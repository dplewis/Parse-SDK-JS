/* global XMLHttpRequest, Blob */
import CoreManager from './CoreManager';
import type { FullOptions } from './RESTController';
import ParseError from './ParseError';
import XhrWeapp from './Xhr.weapp';

let XHR: any = null;
if (typeof XMLHttpRequest !== 'undefined') {
  XHR = XMLHttpRequest;
}
if (process.env.PARSE_BUILD === 'weapp') {
  XHR = XhrWeapp;
}

interface Base64 {
  base64: string;
}
interface Uri {
  uri: string;
}
type FileData = number[] | Base64 | Blob | Uri;
export type FileSaveOptions = FullOptions & {
  metadata?: Record<string, any>;
  tags?: Record<string, any>;
};
export type FileSource =
  | {
      format: 'file';
      file: Blob;
      type: string | undefined;
    }
  | {
      format: 'base64';
      base64: string;
      type: string | undefined;
    }
  | {
      format: 'uri';
      uri: string;
      type: string | undefined;
    };

function b64Digit(number: number): string {
  if (number < 26) {
    return String.fromCharCode(65 + number);
  }
  if (number < 52) {
    return String.fromCharCode(97 + (number - 26));
  }
  if (number < 62) {
    return String.fromCharCode(48 + (number - 52));
  }
  if (number === 62) {
    return '+';
  }
  if (number === 63) {
    return '/';
  }
  throw new TypeError('Tried to encode large digit ' + number + ' in base64.');
}

/**
 * A Parse.File is a local representation of a file that is saved to the Parse
 * cloud.
 *
 * @alias Parse.File
 */
class ParseFile {
  _name: string;
  _url?: string;
  _source: FileSource;
  _previousSave?: Promise<ParseFile>;
  _data?: string;
  _requestTask?: any;
  _metadata?: Record<string, any>;
  _tags?: Record<string, any>;

