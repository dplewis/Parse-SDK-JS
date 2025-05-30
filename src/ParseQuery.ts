import CoreManager from './CoreManager';
import encode from './encode';
import { continueWhile } from './promiseUtils';
import ParseError from './ParseError';
import ParseGeoPoint from './ParseGeoPoint';
import ParseObject from './ParseObject';
import OfflineQuery from './OfflineQuery';
import { DEFAULT_PIN } from './LocalDatastoreUtils';

import type LiveQuerySubscription from './LiveQuerySubscription';
import type { RequestOptions, FullOptions } from './RESTController';
import type { Pointer } from './ParseObject';

type BatchOptions = FullOptions & {
  batchSize?: number;
  useMasterKey?: boolean;
  useMaintenanceKey?: boolean;
  sessionToken?: string;
  context?: Record<string, any>;
  json?: boolean;
};

export type WhereClause = Record<string, any>;

interface QueryOptions {
  useMasterKey?: boolean;
  sessionToken?: string;
  context?: Record<string, any>;
  json?: boolean;
}

interface FullTextQueryOptions {
  language?: string;
  caseSensitive?: boolean;
  diacriticSensitive?: boolean;
}

export interface QueryJSON {
  where: WhereClause;
  watch?: string;
  include?: string;
  excludeKeys?: string;
  keys?: string;
  limit?: number;
  skip?: number;
  order?: string;
  className?: string;
  count?: number;
  hint?: any;
  explain?: boolean;
  readPreference?: string;
  includeReadPreference?: string;
  subqueryReadPreference?: string;
  comment?: string;
}

interface BaseAttributes {
  createdAt: Date;
  objectId: string;
  updatedAt: Date;
}

/**
 * Converts a string into a regex that matches it.
 * Surrounding with \Q .. \E does this, we just need to escape any \E's in
 * the text separately.
 *
 * @param s
 * @private
 * @returns {string}
 */
function quote(s: string): string {
  return '\\Q' + s.replace('\\E', '\\E\\\\E\\Q') + '\\E';
}

/**
 * Extracts the class name from queries. If not all queries have the same
 * class name an error will be thrown.
 *
 * @param queries
 * @private
 * @returns {string}
 */
function _getClassNameFromQueries(queries: ParseQuery[]): string | null {
  let className: string | null = null;
  queries.forEach(q => {
    if (!className) {
      className = q.className;
    }

    if (className !== q.className) {
      throw new Error('All queries must be for the same class.');
    }
  });
  return className;
}

/*
 * Handles pre-populating the result data of a query with select fields,
 * making sure that the data object contains keys for all objects that have
 * been requested with a select, so that our cached state updates correctly.
 */
function handleSelectResult(data: any, select: string[]) {
  const serverDataMask = {};

  select.forEach(field => {
    const hasSubObjectSelect = field.indexOf('.') !== -1;
    if (!hasSubObjectSelect && !Object.hasOwn(data, field)) {
      // this field was selected, but is missing from the retrieved data
      data[field] = undefined;
    } else if (hasSubObjectSelect) {
      // this field references a sub-object,
      // so we need to walk down the path components
      const pathComponents = field.split('.');
      let obj = data;
      let serverMask = serverDataMask;

      pathComponents.forEach((component, index, arr) => {
        // add keys if the expected data is missing
        if (obj && !Object.hasOwn(obj, component)) {
          obj[component] = undefined;
        }
        if (obj && typeof obj === 'object') {
          obj = obj[component];
        }

        //add this path component to the server mask so we can fill it in later if needed
        if (index < arr.length - 1) {
          if (!serverMask[component]) {
            serverMask[component] = {};
          }
          serverMask = serverMask[component];
        }
      });
    }
  });

  if (Object.keys(serverDataMask).length > 0) {
    // When selecting from sub-objects, we don't want to blow away the missing
    // information that we may have retrieved before. We've already added any
    // missing selected keys to sub-objects, but we still need to add in the
    // data for any previously retrieved sub-objects that were not selected.

    const serverData = CoreManager.getObjectStateController().getServerData({
      id: data.objectId,
      className: data.className,
    });

    copyMissingDataWithMask(serverData, data, serverDataMask, false);
  }
}

function copyMissingDataWithMask(src, dest, mask, copyThisLevel) {
  //copy missing elements at this level
  if (copyThisLevel) {
    for (const key in src) {
      if (Object.hasOwn(src, key) && !Object.hasOwn(dest, key)) {
        dest[key] = src[key];
      }
    }
  }
  for (const key in mask) {
    if (dest[key] !== undefined && dest[key] !== null && src !== undefined && src !== null) {
      //traverse into objects as needed
      copyMissingDataWithMask(src[key], dest[key], mask[key], true);
    }
  }
}

function handleOfflineSort(a, b, sorts) {
  let order = sorts[0];
  const operator = order.slice(0, 1);
  const isDescending = operator === '-';
  if (isDescending) {
    order = order.substring(1);
  }
  if (order === '_created_at') {
    order = 'createdAt';
  }
  if (order === '_updated_at') {
    order = 'updatedAt';
  }
  if (!/^[A-Za-z][0-9A-Za-z_]*$/.test(order) || order === 'password') {
    throw new ParseError(ParseError.INVALID_KEY_NAME, `Invalid Key: ${order}`);
  }
  const field1 = a.get(order);
  const field2 = b.get(order);

  if (field1 < field2) {
    return isDescending ? 1 : -1;
  }
  if (field1 > field2) {
    return isDescending ? -1 : 1;
  }
  if (sorts.length > 1) {
    const remainingSorts = sorts.slice(1);
    return handleOfflineSort(a, b, remainingSorts);
  }
  return 0;
}
/**
 * Creates a new parse Parse.Query for the given Parse.Object subclass.
 *
 * <p>Parse.Query defines a query that is used to fetch Parse.Objects. The
 * most common use case is finding all objects that match a query through the
 * <code>find</code> method. for example, this sample code fetches all objects
 * of class <code>myclass</code>. it calls a different function depending on
 * whether the fetch succeeded or not.
 *
 * <pre>
 * var query = new Parse.Query(myclass);
 * query.find().then((results) => {
 *   // results is an array of parse.object.
 * }).catch((error) =>  {
 *  // error is an instance of parse.error.
 * });</pre></p>
 *
 * <p>a Parse.Query can also be used to retrieve a single object whose id is
 * known, through the get method. for example, this sample code fetches an
 * object of class <code>myclass</code> and id <code>myid</code>. it calls a
 * different function depending on whether the fetch succeeded or not.
 *
 * <pre>
 * var query = new Parse.Query(myclass);
 * query.get(myid).then((object) => {
 *     // object is an instance of parse.object.
 * }).catch((error) =>  {
 *  // error is an instance of parse.error.
 * });</pre></p>
 *
 * <p>a Parse.Query can also be used to count the number of objects that match
 * the query without retrieving all of those objects. for example, this
 * sample code counts the number of objects of the class <code>myclass</code>
 * <pre>
 * var query = new Parse.Query(myclass);
 * query.count().then((number) => {
 *     // there are number instances of myclass.
 * }).catch((error) => {
 *     // error is an instance of Parse.Error.
 * });</pre></p>
 *
 * @alias Parse.Query
 */
