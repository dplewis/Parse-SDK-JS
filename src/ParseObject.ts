import CoreManager from './CoreManager';
import canBeSerialized from './canBeSerialized';
import decode from './decode';
import encode from './encode';
import escape from './escape';
import ParseACL from './ParseACL';
import parseDate from './parseDate';
import ParseError from './ParseError';
import ParseFile from './ParseFile';
import { when, continueWhile, resolvingPromise } from './promiseUtils';
import { DEFAULT_PIN, PIN_PREFIX } from './LocalDatastoreUtils';
import uuidv4 from './uuid';
import {
  opFromJSON,
  Op,
  SetOp,
  UnsetOp,
  IncrementOp,
  AddOp,
  AddUniqueOp,
  RemoveOp,
  RelationOp,
} from './ParseOp';
import ParseRelation from './ParseRelation';
import * as SingleInstanceStateController from './SingleInstanceStateController';
import unique from './unique';
import * as UniqueInstanceStateController from './UniqueInstanceStateController';
import unsavedChildren from './unsavedChildren';

import type { AttributeMap, OpsMap } from './ObjectStateMutations';
import type { RequestOptions, FullOptions } from './RESTController';
import type ParseGeoPoint from './ParseGeoPoint';
import type ParsePolygon from './ParsePolygon';

export interface Pointer {
  __type: string;
  className: string;
  objectId?: string;
  _localId?: string;
}

interface SaveParams {
  method: string;
  path: string;
  body: AttributeMap;
}

export type SaveOptions = FullOptions & {
  cascadeSave?: boolean;
  context?: AttributeMap;
  batchSize?: number;
  transaction?: boolean;
};

interface FetchOptions {
  useMasterKey?: boolean;
  sessionToken?: string;
  include?: string | string[];
  context?: AttributeMap;
}

export interface SetOptions {
  ignoreValidation?: boolean;
  unset?: boolean;
}

export type AttributeKey<T> = Extract<keyof T, string>;

export type Attributes = Record<string, any>;

interface JSONBaseAttributes {
  objectId: string;
  createdAt: string;
  updatedAt: string;
}

interface CommonAttributes {
  ACL: ParseACL;
}

type AtomicKey<T> = {
  [K in keyof T]: NonNullable<T[K]> extends any[] ? K : never;
};

type Encode<T> = T extends ParseObject
  ? ReturnType<T['toJSON']> | Pointer
  : T extends ParseACL | ParseGeoPoint | ParsePolygon | ParseRelation | ParseFile
    ? ReturnType<T['toJSON']>
    : T extends Date
      ? { __type: 'Date'; iso: string }
      : T extends RegExp
        ? string
        : T extends (infer R)[]
          ? Encode<R>[]
          : T extends object
            ? ToJSON<T>
            : T;

type ToJSON<T> = {
  [K in keyof T]: Encode<T[K]>;
};

// Mapping of class names to constructors, so we can populate objects from the
// server with appropriate subclasses of ParseObject
const classMap: AttributeMap = {};

// Global counter for generating unique Ids for non-single-instance objects
let objectCount = 0;
// On web clients, objects are single-instance: any two objects with the same Id
// will have the same attributes. However, this may be dangerous default
// behavior in a server scenario
let singleInstance = !CoreManager.get('IS_NODE');
if (singleInstance) {
  CoreManager.setObjectStateController(SingleInstanceStateController);
} else {
  CoreManager.setObjectStateController(UniqueInstanceStateController);
}