  /**
   * @param name {String} The file's name. This will be prefixed by a unique
   *     value once the file has finished saving. The file name must begin with
   *     an alphanumeric character, and consist of alphanumeric characters,
   *     periods, spaces, underscores, or dashes.
   * @param data {Array} The data for the file, as either:
   *     1. an Array of byte value Numbers, or
   *     2. an Object like { base64: "..." } with a base64-encoded String.
   *     3. an Object like { uri: "..." } with a uri String.
   *     4. a File object selected with a file upload control. (3) only works
   *        in Firefox 3.6+, Safari 6.0.2+, Chrome 7+, and IE 10+.
   *        For example:
   * <pre>
   * var fileUploadControl = $("#profilePhotoFileUpload")[0];
   * if (fileUploadControl.files.length > 0) {
   *   var file = fileUploadControl.files[0];
   *   var name = "photo.jpg";
   *   var parseFile = new Parse.File(name, file);
   *   parseFile.save().then(function() {
   *     // The file has been saved to Parse.
   *   }, function(error) {
   *     // The file either could not be read, or could not be saved to Parse.
   *   });
   * }</pre>
   * @param type {String} Optional Content-Type header to use for the file. If
   *     this is omitted, the content type will be inferred from the name's
   *     extension.
   * @param metadata {object} Optional key value pairs to be stored with file object
   * @param tags {object} Optional key value pairs to be stored with file object
   */
  constructor(name: string, data?: FileData, type?: string, metadata?: object, tags?: object) {
    const specifiedType = type || '';

    this._name = name;
    this._metadata = metadata || {};
    this._tags = tags || {};

    if (data !== undefined) {
      if (Array.isArray(data)) {
        this._data = ParseFile.encodeBase64(data);
        this._source = {
          format: 'base64',
          base64: this._data,
          type: specifiedType,
        };
      } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
        this._source = {
          format: 'file',
          file: data,
          type: specifiedType,
        };
      } else if (data && typeof (data as Uri).uri === 'string' && (data as Uri).uri !== undefined) {
        this._source = {
          format: 'uri',
          uri: (data as Uri).uri,
          type: specifiedType,
        };
      } else if (data && typeof (data as Base64).base64 === 'string') {
        const base64 = (data as Base64).base64.split(',').slice(-1)[0];
        const dataType =
          specifiedType ||
          (data as Base64).base64.split(';').slice(0, 1)[0].split(':').slice(1, 2)[0] ||
          'text/plain';
        this._data = base64;
        this._source = {
          format: 'base64',
          base64,
          type: dataType,
        };
      } else {
        throw new TypeError('Cannot create a Parse.File with that data.');
      }
    }
  }

  /**
   * Return the data for the file, downloading it if not already present.
   * Data is present if initialized with Byte Array, Base64 or Saved with Uri.
   * Data is cleared if saved with File object selected with a file upload control
   *
   * @returns {Promise} Promise that is resolve with base64 data
   */
  async getData(): Promise<string> {
    if (this._data) {
      return this._data;
    }
    if (!this._url) {
      throw new Error('Cannot retrieve data for unsaved ParseFile.');
    }
    const options = {
      requestTask: task => (this._requestTask = task),
    };
    const controller = CoreManager.getFileController();
    const result = await controller.download(this._url, options);
    this._data = result.base64;
    return this._data;
  }

  /**
   * Gets the name of the file. Before save is called, this is the filename
   * given by the user. After save is called, that name gets prefixed with a
   * unique identifier.
   *
   * @returns {string}
   */
  name(): string {
    return this._name;
  }

  /**
   * Gets the url of the file. It is only available after you save the file or
   * after you get the file from a Parse.Object.
   *
   * @param {object} options An object to specify url options
   * @param {boolean} [options.forceSecure] force the url to be secure
   * @returns {string | undefined}
   */
  url(options?: { forceSecure?: boolean }): string | undefined {
    options = options || {};
    if (!this._url) {
      return;
    }
    if (options.forceSecure) {
      return this._url.replace(/^http:\/\//i, 'https://');
    } else {
      return this._url;
    }
  }

  /**
   * Gets the metadata of the file.
   *
   * @returns {object}
   */
  metadata(): Record<string, any> {
    return this._metadata;
  }

  /**
   * Gets the tags of the file.
   *
   * @returns {object}
   */
  tags(): Record<string, any> {
    return this._tags;
  }

  /**
   * Saves the file to the Parse cloud.
   *
   * @param {object} options
   * Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *     behalf of a specific user.
   *   <li>progress: In Browser only, callback for upload progress. For example:
   * <pre>
   * let parseFile = new Parse.File(name, file);
   * parseFile.save({
   *   progress: (progressValue, loaded, total, { type }) => {
   *     if (type === "upload" && progressValue !== null) {
   *       // Update the UI using progressValue
   *     }
   *   }
   * });
   * </pre>
   * </ul>
   * @returns {Promise | undefined} Promise that is resolved when the save finishes.
   */
  save(options?: FileSaveOptions & { requestTask?: any }): Promise<ParseFile> | undefined {
    options = options || {};
    options.requestTask = task => (this._requestTask = task);
    options.metadata = this._metadata;
    options.tags = this._tags;

    const controller = CoreManager.getFileController();
    if (!this._previousSave) {
      if (this._source.format === 'file') {
        this._previousSave = controller.saveFile(this._name, this._source, options).then(res => {
          this._name = res.name;
          this._url = res.url;
          this._data = null;
          this._requestTask = null;
          return this;
        });
      } else if (this._source.format === 'uri') {
        this._previousSave = controller
          .download(this._source.uri, options)
          .then(result => {
            if (!(result && result.base64)) {
              return {};
            }
            const newSource = {
              format: 'base64' as const,
              base64: result.base64,
              type: result.contentType,
            };
            this._data = result.base64;
            this._requestTask = null;
            return controller.saveBase64(this._name, newSource, options);
          })
          .then((res: { name?: string; url?: string }) => {
            this._name = res.name;
            this._url = res.url;
            this._requestTask = null;
            return this;
          });
      } else {
        this._previousSave = controller.saveBase64(this._name, this._source, options).then(res => {
          this._name = res.name;
          this._url = res.url;
          this._requestTask = null;
          return this;
        });
      }
    }
    if (this._previousSave) {
      return this._previousSave;
    }
  }

  /**
   * Aborts the request if it has already been sent.
   */
  cancel() {
    if (this._requestTask && typeof this._requestTask.abort === 'function') {
      this._requestTask._aborted = true;
      this._requestTask.abort();
    }
    this._requestTask = null;
  }

  /**
   * Deletes the file from the Parse cloud.
   * In Cloud Code and Node only with Master Key.
   *
   * @param {object} options
   * Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   * <pre>
   * @returns {Promise} Promise that is resolved when the delete finishes.
   */
  destroy(options: FullOptions = {}) {
    if (!this._name) {
      throw new ParseError(ParseError.FILE_DELETE_UNNAMED_ERROR, 'Cannot delete an unnamed file.');
    }
    const destroyOptions = { useMasterKey: true };
    if (Object.hasOwn(options, 'useMasterKey')) {
      destroyOptions.useMasterKey = !!options.useMasterKey;
    }
    const controller = CoreManager.getFileController();
    return controller.deleteFile(this._name, destroyOptions).then(() => {
      this._data = undefined;
      this._requestTask = null;
      return this;
    });
  }

  toJSON(): { __type: 'File'; name?: string; url?: string } {
    return {
      __type: 'File',
      name: this._name,
      url: this._url,
    };
  }

  equals(other: any): boolean {
    if (this === other) {
      return true;
    }
    // Unsaved Files are never equal, since they will be saved to different URLs
    return (
      other instanceof ParseFile &&
      this.name() === other.name() &&
      this.url() === other.url() &&
      typeof this.url() !== 'undefined'
    );
  }

  /**
   * Sets metadata to be saved with file object. Overwrites existing metadata
   *
   * @param {object} metadata Key value pairs to be stored with file object
   */
  setMetadata(metadata: Record<string, any>) {
    if (metadata && typeof metadata === 'object') {
      Object.keys(metadata).forEach(key => {
        this.addMetadata(key, metadata[key]);
      });
    }
  }

  /**
   * Sets metadata to be saved with file object. Adds to existing metadata.
   *
   * @param {string} key key to store the metadata
   * @param {*} value metadata
   */
  addMetadata(key: string, value: any) {
    if (typeof key === 'string') {
      this._metadata[key] = value;
    }
  }

  /**
   * Sets tags to be saved with file object. Overwrites existing tags
   *
   * @param {object} tags Key value pairs to be stored with file object
   */
  setTags(tags: Record<string, any>) {
    if (tags && typeof tags === 'object') {
      Object.keys(tags).forEach(key => {
        this.addTag(key, tags[key]);
      });
    }
  }

  /**
   * Sets tags to be saved with file object. Adds to existing tags.
   *
   * @param {string} key key to store tags
   * @param {*} value tag
   */
  addTag(key: string, value: string) {
    if (typeof key === 'string') {
      this._tags[key] = value;
    }
  }

  static fromJSON(obj): ParseFile {
    if (obj.__type !== 'File') {
      throw new TypeError('JSON object does not represent a ParseFile');
    }
    const file = new ParseFile(obj.name);
    file._url = obj.url;
    return file;
  }

  static encodeBase64(bytes: number[] | Uint8Array): string {
    const chunks = [];
    chunks.length = Math.ceil(bytes.length / 3);
    for (let i = 0; i < chunks.length; i++) {
      const b1 = bytes[i * 3];
      const b2 = bytes[i * 3 + 1] || 0;
      const b3 = bytes[i * 3 + 2] || 0;

      const has2 = i * 3 + 1 < bytes.length;
      const has3 = i * 3 + 2 < bytes.length;

      chunks[i] = [
        b64Digit((b1 >> 2) & 0x3f),
        b64Digit(((b1 << 4) & 0x30) | ((b2 >> 4) & 0x0f)),
        has2 ? b64Digit(((b2 << 2) & 0x3c) | ((b3 >> 6) & 0x03)) : '=',
        has3 ? b64Digit(b3 & 0x3f) : '=',
      ].join('');
    }

    return chunks.join('');
  }
}