class ParseQuery<T extends ParseObject = ParseObject> {
  /**
   * @property {string} className
   */
  className: string;
  _where: any;
  _watch: string[];
  _include: string[];
  _exclude: string[];
  _select: string[];
  _limit: number;
  _skip: number;
  _count: boolean;
  _order: string[];
  _readPreference: string | null;
  _includeReadPreference: string | null;
  _subqueryReadPreference: string | null;
  _queriesLocalDatastore: boolean;
  _localDatastorePinName: any;
  _extraOptions: Record<string, any>;
  _hint: any;
  _explain: boolean;
  _xhrRequest: any;
  _comment: string;

  /**
   * @param {(string | Parse.Object)} objectClass An instance of a subclass of Parse.Object, or a Parse className string.
   */
  constructor(objectClass: string | (new (...args: any[]) => T | ParseObject)) {
    if (typeof objectClass === 'string') {
      if (objectClass === 'User' && CoreManager.get('PERFORM_USER_REWRITE')) {
        this.className = '_User';
      } else {
        this.className = objectClass;
      }
    } else if (objectClass instanceof ParseObject) {
      this.className = objectClass.className;
    } else if (typeof objectClass === 'function') {
      const objClass = objectClass as any;
      if (typeof objClass.className === 'string') {
        this.className = objClass.className;
      } else {
        const obj = new objClass();
        this.className = obj.className;
      }
    } else {
      throw new TypeError('A ParseQuery must be constructed with a ParseObject or class name.');
    }

    this._where = {};
    this._watch = [];
    this._include = [];
    this._exclude = [];
    this._count = false;
    this._limit = -1; // negative limit is not sent in the server request
    this._skip = 0;
    this._readPreference = null;
    this._includeReadPreference = null;
    this._subqueryReadPreference = null;
    this._queriesLocalDatastore = false;
    this._localDatastorePinName = null;
    this._extraOptions = {};
    this._xhrRequest = {
      task: null,
      onchange: () => {},
    };
    this._comment = null;
  }