function getServerUrlPath() {
  let serverUrl = CoreManager.get('SERVER_URL');
  if (serverUrl[serverUrl.length - 1] !== '/') {
    serverUrl += '/';
  }
  const url = serverUrl.replace(/https?:\/\//, '');
  return url.substr(url.indexOf('/'));
}

/**
 * Creates a new model with defined attributes.
 *
 * <p>You won't normally call this method directly.  It is recommended that
 * you use a subclass of <code>Parse.Object</code> instead, created by calling
 * <code>extend</code>.</p>
 *
 * <p>However, if you don't want to use a subclass, or aren't sure which
 * subclass is appropriate, you can use this form:<pre>
 *     var object = new Parse.Object("ClassName");
 * </pre>
 * That is basically equivalent to:<pre>
 *     var MyClass = Parse.Object.extend("ClassName");
 *     var object = new MyClass();
 * </pre></p>
 *
 * @alias Parse.Object
 */
class ParseObject<T extends Attributes = Attributes> {
  /**
   * @param {string} className The class name for the object
   * @param {object} attributes The initial set of data to store in the object.
   * @param {object} options The options for this object instance.
   * @param {boolean} [options.ignoreValidation] Set to `true` ignore any attribute validation errors.
   */
  constructor(
    className?: string | { className: string; [attr: string]: any },
    attributes?: T,
    options?: SetOptions
  ) {
    // Enable legacy initializers
    if (typeof this.initialize === 'function') {
      this.initialize.apply(this, arguments);
    }

    let toSet = null;
    this._objCount = objectCount++;
    if (typeof className === 'string') {
      this.className = className;
      if (attributes && typeof attributes === 'object') {
        toSet = attributes;
      }
    } else if (className && typeof className === 'object') {
      this.className = className.className;
      toSet = {};
      for (const attr in className) {
        if (attr !== 'className') {
          toSet[attr] = className[attr];
        }
      }
      if (attributes && typeof attributes === 'object') {
        options = attributes as any;
      }
    }
    if (toSet) {
      try {
        this.set(toSet, options);
      } catch (_) {
        throw new Error("Can't create an invalid Parse Object");
      }
    }
  }

  /**
   * The ID of this object, unique within its class.
   *
   * @property {string} id
   */
  id?: string;
  _localId?: string;
  _objCount: number;
  className: string;

  /* Prototype getters / setters */

  get attributes(): T {
    const stateController = CoreManager.getObjectStateController();
    return Object.freeze(stateController.estimateAttributes(this._getStateIdentifier())) as T;
  }

  /**
   * The first time this object was saved on the server.
   *
   * @property {Date} createdAt
   * @returns {Date}
   */
  get createdAt(): Date | undefined {
    return this._getServerData().createdAt;
  }

  /**
   * The last time this object was updated on the server.
   *
   * @property {Date} updatedAt
   * @returns {Date}
   */
  get updatedAt(): Date | undefined {
    return this._getServerData().updatedAt;
  }

  /* Private methods */

  /**
   * Returns a local or server Id used uniquely identify this object
   *
   * @returns {string}
   */
  _getId(): string {
    if (typeof this.id === 'string') {
      return this.id;
    }
    if (typeof this._localId === 'string') {
      return this._localId;
    }
    const localId = 'local' + uuidv4();
    this._localId = localId;
    return localId;
  }

  /**
   * Returns a unique identifier used to pull data from the State Controller.
   *
   * @returns {Parse.Object|object}
   */
  _getStateIdentifier(): ParseObject | { id: string; className: string } {
    if (singleInstance) {
      let id = this.id;
      if (!id) {
        id = this._getId();
      }
      return {
        id,
        className: this.className,
      };
    } else {
      return this;
    }
  }

  _getServerData(): Attributes {
    const stateController = CoreManager.getObjectStateController();
    return stateController.getServerData(this._getStateIdentifier());
  }

  _clearServerData() {
    const serverData = this._getServerData();
    const unset = {};
    for (const attr in serverData) {
      unset[attr] = undefined;
    }
    const stateController = CoreManager.getObjectStateController();
    stateController.setServerData(this._getStateIdentifier(), unset);
  }

  _getPendingOps(): OpsMap[] {
    const stateController = CoreManager.getObjectStateController();
    return stateController.getPendingOps(this._getStateIdentifier());
  }

  /**
   * @param {Array<string>} [keysToClear] - if specified, only ops matching
   * these fields will be cleared
   */
  _clearPendingOps(keysToClear?: string[]) {
    const pending = this._getPendingOps();
    const latest = pending[pending.length - 1];
    const keys = keysToClear || Object.keys(latest);
    keys.forEach(key => {
      delete latest[key];
    });
  }

  _getDirtyObjectAttributes(): Attributes {
    const attributes = this.attributes;
    const stateController = CoreManager.getObjectStateController();
    const objectCache = stateController.getObjectCache(this._getStateIdentifier());
    const dirty: Attributes = {};
    for (const attr in attributes) {
      const val: any = attributes[attr];
      if (
        val &&
        typeof val === 'object' &&
        !(val instanceof ParseObject) &&
        !(val instanceof ParseFile) &&
        !(val instanceof ParseRelation)
      ) {
        // Due to the way browsers construct maps, the key order will not change
        // unless the object is changed
        try {
          const json = encode(val, false, true);
          const stringified = JSON.stringify(json);
          if (objectCache[attr] !== stringified) {
            dirty[attr] = val;
          }
        } catch (_) {
          // Error occurred, possibly by a nested unsaved pointer in a mutable container
          // No matter how it happened, it indicates a change in the attribute
          dirty[attr] = val;
        }
      }
    }
    return dirty;
  }

  _toFullJSON(seen?: any[], offline?: boolean): Attributes {
    const json: Attributes = this.toJSON(seen, offline);
    json.__type = 'Object';
    json.className = this.className;
    return json;
  }

  _getSaveJSON(): Attributes {
    const pending = this._getPendingOps();
    const dirtyObjects = this._getDirtyObjectAttributes();
    const json = {};
    let attr;

    for (attr in dirtyObjects) {
      let isDotNotation = false;
      for (let i = 0; i < pending.length; i += 1) {
        for (const field in pending[i]) {
          // Dot notation operations are handled later
          if (field.includes('.')) {
            const fieldName = field.split('.')[0];
            if (fieldName === attr) {
              isDotNotation = true;
              break;
            }
          }
        }
      }
      if (!isDotNotation) {
        json[attr] = new SetOp(dirtyObjects[attr]).toJSON();
      }
    }
    for (attr in pending[0]) {
      json[attr] = pending[0][attr].toJSON();
    }
    return json;
  }

  _getSaveParams(): SaveParams {
    let method = this.id ? 'PUT' : 'POST';
    const body = this._getSaveJSON();
    let path = 'classes/' + this.className;
    if (CoreManager.get('ALLOW_CUSTOM_OBJECT_ID')) {
      if (!this.createdAt) {
        method = 'POST';
        body.objectId = this.id;
      } else {
        method = 'PUT';
        path += '/' + this.id;
      }
    } else if (this.id) {
      path += '/' + this.id;
    } else if (this.className === '_User') {
      path = 'users';
    }
    return {
      method,
      body,
      path,
    };
  }

  _finishFetch(serverData: Attributes) {
    if (!this.id && serverData.objectId) {
      this.id = serverData.objectId;
    }
    const stateController = CoreManager.getObjectStateController();
    stateController.initializeState(this._getStateIdentifier());
    const decoded: Partial<{
      createdAt?: Date;
      updatedAt?: Date;
      ACL?: any;
      [key: string]: any;
    }> = {};
    for (const attr in serverData) {
      if (attr === 'ACL') {
        decoded[attr] = new ParseACL(serverData[attr]);
      } else if (attr !== 'objectId') {
        decoded[attr] = decode(serverData[attr]);
        if (decoded[attr] instanceof ParseRelation) {
          decoded[attr]._ensureParentAndKey(this, attr);
        }
      }
    }
    if (decoded.createdAt && typeof decoded.createdAt === 'string') {
      decoded.createdAt = parseDate(decoded.createdAt);
    }
    if (decoded.updatedAt && typeof decoded.updatedAt === 'string') {
      decoded.updatedAt = parseDate(decoded.updatedAt);
    }
    if (!decoded.updatedAt && decoded.createdAt) {
      decoded.updatedAt = decoded.createdAt;
    }
    stateController.commitServerChanges(this._getStateIdentifier(), decoded);
  }

  _setExisted(existed: boolean) {
    const stateController = CoreManager.getObjectStateController();
    const state = stateController.getState(this._getStateIdentifier());
    if (state) {
      state.existed = existed;
    }
  }

  _migrateId(serverId: string) {
    if (this._localId && serverId) {
      if (singleInstance) {
        const stateController = CoreManager.getObjectStateController();
        const oldState = stateController.removeState(this._getStateIdentifier());
        this.id = serverId;
        delete this._localId;
        if (oldState) {
          stateController.initializeState(this._getStateIdentifier(), oldState);
        }
      } else {
        this.id = serverId;
        delete this._localId;
      }
    }
  }

  _handleSaveResponse(response: Attributes, status: number) {
    const changes: Partial<{
      createdAt: string;
      updatedAt: string;
      [key: string]: any;
    }> = {};
    let attr;
    const stateController = CoreManager.getObjectStateController();
    const pending = stateController.popPendingState(this._getStateIdentifier());
    for (attr in pending) {
      if (pending[attr] instanceof RelationOp) {
        changes[attr] = (pending[attr] as RelationOp).applyTo(undefined, this, attr);
      } else if (!(attr in response)) {
        // Only SetOps and UnsetOps should not come back with results
        changes[attr] = pending[attr].applyTo(undefined);
      }
    }
    for (attr in response) {
      if ((attr === 'createdAt' || attr === 'updatedAt') && typeof response[attr] === 'string') {
        changes[attr] = parseDate(response[attr]);
      } else if (attr === 'ACL') {
        changes[attr] = new ParseACL(response[attr]);
      } else if (attr !== 'objectId') {
        const val = decode(response[attr]);
        if (val && Object.getPrototypeOf(val) === Object.prototype) {
          changes[attr] = { ...this.attributes[attr], ...val };
        } else {
          changes[attr] = val;
        }
        if (changes[attr] instanceof UnsetOp) {
          changes[attr] = undefined;
        }
      }
    }
    if (changes.createdAt && !changes.updatedAt) {
      changes.updatedAt = changes.createdAt;
    }

    this._migrateId(response.objectId);

    if (status !== 201) {
      this._setExisted(true);
    }

    stateController.commitServerChanges(this._getStateIdentifier(), changes);
  }

  _handleSaveError() {
    const stateController = CoreManager.getObjectStateController();
    stateController.mergeFirstPendingState(this._getStateIdentifier());
  }

  static _getClassMap() {
    return classMap;
  }

  static _getRequestOptions(options: RequestOptions & FullOptions & { json?: boolean } = {}) {
    const requestOptions: RequestOptions & FullOptions & { json?: boolean } = {};
    const { hasOwn } = Object;
    if (hasOwn(options, 'useMasterKey')) {
      requestOptions.useMasterKey = !!options.useMasterKey;
    }
    if (hasOwn(options, 'useMaintenanceKey')) {
      requestOptions.useMaintenanceKey = !!options.useMaintenanceKey;
    }
    if (hasOwn(options, 'sessionToken') && typeof options.sessionToken === 'string') {
      requestOptions.sessionToken = options.sessionToken;
    }
    if (hasOwn(options, 'installationId') && typeof options.installationId === 'string') {
      requestOptions.installationId = options.installationId;
    }
    if (hasOwn(options, 'transaction') && typeof options.transaction === 'boolean') {
      requestOptions.transaction = options.transaction;
    }
    if (hasOwn(options, 'batchSize') && typeof options.batchSize === 'number') {
      requestOptions.batchSize = options.batchSize;
    }
    if (hasOwn(options, 'context') && typeof options.context === 'object') {
      requestOptions.context = options.context;
    }
    if (hasOwn(options, 'include')) {
      requestOptions.include = ParseObject.handleIncludeOptions(options);
    }
    if (hasOwn(options, 'usePost')) {
      requestOptions.usePost = options.usePost;
    }
    if (hasOwn(options, 'json')) {
      requestOptions.json = options.json;
    }
    return requestOptions;
  }

  /* Public methods */

  initialize() {
    // NOOP
  }

  /**
   * Returns a JSON version of the object suitable for saving to Parse.
   *
   * @param seen
   * @param offline
   * @returns {object}
   */
  toJSON(seen?: any[], offline?: boolean): ToJSON<T> & JSONBaseAttributes {
    const seenEntry = this.id ? this.className + ':' + this.id : this;
    seen = seen || [seenEntry];
    const json: any = {};
    const attrs = this.attributes;
    for (const attr in attrs) {
      if ((attr === 'createdAt' || attr === 'updatedAt') && attrs[attr].toJSON) {
        json[attr] = attrs[attr].toJSON();
      } else {
        json[attr] = encode(attrs[attr], false, false, seen, offline);
      }
    }
    const pending = this._getPendingOps();
    for (const attr in pending[0]) {
      if (attr.indexOf('.') < 0) {
        json[attr] = pending[0][attr].toJSON(offline);
      }
    }
    if (this.id) {
      json.objectId = this.id;
    }
    return json;
  }

  /**
   * Determines whether this ParseObject is equal to another ParseObject
   *
   * @param {object} other - An other object ot compare
   * @returns {boolean}
   */
  equals<T extends ParseObject>(other: T): boolean {
    if ((this as any) === (other as any)) {
      return true;
    }
    return (
      other instanceof ParseObject &&
      this.className === other.className &&
      this.id === other.id &&
      typeof this.id !== 'undefined'
    );
  }

  /**
   * Returns true if this object has been modified since its last
   * save/refresh.  If an attribute is specified, it returns true only if that
   * particular attribute has been modified since the last save/refresh.
   *
   * @param {string} attr An attribute name (optional).
   * @returns {boolean}
   */
  dirty<K extends AttributeKey<T>>(attr?: K): boolean {
    if (!this.id) {
      return true;
    }
    const pendingOps = this._getPendingOps();
    const dirtyObjects = this._getDirtyObjectAttributes();
    if (attr) {
      if (Object.hasOwn(dirtyObjects, attr)) {
        return true;
      }
      for (let i = 0; i < pendingOps.length; i++) {
        if (Object.hasOwn(pendingOps[i], attr)) {
          return true;
        }
      }
      return false;
    }
    if (Object.keys(pendingOps[0]).length !== 0) {
      return true;
    }
    if (Object.keys(dirtyObjects).length !== 0) {
      return true;
    }
    return false;
  }

  /**
   * Returns an array of keys that have been modified since last save/refresh
   *
   * @returns {string[]}
   */
  dirtyKeys(): string[] {
    const pendingOps = this._getPendingOps();
    const keys = {};
    for (let i = 0; i < pendingOps.length; i++) {
      for (const attr in pendingOps[i]) {
        keys[attr] = true;
      }
    }
    const dirtyObjects = this._getDirtyObjectAttributes();
    for (const attr in dirtyObjects) {
      keys[attr] = true;
    }
    return Object.keys(keys);
  }

  /**
   * Returns true if the object has been fetched.
   *
   * @returns {boolean}
   */
  isDataAvailable(): boolean {
    const serverData = this._getServerData();
    return !!Object.keys(serverData).length;
  }

  /**
   * Gets a Pointer referencing this Object.
   *
   * @returns {Pointer}
   */
  toPointer(): Pointer {
    if (!this.id) {
      throw new Error('Cannot create a pointer to an unsaved ParseObject');
    }
    return {
      __type: 'Pointer',
      className: this.className,
      objectId: this.id,
    };
  }

  /**
   * Gets a Pointer referencing this Object.
   *
   * @returns {Pointer}
   */
  toOfflinePointer(): Pointer {
    if (!this._localId) {
      throw new Error('Cannot create a offline pointer to a saved ParseObject');
    }
    return {
      __type: 'Object',
      className: this.className,
      _localId: this._localId,
    };
  }

  /**
   * Gets the value of an attribute.
   *
   * @param {string} attr The string name of an attribute.
   * @returns {*}
   */
  get<K extends AttributeKey<T>>(attr: K): T[K] {
    return this.attributes[attr];
  }

  /**
   * Gets a relation on the given class for the attribute.
   *
   * @param {string} attr The attribute to get the relation for.
   * @returns {Parse.Relation}
   */
  relation<R extends ParseObject, K extends AttributeKey<T> = AttributeKey<T>>(
    attr: T[K] extends ParseRelation ? K : never
  ): ParseRelation<this, R> {
    const value = this.get(attr) as any;
    if (value) {
      if (!(value instanceof ParseRelation)) {
        throw new Error('Called relation() on non-relation field ' + attr);
      }
      value._ensureParentAndKey(this, attr);
      return value;
    }
    return new ParseRelation(this, attr);
  }

  /**
   * Gets the HTML-escaped value of an attribute.
   *
   * @param {string} attr The string name of an attribute.
   * @returns {string}
   */
  escape<K extends AttributeKey<T>>(attr: K): string {
    let val = this.attributes[attr];
    if (val == null) {
      return '';
    }
    if (typeof val !== 'string') {
      if (typeof val.toString !== 'function') {
        return '';
      }
      val = val.toString();
    }
    return escape(val);
  }

  /**
   * Returns <code>true</code> if the attribute contains a value that is not
   * null or undefined.
   *
   * @param {string} attr The string name of the attribute.
   * @returns {boolean}
   */
  has<K extends AttributeKey<T>>(attr: K): boolean {
    const attributes = this.attributes;
    if (Object.hasOwn(attributes, attr)) {
      return attributes[attr] != null;
    }
    return false;
  }

  /**
   * Sets a hash of model attributes on the object.
   *
   * <p>You can call it with an object containing keys and values, with one
   * key and value, or dot notation.  For example:<pre>
   *   gameTurn.set({
   *     player: player1,
   *     diceRoll: 2
   *   }, {
   *     error: function(gameTurnAgain, error) {
   *       // The set failed validation.
   *     }
   *   });
   *
   *   game.set("currentPlayer", player2, {
   *     error: function(gameTurnAgain, error) {
   *       // The set failed validation.
   *     }
   *   });
   *
   *   game.set("finished", true);</pre></p>
   *
   *   game.set("player.score", 10);</pre></p>
   *
   * @param {(string|object)} key The key to set.
   * @param {(string|object)} value The value to give it.
   * @param {object} options A set of options for the set.
   *     The only supported option is <code>error</code>.
   * @returns {Parse.Object} Returns the object, so you can chain this call.
   */
  set<K extends AttributeKey<T>>(
    key: K | (Pick<T, K> | T),
    value?: SetOptions | (T[K] extends undefined ? never : T[K]),
    options?: SetOptions
  ): this {
    let changes: any = {};
    const newOps = {};
    if (key && typeof key === 'object') {
      changes = key;
      options = value;
    } else if (typeof key === 'string') {
      changes[key] = value;
    } else {
      return this;
    }
    options = options || {};
    let readonly = [];
    if (typeof (this.constructor as any).readOnlyAttributes === 'function') {
      readonly = readonly.concat((this.constructor as any).readOnlyAttributes());
    }
    for (const k in changes) {
      if (k === 'createdAt' || k === 'updatedAt') {
        // This property is read-only, but for legacy reasons we silently
        // ignore it
        continue;
      }
      if (readonly.indexOf(k) > -1) {
        throw new Error('Cannot modify readonly attribute: ' + k);
      }
      if (options.unset) {
        newOps[k] = new UnsetOp();
      } else if (changes[k] instanceof Op) {
        newOps[k] = changes[k];
      } else if (
        changes[k] &&
        typeof changes[k] === 'object' &&
        typeof changes[k].__op === 'string'
      ) {
        newOps[k] = opFromJSON(changes[k]);
      } else if (k === 'objectId' || k === 'id') {
        if (typeof changes[k] === 'string') {
          this.id = changes[k];
        }
      } else if (
        k === 'ACL' &&
        typeof changes[k] === 'object' &&
        !(changes[k] instanceof ParseACL)
      ) {
        newOps[k] = new SetOp(new ParseACL(changes[k]));
      } else if (changes[k] instanceof ParseRelation) {
        const relation = new ParseRelation(this, k);
        relation.targetClassName = changes[k].targetClassName;
        newOps[k] = new SetOp(relation);
      } else {
        newOps[k] = new SetOp(changes[k]);
      }
    }

    const currentAttributes = this.attributes;

    // Calculate new values
    const newValues = {};
    for (const attr in newOps) {
      if (newOps[attr] instanceof RelationOp) {
        newValues[attr] = newOps[attr].applyTo(currentAttributes[attr], this, attr);
      } else if (!(newOps[attr] instanceof UnsetOp)) {
        newValues[attr] = newOps[attr].applyTo(currentAttributes[attr]);
      }
    }

    // Validate changes
    if (!options.ignoreValidation) {
      const validationError = this.validate(newValues);
      if (validationError) {
        throw validationError;
      }
    }

    // Consolidate Ops
    const pendingOps = this._getPendingOps();
    const last = pendingOps.length - 1;
    const stateController = CoreManager.getObjectStateController();
    for (const attr in newOps) {
      const nextOp = newOps[attr].mergeWith(pendingOps[last][attr]);
      stateController.setPendingOp(this._getStateIdentifier(), attr, nextOp);
    }

    return this;
  }

  /**
   * Remove an attribute from the model. This is a noop if the attribute doesn't
   * exist.
   *
   * @param {string} attr The string name of an attribute.
   * @param options
   * @returns {Parse.Object} Returns the object, so you can chain this call.
   */
  unset<K extends AttributeKey<T>>(attr: K, options?: SetOptions): this {
    options = options || {};
    options.unset = true;
    return this.set(attr, null, options);
  }

  /**
   * Atomically increments the value of the given attribute the next time the
   * object is saved. If no amount is specified, 1 is used by default.
   *
   * @param attr {String} The key.
   * @param amount {Number} The amount to increment by (optional).
   * @returns {Parse.Object} Returns the object, so you can chain this call.
   */
  increment<K extends AttributeKey<T>>(attr: K, amount?: number): this {
    if (typeof amount === 'undefined') {
      amount = 1;
    }
    if (typeof amount !== 'number') {
      throw new Error('Cannot increment by a non-numeric amount.');
    }
    return this.set(attr, new IncrementOp(amount) as any);
  }

  /**
   * Atomically decrements the value of the given attribute the next time the
   * object is saved. If no amount is specified, 1 is used by default.
   *
   * @param attr {String} The key.
   * @param amount {Number} The amount to decrement by (optional).
   * @returns {Parse.Object} Returns the object, so you can chain this call.
   */
  decrement<K extends AttributeKey<T>>(attr: K, amount?: number): this {
    if (typeof amount === 'undefined') {
      amount = 1;
    }
    if (typeof amount !== 'number') {
      throw new Error('Cannot decrement by a non-numeric amount.');
    }
    return this.set(attr, new IncrementOp(amount * -1) as any);
  }

  /**
   * Atomically add an object to the end of the array associated with a given
   * key.
   *
   * @param attr {String} The key.
   * @param item {} The item to add.
   * @returns {Parse.Object} Returns the object, so you can chain this call.
   */
  add<K extends AtomicKey<T>[keyof T]>(attr: K, item: NonNullable<T[K]>[number]): this {
    return this.set(attr as any, new AddOp([item]) as any);
  }

  /**
   * Atomically add the objects to the end of the array associated with a given
   * key.
   *
   * @param attr {String} The key.
   * @param items {Object[]} The items to add.
   * @returns {Parse.Object} Returns the object, so you can chain this call.
   */
  addAll<K extends AtomicKey<T>[keyof T]>(attr: K, items: NonNullable<T[K]>): this {
    return this.set(attr as any, new AddOp(items) as any);
  }

  /**
   * Atomically add an object to the array associated with a given key, only
   * if it is not already present in the array. The position of the insert is
   * not guaranteed.
   *
   * @param attr {String} The key.
   * @param item {} The object to add.
   * @returns {Parse.Object} Returns the object, so you can chain this call.
   */
  addUnique<K extends AtomicKey<T>[keyof T]>(attr: K, item: NonNullable<T[K]>[number]): this {
    return this.set(attr as any, new AddUniqueOp([item]) as any);
  }

  /**
   * Atomically add the objects to the array associated with a given key, only
   * if it is not already present in the array. The position of the insert is
   * not guaranteed.
   *
   * @param attr {String} The key.
   * @param items {Object[]} The objects to add.
   * @returns {Parse.Object} Returns the object, so you can chain this call.
   */
  addAllUnique<K extends AtomicKey<T>[keyof T]>(attr: K, items: NonNullable<T[K]>): this {
    return this.set(attr as any, new AddUniqueOp(items) as any);
  }

  /**
   * Atomically remove all instances of an object from the array associated
   * with a given key.
   *
   * @param attr {String} The key.
   * @param item {} The object to remove.
   * @returns {Parse.Object} Returns the object, so you can chain this call.
   */
  remove<K extends AtomicKey<T>[keyof T]>(attr: K, item: NonNullable<T[K]>[number]): this {
    return this.set(attr as any, new RemoveOp([item]) as any);
  }

  /**
   * Atomically remove all instances of the objects from the array associated
   * with a given key.
   *
   * @param attr {String} The key.
   * @param items {Object[]} The object to remove.
   * @returns {Parse.Object} Returns the object, so you can chain this call.
   */
  removeAll<K extends AtomicKey<T>[keyof T]>(attr: K, items: NonNullable<T[K]>): this {
    return this.set(attr as any, new RemoveOp(items) as any);
  }

  /**
   * Returns an instance of a subclass of Parse.Op describing what kind of
   * modification has been performed on this field since the last time it was
   * saved. For example, after calling object.increment("x"), calling
   * object.op("x") would return an instance of Parse.Op.Increment.
   *
   * @param attr {String} The key.
   * @returns {Parse.Op | undefined} The operation, or undefined if none.
   */
  op<K extends AttributeKey<T>>(attr: K): Op | undefined {
    const pending = this._getPendingOps();
    for (let i = pending.length; i--;) {
      if (pending[i][attr]) {
        return pending[i][attr];
      }
    }
  }

  /**
   * Creates a new model with identical attributes to this one.
   *
   * @returns {Parse.Object}
   */
  clone(): any {
    const clone = new (this.constructor as new (
      ...args: ConstructorParameters<typeof ParseObject>
    ) => this)(this.className);
    let attributes = this.attributes;
    if (typeof (this.constructor as any).readOnlyAttributes === 'function') {
      const readonly = (this.constructor as any).readOnlyAttributes() || [];
      // Attributes are frozen, so we have to rebuild an object,
      // rather than delete readonly keys
      const copy: T = {} as T;
      for (const a in attributes) {
        if (readonly.indexOf(a) < 0) {
          copy[a] = attributes[a];
        }
      }
      attributes = copy;
    }
    if (clone.set) {
      clone.set(attributes as any);
    }
    return clone;
  }

  /**
   * Creates a new instance of this object. Not to be confused with clone()
   *
   * @returns {Parse.Object}
   */
  newInstance(): this {
    const clone = new (this.constructor as new (
      ...args: ConstructorParameters<typeof ParseObject>
    ) => this)(this.className);
    clone.id = this.id;
    if (singleInstance) {
      // Just return an object with the right id
      return clone;
    }

    const stateController = CoreManager.getObjectStateController();
    if (stateController) {
      stateController.duplicateState(this._getStateIdentifier(), clone._getStateIdentifier());
    }
    return clone;
  }

  /**
   * Returns true if this object has never been saved to Parse.
   *
   * @returns {boolean}
   */
  isNew(): boolean {
    return !this.id;
  }

  /**
   * Returns true if this object was created by the Parse server when the
   * object might have already been there (e.g. in the case of a Facebook
   * login)
   *
   * @returns {boolean}
   */
  existed(): boolean {
    if (!this.id) {
      return false;
    }
    const stateController = CoreManager.getObjectStateController();
    const state = stateController.getState(this._getStateIdentifier());
    if (state) {
      return state.existed;
    }
    return false;
  }

  /**
   * Returns true if this object exists on the Server
   *
   * @param {object} options
   * Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   * </ul>
   * @returns {Promise<boolean>} A boolean promise that is fulfilled if object exists.
   */
  async exists(options?: RequestOptions): Promise<boolean> {
    if (!this.id) {
      return false;
    }
    try {
      const ParseQuery = CoreManager.getParseQuery();
      const query = new ParseQuery(this.className);
      await query.get(this.id, options);
      return true;
    } catch (e) {
      if (e.code === ParseError.OBJECT_NOT_FOUND) {
        return false;
      }
      throw e;
    }
  }

  /**
   * Checks if the model is currently in a valid state.
   *
   * @returns {boolean}
   */
  isValid(): boolean {
    return !this.validate(this.attributes);
  }

  /**
   * You should not call this function directly unless you subclass
   * <code>Parse.Object</code>, in which case you can override this method
   * to provide additional validation on <code>set</code> and
   * <code>save</code>.  Your implementation should return
   *
   * @param {object} attrs The current data to validate.
   * @returns {Parse.Error|boolean} False if the data is valid.  An error object otherwise.
   * @see Parse.Object#set
   */
  validate(attrs: Attributes): ParseError | boolean {
    if (Object.hasOwn(attrs, 'ACL') && !(attrs.ACL instanceof ParseACL)) {
      return new ParseError(ParseError.OTHER_CAUSE, 'ACL must be a Parse ACL.');
    }
    for (const key in attrs) {
      if (!/^[A-Za-z_][0-9A-Za-z_.]*$/.test(key)) {
        return new ParseError(ParseError.INVALID_KEY_NAME, `Invalid key name: ${key}`);
      }
    }
    return false;
  }

  /**
   * Returns the ACL for this object.
   *
   * @returns {Parse.ACL|null} An instance of Parse.ACL.
   * @see Parse.Object#get
   */
  getACL(): ParseACL | null {
    const acl: any = this.get('ACL' as AttributeKey<T>);
    if (acl instanceof ParseACL) {
      return acl;
    }
    return null;
  }

  /**
   * Sets the ACL to be used for this object.
   *
   * @param {Parse.ACL} acl An instance of Parse.ACL.
   * @param {object} options
   * @returns {Parse.Object} Returns the object, so you can chain this call.
   * @see Parse.Object#set
   */
  setACL(acl: ParseACL, options?: any): this {
    return this.set('ACL' as AttributeKey<T>, acl as any, options);
  }

  /**
   * Clears any (or specific) changes to this object made since the last call to save()
   *
   * @param {string} [keys] - specify which fields to revert
   */
  revert(...keys: Extract<keyof (T & CommonAttributes), string>[]): void {
    let keysToRevert;
    if (keys.length) {
      keysToRevert = [];
      for (const key of keys) {
        if (typeof key === 'string') {
          keysToRevert.push(key);
        } else {
          throw new Error('Parse.Object#revert expects either no, or a list of string, arguments.');
        }
      }
    }
    this._clearPendingOps(keysToRevert);
  }

  /**
   * Clears all attributes on a model
   *
   * @returns {Parse.Object} Returns the object, so you can chain this call.
   */
  clear(): this {
    const attributes = this.attributes;
    const erasable: Attributes = {};
    let readonly = ['createdAt', 'updatedAt'];
    if (typeof (this.constructor as any).readOnlyAttributes === 'function') {
      readonly = readonly.concat((this.constructor as any).readOnlyAttributes());
    }
    for (const attr in attributes) {
      if (readonly.indexOf(attr) < 0) {
        erasable[attr] = true;
      }
    }
    return this.set(erasable as any, { unset: true });
  }

  /**
   * Fetch the model from the server. If the server's representation of the
   * model differs from its current attributes, they will be overriden.
   *
   * @param {object} options
   * Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   *   <li>include: The name(s) of the key(s) to include. Can be a string, an array of strings,
   *       or an array of array of strings.
   *   <li>context: A dictionary that is accessible in Cloud Code `beforeFind` trigger.
   * </ul>
   * @returns {Promise} A promise that is fulfilled when the fetch
   *     completes.
   */
  fetch(options: FetchOptions): Promise<this> {
    const fetchOptions = ParseObject._getRequestOptions(options);
    const controller = CoreManager.getObjectController();
    return controller.fetch(this, true, fetchOptions) as Promise<this>;
  }

  /**
   * Fetch the model from the server. If the server's representation of the
   * model differs from its current attributes, they will be overriden.
   *
   * Includes nested Parse.Objects for the provided key. You can use dot
   * notation to specify which fields in the included object are also fetched.
   *
   * @param {string | Array<string | Array<string>>} keys The name(s) of the key(s) to include.
   * @param {object} options
   * Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   * </ul>
   * @returns {Promise} A promise that is fulfilled when the fetch
   *     completes.
   */
  fetchWithInclude(keys: string | (string | string[])[], options?: RequestOptions): Promise<this> {
    options = options || {};
    options.include = keys;
    return this.fetch(options);
  }

  /**
   * Saves this object to the server at some unspecified time in the future,
   * even if Parse is currently inaccessible.
   *
   * Use this when you may not have a solid network connection, and don't need to know when the save completes.
   * If there is some problem with the object such that it can't be saved, it will be silently discarded.
   *
   * Objects saved with this method will be stored locally in an on-disk cache until they can be delivered to Parse.
   * They will be sent immediately if possible. Otherwise, they will be sent the next time a network connection is
   * available. Objects saved this way will persist even after the app is closed, in which case they will be sent the
   * next time the app is opened.
   *
   * @param {object} [options]
   * Used to pass option parameters to method if arg1 and arg2 were both passed as strings.
   * Valid options are:
   * <ul>
   * <li>sessionToken: A valid session token, used for making a request on
   * behalf of a specific user.
   * <li>cascadeSave: If `false`, nested objects will not be saved (default is `true`).
   * <li>context: A dictionary that is accessible in Cloud Code `beforeSave` and `afterSave` triggers.
   * </ul>
   * @returns {Promise} A promise that is fulfilled when the save
   * completes.
   */
  async saveEventually(options?: SaveOptions): Promise<this> {
    try {
      await this.save(null, options);
    } catch (e) {
      if (e.code === ParseError.CONNECTION_FAILED) {
        await CoreManager.getEventuallyQueue().save(this, options);
        CoreManager.getEventuallyQueue().poll();
      }
    }
    return this;
  }

  /**
   * Set a hash of model attributes, and save the model to the server.
   * updatedAt will be updated when the request returns.
   * You can either call it as:<pre>
   * object.save();</pre>
   * or<pre>
   * object.save(attrs);</pre>
   * or<pre>
   * object.save(null, options);</pre>
   * or<pre>
   * object.save(attrs, options);</pre>
   * or<pre>
   * object.save(key, value);</pre>
   * or<pre>
   * object.save(key, value, options);</pre>
   *
   * Example 1: <pre>
   * gameTurn.save({
   * player: "Jake Cutter",
   * diceRoll: 2
   * }).then(function(gameTurnAgain) {
   * // The save was successful.
   * }, function(error) {
   * // The save failed.  Error is an instance of Parse.Error.
   * });</pre>
   *
   * Example 2: <pre>
   * gameTurn.save("player", "Jake Cutter");</pre>
   *
   * @param {string | object | null} [arg1]
   * Valid options are:<ul>
   * <li>`Object` - Key/value pairs to update on the object.</li>
   * <li>`String` Key - Key of attribute to update (requires arg2 to also be string)</li>
   * <li>`null` - Passing null for arg1 allows you to save the object with options passed in arg2.</li>
   * </ul>
   * @param {string | object} [arg2]
   * <ul>
   * <li>`String` Value - If arg1 was passed as a key, arg2 is the value that should be set on that key.</li>
   * <li>`Object` Options - Valid options are:
   * <ul>
   * <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   * be used for this request.
   * <li>sessionToken: A valid session token, used for making a request on
   * behalf of a specific user.
   * <li>cascadeSave: If `false`, nested objects will not be saved (default is `true`).
   * <li>context: A dictionary that is accessible in Cloud Code `beforeSave` and `afterSave` triggers.
   * </ul>
   * </li>
   * </ul>
   * @param {object} [arg3]
   * Used to pass option parameters to method if arg1 and arg2 were both passed as strings.
   * Valid options are:
   * <ul>
   * <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   * be used for this request.
   * <li>sessionToken: A valid session token, used for making a request on
   * behalf of a specific user.
   * <li>cascadeSave: If `false`, nested objects will not be saved (default is `true`).
   * <li>context: A dictionary that is accessible in Cloud Code `beforeSave` and `afterSave` triggers.
   * </ul>
   * @returns {Promise} A promise that is fulfilled when the save
   * completes.
   */
  async save<K extends AttributeKey<T>>(
    arg1?: Pick<T, K> | T | null,
    arg2?: SaveOptions
  ): Promise<this>;
  async save<K extends AttributeKey<T>>(
    arg1: K,
    arg2: T[K] extends undefined ? never : T[K],
    arg3?: SaveOptions
  ): Promise<this> {
    let attrs;
    let options;
    if (typeof arg1 === 'object' || typeof arg1 === 'undefined') {
      attrs = arg1;
      if (typeof arg2 === 'object') {
        options = arg2;
      }
    } else {
      attrs = {};
      attrs[arg1] = arg2;
      options = arg3;
    }
    options = options || {};
    if (attrs) {
      this.set(attrs, options);
    }
    const saveOptions = ParseObject._getRequestOptions(options);
    const controller = CoreManager.getObjectController();
    const unsaved = options.cascadeSave !== false ? unsavedChildren(this) : null;
    if (
      unsaved &&
      unsaved.length &&
      options.transaction === true &&
      unsaved.some(el => el instanceof ParseObject)
    ) {
      const unsavedFiles: ParseFile[] = [];
      const unsavedObjects: ParseObject[] = [];
      unsaved.forEach(el => {
        if (el instanceof ParseFile) unsavedFiles.push(el);
        else unsavedObjects.push(el);
      });
      unsavedObjects.push(this);

      const filePromise = unsavedFiles.length
        ? controller.save(unsavedFiles, saveOptions)
        : Promise.resolve();

      return filePromise
        .then(() => controller.save(unsavedObjects, saveOptions))
        .then((savedOjbects: this[]) => savedOjbects.pop());
    }
    await controller.save(unsaved, saveOptions);
    return controller.save(this, saveOptions) as Promise<ParseObject> as Promise<this>;
  }

  /**
   * Deletes this object from the server at some unspecified time in the future,
   * even if Parse is currently inaccessible.
   *
   * Use this when you may not have a solid network connection,
   * and don't need to know when the delete completes. If there is some problem with the object
   * such that it can't be deleted, the request will be silently discarded.
   *
   * Delete instructions made with this method will be stored locally in an on-disk cache until they can be transmitted
   * to Parse. They will be sent immediately if possible. Otherwise, they will be sent the next time a network connection
   * is available. Delete requests will persist even after the app is closed, in which case they will be sent the
   * next time the app is opened.
   *
   * @param {object} [options]
   * Valid options are:<ul>
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   *   <li>context: A dictionary that is accessible in Cloud Code `beforeDelete` and `afterDelete` triggers.
   * </ul>
   * @returns {Promise} A promise that is fulfilled when the destroy
   *     completes.
   */
  async destroyEventually(options?: RequestOptions): Promise<this> {
    try {
      await this.destroy(options);
    } catch (e) {
      if (e.code === ParseError.CONNECTION_FAILED) {
        await CoreManager.getEventuallyQueue().destroy(this, options);
        CoreManager.getEventuallyQueue().poll();
      }
    }
    return this;
  }

  /**
   * Destroy this model on the server if it was already persisted.
   *
   * @param {object} options
   * Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   *   <li>context: A dictionary that is accessible in Cloud Code `beforeDelete` and `afterDelete` triggers.
   * </ul>
   * @returns {Promise} A promise that is fulfilled when the destroy
   *     completes.
   */
  destroy(options?: RequestOptions): Promise<ParseObject | undefined> {
    if (!this.id) {
      return Promise.resolve(undefined);
    }
    const destroyOptions = ParseObject._getRequestOptions(options);
    return CoreManager.getObjectController().destroy(this, destroyOptions) as Promise<ParseObject>;
  }

  /**
   * Asynchronously stores the object and every object it points to in the local datastore,
   * recursively, using a default pin name: _default.
   *
   * If those other objects have not been fetched from Parse, they will not be stored.
   * However, if they have changed data, all the changes will be retained.
   *
   * <pre>
   * await object.pin();
   * </pre>
   *
   * To retrieve object:
   * <code>query.fromLocalDatastore()</code> or <code>query.fromPin()</code>
   *
   * @returns {Promise} A promise that is fulfilled when the pin completes.
   */
  pin(): Promise<void> {
    return ParseObject.pinAllWithName(DEFAULT_PIN, [this]);
  }

  /**
   * Asynchronously removes the object and every object it points to in the local datastore,
   * recursively, using a default pin name: _default.
   *
   * <pre>
   * await object.unPin();
   * </pre>
   *
   * @returns {Promise} A promise that is fulfilled when the unPin completes.
   */
  unPin(): Promise<void> {
    return ParseObject.unPinAllWithName(DEFAULT_PIN, [this]);
  }

  /**
   * Asynchronously returns if the object is pinned
   *
   * <pre>
   * const isPinned = await object.isPinned();
   * </pre>
   *
   * @returns {Promise<boolean>} A boolean promise that is fulfilled if object is pinned.
   */
  async isPinned(): Promise<boolean> {
    const localDatastore = CoreManager.getLocalDatastore();
    if (!localDatastore.isEnabled) {
      return Promise.reject('Parse.enableLocalDatastore() must be called first');
    }
    const objectKey = localDatastore.getKeyForObject(this);
    const pin = await localDatastore.fromPinWithName(objectKey);
    return pin.length > 0;
  }

  /**
   * Asynchronously stores the objects and every object they point to in the local datastore, recursively.
   *
   * If those other objects have not been fetched from Parse, they will not be stored.
   * However, if they have changed data, all the changes will be retained.
   *
   * <pre>
   * await object.pinWithName(name);
   * </pre>
   *
   * To retrieve object:
   * <code>query.fromLocalDatastore()</code> or <code>query.fromPinWithName(name)</code>
   *
   * @param {string} name Name of Pin.
   * @returns {Promise} A promise that is fulfilled when the pin completes.
   */
  pinWithName(name: string): Promise<void> {
    return ParseObject.pinAllWithName(name, [this]);
  }

  /**
   * Asynchronously removes the object and every object it points to in the local datastore, recursively.
   *
   * <pre>
   * await object.unPinWithName(name);
   * </pre>
   *
   * @param {string} name Name of Pin.
   * @returns {Promise} A promise that is fulfilled when the unPin completes.
   */
  unPinWithName(name: string): Promise<void> {
    return ParseObject.unPinAllWithName(name, [this]);
  }

  /**
   * Asynchronously loads data from the local datastore into this object.
   *
   * <pre>
   * await object.fetchFromLocalDatastore();
   * </pre>
   *
   * You can create an unfetched pointer with <code>Parse.Object.createWithoutData()</code>
   * and then call <code>fetchFromLocalDatastore()</code> on it.
   *
   * @returns {Promise} A promise that is fulfilled when the fetch completes.
   */
  async fetchFromLocalDatastore(): Promise<ParseObject> {
    const localDatastore = CoreManager.getLocalDatastore();
    if (!localDatastore.isEnabled) {
      throw new Error('Parse.enableLocalDatastore() must be called first');
    }
    const objectKey = localDatastore.getKeyForObject(this);
    const pinned = await localDatastore._serializeObject(objectKey);
    if (!pinned) {
      throw new Error('Cannot fetch an unsaved ParseObject');
    }
    const result = ParseObject.fromJSON(pinned);
    this._finishFetch(result.toJSON());

    return this;
  }

  /* Static methods */

  static _clearAllState() {
    const stateController = CoreManager.getObjectStateController();
    stateController.clearAllState();
  }

  /**
   * Fetches the given list of Parse.Object.
   * If any error is encountered, stops and calls the error handler.
   *
   * <pre>
   *   Parse.Object.fetchAll([object1, object2, ...])
   *    .then((list) => {
   *      // All the objects were fetched.
   *    }, (error) => {
   *      // An error occurred while fetching one of the objects.
   *    });
   * </pre>
   *
   * @param {Array} list A list of <code>Parse.Object</code>.
   * @param {object} options
   * Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   *   <li>include: The name(s) of the key(s) to include. Can be a string, an array of strings,
   *       or an array of array of strings.
   * </ul>
   * @static
   * @returns {Parse.Object[]}
   */
  static fetchAll<T extends ParseObject>(list: T[], options?: RequestOptions): Promise<T[]> {
    const fetchOptions = ParseObject._getRequestOptions(options);
    return CoreManager.getObjectController().fetch(list, true, fetchOptions) as Promise<T[]>;
  }

  /**
   * Fetches the given list of Parse.Object.
   *
   * Includes nested Parse.Objects for the provided key. You can use dot
   * notation to specify which fields in the included object are also fetched.
   *
   * If any error is encountered, stops and calls the error handler.
   *
   * <pre>
   *   Parse.Object.fetchAllWithInclude([object1, object2, ...], [pointer1, pointer2, ...])
   *    .then((list) => {
   *      // All the objects were fetched.
   *    }, (error) => {
   *      // An error occurred while fetching one of the objects.
   *    });
   * </pre>
   *
   * @param {Array} list A list of <code>Parse.Object</code>.
   * @param {string | Array<string | Array<string>>} keys The name(s) of the key(s) to include.
   * @param {object} options
   * Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   * </ul>
   * @static
   * @returns {Parse.Object[]}
   */
  static fetchAllWithInclude<T extends ParseObject>(
    list: T[],
    keys: keyof T['attributes'] | (keyof T['attributes'])[],
    options?: RequestOptions
  ): Promise<T[]> {
    options = options || {};
    options.include = keys;
    return ParseObject.fetchAll(list, options);
  }

  /**
   * Fetches the given list of Parse.Object if needed.
   * If any error is encountered, stops and calls the error handler.
   *
   * Includes nested Parse.Objects for the provided key. You can use dot
   * notation to specify which fields in the included object are also fetched.
   *
   * If any error is encountered, stops and calls the error handler.
   *
   * <pre>
   *   Parse.Object.fetchAllIfNeededWithInclude([object1, object2, ...], [pointer1, pointer2, ...])
   *    .then((list) => {
   *      // All the objects were fetched.
   *    }, (error) => {
   *      // An error occurred while fetching one of the objects.
   *    });
   * </pre>
   *
   * @param {Array} list A list of <code>Parse.Object</code>.
   * @param {string | Array<string | Array<string>>} keys The name(s) of the key(s) to include.
   * @param {object} options
   * Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   * </ul>
   * @static
   * @returns {Parse.Object[]}
   */
  static fetchAllIfNeededWithInclude<T extends ParseObject>(
    list: T[],
    keys: keyof T['attributes'] | (keyof T['attributes'])[],
    options?: RequestOptions
  ): Promise<T[]> {
    options = options || {};
    options.include = keys;
    return ParseObject.fetchAllIfNeeded(list, options);
  }

  /**
   * Fetches the given list of Parse.Object if needed.
   * If any error is encountered, stops and calls the error handler.
   *
   * <pre>
   *   Parse.Object.fetchAllIfNeeded([object1, ...])
   *    .then((list) => {
   *      // Objects were fetched and updated.
   *    }, (error) => {
   *      // An error occurred while fetching one of the objects.
   *    });
   * </pre>
   *
   * @param {Array} list A list of <code>Parse.Object</code>.
   * @param {object} options
   * Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   *   <li>include: The name(s) of the key(s) to include. Can be a string, an array of strings,
   *       or an array of array of strings.
   *   <li>context: A dictionary that is accessible in Cloud Code `beforeFind` trigger.
   * </ul>
   * @static
   * @returns {Parse.Object[]}
   */
  static fetchAllIfNeeded<T extends ParseObject>(list: T[], options?: FetchOptions): Promise<T[]> {
    const fetchOptions = ParseObject._getRequestOptions(options);
    return CoreManager.getObjectController().fetch(list, false, fetchOptions) as Promise<T[]>;
  }

  static handleIncludeOptions(options: { include?: string | string[] }) {
    let include = [];
    if (Array.isArray(options.include)) {
      options.include.forEach(key => {
        if (Array.isArray(key)) {
          include = include.concat(key);
        } else {
          include.push(key);
        }
      });
    } else {
      include.push(options.include!);
    }
    return include;
  }

  /**
   * Destroy the given list of models on the server if it was already persisted.
   *
   * <p>Unlike saveAll, if an error occurs while deleting an individual model,
   * this method will continue trying to delete the rest of the models if
   * possible, except in the case of a fatal error like a connection error.
   *
   * <p>In particular, the Parse.Error object returned in the case of error may
   * be one of two types:
   *
   * <ul>
   * <li>A Parse.Error.AGGREGATE_ERROR. This object's "errors" property is an
   * array of other Parse.Error objects. Each error object in this array
   * has an "object" property that references the object that could not be
   * deleted (for instance, because that object could not be found).</li>
   * <li>A non-aggregate Parse.Error. This indicates a serious error that
   * caused the delete operation to be aborted partway through (for
   * instance, a connection failure in the middle of the delete).</li>
   * </ul>
   *
   * <pre>
   * Parse.Object.destroyAll([object1, object2, ...])
   * .then((list) => {
   * // All the objects were deleted.
   * }, (error) => {
   * // An error occurred while deleting one or more of the objects.
   * // If this is an aggregate error, then we can inspect each error
   * // object individually to determine the reason why a particular
   * // object was not deleted.
   * if (error.code === Parse.Error.AGGREGATE_ERROR) {
   * for (var i = 0; i < error.errors.length; i++) {
   * console.log("Couldn't delete " + error.errors[i].object.id +
   * "due to " + error.errors[i].message);
   * }
   * } else {
   * console.log("Delete aborted because of " + error.message);
   * }
   * });
   * </pre>
   *
   * @param {Array} list A list of <code>Parse.Object</code>.
   * @param {object} options
   * Valid options are:<ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *     be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   *   <li>context: A dictionary that is accessible in Cloud Code `beforeDelete` and `afterDelete` triggers.
   *   <li>transaction: Set to true to enable transactions
   *   <li>batchSize: How many objects to yield in each batch (default: 20)
   * </ul>
   * @static
   * @returns {Promise} A promise that is fulfilled when the destroyAll
   * completes.
   */
  static destroyAll(list: ParseObject[], options?: SaveOptions) {
    const destroyOptions = ParseObject._getRequestOptions(options);
    return CoreManager.getObjectController().destroy(list, destroyOptions);
  }

  /**
   * Saves the given list of Parse.Object.
   * If any error is encountered, stops and calls the error handler.
   *
   * <pre>
   * Parse.Object.saveAll([object1, object2, ...])
   * .then((list) => {
   * // All the objects were saved.
   * }, (error) => {
   * // An error occurred while saving one of the objects.
   * });
   * </pre>
   *
   * @param {Array} list A list of <code>Parse.Object</code>.
   * @param {object} options
   * Valid options are:
   * <ul>
   *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
   *        be used for this request.
   *   <li>sessionToken: A valid session token, used for making a request on
   *       behalf of a specific user.
   *   <li>cascadeSave: If `false`, nested objects will not be saved (default is `true`).
   *   <li>context: A dictionary that is accessible in Cloud Code `beforeSave` and `afterSave` triggers.
   *   <li>transaction: Set to true to enable transactions
   *   <li>batchSize: How many objects to yield in each batch (default: 20)
   * </ul>
   * @static
   * @returns {Parse.Object[]}
   */
  static saveAll<T extends ParseObject[]>(list: T, options?: SaveOptions): Promise<T> {
    const saveOptions = ParseObject._getRequestOptions(options);
    return CoreManager.getObjectController().save(list, saveOptions) as any;
  }

  /**
   * Creates a reference to a subclass of Parse.Object with the given id. This
   * does not exist on Parse.Object, only on subclasses.
   *
   * <p>A shortcut for: <pre>
   *  var Foo = Parse.Object.extend("Foo");
   *  var pointerToFoo = new Foo();
   *  pointerToFoo.id = "myObjectId";
   * </pre>
   *
   * @param {string} id The ID of the object to create a reference to.
   * @static
   * @returns {Parse.Object} A Parse.Object reference.
   */
  static createWithoutData(id: string): ParseObject {
    const obj = new this();
    obj.id = id;
    return obj;
  }

  /**
   * Creates a new instance of a Parse Object from a JSON representation.
   *
   * @param {object} json The JSON map of the Object's data
   * @param {boolean} override In single instance mode, all old server data
   *   is overwritten if this is set to true
   * @param {boolean} dirty Whether the Parse.Object should set JSON keys to dirty
   * @static
   * @returns {Parse.Object} A Parse.Object reference
   */
  static fromJSON<T extends ParseObject>(json: any, override?: boolean, dirty?: boolean): T {
    if (!json.className) {
      throw new Error('Cannot create an object without a className');
    }
    const constructor = classMap[json.className];
    const o = constructor ? new constructor(json.className) : new ParseObject(json.className);
    const otherAttributes: Attributes = {};
    for (const attr in json) {
      if (attr !== 'className' && attr !== '__type') {
        otherAttributes[attr] = json[attr];
        if (dirty) {
          o.set(attr, json[attr]);
        }
      }
    }
    if (override) {
      // id needs to be set before clearServerData can work
      if (otherAttributes.objectId) {
        o.id = otherAttributes.objectId;
      }
      let preserved = null;
      if (typeof o._preserveFieldsOnFetch === 'function') {
        preserved = o._preserveFieldsOnFetch();
      }
      o._clearServerData();
      if (preserved) {
        o._finishFetch(preserved);
      }
    }
    o._finishFetch(otherAttributes);
    if (json.objectId) {
      o._setExisted(true);
    }
    return o;
  }

  /**
   * Registers a subclass of Parse.Object with a specific class name.
   * When objects of that class are retrieved from a query, they will be
   * instantiated with this subclass.
   * This is only necessary when using ES6 subclassing.
   *
   * @param {string} className The class name of the subclass
   * @param {Function} constructor The subclass
   */
  static registerSubclass(className: string, constructor: any) {
    if (typeof className !== 'string') {
      throw new TypeError('The first argument must be a valid class name.');
    }
    if (typeof constructor === 'undefined') {
      throw new TypeError('You must supply a subclass constructor.');
    }
    if (typeof constructor !== 'function') {
      throw new TypeError(
        'You must register the subclass constructor. ' +
          'Did you attempt to register an instance of the subclass?'
      );
    }
    classMap[className] = constructor;
    if (!constructor.className) {
      constructor.className = className;
    }
  }

  /**
   * Unegisters a subclass of Parse.Object with a specific class name.
   *
   * @param {string} className The class name of the subclass
   */
  static unregisterSubclass(className: string) {
    if (typeof className !== 'string') {
      throw new TypeError('The first argument must be a valid class name.');
    }
    delete classMap[className];
  }

  /**
   * Creates a new subclass of Parse.Object for the given Parse class name.
   *
   * <p>Every extension of a Parse class will inherit from the most recent
   * previous extension of that class. When a Parse.Object is automatically
   * created by parsing JSON, it will use the most recent extension of that
   * class.</p>
   *
   * <p>You should call either:<pre>
   *     var MyClass = Parse.Object.extend("MyClass", {
   *         <i>Instance methods</i>,
   *         initialize: function(attrs, options) {
   *             this.someInstanceProperty = [],
   *             <i>Other instance properties</i>
   *         }
   *     }, {
   *         <i>Class properties</i>
   *     });</pre>
   * or, for Backbone compatibility:<pre>
   *     var MyClass = Parse.Object.extend({
   *         className: "MyClass",
   *         <i>Instance methods</i>,
   *         initialize: function(attrs, options) {
   *             this.someInstanceProperty = [],
   *             <i>Other instance properties</i>
   *         }
   *     }, {
   *         <i>Class properties</i>
   *     });</pre></p>
   *
   * @param {string} className The name of the Parse class backing this model.
   * @param {object} [protoProps] Instance properties to add to instances of the
   *     class returned from this method.
   * @param {object} [classProps] Class properties to add the class returned from
   *     this method.
   * @returns {Parse.Object} A new subclass of Parse.Object.
   */
  static extend(className: any, protoProps?: any, classProps?: any) {
    if (typeof className !== 'string') {
      if (className && typeof className.className === 'string') {
        return ParseObject.extend(className.className, className, protoProps);
      } else {
        throw new Error("Parse.Object.extend's first argument should be the className.");
      }
    }
    let adjustedClassName = className;

    if (adjustedClassName === 'User' && CoreManager.get('PERFORM_USER_REWRITE')) {
      adjustedClassName = '_User';
    }

    let parentProto = ParseObject.prototype;
    if (Object.hasOwn(this, '__super__') && (this as any).__super__) {
      parentProto = this.prototype;
    }
    let ParseObjectSubclass = function (attributes, options) {
      this.className = adjustedClassName;
      this._objCount = objectCount++;
      // Enable legacy initializers
      if (typeof this.initialize === 'function') {
        this.initialize.apply(this, arguments);
      }

      if (this._initializers) {
        for (const initializer of this._initializers) {
          initializer.apply(this, arguments);
        }
      }

      if (attributes && typeof attributes === 'object') {
        try {
          this.set(attributes || {}, options);
        } catch (_) {
          throw new Error("Can't create an invalid Parse Object");
        }
      }
    };
    if (classMap[adjustedClassName]) {
      ParseObjectSubclass = classMap[adjustedClassName];
    } else {
      (ParseObjectSubclass as any).extend = function (name, protoProps, classProps) {
        if (typeof name === 'string') {
          return ParseObject.extend.call(ParseObjectSubclass, name, protoProps, classProps);
        }
        return ParseObject.extend.call(ParseObjectSubclass, adjustedClassName, name, protoProps);
      };
      (ParseObjectSubclass as any).createWithoutData = ParseObject.createWithoutData;
      (ParseObjectSubclass as any).className = adjustedClassName;
      (ParseObjectSubclass as any).__super__ = parentProto;
      ParseObjectSubclass.prototype = Object.create(parentProto, {
        constructor: {
          value: ParseObjectSubclass,
          enumerable: false,
          writable: true,
          configurable: true,
        },
      });
    }

    if (protoProps) {
      for (const prop in protoProps) {
        if (prop === 'initialize') {
          Object.defineProperty(ParseObjectSubclass.prototype, '_initializers', {
            value: [...(ParseObjectSubclass.prototype._initializers || []), protoProps[prop]],
            enumerable: false,
            writable: true,
            configurable: true,
          });
          continue;
        }
        if (prop !== 'className') {
          Object.defineProperty(ParseObjectSubclass.prototype, prop, {
            value: protoProps[prop],
            enumerable: false,
            writable: true,
            configurable: true,
          });
        }
      }
    }

    if (classProps) {
      for (const prop in classProps) {
        if (prop !== 'className') {
          Object.defineProperty(ParseObjectSubclass, prop, {
            value: classProps[prop],
            enumerable: false,
            writable: true,
            configurable: true,
          });
        }
      }
    }
    classMap[adjustedClassName] = ParseObjectSubclass;
    return ParseObjectSubclass;
  }

  /**
   * Enable single instance objects, where any local objects with the same Id
   * share the same attributes, and stay synchronized with each other.
   * This is disabled by default in server environments, since it can lead to
   * security issues.
   *
   * @static
   */
  static enableSingleInstance() {
    singleInstance = true;
    CoreManager.setObjectStateController(SingleInstanceStateController);
  }

  /**
   * Disable single instance objects, where any local objects with the same Id
   * share the same attributes, and stay synchronized with each other.
   * When disabled, you can have two instances of the same object in memory
   * without them sharing attributes.
   *
   * @static
   */
  static disableSingleInstance() {
    singleInstance = false;
    CoreManager.setObjectStateController(UniqueInstanceStateController);
  }

  /**
   * Asynchronously stores the objects and every object they point to in the local datastore,
   * recursively, using a default pin name: _default.
   *
   * If those other objects have not been fetched from Parse, they will not be stored.
   * However, if they have changed data, all the changes will be retained.
   *
   * <pre>
   * await Parse.Object.pinAll([...]);
   * </pre>
   *
   * To retrieve object:
   * <code>query.fromLocalDatastore()</code> or <code>query.fromPin()</code>
   *
   * @param {Array} objects A list of <code>Parse.Object</code>.
   * @returns {Promise} A promise that is fulfilled when the pin completes.
   * @static
   */
  static pinAll(objects: ParseObject[]): Promise<void> {
    const localDatastore = CoreManager.getLocalDatastore();
    if (!localDatastore.isEnabled) {
      return Promise.reject('Parse.enableLocalDatastore() must be called first');
    }
    return ParseObject.pinAllWithName(DEFAULT_PIN, objects);
  }

  /**
   * Asynchronously stores the objects and every object they point to in the local datastore, recursively.
   *
   * If those other objects have not been fetched from Parse, they will not be stored.
   * However, if they have changed data, all the changes will be retained.
   *
   * <pre>
   * await Parse.Object.pinAllWithName(name, [obj1, obj2, ...]);
   * </pre>
   *
   * To retrieve object:
   * <code>query.fromLocalDatastore()</code> or <code>query.fromPinWithName(name)</code>
   *
   * @param {string} name Name of Pin.
   * @param {Array} objects A list of <code>Parse.Object</code>.
   * @returns {Promise} A promise that is fulfilled when the pin completes.
   * @static
   */
  static pinAllWithName(name: string, objects: ParseObject[]): Promise<void> {
    const localDatastore = CoreManager.getLocalDatastore();
    if (!localDatastore.isEnabled) {
      return Promise.reject('Parse.enableLocalDatastore() must be called first');
    }
    return localDatastore._handlePinAllWithName(name, objects);
  }

  /**
   * Asynchronously removes the objects and every object they point to in the local datastore,
   * recursively, using a default pin name: _default.
   *
   * <pre>
   * await Parse.Object.unPinAll([...]);
   * </pre>
   *
   * @param {Array} objects A list of <code>Parse.Object</code>.
   * @returns {Promise} A promise that is fulfilled when the unPin completes.
   * @static
   */
  static unPinAll(objects: ParseObject[]): Promise<void> {
    const localDatastore = CoreManager.getLocalDatastore();
    if (!localDatastore.isEnabled) {
      return Promise.reject('Parse.enableLocalDatastore() must be called first');
    }
    return ParseObject.unPinAllWithName(DEFAULT_PIN, objects);
  }

  /**
   * Asynchronously removes the objects and every object they point to in the local datastore, recursively.
   *
   * <pre>
   * await Parse.Object.unPinAllWithName(name, [obj1, obj2, ...]);
   * </pre>
   *
   * @param {string} name Name of Pin.
   * @param {Array} objects A list of <code>Parse.Object</code>.
   * @returns {Promise} A promise that is fulfilled when the unPin completes.
   * @static
   */
  static unPinAllWithName(name: string, objects: ParseObject[]): Promise<void> {
    const localDatastore = CoreManager.getLocalDatastore();
    if (!localDatastore.isEnabled) {
      return Promise.reject('Parse.enableLocalDatastore() must be called first');
    }
    return localDatastore._handleUnPinAllWithName(name, objects);
  }

  /**
   * Asynchronously removes all objects in the local datastore using a default pin name: _default.
   *
   * <pre>
   * await Parse.Object.unPinAllObjects();
   * </pre>
   *
   * @returns {Promise} A promise that is fulfilled when the unPin completes.
   * @static
   */
  static unPinAllObjects(): Promise<void> {
    const localDatastore = CoreManager.getLocalDatastore();
    if (!localDatastore.isEnabled) {
      return Promise.reject('Parse.enableLocalDatastore() must be called first');
    }
    return localDatastore.unPinWithName(DEFAULT_PIN);
  }

  /**
   * Asynchronously removes all objects with the specified pin name.
   * Deletes the pin name also.
   *
   * <pre>
   * await Parse.Object.unPinAllObjectsWithName(name);
   * </pre>
   *
   * @param {string} name Name of Pin.
   * @returns {Promise} A promise that is fulfilled when the unPin completes.
   * @static
   */
  static unPinAllObjectsWithName(name: string): Promise<void> {
    const localDatastore = CoreManager.getLocalDatastore();
    if (!localDatastore.isEnabled) {
      return Promise.reject('Parse.enableLocalDatastore() must be called first');
    }
    return localDatastore.unPinWithName(PIN_PREFIX + name);
  }
}

const DefaultController = {
  fetch(
    target: ParseObject | ParseObject[],
    forceFetch: boolean,
    options?: RequestOptions
  ): Promise<(ParseObject | undefined)[] | ParseObject | undefined> {
    const localDatastore = CoreManager.getLocalDatastore();
    if (Array.isArray(target)) {
      if (target.length < 1) {
        return Promise.resolve([]);
      }
      const objs: ParseObject[] = [];
      const ids: string[] = [];
      let className: string | null = null;
      const results: ParseObject[] = [];
      let error: ParseError | null = null;
      target.forEach(el => {
        if (error) {
          return;
        }
        if (!className) {
          className = el.className;
        }
        if (className !== el.className) {
          error = new ParseError(
            ParseError.INVALID_CLASS_NAME,
            'All objects should be of the same class'
          );
        }
        if (!el.id) {
          error = new ParseError(ParseError.MISSING_OBJECT_ID, 'All objects must have an ID');
        }
        if (forceFetch || !el.isDataAvailable()) {
          ids.push(el.id!);
          objs.push(el);
        }
        results.push(el);
      });
      if (error) {
        return Promise.reject(error);
      }
      const ParseQuery = CoreManager.getParseQuery();
      const query = new ParseQuery(className);
      query.containedIn('objectId', ids);
      if (options && options.include) {
        query.include(options.include);
      }
      query._limit = ids.length;
      return query.find(options).then(async objects => {
        const idMap = {};
        objects.forEach(o => {
          idMap[o.id] = o;
        });
        for (let i = 0; i < objs.length; i++) {
          const obj = objs[i];
          if (!obj || !obj.id || !idMap[obj.id]) {
            if (forceFetch) {
              return Promise.reject(
                new ParseError(ParseError.OBJECT_NOT_FOUND, 'All objects must exist on the server.')
              );
            }
          }
        }
        if (!singleInstance) {
          // If single instance objects are disabled, we need to replace the
          for (let i = 0; i < results.length; i++) {
            const obj = results[i];
            if (obj && obj.id && idMap[obj.id]) {
              const id = obj.id;
              obj._finishFetch(idMap[id].toJSON());
              results[i] = idMap[id];
            }
          }
        }
        for (const object of results) {
          await localDatastore._updateObjectIfPinned(object);
        }
        return Promise.resolve(results);
      });
    } else if (target instanceof ParseObject) {
      if (!target.id) {
        return Promise.reject(
          new ParseError(ParseError.MISSING_OBJECT_ID, 'Object does not have an ID')
        );
      }
      const RESTController = CoreManager.getRESTController();
      const params: RequestOptions = {};
      if (options && options.include) {
        params.include = options.include.join();
      }
      return RESTController.request(
        'GET',
        'classes/' + target.className + '/' + target._getId(),
        params,
        options
      ).then(async response => {
        target._clearPendingOps();
        target._clearServerData();
        target._finishFetch(response);
        await localDatastore._updateObjectIfPinned(target);
        return target;
      });
    }
    return Promise.resolve(undefined);
  },

  async destroy(
    target: ParseObject | ParseObject[],
    options?: RequestOptions
  ): Promise<ParseObject | ParseObject[]> {
    if (options && options.batchSize && options.transaction)
      throw new ParseError(
        ParseError.OTHER_CAUSE,
        'You cannot use both transaction and batchSize options simultaneously.'
      );

    let batchSize =
      options && options.batchSize ? options.batchSize : CoreManager.get('REQUEST_BATCH_SIZE');
    const localDatastore = CoreManager.getLocalDatastore();

    const RESTController = CoreManager.getRESTController();
    if (Array.isArray(target)) {
      if (options && options.transaction && target.length > 1) batchSize = target.length;

      if (target.length < 1) {
        return Promise.resolve([]);
      }
      const batches = [[]];
      target.forEach(obj => {
        if (!obj.id) {
          return;
        }
        batches[batches.length - 1].push(obj);
        if (batches[batches.length - 1].length >= batchSize) {
          batches.push([]);
        }
      });
      if (batches[batches.length - 1].length === 0) {
        // If the last batch is empty, remove it
        batches.pop();
      }
      let deleteCompleted = Promise.resolve();
      const errors = [];
      batches.forEach(batch => {
        const requests = batch.map(obj => {
          return {
            method: 'DELETE',
            path: getServerUrlPath() + 'classes/' + obj.className + '/' + obj._getId(),
            body: {},
          };
        });
        const body =
          options && options.transaction && requests.length > 1
            ? { requests, transaction: true }
            : { requests };

        deleteCompleted = deleteCompleted.then(() => {
          return RESTController.request('POST', 'batch', body, options).then(results => {
            for (let i = 0; i < results.length; i++) {
              if (results[i] && Object.hasOwn(results[i], 'error')) {
                const err = new ParseError(results[i].error.code, results[i].error.error);
                err.object = batch[i];
                errors.push(err);
              }
            }
          });
        });
      });
      return deleteCompleted.then(async () => {
        if (errors.length) {
          const aggregate = new ParseError(ParseError.AGGREGATE_ERROR);
          aggregate.errors = errors;
          return Promise.reject(aggregate);
        }
        for (const object of target) {
          await localDatastore._destroyObjectIfPinned(object);
        }
        return Promise.resolve(target);
      });
    } else if (target instanceof ParseObject) {
      return RESTController.request(
        'DELETE',
        'classes/' + target.className + '/' + target._getId(),
        {},
        options
      ).then(async () => {
        await localDatastore._destroyObjectIfPinned(target);
        return Promise.resolve(target);
      });
    }
    return Promise.resolve(target);
  },

  save(
    target: ParseObject | null | (ParseObject | ParseFile)[],
    options?: RequestOptions
  ): Promise<ParseObject | ParseObject[] | ParseFile | undefined> {
    if (options && options.batchSize && options.transaction)
      return Promise.reject(
        new ParseError(
          ParseError.OTHER_CAUSE,
          'You cannot use both transaction and batchSize options simultaneously.'
        )
      );

    let batchSize =
      options && options.batchSize ? options.batchSize : CoreManager.get('REQUEST_BATCH_SIZE');

    const localDatastore = CoreManager.getLocalDatastore();
    const mapIdForPin = {};

    const RESTController = CoreManager.getRESTController();
    const stateController = CoreManager.getObjectStateController();
    const allowCustomObjectId = CoreManager.get('ALLOW_CUSTOM_OBJECT_ID');

    options = options || {};
    options.returnStatus = options.returnStatus || true;
    if (Array.isArray(target)) {
      if (target.length < 1) {
        return Promise.resolve([]);
      }

      let unsaved = target.concat();
      for (let i = 0; i < target.length; i++) {
        const target_i = target[i];
        if (target_i instanceof ParseObject) {
          unsaved = unsaved.concat(unsavedChildren(target_i, true));
        }
      }
      unsaved = unique(unsaved);

      const filesSaved: (Promise<ParseFile> | undefined)[] = [];
      let pending: ParseObject[] = [];
      unsaved.forEach(el => {
        if (el instanceof ParseFile) {
          filesSaved.push(el.save(options));
        } else if (el instanceof ParseObject) {
          pending.push(el);
        }
      });

      if (options && options.transaction && pending.length > 1) {
        if (pending.some(el => !canBeSerialized(el)))
          return Promise.reject(
            new ParseError(
              ParseError.OTHER_CAUSE,
              'Tried to save a transactional batch containing an object with unserializable attributes.'
            )
          );
        batchSize = pending.length;
      }

      return Promise.all(filesSaved).then(() => {
        let objectError = null;
        return continueWhile(
          () => {
            return pending.length > 0;
          },
          () => {
            const batch = [];
            const nextPending = [];
            pending.forEach(el => {
              if (allowCustomObjectId && Object.hasOwn(el, 'id') && !el.id) {
                throw new ParseError(
                  ParseError.MISSING_OBJECT_ID,
                  'objectId must not be empty or null'
                );
              }

              if (batch.length < batchSize && canBeSerialized(el)) {
                batch.push(el);
              } else {
                nextPending.push(el);
              }
            });
            pending = nextPending;
            if (batch.length < 1) {
              return Promise.reject(
                new ParseError(ParseError.OTHER_CAUSE, 'Tried to save a batch with a cycle.')
              );
            }

            // Queue up tasks for each object in the batch.
            // When every task is ready, the API request will execute
            const batchReturned = resolvingPromise();
            const batchReady: ReturnType<typeof resolvingPromise<void>>[] = [];
            const batchTasks: Promise<void>[] = [];
            batch.forEach((obj, index) => {
              // eslint-disable-next-line
              const ready = resolvingPromise<void>();
              batchReady.push(ready);
              const task = function () {
                ready.resolve();
                return batchReturned.then(responses => {
                  if (Object.hasOwn(responses[index], 'success')) {
                    const objectId = responses[index].success.objectId;
                    const status = responses[index]._status;
                    delete responses[index]._status;
                    delete responses[index]._headers;
                    delete responses[index]._xhr;
                    mapIdForPin[objectId] = obj._localId;
                    obj._handleSaveResponse(responses[index].success, status);
                  } else {
                    if (!objectError && Object.hasOwn(responses[index], 'error')) {
                      const serverError = responses[index].error;
                      objectError = new ParseError(serverError.code, serverError.error);
                      // Cancel the rest of the save
                      pending = [];
                    }
                    obj._handleSaveError();
                  }
                });
              };
              stateController.pushPendingState(obj._getStateIdentifier());
              batchTasks.push(stateController.enqueueTask(obj._getStateIdentifier(), task));
            });

            when(batchReady)
              .then(() => {
                // Kick off the batch request
                const requests = batch.map(obj => {
                  const params = obj._getSaveParams();
                  params.path = getServerUrlPath() + params.path;
                  return params;
                });
                const body =
                  options && options.transaction && requests.length > 1
                    ? { requests, transaction: true }
                    : { requests };
                return RESTController.request('POST', 'batch', body, options);
              })
              .then(batchReturned.resolve, error => {
                batchReturned.reject(new ParseError(ParseError.INCORRECT_TYPE, error.message));
              });

            return when(batchTasks);
          }
        ).then(async () => {
          if (objectError) {
            return Promise.reject(objectError);
          }
          for (const object of target) {
            // Make sure that it is a ParseObject before updating it into the localDataStore
            if (object instanceof ParseObject) {
              await localDatastore._updateLocalIdForObject(mapIdForPin[object.id], object);
              await localDatastore._updateObjectIfPinned(object);
            }
          }
          return Promise.resolve(target);
        });
      });
    } else if (target instanceof ParseObject) {
      if (allowCustomObjectId && Object.hasOwn(target, 'id') && !target.id) {
        throw new ParseError(ParseError.MISSING_OBJECT_ID, 'objectId must not be empty or null');
      }
      // generate _localId in case if cascadeSave=false
      target._getId();
      const localId = target._localId;
      // copying target lets guarantee the pointer isn't modified elsewhere
      const targetCopy = target;
      const task = function () {
        const params = targetCopy._getSaveParams();
        return RESTController.request(params.method, params.path, params.body, options).then(
          response => {
            const status = response._status;
            delete response._status;
            delete response._headers;
            delete response._xhr;
            targetCopy._handleSaveResponse(response, status);
          },
          error => {
            targetCopy._handleSaveError();
            return Promise.reject(error);
          }
        );
      };

      stateController.pushPendingState(target._getStateIdentifier());
      return stateController.enqueueTask(target._getStateIdentifier(), task).then(
        async () => {
          await localDatastore._updateLocalIdForObject(localId, target);
          await localDatastore._updateObjectIfPinned(target);
          return target;
        },
        error => {
          return Promise.reject(error);
        }
      );
    }
    return Promise.resolve(undefined);
  },
};

CoreManager.setParseObject(ParseObject);
CoreManager.setObjectController(DefaultController);

export default ParseObject;
