/* global XMLHttpRequest, XDomainRequest */
import uuidv4 from './uuid';
import CoreManager from './CoreManager';
import ParseError from './ParseError';
import { resolvingPromise } from './promiseUtils';
import XhrWeapp from './Xhr.weapp';

export interface RequestOptions {
  useMasterKey?: boolean;
  useMaintenanceKey?: boolean;
  sessionToken?: string;
  installationId?: string;
  returnStatus?: boolean;
  batchSize?: number;
  include?: any;
  progress?: any;
  context?: any;
  usePost?: boolean;
  ignoreEmailVerification?: boolean;
  transaction?: boolean;
}

export interface FullOptions {
  success?: any;
  error?: any;
  useMasterKey?: boolean;
  useMaintenanceKey?: boolean;
  sessionToken?: string;
  installationId?: string;
  progress?: any;
  usePost?: boolean;
}

interface PayloadType {
  _context?: any;
  _method?: string;
  _ApplicationId: string;
  _JavaScriptKey?: string;
  _ClientVersion: string;
  _MasterKey?: string;
  _MaintenanceKey?: string;
  _RevocableSession?: string;
  _InstallationId?: string;
  _SessionToken?: string;
}

let XHR: any = null;
if (typeof XMLHttpRequest !== 'undefined') {
  XHR = XMLHttpRequest;
}
if (process.env.PARSE_BUILD === 'node') {
  XHR = require('xmlhttprequest').XMLHttpRequest;
}
if (process.env.PARSE_BUILD === 'weapp') {
  XHR = XhrWeapp;
}

let useXDomainRequest = false;
// @ts-ignore
if (typeof XDomainRequest !== 'undefined' && !('withCredentials' in new XMLHttpRequest())) {
  useXDomainRequest = true;
}

function ajaxIE9(method: string, url: string, data: any, _headers?: any, options?: FullOptions) {
  return new Promise((resolve, reject) => {
    // @ts-ignore
    const xdr = new XDomainRequest();
    xdr.onload = function () {
      let response;
      try {
        response = JSON.parse(xdr.responseText);
      } catch (e) {
        reject(e);
      }
      if (response) {
        resolve({ response });
      }
    };
    xdr.onerror = xdr.ontimeout = function () {
      // Let's fake a real error message.
      const fakeResponse = {
        responseText: JSON.stringify({
          code: ParseError.X_DOMAIN_REQUEST,
          error: "IE's XDomainRequest does not supply error info.",
        }),
      };
      reject(fakeResponse);
    };
    xdr.onprogress = function () {
      if (options && typeof options.progress === 'function') {
        options.progress(xdr.responseText);
      }
    };
    xdr.open(method, url);
    xdr.send(data);
    // @ts-ignore
    if (options && typeof options.requestTask === 'function') {
      // @ts-ignore
      options.requestTask(xdr);
    }
  });
}