const DefaultController = {
  saveFile: async function (name: string, source: FileSource, options?: FileSaveOptions) {
    if (source.format !== 'file') {
      throw new Error('saveFile can only be used with File-type sources.');
    }
    const base64Data = await new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.onerror = error => rej(error);
      reader.readAsDataURL(source.file);
    });
    // we only want the data after the comma
    // For example: "data:application/pdf;base64,JVBERi0xLjQKJ..." we would only want "JVBERi0xLjQKJ..."
    const [first, second] = base64Data.split(',');
    // in the event there is no 'data:application/pdf;base64,' at the beginning of the base64 string
    // use the entire string instead
    const data = second ? second : first;
    const newSource = {
      format: 'base64' as const,
      base64: data as string,
      type: source.type || (source.file ? source.file.type : undefined),
    };
    return await DefaultController.saveBase64(name, newSource, options);
  },

  saveBase64: function (name: string, source: FileSource, options: FileSaveOptions = {}) {
    if (source.format !== 'base64') {
      throw new Error('saveBase64 can only be used with Base64-type sources.');
    }
    const data: { base64: any; _ContentType?: any; fileData: any } = {
      base64: source.base64,
      fileData: {
        metadata: { ...options.metadata },
        tags: { ...options.tags },
      },
    };
    delete options.metadata;
    delete options.tags;
    if (source.type) {
      data._ContentType = source.type;
    }
    const path = 'files/' + name;
    return CoreManager.getRESTController().request('POST', path, data, options);
  },

  download: function (uri, options) {
    if (XHR) {
      return this.downloadAjax(uri, options);
    } else if (process.env.PARSE_BUILD === 'node') {
      return new Promise((resolve, reject) => {
        const client = uri.indexOf('https') === 0 ? require('https') : require('http');
        const req = client.get(uri, resp => {
          resp.setEncoding('base64');
          let base64 = '';
          resp.on('data', data => (base64 += data));
          resp.on('end', () => {
            resolve({
              base64,
              contentType: resp.headers['content-type'],
            });
          });
        });
        req.on('abort', () => {
          resolve({});
        });
        req.on('error', reject);
        options.requestTask(req);
      });
    } else {
      return Promise.reject('Cannot make a request: No definition of XMLHttpRequest was found.');
    }
  },

  downloadAjax: function (uri: string, options: any) {
    return new Promise((resolve, reject) => {
      const xhr = new XHR();
      xhr.open('GET', uri, true);
      xhr.responseType = 'arraybuffer';
      xhr.onerror = function (e) {
        reject(e);
      };
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== xhr.DONE) {
          return;
        }
        if (!this.response) {
          return resolve({});
        }
        const bytes = new Uint8Array(this.response);
        resolve({
          base64: ParseFile.encodeBase64(bytes),
          contentType: xhr.getResponseHeader('content-type'),
        });
      };
      options.requestTask(xhr);
      xhr.send();
    });
  },

  deleteFile: function (name: string, options?: FullOptions) {
    const headers = {
      'X-Parse-Application-ID': CoreManager.get('APPLICATION_ID'),
    };
    if (options.useMasterKey) {
      headers['X-Parse-Master-Key'] = CoreManager.get('MASTER_KEY');
    }
    let url = CoreManager.get('SERVER_URL');
    if (url[url.length - 1] !== '/') {
      url += '/';
    }
    url += 'files/' + name;
    return CoreManager.getRESTController()
      .ajax('DELETE', url, '', headers)
      .catch(response => {
        // TODO: return JSON object in server
        if (!response || response === 'SyntaxError: Unexpected end of JSON input') {
          return Promise.resolve();
        } else {
          return CoreManager.getRESTController().handleError(response);
        }
      });
  },

  _setXHR(xhr: any) {
    XHR = xhr;
  },

  _getXHR() {
    return XHR;
  },
};

CoreManager.setFileController(DefaultController);

export default ParseFile;
exports.b64Digit = b64Digit;