  /**
   * Adds constraint that at least one of the passed in queries matches.
   *
   * @param {Array} queries
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  _orQuery(queries: ParseQuery[]): this {
    const queryJSON = queries.map(q => {
      return q.toJSON().where;
    });

    this._where.$or = queryJSON;
    return this;
  }

  /**
   * Adds constraint that all of the passed in queries match.
   *
   * @param {Array} queries
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  _andQuery(queries: ParseQuery[]): this {
    const queryJSON = queries.map(q => {
      return q.toJSON().where;
    });

    this._where.$and = queryJSON;
    return this;
  }

  /**
   * Adds constraint that none of the passed in queries match.
   *
   * @param {Array} queries
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  _norQuery(queries: ParseQuery[]): this {
    const queryJSON = queries.map(q => {
      return q.toJSON().where;
    });

    this._where.$nor = queryJSON;
    return this;
  }

  /**
   * Helper for condition queries
   *
   * @param key
   * @param condition
   * @param value
   * @returns {Parse.Query}
   */
  _addCondition<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    condition: string,
    value: any
  ): this {
    if (!this._where[key] || typeof this._where[key] === 'string') {
      this._where[key] = {};
    }
    this._where[key][condition] = encode(value, false, true);
    return this;
  }

  /**
   * Converts string for regular expression at the beginning
   *
   * @param string
   * @returns {string}
   */
  _regexStartWith(string: string): string {
    return '^' + quote(string);
  }

  async _handleOfflineQuery(params: QueryJSON) {
    OfflineQuery.validateQuery(this);
    const localDatastore = CoreManager.getLocalDatastore();
    const objects = await localDatastore._serializeObjectsFromPinName(this._localDatastorePinName);
    let results = objects
      .map((json, _index, arr) => {
        const object = ParseObject.fromJSON(json, false);
        if (json._localId && !json.objectId) {
          object._localId = json._localId;
        }
        if (!OfflineQuery.matchesQuery(this.className, object, arr, this)) {
          return null;
        }
        return object;
      })
      .filter(object => object !== null);
    if (params.keys) {
      let keys = params.keys.split(',');
      const alwaysSelectedKeys = ['className', 'objectId', 'createdAt', 'updatedAt', 'ACL'];
      keys = keys.concat(alwaysSelectedKeys);
      results = results.map(object => {
        const json = object._toFullJSON();
        Object.keys(json).forEach(key => {
          if (!keys.includes(key)) {
            delete json[key];
          }
        });
        return ParseObject.fromJSON(json, false);
      });
    }
    if (params.order) {
      const sorts = params.order.split(',');
      results.sort((a, b) => {
        return handleOfflineSort(a, b, sorts);
      });
    }

    let count; // count total before applying limit/skip
    if (params.count) {
      count = results.length; // total count from response
    }

    if (params.skip) {
      if (params.skip >= results.length) {
        results = [];
      } else {
        results = results.splice(params.skip, results.length);
      }
    }
    let limit = results.length;
    if (params.limit !== 0 && params.limit < results.length) {
      limit = params.limit;
    }

    results = results.splice(0, limit);

    if (typeof count === 'number') {
      return { results, count };
    }

    return results;
  }

  /**
   * Returns a JSON representation of this query.
   *
   * @returns {object} The JSON representation of the query.
   */
  toJSON(): QueryJSON {
    const params: QueryJSON = {
      where: this._where,
    };

    if (this._watch.length) {
      params.watch = this._watch.join(',');
    }
    if (this._include.length) {
      params.include = this._include.join(',');
    }
    if (this._exclude.length) {
      params.excludeKeys = this._exclude.join(',');
    }
    if (this._select) {
      params.keys = this._select.join(',');
    }
    if (this._count) {
      params.count = 1;
    }
    if (this._limit >= 0) {
      params.limit = this._limit;
    }
    if (this._skip > 0) {
      params.skip = this._skip;
    }
    if (this._order) {
      params.order = this._order.join(',');
    }
    if (this._readPreference) {
      params.readPreference = this._readPreference;
    }
    if (this._includeReadPreference) {
      params.includeReadPreference = this._includeReadPreference;
    }
    if (this._subqueryReadPreference) {
      params.subqueryReadPreference = this._subqueryReadPreference;
    }
    if (this._hint) {
      params.hint = this._hint;
    }
    if (this._explain) {
      params.explain = true;
    }
    if (this._comment) {
      params.comment = this._comment;
    }
    for (const key in this._extraOptions) {
      params[key] = this._extraOptions[key];
    }

    return params;
  }

  /**
   * Return a query with conditions from json, can be useful to send query from server side to client
   * Not static, all query conditions was set before calling this method will be deleted.
   * For example on the server side we have
   * var query = new Parse.Query("className");
   * query.equalTo(key: value);
   * query.limit(100);
   * ... (others queries)
   * Create JSON representation of Query Object
   * var jsonFromServer = query.fromJSON();
   *
   * On client side getting query:
   * var query = new Parse.Query("className");
   * query.fromJSON(jsonFromServer);
   *
   * and continue to query...
   * query.skip(100).find().then(...);
   *
   * @param {QueryJSON} json from Parse.Query.toJSON() method
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  withJSON(json: QueryJSON): this {
    if (json.where) {
      this._where = json.where;
    }

    if (json.watch) {
      this._watch = json.watch.split(',');
    }

    if (json.include) {
      this._include = json.include.split(',');
    }

    if (json.keys) {
      this._select = json.keys.split(',');
    }

    if (json.excludeKeys) {
      this._exclude = json.excludeKeys.split(',');
    }

    if (json.count) {
      this._count = json.count === 1;
    }

    if (json.limit) {
      this._limit = json.limit;
    }

    if (json.skip) {
      this._skip = json.skip;
    }

    if (json.order) {
      this._order = json.order.split(',');
    }

    if (json.readPreference) {
      this._readPreference = json.readPreference;
    }

    if (json.includeReadPreference) {
      this._includeReadPreference = json.includeReadPreference;
    }

    if (json.subqueryReadPreference) {
      this._subqueryReadPreference = json.subqueryReadPreference;
    }

    if (json.hint) {
      this._hint = json.hint;
    }

    if (json.explain) {
      this._explain = !!json.explain;
    }

    if (json.comment) {
      this._comment = json.comment;
    }

    for (const key in json) {
      if (Object.hasOwn(json, key)) {
        if (
          [
            'where',
            'include',
            'keys',
            'count',
            'limit',
            'skip',
            'order',
            'readPreference',
            'includeReadPreference',
            'subqueryReadPreference',
            'hint',
            'explain',
            'comment',
          ].indexOf(key) === -1
        ) {
          this._extraOptions[key] = json[key];
        }
      }
    }

    return this;
  }

  /**
   * Static method to restore Parse.Query by json representation
   * Internally calling Parse.Query.withJSON
   *
   * @param {string} className
   * @param {QueryJSON} json from Parse.Query.toJSON() method
   * @returns {Parse.Query} new created query
   */
  static fromJSON(className: string, json: QueryJSON): ParseQuery {
    const query = new ParseQuery(className);
    return query.withJSON(json);
  }

  /**
   * Constructs a Parse.Object whose id is already known by fetching data from
   * the server. Unlike the <code>first</code> method, it never returns undefined.
   *
   * @param {string} objectId The id of the object to be fetched.
   * @param {object} options
   * Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   *   <li>context: A dictionary that is accessible in Cloud Code `beforeFind` trigger.
   *   <li>json: Return raw json without converting to Parse.Object
   * </ul>
   * @returns {Promise} A promise that is resolved with the result when
   * the query completes.
   */
  get(objectId: string, options?: QueryOptions): Promise<T> {
    this.equalTo('objectId', objectId as any);

    const firstOptions = ParseObject._getRequestOptions(options);
    return this.first(firstOptions).then(response => {
      if (response) {
        return response;
      }

      const errorObject = new ParseError(ParseError.OBJECT_NOT_FOUND, 'Object not found.');
      return Promise.reject(errorObject);
    });
  }

  /**
   * Retrieves a list of ParseObjects that satisfy this query.
   *
   * @param {object} options Valid options
   * are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   *   <li>context: A dictionary that is accessible in Cloud Code `beforeFind` trigger.
   *   <li>json: Return raw json without converting to Parse.Object
   * </ul>
   * @returns {Promise} A promise that is resolved with the results when
   * the query completes.
   */
  find(options?: QueryOptions): Promise<T[]> {
    const findOptions = ParseObject._getRequestOptions(options);
    this._setRequestTask(findOptions);

    const controller = CoreManager.getQueryController();
    const select = this._select;

    if (this._queriesLocalDatastore) {
      return this._handleOfflineQuery(this.toJSON());
    }
    return controller.find(this.className, this.toJSON(), findOptions).then(response => {
      // Return generic object when explain is used
      if (this._explain) {
        return response.results;
      }
      const results = response.results?.map(data => {
        // In cases of relations, the server may send back a className
        // on the top level of the payload
        const override = response.className || this.className;
        if (!data.className) {
          data.className = override;
        }

        // Make sure the data object contains keys for all objects that
        // have been requested with a select, so that our cached state
        // updates correctly.
        if (select) {
          handleSelectResult(data, select);
        }
        if (findOptions.json) {
          return data;
        } else {
          return ParseObject.fromJSON(data, !select);
        }
      });

      const count = response.count;

      if (typeof count === 'number') {
        return { results, count } as any;
      } else {
        return results;
      }
    });
  }

  /**
   * Retrieves a complete list of ParseObjects that satisfy this query.
   * Using `eachBatch` under the hood to fetch all the valid objects.
   *
   * @param {object} options Valid options are:<ul>
   *   <li>batchSize: How many objects to yield in each batch (default: 100)
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   *   <li>json: Return raw JSON without converting to Parse.Object.
   * </ul>
   * @returns {Promise} A promise that is resolved with the results when
   * the query completes.
   */
  async findAll(options?: BatchOptions): Promise<T[]> {
    let result: T[] = [];
    await this.eachBatch((objects: T[]) => {
      result = [...result, ...objects];
    }, options);
    return result;
  }

  /**
   * Counts the number of objects that match this query.
   *
   * @param {object} options
   * @param {boolean} [options.useMasterKey]
   * @param {string} [options.sessionToken]
   * Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   * </ul>
   * @returns {Promise} A promise that is resolved with the count when
   * the query completes.
   */
  count(options?: { useMasterKey?: boolean; sessionToken?: string }): Promise<number> {
    options = options || {};

    const findOptions = ParseObject._getRequestOptions(options);
    this._setRequestTask(findOptions);

    const controller = CoreManager.getQueryController();

    const params = this.toJSON();
    params.limit = 0;
    params.count = 1;

    return controller.find(this.className, params, findOptions).then(result => {
      return result.count;
    });
  }

  /**
   * Executes a distinct query and returns unique values
   *
   * @param {string} key A field to find distinct values
   * @param {object} options
   * @param {string} [options.sessionToken] A valid session token, used for making a request on behalf of a specific user.
   * @returns {Promise} A promise that is resolved with the query completes.
   */
  distinct<K extends keyof T['attributes'], V = T['attributes'][K]>(
    key: K,
    options?: { sessionToken?: string }
  ): Promise<V[]> {
    options = options || {};
    const distinctOptions: { sessionToken?: string; useMasterKey: boolean } = {
      useMasterKey: true,
    };
    if (Object.hasOwn(options, 'sessionToken')) {
      distinctOptions.sessionToken = options.sessionToken;
    }
    this._setRequestTask(distinctOptions);

    const controller = CoreManager.getQueryController();
    const params = {
      distinct: key,
      where: this._where,
      hint: this._hint,
    };
    return controller.aggregate(this.className, params, distinctOptions).then(results => {
      return results.results!;
    });
  }

  /**
   * Executes an aggregate query and returns aggregate results
   *
   * @param {(Array|object)} pipeline Array or Object of stages to process query
   * @param {object} options
   * @param {string} [options.sessionToken] A valid session token, used for making a request on behalf of a specific user.
   * @returns {Promise} A promise that is resolved with the query completes.
   */
  aggregate(pipeline: any, options?: { sessionToken?: string }): Promise<any[]> {
    options = options || {};
    const aggregateOptions: { sessionToken?: string; useMasterKey: boolean } = {
      useMasterKey: true,
    };
    if (Object.hasOwn(options, 'sessionToken')) {
      aggregateOptions.sessionToken = options.sessionToken;
    }
    this._setRequestTask(aggregateOptions);

    const controller = CoreManager.getQueryController();

    if (!Array.isArray(pipeline) && typeof pipeline !== 'object') {
      throw new Error('Invalid pipeline must be Array or Object');
    }

    if (Object.keys(this._where || {}).length) {
      if (!Array.isArray(pipeline)) {
        pipeline = [pipeline];
      }
      pipeline.unshift({ $match: this._where });
    }

    const params = {
      pipeline,
      hint: this._hint,
      explain: this._explain,
      readPreference: this._readPreference,
    };
    return controller.aggregate(this.className, params, aggregateOptions).then(results => {
      return results.results!;
    });
  }

  /**
   * Retrieves at most one Parse.Object that satisfies this query.
   *
   * Returns the object if there is one, otherwise undefined.
   *
   * @param {object} options Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   *   <li>context: A dictionary that is accessible in Cloud Code `beforeFind` trigger.
   *   <li>json: Return raw json without converting to Parse.Object
   * </ul>
   * @returns {Promise} A promise that is resolved with the object when
   * the query completes.
   */
  first(options: QueryOptions = {}): Promise<T | undefined> {
    const findOptions = ParseObject._getRequestOptions(options);
    this._setRequestTask(findOptions);

    const controller = CoreManager.getQueryController();

    const params = this.toJSON();
    params.limit = 1;

    const select = this._select;

    if (this._queriesLocalDatastore) {
      return this._handleOfflineQuery(params).then(objects => {
        if (!objects[0]) {
          return undefined;
        }
        return objects[0];
      });
    }

    return controller.find(this.className, params, findOptions).then(response => {
      const objects = response.results!;
      if (!objects[0]) {
        return undefined;
      }
      if (!objects[0].className) {
        objects[0].className = this.className;
      }

      // Make sure the data object contains keys for all objects that
      // have been requested with a select, so that our cached state
      // updates correctly.
      if (select) {
        handleSelectResult(objects[0], select);
      }
      if (findOptions.json) {
        return objects[0] as T;
      } else {
        return ParseObject.fromJSON(objects[0], !select) as T;
      }
    });
  }

  /**
   * Iterates over objects matching a query, calling a callback for each batch.
   * If the callback returns a promise, the iteration will not continue until
   * that promise has been fulfilled. If the callback returns a rejected
   * promise, then iteration will stop with that error. The items are processed
   * in an unspecified order. The query may not have any sort order, and may
   * not use limit or skip.
   *
   * @param {Function} callback Callback that will be called with each result
   *     of the query.
   * @param {object} options Valid options are:<ul>
   *   <li>batchSize: How many objects to yield in each batch (default: 100)
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   *   <li>context: A dictionary that is accessible in Cloud Code `beforeFind` trigger.
   * </ul>
   * @returns {Promise} A promise that will be fulfilled once the
   *     iteration has completed.
   */
  eachBatch(
    callback: (objs: T[]) => PromiseLike<void> | void,
    options?: BatchOptions
  ): Promise<void> {
    options = options || {};

    if (this._order || this._skip || this._limit >= 0) {
      const error = 'Cannot iterate on a query with sort, skip, or limit.';
      return Promise.reject(error);
    }

    const query = ParseQuery.fromJSON(this.className, this.toJSON());
    query.ascending('objectId');
    query._limit = options.batchSize || 100;

    const findOptions = ParseObject._getRequestOptions(options);
    let finished = false;
    let previousResults: T[] = [];
    return continueWhile(
      () => {
        return !finished;
      },
      async () => {
        const [results] = await Promise.all([
          query.find(findOptions),
          Promise.resolve(previousResults.length > 0 && callback(previousResults)),
        ]);
        if (results.length >= query._limit) {
          if (findOptions.json) {
            query.greaterThan('objectId', (results[results.length - 1] as any).objectId);
          } else {
            query.greaterThan('objectId', results[results.length - 1].id);
          }
          previousResults = results as T[];
        } else if (results.length > 0) {
          await Promise.resolve(callback(results as T[]));
          finished = true;
        } else {
          finished = true;
        }
      }
    );
  }

  /**
   * Iterates over each result of a query, calling a callback for each one. If
   * the callback returns a promise, the iteration will not continue until
   * that promise has been fulfilled. If the callback returns a rejected
   * promise, then iteration will stop with that error. The items are
   * processed in an unspecified order. The query may not have any sort order,
   * and may not use limit or skip.
   *
   * @param {Function} callback Callback that will be called with each result
   *     of the query.
   * @param {object} options Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   *   <li>json: Return raw json without converting to Parse.Object
   * </ul>
   * @returns {Promise} A promise that will be fulfilled once the
   *     iteration has completed.
   */
  each(callback: (obj: T) => PromiseLike<void> | void, options?: BatchOptions): Promise<void> {
    return this.eachBatch(results => {
      let callbacksDone = Promise.resolve();
      results.forEach((result: T) => {
        callbacksDone = callbacksDone.then(() => {
          return callback(result);
        });
      });
      return callbacksDone;
    }, options);
  }

  /**
   * Adds a hint to force index selection. (https://docs.mongodb.com/manual/reference/operator/meta/hint/)
   *
   * @param {(string|object)} value String or Object of index that should be used when executing query
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  hint(value: any): this {
    if (typeof value === 'undefined') {
      delete this._hint;
    }
    this._hint = value;
    return this;
  }

  /**
   * Investigates the query execution plan. Useful for optimizing queries. (https://docs.mongodb.com/manual/reference/operator/meta/explain/)
   *
   * @param {boolean} explain Used to toggle the information on the query plan.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  explain(explain = true): this {
    if (typeof explain !== 'boolean') {
      throw new Error('You can only set explain to a boolean value');
    }
    this._explain = explain;
    return this;
  }

  /**
   * Iterates over each result of a query, calling a callback for each one. If
   * the callback returns a promise, the iteration will not continue until
   * that promise has been fulfilled. If the callback returns a rejected
   * promise, then iteration will stop with that error. The items are
   * processed in an unspecified order. The query may not have any sort order,
   * and may not use limit or skip.
   *
   * @param {Function} callback Callback <ul>
   *   <li>currentObject: The current Parse.Object being processed in the array.</li>
   *   <li>index: The index of the current Parse.Object being processed in the array.</li>
   *   <li>query: The query map was called upon.</li>
   * </ul>
   * @param {object} options Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   * </ul>
   * @returns {Promise} A promise that will be fulfilled once the
   *     iteration has completed.
   */
  async map(
    callback: (currentObject: ParseObject, index: number, query: ParseQuery) => any,
    options?: BatchOptions
  ): Promise<any[]> {
    const array: ParseObject[] = [];
    let index = 0;
    await this.each(object => {
      return Promise.resolve(callback(object, index, this)).then(result => {
        array.push(result);
        index += 1;
      });
    }, options);
    return array;
  }

  /**
   * Iterates over each result of a query, calling a callback for each one. If
   * the callback returns a promise, the iteration will not continue until
   * that promise has been fulfilled. If the callback returns a rejected
   * promise, then iteration will stop with that error. The items are
   * processed in an unspecified order. The query may not have any sort order,
   * and may not use limit or skip.
   *
   * @param {Function} callback Callback <ul>
   *   <li>accumulator: The accumulator accumulates the callback's return values. It is the accumulated value previously returned in the last invocation of the callback.</li>
   *   <li>currentObject: The current Parse.Object being processed in the array.</li>
   *   <li>index: The index of the current Parse.Object being processed in the array.</li>
   * </ul>
   * @param {*} initialValue A value to use as the first argument to the first call of the callback. If no initialValue is supplied, the first object in the query will be used and skipped.
   * @param {object} options Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   * </ul>
   * @returns {Promise} A promise that will be fulfilled once the
   *     iteration has completed.
   */
  async reduce(
    callback: (accumulator: any, currentObject: ParseObject, index: number) => any,
    initialValue: any,
    options?: BatchOptions
  ): Promise<any[]> {
    let accumulator = initialValue;
    let index = 0;
    await this.each(object => {
      // If no initial value was given, we take the first object from the query
      // as the initial value and don't call the callback with it.
      if (index === 0 && initialValue === undefined) {
        accumulator = object;
        index += 1;
        return;
      }
      return Promise.resolve(callback(accumulator, object, index)).then(result => {
        accumulator = result;
        index += 1;
      });
    }, options);
    if (index === 0 && initialValue === undefined) {
      // Match Array.reduce behavior: "Calling reduce() on an empty array
      // without an initialValue will throw a TypeError".
      throw new TypeError('Reducing empty query result set with no initial value');
    }
    return accumulator;
  }

  /**
   * Iterates over each result of a query, calling a callback for each one. If
   * the callback returns a promise, the iteration will not continue until
   * that promise has been fulfilled. If the callback returns a rejected
   * promise, then iteration will stop with that error. The items are
   * processed in an unspecified order. The query may not have any sort order,
   * and may not use limit or skip.
   *
   * @param {Function} callback Callback <ul>
   *   <li>currentObject: The current Parse.Object being processed in the array.</li>
   *   <li>index: The index of the current Parse.Object being processed in the array.</li>
   *   <li>query: The query filter was called upon.</li>
   * </ul>
   * @param {object} options Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   * </ul>
   * @returns {Promise} A promise that will be fulfilled once the
   *     iteration has completed.
   */
  async filter(
    callback: (currentObject: ParseObject, index: number, query: ParseQuery) => boolean,
    options?: BatchOptions
  ): Promise<ParseObject[]> {
    const array: ParseObject[] = [];
    let index = 0;
    await this.each(object => {
      return Promise.resolve(callback(object, index, this)).then(flag => {
        if (flag) {
          array.push(object);
        }
        index += 1;
      });
    }, options);
    return array;
  }

  /* Query Conditions */

  /**
   * Adds a constraint to the query that requires a particular key's value to
   * be equal to the provided value.
   *
   * @param {string} key The key to check.
   * @param value The value that the Parse.Object must contain.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  equalTo<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    value:
      | T['attributes'][K]
      | (T['attributes'][K] extends ParseObject
          ? Pointer
          : T['attributes'][K] extends (infer E)[]
            ? E
            : never)
  ): this {
    if (key && typeof key === 'object') {
      Object.entries(key).forEach(([k, val]) => this.equalTo(k, val as any));
      return this;
    }
    if (typeof value === 'undefined') {
      return this.doesNotExist(key as string);
    }
    this._where[key as string] = encode(value, false, true);
    return this;
  }

  /**
   * Adds a constraint to the query that requires a particular key's value to
   * be not equal to the provided value.
   *
   * @param {string} key The key to check.
   * @param value The value that must not be equalled.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  notEqualTo<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    value:
      | T['attributes'][K]
      | (T['attributes'][K] extends ParseObject
          ? Pointer
          : T['attributes'][K] extends (infer E)[]
            ? E
            : never)
  ): this {
    if (key && typeof key === 'object') {
      Object.entries(key).forEach(([k, val]) => this.notEqualTo(k, val as any));
      return this;
    }
    return this._addCondition(key, '$ne', value);
  }

  /**
   * Adds a constraint to the query that requires a particular key's value to
   * be less than the provided value.
   *
   * @param {string} key The key to check.
   * @param value The value that provides an upper bound.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  lessThan<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    value: T['attributes'][K]
  ): this {
    return this._addCondition(key, '$lt', value);
  }

  /**
   * Adds a constraint to the query that requires a particular key's value to
   * be greater than the provided value.
   *
   * @param {string} key The key to check.
   * @param value The value that provides an lower bound.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  greaterThan<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    value: T['attributes'][K]
  ): this {
    return this._addCondition(key, '$gt', value);
  }

  /**
   * Adds a constraint to the query that requires a particular key's value to
   * be less than or equal to the provided value.
   *
   * @param {string} key The key to check.
   * @param value The value that provides an upper bound.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  lessThanOrEqualTo<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    value: T['attributes'][K]
  ): this {
    return this._addCondition(key, '$lte', value);
  }

  /**
   * Adds a constraint to the query that requires a particular key's value to
   * be greater than or equal to the provided value.
   *
   * @param {string} key The key to check.
   * @param {*} value The value that provides an lower bound.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  greaterThanOrEqualTo<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    value: T['attributes'][K]
  ): this {
    return this._addCondition(key, '$gte', value);
  }

  /**
   * Adds a constraint to the query that requires a particular key's value to
   * be contained in the provided list of values.
   *
   * @param {string} key The key to check.
   * @param {Array<*>} values The values that will match.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  containedIn<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    values: (T['attributes'][K] | (T['attributes'][K] extends ParseObject ? string : never))[]
  ): this {
    return this._addCondition(key, '$in', values);
  }

  /**
   * Adds a constraint to the query that requires a particular key's value to
   * not be contained in the provided list of values.
   *
   * @param {string} key The key to check.
   * @param {Array<*>} values The values that will not match.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  notContainedIn<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    values: T['attributes'][K][]
  ): this {
    return this._addCondition(key, '$nin', values);
  }

  /**
   * Adds a constraint to the query that requires a particular key's value to
   * be contained by the provided list of values. Get objects where all array elements match.
   *
   * @param {string} key The key to check.
   * @param {Array} values The values that will match.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  containedBy<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    values: (T['attributes'][K] | (T['attributes'][K] extends ParseObject ? string : never))[]
  ): this {
    return this._addCondition(key, '$containedBy', values);
  }

  /**
   * Adds a constraint to the query that requires a particular key's value to
   * contain each one of the provided list of values.
   *
   * @param {string} key The key to check.  This key's value must be an array.
   * @param {Array} values The values that will match.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  containsAll<K extends keyof T['attributes'] | keyof BaseAttributes>(key: K, values: any[]): this {
    return this._addCondition(key, '$all', values);
  }

  /**
   * Adds a constraint to the query that requires a particular key's value to
   * contain each one of the provided list of values starting with given strings.
   *
   * @param {string} key The key to check.  This key's value must be an array.
   * @param {Array<string>} values The string values that will match as starting string.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  containsAllStartingWith<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    values: any[]
  ): this {
    if (!Array.isArray(values)) {
      values = [values];
    }

    const regexObject = values.map(value => {
      return { $regex: this._regexStartWith(value) };
    });

    return this.containsAll(key, regexObject);
  }

  /**
   * Adds a constraint for finding objects that contain the given key.
   *
   * @param {string} key The key that should exist.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  exists<K extends keyof T['attributes'] | keyof BaseAttributes>(key: K): this {
    return this._addCondition(key, '$exists', true);
  }

  /**
   * Adds a constraint for finding objects that do not contain a given key.
   *
   * @param {string} key The key that should not exist
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  doesNotExist<K extends keyof T['attributes'] | keyof BaseAttributes>(key: K): this {
    return this._addCondition(key, '$exists', false);
  }

  /**
   * Adds a regular expression constraint for finding string values that match
   * the provided regular expression.
   * This may be slow for large datasets.
   *
   * @param {string} key The key that the string to match is stored in.
   * @param {RegExp | string} regex The regular expression pattern to match.
   * @param {string} modifiers The regular expression mode.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  matches<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    regex: RegExp | string,
    modifiers?: string
  ): this {
    this._addCondition(key, '$regex', regex);
    if (!modifiers) {
      modifiers = '';
    }
    if (typeof regex !== 'string') {
      if (regex.ignoreCase) {
        modifiers += 'i';
      }
      if (regex.multiline) {
        modifiers += 'm';
      }
    }
    if (modifiers.length) {
      this._addCondition(key, '$options', modifiers);
    }
    return this;
  }

  /**
   * Adds a constraint that requires that a key's value matches a Parse.Query
   * constraint.
   *
   * @param {string} key The key that the contains the object to match the
   *                     query.
   * @param {Parse.Query} query The query that should match.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  matchesQuery<U extends ParseObject, K extends keyof T['attributes']>(
    key: K,
    query: ParseQuery<U>
  ): this {
    const queryJSON = query.toJSON();
    queryJSON.className = query.className;
    return this._addCondition(key, '$inQuery', queryJSON);
  }

  /**
   * Adds a constraint that requires that a key's value not matches a
   * Parse.Query constraint.
   *
   * @param {string} key The key that the contains the object to match the
   *                     query.
   * @param {Parse.Query} query The query that should not match.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  doesNotMatchQuery<U extends ParseObject, K extends keyof T['attributes']>(
    key: K,
    query: ParseQuery<U>
  ): this {
    const queryJSON = query.toJSON();
    queryJSON.className = query.className;
    return this._addCondition(key, '$notInQuery', queryJSON);
  }

  /**
   * Adds a constraint that requires that a key's value matches a value in
   * an object returned by a different Parse.Query.
   *
   * @param {string} key The key that contains the value that is being
   *                     matched.
   * @param {string} queryKey The key in the objects returned by the query to
   *                          match against.
   * @param {Parse.Query} query The query to run.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  matchesKeyInQuery<
    U extends ParseObject,
    K extends keyof T['attributes'],
    X extends Extract<keyof U['attributes'], string>,
  >(key: K, queryKey: X, query: ParseQuery<U>): this {
    const queryJSON = query.toJSON();
    queryJSON.className = query.className;
    return this._addCondition(key, '$select', {
      key: queryKey,
      query: queryJSON,
    });
  }

  /**
   * Adds a constraint that requires that a key's value not match a value in
   * an object returned by a different Parse.Query.
   *
   * @param {string} key The key that contains the value that is being
   *                     excluded.
   * @param {string} queryKey The key in the objects returned by the query to
   *                          match against.
   * @param {Parse.Query} query The query to run.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  doesNotMatchKeyInQuery<
    U extends ParseObject,
    K extends keyof T['attributes'] | keyof BaseAttributes,
    X extends Extract<keyof U['attributes'], string>,
  >(key: K, queryKey: X, query: ParseQuery<U>): this {
    const queryJSON = query.toJSON();
    queryJSON.className = query.className;
    return this._addCondition(key, '$dontSelect', {
      key: queryKey,
      query: queryJSON,
    });
  }

  /**
   * Adds a constraint for finding string values that contain a provided
   * string.  This may be slow for large datasets.
   *
   * @param {string} key The key that the string to match is stored in.
   * @param {string} substring The substring that the value must contain.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  contains<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    substring: string
  ): this {
    if (typeof substring !== 'string') {
      throw new Error('The value being searched for must be a string.');
    }
    return this._addCondition(key, '$regex', quote(substring));
  }

  /**
   * Adds a constraint for finding string values that contain a provided
   * string. This may be slow for large datasets. Requires Parse-Server > 2.5.0
   *
   * In order to sort you must use select and ascending ($score is required)
   *  <pre>
   *   query.fullText('field', 'term');
   *   query.ascending('$score');
   *   query.select('$score');
   *  </pre>
   *
   * To retrieve the weight / rank
   *  <pre>
   *   object->get('score');
   *  </pre>
   *
   * You can define optionals by providing an object as a third parameter
   *  <pre>
   *   query.fullText('field', 'term', { language: 'es', diacriticSensitive: true });
   *  </pre>
   *
   * @param {string} key The key that the string to match is stored in.
   * @param {string} value The string to search
   * @param {object} options (Optional)
   * @param {string} options.language The language that determines the list of stop words for the search and the rules for the stemmer and tokenizer.
   * @param {boolean} options.caseSensitive A boolean flag to enable or disable case sensitive search.
   * @param {boolean} options.diacriticSensitive A boolean flag to enable or disable diacritic sensitive search.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  fullText<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    value: string,
    options?: FullTextQueryOptions
  ): this {
    options = options || {};

    if (!key) {
      throw new Error('A key is required.');
    }
    if (!value) {
      throw new Error('A search term is required');
    }
    if (typeof value !== 'string') {
      throw new Error('The value being searched for must be a string.');
    }

    const fullOptions: {
      $term?: string;
      $language?: string;
      $caseSensitive?: boolean;
      $diacriticSensitive?: boolean;
    } = {};
    fullOptions.$term = value;

    for (const option in options) {
      switch (option) {
      case 'language':
        fullOptions.$language = options[option];
        break;
      case 'caseSensitive':
        fullOptions.$caseSensitive = options[option];
        break;
      case 'diacriticSensitive':
        fullOptions.$diacriticSensitive = options[option];
        break;
      default:
        throw new Error(`Unknown option: ${option}`);
      }
    }

    return this._addCondition(key, '$text', { $search: fullOptions });
  }

  /**
   * Method to sort the full text search by text score
   *
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  sortByTextScore() {
    this.ascending('$score');
    this.select(['$score'] as any);
    return this;
  }

  /**
   * Adds a constraint for finding string values that start with a provided
   * string.  This query will use the backend index, so it will be fast even
   * for large datasets.
   *
   * @param {string} key The key that the string to match is stored in.
   * @param {string} prefix The substring that the value must start with.
   * @param {string} modifiers The regular expression mode.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  startsWith<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    prefix: string,
    modifiers?: string
  ): this {
    if (typeof prefix !== 'string') {
      throw new Error('The value being searched for must be a string.');
    }
    return this.matches(key, this._regexStartWith(prefix), modifiers);
  }

  /**
   * Adds a constraint for finding string values that end with a provided
   * string.  This will be slow for large datasets.
   *
   * @param {string} key The key that the string to match is stored in.
   * @param {string} suffix The substring that the value must end with.
   * @param {string} modifiers The regular expression mode.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  endsWith<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    suffix: string,
    modifiers?: string
  ): this {
    if (typeof suffix !== 'string') {
      throw new Error('The value being searched for must be a string.');
    }
    return this.matches(key, quote(suffix) + '$', modifiers);
  }

  /**
   * Adds a proximity based constraint for finding objects with key point
   * values near the point given.
   *
   * @param {string} key The key that the Parse.GeoPoint is stored in.
   * @param {Parse.GeoPoint} point The reference Parse.GeoPoint that is used.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  near<K extends keyof T['attributes'] | keyof BaseAttributes>(key: K, point: ParseGeoPoint): this {
    if (!(point instanceof ParseGeoPoint)) {
      // Try to cast it as a GeoPoint
      point = new ParseGeoPoint(point);
    }
    return this._addCondition(key, '$nearSphere', point);
  }

  /**
   * Adds a proximity based constraint for finding objects with key point
   * values near the point given and within the maximum distance given.
   *
   * @param {string} key The key that the Parse.GeoPoint is stored in.
   * @param {Parse.GeoPoint} point The reference Parse.GeoPoint that is used.
   * @param {number} maxDistance Maximum distance (in radians) of results to return.
   * @param {boolean} sorted A Bool value that is true if results should be
   * sorted by distance ascending, false is no sorting is required,
   * defaults to true.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  withinRadians<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    point: ParseGeoPoint,
    maxDistance: number,
    sorted?: boolean
  ): this {
    if (sorted || sorted === undefined) {
      this.near(key, point);
      return this._addCondition(key, '$maxDistance', maxDistance);
    } else {
      return this._addCondition(key, '$geoWithin', {
        $centerSphere: [[point.longitude, point.latitude], maxDistance],
      });
    }
  }

  /**
   * Adds a proximity based constraint for finding objects with key point
   * values near the point given and within the maximum distance given.
   * Radius of earth used is 3958.8 miles.
   *
   * @param {string} key The key that the Parse.GeoPoint is stored in.
   * @param {Parse.GeoPoint} point The reference Parse.GeoPoint that is used.
   * @param {number} maxDistance Maximum distance (in miles) of results to return.
   * @param {boolean} sorted A Bool value that is true if results should be
   * sorted by distance ascending, false is no sorting is required,
   * defaults to true.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  withinMiles<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    point: ParseGeoPoint,
    maxDistance: number,
    sorted?: boolean
  ): this {
    return this.withinRadians(key, point, maxDistance / 3958.8, sorted);
  }

  /**
   * Adds a proximity based constraint for finding objects with key point
   * values near the point given and within the maximum distance given.
   * Radius of earth used is 6371.0 kilometers.
   *
   * @param {string} key The key that the Parse.GeoPoint is stored in.
   * @param {Parse.GeoPoint} point The reference Parse.GeoPoint that is used.
   * @param {number} maxDistance Maximum distance (in kilometers) of results to return.
   * @param {boolean} sorted A Bool value that is true if results should be
   * sorted by distance ascending, false is no sorting is required,
   * defaults to true.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  withinKilometers<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    point: ParseGeoPoint,
    maxDistance: number,
    sorted?: boolean
  ): this {
    return this.withinRadians(key, point, maxDistance / 6371.0, sorted);
  }

  /**
   * Adds a constraint to the query that requires a particular key's
   * coordinates be contained within a given rectangular geographic bounding
   * box.
   *
   * @param {string} key The key to be constrained.
   * @param {Parse.GeoPoint} southwest
   *     The lower-left inclusive corner of the box.
   * @param {Parse.GeoPoint} northeast
   *     The upper-right inclusive corner of the box.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  withinGeoBox<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    southwest: ParseGeoPoint,
    northeast: ParseGeoPoint
  ): this {
    if (!(southwest instanceof ParseGeoPoint)) {
      southwest = new ParseGeoPoint(southwest);
    }
    if (!(northeast instanceof ParseGeoPoint)) {
      northeast = new ParseGeoPoint(northeast);
    }
    this._addCondition(key, '$within', { $box: [southwest, northeast] });
    return this;
  }

  /**
   * Adds a constraint to the query that requires a particular key's
   * coordinates be contained within and on the bounds of a given polygon.
   * Supports closed and open (last point is connected to first) paths
   *
   * Polygon must have at least 3 points
   *
   * @param {string} key The key to be constrained.
   * @param {Array} points Array of Coordinates / GeoPoints
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  withinPolygon<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    points: number[][]
  ): this {
    return this._addCondition(key, '$geoWithin', { $polygon: points });
  }

  /**
   * Add a constraint to the query that requires a particular key's
   * coordinates that contains a ParseGeoPoint
   *
   * @param {string} key The key to be constrained.
   * @param {Parse.GeoPoint} point
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  polygonContains<K extends keyof T['attributes'] | keyof BaseAttributes>(
    key: K,
    point: ParseGeoPoint
  ): this {
    return this._addCondition(key, '$geoIntersects', { $point: point });
  }

  /* Query Orderings */

  /**
   * Sorts the results in ascending order by the given key.
   *
   * @param {(string|string[])} keys The key to order by, which is a
   * string of comma separated values, or an Array of keys, or multiple keys.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  ascending(...keys: string[]): this {
    this._order = [];
    return this.addAscending.apply(this, keys);
  }

  /**
   * Sorts the results in ascending order by the given key,
   * but can also add secondary sort descriptors without overwriting _order.
   *
   * @param {(string|string[])} keys The key to order by, which is a
   * string of comma separated values, or an Array of keys, or multiple keys.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  addAscending(...keys: string[]): this {
    if (!this._order) {
      this._order = [];
    }
    keys.forEach((key: any) => {
      if (Array.isArray(key)) {
        key = key.join();
      }
      this._order = this._order.concat(key.replace(/\s/g, '').split(','));
    });

    return this;
  }

  /**
   * Sorts the results in descending order by the given key.
   *
   * @param {(string|string[])} keys The key to order by, which is a
   * string of comma separated values, or an Array of keys, or multiple keys.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  descending(...keys: string[]): this {
    this._order = [];
    return this.addDescending.apply(this, keys);
  }

  /**
   * Sorts the results in descending order by the given key,
   * but can also add secondary sort descriptors without overwriting _order.
   *
   * @param {(string|string[])} keys The key to order by, which is a
   * string of comma separated values, or an Array of keys, or multiple keys.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  addDescending(...keys: string[]): this {
    if (!this._order) {
      this._order = [];
    }
    keys.forEach((key: any) => {
      if (Array.isArray(key)) {
        key = key.join();
      }
      this._order = this._order.concat(
        key
          .replace(/\s/g, '')
          .split(',')
          .map((k: string) => {
            return '-' + k;
          })
      );
    });

    return this;
  }

  /* Query Options */

  /**
   * Sets the number of results to skip before returning any results.
   * This is useful for pagination.
   * Default is to skip zero results.
   *
   * @param {number} n the number of results to skip.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  skip(n: number): this {
    if (typeof n !== 'number' || n < 0) {
      throw new Error('You can only skip by a positive number');
    }
    this._skip = n;
    return this;
  }

  /**
   * Sets the limit of the number of results to return. The default limit is 100.
   *
   * @param {number} n the number of results to limit to.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  limit(n: number): this {
    if (typeof n !== 'number') {
      throw new Error('You can only set the limit to a numeric value');
    }
    this._limit = n;
    return this;
  }

  /**
   * Sets the flag to include with response the total number of objects satisfying this query,
   * despite limits/skip. Might be useful for pagination.
   * Note that result of this query will be wrapped as an object with
   * `results`: holding {ParseObject} array and `count`: integer holding total number
   *
   * @param {boolean} includeCount false - disable, true - enable.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  withCount(includeCount = true): this {
    if (typeof includeCount !== 'boolean') {
      throw new Error('You can only set withCount to a boolean value');
    }
    this._count = includeCount;
    return this;
  }
  /**
   * Includes nested Parse.Objects for the provided key.  You can use dot
   * notation to specify which fields in the included object are also fetched.
   *
   * You can include all nested Parse.Objects by passing in '*'.
   * Requires Parse Server 3.0.0+
   * <pre>query.include('*');</pre>
   *
   * @param {...string|Array<string>} keys The name(s) of the key(s) to include.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  include<K extends keyof T['attributes'] | keyof BaseAttributes>(...keys: (K | K[])[]): this {
    keys.forEach(key => {
      if (Array.isArray(key)) {
        this._include = this._include.concat(key as string[]);
      } else {
        this._include.push(key as string);
      }
    });
    return this;
  }

  /**
   * Includes all nested Parse.Objects one level deep.
   *
   * Requires Parse Server 3.0.0+
   *
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  includeAll(): this {
    return this.include('*');
  }

  /**
   * Restricts the fields of the returned Parse.Objects to include only the
   * provided keys.  If this is called multiple times, then all of the keys
   * specified in each of the calls will be included.
   *
   * @param {...string|Array<string>} keys The name(s) of the key(s) to include.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  select<K extends keyof T['attributes'] | keyof BaseAttributes>(...keys: (K | K[])[]): this {
    if (!this._select) {
      this._select = [];
    }
    keys.forEach(key => {
      if (Array.isArray(key)) {
        this._select = this._select.concat(key as string[]);
      } else {
        this._select.push(key as string);
      }
    });
    return this;
  }

  /**
   * Restricts the fields of the returned Parse.Objects to all keys except the
   * provided keys. Exclude takes precedence over select and include.
   *
   * Requires Parse Server 3.6.0+
   *
   * @param {...string|Array<string>} keys The name(s) of the key(s) to exclude.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  exclude<K extends keyof T['attributes'] | keyof BaseAttributes>(...keys: (K | K[])[]): this {
    keys.forEach(key => {
      if (Array.isArray(key)) {
        this._exclude = this._exclude.concat(key as string[]);
      } else {
        this._exclude.push(key as string);
      }
    });
    return this;
  }

  /**
   * Restricts live query to trigger only for watched fields.
   *
   * Requires Parse Server 6.0.0+
   *
   * @param {...string|Array<string>} keys The name(s) of the key(s) to watch.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  watch<K extends keyof T['attributes'] | keyof BaseAttributes>(...keys: (K | K[])[]): this {
    keys.forEach(key => {
      if (Array.isArray(key)) {
        this._watch = this._watch.concat(key as string[]);
      } else {
        this._watch.push(key as string);
      }
    });
    return this;
  }

  /**
   * Changes the read preference that the backend will use when performing the query to the database.
   *
   * @param {string} readPreference The read preference for the main query.
   * @param {string} includeReadPreference The read preference for the queries to include pointers.
   * @param {string} subqueryReadPreference The read preference for the sub queries.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  readPreference(
    readPreference: string,
    includeReadPreference?: string,
    subqueryReadPreference?: string
  ): this {
    this._readPreference = readPreference;
    this._includeReadPreference = includeReadPreference || null;
    this._subqueryReadPreference = subqueryReadPreference || null;
    return this;
  }

  /**
   * Subscribe this query to get liveQuery updates
   *
   * @param {string} sessionToken (optional) Defaults to the currentUser
   * @returns {Promise<LiveQuerySubscription>} Returns the liveQuerySubscription, it's an event emitter
   * which can be used to get liveQuery updates.
   */
  async subscribe(sessionToken?: string | null): Promise<LiveQuerySubscription> {
    const currentUser = await CoreManager.getUserController().currentUserAsync();
    if (!sessionToken) {
      sessionToken = currentUser ? currentUser.getSessionToken() || undefined : undefined;
    }
    const liveQueryClient = await CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    if (liveQueryClient.shouldOpen()) {
      liveQueryClient.open();
    }
    const subscription = liveQueryClient.subscribe(this, sessionToken!);
    return subscription.subscribePromise.then(() => {
      return subscription;
    });
  }

  /**
   * Constructs a Parse.Query that is the OR of the passed in queries.  For
   * example:
   * <pre>var compoundQuery = Parse.Query.or(query1, query2, query3);</pre>
   *
   * will create a compoundQuery that is an or of the query1, query2, and
   * query3.
   *
   * @param {...Parse.Query} queries The list of queries to OR.
   * @static
   * @returns {Parse.Query} The query that is the OR of the passed in queries.
   */
  static or(...queries: ParseQuery[]): ParseQuery {
    const className = _getClassNameFromQueries(queries);
    const query = new ParseQuery(className!);
    query._orQuery(queries);
    return query;
  }

  /**
   * Constructs a Parse.Query that is the AND of the passed in queries.  For
   * example:
   * <pre>var compoundQuery = Parse.Query.and(query1, query2, query3);</pre>
   *
   * will create a compoundQuery that is an and of the query1, query2, and
   * query3.
   *
   * @param {...Parse.Query} queries The list of queries to AND.
   * @static
   * @returns {Parse.Query} The query that is the AND of the passed in queries.
   */
  static and(...queries: ParseQuery[]): ParseQuery {
    const className = _getClassNameFromQueries(queries);
    const query = new ParseQuery(className!);
    query._andQuery(queries);
    return query;
  }

  /**
   * Constructs a Parse.Query that is the NOR of the passed in queries.  For
   * example:
   * <pre>const compoundQuery = Parse.Query.nor(query1, query2, query3);</pre>
   *
   * will create a compoundQuery that is a nor of the query1, query2, and
   * query3.
   *
   * @param {...Parse.Query} queries The list of queries to NOR.
   * @static
   * @returns {Parse.Query} The query that is the NOR of the passed in queries.
   */
  static nor(...queries: ParseQuery[]): ParseQuery {
    const className = _getClassNameFromQueries(queries);
    const query = new ParseQuery(className!);
    query._norQuery(queries);
    return query;
  }

  /**
   * Change the source of this query to the server.
   *
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  fromNetwork(): this {
    this._queriesLocalDatastore = false;
    this._localDatastorePinName = null;
    return this;
  }

  /**
   * Changes the source of this query to all pinned objects.
   *
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  fromLocalDatastore(): this {
    return this.fromPinWithName(null);
  }

  /**
   * Changes the source of this query to the default group of pinned objects.
   *
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  fromPin(): this {
    return this.fromPinWithName(DEFAULT_PIN);
  }

  /**
   * Changes the source of this query to a specific group of pinned objects.
   *
   * @param {string} name The name of query source.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  fromPinWithName(name?: string | null): this {
    const localDatastore = CoreManager.getLocalDatastore();
    if (localDatastore.checkIfEnabled()) {
      this._queriesLocalDatastore = true;
      this._localDatastorePinName = name;
    }
    return this;
  }

  /**
   * Cancels the current network request (if any is running).
   *
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  cancel(): this {
    if (this._xhrRequest.task && typeof this._xhrRequest.task.abort === 'function') {
      this._xhrRequest.task._aborted = true;
      this._xhrRequest.task.abort();
      this._xhrRequest.task = null;
      this._xhrRequest.onchange = () => {};
      return this;
    }
    this._xhrRequest.onchange = () => this.cancel();
    return this;
  }

  _setRequestTask(options) {
    options.requestTask = task => {
      this._xhrRequest.task = task;
      this._xhrRequest.onchange();
    };
  }

  /**
   * Sets a comment to the query so that the query
   * can be identified when using a the profiler for MongoDB.
   *
   * @param {string} value a comment can make your profile data easier to interpret and trace.
   * @returns {Parse.Query} Returns the query, so you can chain this call.
   */
  comment(value: string): this {
    if (value == null) {
      delete this._comment;
      return this;
    }
    if (typeof value !== 'string') {
      throw new Error('The value of a comment to be sent with this query must be a string.');
    }
    this._comment = value;
    return this;
  }
}

const DefaultController = {
  find(
    className: string,
    params: QueryJSON,
    options?: RequestOptions
  ): Promise<{ results: ParseObject[] }> {
    const RESTController = CoreManager.getRESTController();
    return RESTController.request('GET', 'classes/' + className, params, options);
  },

  aggregate(className: string, params: any, options?: RequestOptions): Promise<{ results: any[] }> {
    const RESTController = CoreManager.getRESTController();

    return RESTController.request('GET', 'aggregate/' + className, params, options);
  },
};

CoreManager.setParseQuery(ParseQuery);
CoreManager.setQueryController(DefaultController);

export default ParseQuery;