const RESTController = {
  ajax(method: string, url: string, data: any, headers?: any, options?: FullOptions) {
    if (useXDomainRequest) {
      return ajaxIE9(method, url, data, headers, options);
    }
    const promise = resolvingPromise();
    const isIdempotent = CoreManager.get('IDEMPOTENCY') && ['POST', 'PUT'].includes(method);
    const requestId = isIdempotent ? uuidv4() : '';
    let attempts = 0;

    const dispatch = function () {
      if (XHR == null) {
        throw new Error('Cannot make a request: No definition of XMLHttpRequest was found.');
      }
      let handled = false;

      const xhr = new XHR();
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4 || handled || xhr._aborted) {
          return;
        }
        handled = true;

        if (xhr.status >= 200 && xhr.status < 300) {
          let response;
          try {
            response = JSON.parse(xhr.responseText);
            const availableHeaders =
              typeof xhr.getAllResponseHeaders === 'function' ? xhr.getAllResponseHeaders() : '';
            headers = {};
            if (
              typeof xhr.getResponseHeader === 'function' &&
              availableHeaders?.indexOf('access-control-expose-headers') >= 0
            ) {
              const responseHeaders = xhr
                .getResponseHeader('access-control-expose-headers')
                .split(', ');
              responseHeaders.forEach(header => {
                if (availableHeaders.indexOf(header.toLowerCase()) >= 0) {
                  headers[header] = xhr.getResponseHeader(header.toLowerCase());
                }
              });
            }
          } catch (e) {
            promise.reject(e.toString());
          }
          if (response) {
            promise.resolve({ response, headers, status: xhr.status, xhr });
          }
        } else if (xhr.status >= 500 || xhr.status === 0) {
          // retry on 5XX or node-xmlhttprequest error
          if (++attempts < CoreManager.get('REQUEST_ATTEMPT_LIMIT')) {
            // Exponentially-growing random delay
            const delay = Math.round(Math.random() * 125 * Math.pow(2, attempts));
            setTimeout(dispatch, delay);
          } else if (xhr.status === 0) {
            promise.reject('Unable to connect to the Parse API');
          } else {
            // After the retry limit is reached, fail
            promise.reject(xhr);
          }
        } else {
          promise.reject(xhr);
        }
      };

      headers = headers || {};
      if (typeof headers['Content-Type'] !== 'string') {
        headers['Content-Type'] = 'text/plain'; // Avoid pre-flight
      }
      if (CoreManager.get('IS_NODE')) {
        headers['User-Agent'] =
          'Parse/' + CoreManager.get('VERSION') + ' (NodeJS ' + process.versions.node + ')';
      }
      if (isIdempotent) {
        headers['X-Parse-Request-Id'] = requestId;
      }
      if (CoreManager.get('SERVER_AUTH_TYPE') && CoreManager.get('SERVER_AUTH_TOKEN')) {
        headers['Authorization'] =
          CoreManager.get('SERVER_AUTH_TYPE') + ' ' + CoreManager.get('SERVER_AUTH_TOKEN');
      }
      const customHeaders = CoreManager.get('REQUEST_HEADERS');
      for (const key in customHeaders) {
        headers[key] = customHeaders[key];
      }

      if (options && typeof options.progress === 'function') {
        const handleProgress = function (type, event) {
          if (event.lengthComputable) {
            options.progress(event.loaded / event.total, event.loaded, event.total, { type });
          } else {
            options.progress(null, null, null, { type });
          }
        };

        xhr.onprogress = event => {
          handleProgress('download', event);
        };

        if (xhr.upload) {
          xhr.upload.onprogress = event => {
            handleProgress('upload', event);
          };
        }
      }

      xhr.open(method, url, true);

      for (const h in headers) {
        xhr.setRequestHeader(h, headers[h]);
      }
      xhr.onabort = function () {
        promise.resolve({
          response: { results: [] },
          status: 0,
          xhr,
        });
      };
      xhr.send(data);
      // @ts-ignore
      if (options && typeof options.requestTask === 'function') {
        // @ts-ignore
        options.requestTask(xhr);
      }
    };
    dispatch();

    return promise;
  },

  request(method: string, path: string, data: any, options?: RequestOptions) {
    options = options || {};
    let url = CoreManager.get('SERVER_URL');
    if (url[url.length - 1] !== '/') {
      url += '/';
    }
    url += path;

    const payload: Partial<PayloadType> = {};
    if (data && typeof data === 'object') {
      for (const k in data) {
        payload[k] = data[k];
      }
    }

    // Add context
    const context = options.context;
    if (context !== undefined) {
      payload._context = context;
    }

    if (method !== 'POST') {
      payload._method = method;
      method = 'POST';
    }

    payload._ApplicationId = CoreManager.get('APPLICATION_ID');
    const jsKey = CoreManager.get('JAVASCRIPT_KEY');
    if (jsKey) {
      payload._JavaScriptKey = jsKey;
    }
    payload._ClientVersion = CoreManager.get('VERSION');

    let useMasterKey = options.useMasterKey;
    if (typeof useMasterKey === 'undefined') {
      useMasterKey = CoreManager.get('USE_MASTER_KEY');
    }
    if (useMasterKey) {
      if (CoreManager.get('MASTER_KEY')) {
        delete payload._JavaScriptKey;
        payload._MasterKey = CoreManager.get('MASTER_KEY');
      } else {
        throw new Error('Cannot use the Master Key, it has not been provided.');
      }
    }
    if (options.useMaintenanceKey) {
      payload._MaintenanceKey = CoreManager.get('MAINTENANCE_KEY');
    }
    if (CoreManager.get('FORCE_REVOCABLE_SESSION')) {
      payload._RevocableSession = '1';
    }

    const installationId = options.installationId;
    let installationIdPromise: Promise<string>;
    if (installationId && typeof installationId === 'string') {
      installationIdPromise = Promise.resolve(installationId);
    } else {
      const installationController = CoreManager.getInstallationController();
      installationIdPromise = installationController.currentInstallationId();
    }

    return installationIdPromise
      .then(iid => {
        payload._InstallationId = iid;
        const userController = CoreManager.getUserController();
        if (options && typeof options.sessionToken === 'string') {
          return Promise.resolve(options.sessionToken);
        } else if (userController) {
          return userController.currentUserAsync().then(user => {
            if (user) {
              return Promise.resolve(user.getSessionToken());
            }
            return Promise.resolve(null);
          });
        }
        return Promise.resolve(null);
      })
      .then(token => {
        if (token) {
          payload._SessionToken = token;
        }

        const payloadString = JSON.stringify(payload);
        return RESTController.ajax(method, url, payloadString, {}, options).then(
          ({ response, status, headers, xhr }) => {
            if (options.returnStatus) {
              return { ...response, _status: status, _headers: headers, _xhr: xhr };
            } else {
              return response;
            }
          }
        );
      })
      .catch(RESTController.handleError);
  },

  handleError(response: any) {
    // Transform the error into an instance of ParseError by trying to parse
    // the error string as JSON
    let error;
    if (response && response.responseText) {
      try {
        const errorJSON = JSON.parse(response.responseText);
        error = new ParseError(errorJSON.code, errorJSON.error);
      } catch (_) {
        // If we fail to parse the error text, that's okay.
        error = new ParseError(
          ParseError.INVALID_JSON,
          'Received an error with invalid JSON from Parse: ' + response.responseText
        );
      }
    } else {
      const message = response.message ? response.message : response;
      error = new ParseError(
        ParseError.CONNECTION_FAILED,
        'XMLHttpRequest failed: ' + JSON.stringify(message)
      );
    }
    return Promise.reject(error);
  },

  _setXHR(xhr: any) {
    XHR = xhr;
  },

  _getXHR() {
    return XHR;
  },
};

export default RESTController;
