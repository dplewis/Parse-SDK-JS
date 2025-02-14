/// <reference path="node.d.ts" />
/// <reference path="react-native.d.ts" />

declare enum ErrorCode {
  OTHER_CAUSE = -1,
  INTERNAL_SERVER_ERROR = 1,
  CONNECTION_FAILED = 100,
  OBJECT_NOT_FOUND = 101,
  INVALID_QUERY = 102,
  INVALID_CLASS_NAME = 103,
  MISSING_OBJECT_ID = 104,
  INVALID_KEY_NAME = 105,
  INVALID_POINTER = 106,
  INVALID_JSON = 107,
  COMMAND_UNAVAILABLE = 108,
  NOT_INITIALIZED = 109,
  INCORRECT_TYPE = 111,
  INVALID_CHANNEL_NAME = 112,
  PUSH_MISCONFIGURED = 115,
  OBJECT_TOO_LARGE = 116,
  OPERATION_FORBIDDEN = 119,
  CACHE_MISS = 120,
  INVALID_NESTED_KEY = 121,
  INVALID_FILE_NAME = 122,
  INVALID_ACL = 123,
  TIMEOUT = 124,
  INVALID_EMAIL_ADDRESS = 125,
  MISSING_CONTENT_TYPE = 126,
  MISSING_CONTENT_LENGTH = 127,
  INVALID_CONTENT_LENGTH = 128,
  FILE_TOO_LARGE = 129,
  FILE_SAVE_ERROR = 130,
  DUPLICATE_VALUE = 137,
  INVALID_ROLE_NAME = 139,
  EXCEEDED_QUOTA = 140,
  SCRIPT_FAILED = 141,
  VALIDATION_ERROR = 142,
  INVALID_IMAGE_DATA = 150,
  UNSAVED_FILE_ERROR = 151,
  INVALID_PUSH_TIME_ERROR = 152,
  FILE_DELETE_ERROR = 153,
  REQUEST_LIMIT_EXCEEDED = 155,
  DUPLICATE_REQUEST = 159,
  INVALID_EVENT_NAME = 160,
  FILE_DELETE_UNNAMED_ERROR = 161,
  USERNAME_MISSING = 200,
  PASSWORD_MISSING = 201,
  USERNAME_TAKEN = 202,
  EMAIL_TAKEN = 203,
  EMAIL_MISSING = 204,
  EMAIL_NOT_FOUND = 205,
  SESSION_MISSING = 206,
  MUST_CREATE_USER_THROUGH_SIGNUP = 207,
  ACCOUNT_ALREADY_LINKED = 208,
  INVALID_SESSION_TOKEN = 209,
  MFA_ERROR = 210,
  MFA_TOKEN_REQUIRED = 211,
  LINKED_ID_MISSING = 250,
  INVALID_LINKED_SESSION = 251,
  UNSUPPORTED_SERVICE = 252,
  INVALID_SCHEMA_OPERATION = 255,
  AGGREGATE_ERROR = 600,
  FILE_READ_ERROR = 601,
  X_DOMAIN_REQUEST = 602,
}

declare global {
  namespace Parse {
    let applicationId: string;
    let javaScriptKey: string | undefined;
    let liveQueryServerURL: string;
    let masterKey: string | undefined;
    let serverAuthToken: string | undefined;
    let serverAuthType: string | undefined;
    let serverURL: string;
    let secret: string;
    let idempotency: boolean;
    let encryptedUser: boolean;

    interface BatchSizeOption {
      batchSize?: number | undefined;
    }

    interface CascadeSaveOption {
      cascadeSave?: boolean | undefined;
    }

    interface SuccessOption {
      success?: Function | undefined;
    }

    interface ErrorOption {
      error?: Function | undefined;
    }

    interface ContextOption {
      context?: { [key: string]: any };
    }

    interface FullOptions {
      success?: Function | undefined;
      error?: Function | undefined;
      useMasterKey?: boolean | undefined;
      sessionToken?: string | undefined;
      installationId?: string | undefined;
      progress?: Function | undefined;

      usePost?: boolean;
    }

    interface RequestOptions {
      useMasterKey?: boolean | undefined;
      sessionToken?: string | undefined;
      installationId?: string | undefined;
      batchSize?: number | undefined;
      include?: string | string[] | undefined;
      progress?: Function | undefined;
    }

    interface SuccessFailureOptions extends SuccessOption, ErrorOption {}

    interface SignUpOptions {
      useMasterKey?: boolean | undefined;
      installationId?: string | undefined;
    }

    interface SessionTokenOption {
      sessionToken?: string | undefined;
    }

    interface WaitOption {
      wait?: boolean | undefined;
    }

    interface UseMasterKeyOption {
      useMasterKey?: boolean | undefined;
    }

    interface RawJSONOptions {
      json?: boolean;
    }

    interface ScopeOptions extends SessionTokenOption, UseMasterKeyOption {}

    interface SilentOption {
      silent?: boolean | undefined;
    }

    interface Pointer {
      __type: string;
      className: string;
      objectId: string;
    }

    interface AuthData {
      [key: string]: any;
    }

    interface AuthProvider {
      authenticate: () => void;
      deauthenticate?: (() => void) | undefined;
      getAuthType: () => string;
      restoreAuthentication: () => boolean;
    }

    interface BaseAttributes {
      createdAt: Date;
      objectId: string;
      updatedAt: Date;
    }

    interface CommonAttributes {
      ACL: ACL;
    }

    interface JSONBaseAttributes {
      createdAt: string;
      objectId: string;
      updatedAt: string;
    }

    class ACL {
      permissionsById: any;

      constructor(arg1?: any);

      setPublicReadAccess(allowed: boolean): void;
      getPublicReadAccess(): boolean;

      setPublicWriteAccess(allowed: boolean): void;
      getPublicWriteAccess(): boolean;

      setReadAccess(userId: User | string, allowed: boolean): void;
      getReadAccess(userId: User | string): boolean;

      setWriteAccess(userId: User | string, allowed: boolean): void;
      getWriteAccess(userId: User | string): boolean;

      setRoleReadAccess(role: Role | string, allowed: boolean): void;
      getRoleReadAccess(role: Role | string): boolean;

      setRoleWriteAccess(role: Role | string, allowed: boolean): void;
      getRoleWriteAccess(role: Role | string): boolean;

      toJSON(): any;
    }

    class File {
      constructor(
        name: string,
        data: number[] | { base64: string } | { size: number; type: string } | { uri: string },
        type?: string
      );

      getData(): Promise<string>;
      url(options?: { forceSecure?: boolean | undefined }): string;
      metadata(): Record<string, any>;
      tags(): Record<string, any>;
      name(): string;
      save(options?: FullOptions): Promise<File>;
      cancel(): void;
      destroy(options?: FullOptions): Promise<File>;
      toJSON(): { __type: string; name: string; url: string };
      equals(other: File): boolean;
      setMetadata(metadata: Record<string, any>): void;
      addMetadata(key: string, value: any): void;
      setTags(tags: Record<string, any>): void;
      addTag(key: string, value: any): void;
      readonly _url: string;
    }

    class GeoPoint {
      latitude: number;
      longitude: number;

      constructor(latitude: number, longitude: number);
      constructor(coords?: { latitude: number; longitude: number } | [number, number]);

      current(options?: SuccessFailureOptions): GeoPoint;
      radiansTo(point: GeoPoint): number;
      kilometersTo(point: GeoPoint): number;
      milesTo(point: GeoPoint): number;
      toJSON(): any;
    }

    class Relation<S extends Object = Object, T extends Object = Object> {
      parent: S;
      key: string;
      targetClassName: string;

      constructor(parent?: S, key?: string);

      add(object: T | T[]): void;
      query(): Query<T>;
      remove(object: T | T[]): void;
      toJSON(): any;
    }

    interface Attributes {
      [key: string]: any;
    }

    interface Object<T extends Attributes = Attributes> {
      id: string;
      createdAt: Date;
      updatedAt: Date;
      attributes: T;
      className: string;

      add<K extends { [K in keyof T]: NonNullable<T[K]> extends any[] ? K : never }[keyof T]>(
        attr: K,
        item: NonNullable<T[K]>[number]
      ): this | false;
      addAll<K extends { [K in keyof T]: NonNullable<T[K]> extends any[] ? K : never }[keyof T]>(
        attr: K,
        items: NonNullable<T[K]>
      ): this | false;
      addAllUnique: this['addAll'];
      addUnique: this['add'];
      clear(options: any): any;
      clone(): this;
      destroy(options?: Object.DestroyOptions): Promise<this>;
      destroyEventually(options?: Object.DestroyOptions): Promise<this>;
      dirty(attr?: Extract<keyof T, string>): boolean;
      dirtyKeys(): string[];
      equals<T extends Object>(other: T): boolean;
      escape(attr: Extract<keyof T, string>): string;
      existed(): boolean;
      exists(options?: RequestOptions): Promise<boolean>;
      fetch(options?: Object.FetchOptions): Promise<this>;
      fetchFromLocalDatastore(): Promise<this>;
      fetchWithInclude<K extends Extract<keyof T, string>>(
        keys: K | Array<K | K[]>,
        options?: RequestOptions
      ): Promise<this>;
      get<K extends Extract<keyof T, string>>(attr: K): T[K];
      getACL(): ACL | undefined;
      has(attr: Extract<keyof T, string>): boolean;
      increment(attr: Extract<keyof T, string>, amount?: number): this | false;
      decrement(attr: Extract<keyof T, string>, amount?: number): this | false;
      initialize(): void;
      isDataAvailable(): boolean;
      isNew(): boolean;
      isPinned(): Promise<boolean>;
      isValid(): boolean;
      newInstance(): this;
      op(attr: Extract<keyof T, string>): any;
      pin(): Promise<void>;
      pinWithName(name: string): Promise<void>;
      relation<R extends Object, K extends Extract<keyof T, string> = Extract<keyof T, string>>(
        attr: T[K] extends Relation ? K : never
      ): Relation<this, R>;
      remove: this['add'];
      removeAll: this['addAll'];
      revert(...keys: Array<Extract<keyof (T & CommonAttributes), string>>): void;
      save<K extends Extract<keyof T, string>>(
        attrs?: Pick<T, K> | T | null,
        options?: Object.SaveOptions
      ): Promise<this>;
      save<K extends Extract<keyof T, string>>(
        key: K,
        value: T[K] extends undefined ? never : T[K],
        options?: Object.SaveOptions
      ): Promise<this>;
      saveEventually(options?: Object.SaveOptions): Promise<this>;
      set<K extends Extract<keyof T, string>>(
        attrs: Pick<T, K> | T,
        options?: Object.SetOptions
      ): this | false;
      set<K extends Extract<keyof T, string>>(
        key: K,
        value: T[K] extends undefined ? never : T[K],
        options?: Object.SetOptions
      ): this | false;
      setACL(acl: ACL, options?: SuccessFailureOptions): this | false;
      toJSON(): Object.ToJSON<T> & JSONBaseAttributes;
      toPointer(): Pointer;
      unPin(): Promise<void>;
      unPinWithName(name: string): Promise<void>;
      unset(attr: Extract<keyof T, string>, options?: any): this | false;
      validate(attrs: Attributes, options?: SuccessFailureOptions): Error | false;
    }
    interface ObjectStatic<T extends Object = Object> {
      createWithoutData(id: string): T;
      destroyAll<T extends Object>(list: T[], options?: Object.DestroyAllOptions): Promise<T[]>;
      extend(className: string | { className: string }, protoProps?: any, classProps?: any): any;
      fetchAll<T extends Object>(list: T[], options: Object.FetchAllOptions): Promise<T[]>;
      fetchAllIfNeeded<T extends Object>(list: T[], options?: Object.FetchAllOptions): Promise<T[]>;
      fetchAllIfNeededWithInclude<T extends Object>(
        list: T[],
        keys: keyof T['attributes'] | Array<keyof T['attributes']>,
        options?: RequestOptions
      ): Promise<T[]>;
      fetchAllWithInclude<T extends Object>(
        list: T[],
        keys: keyof T['attributes'] | Array<keyof T['attributes']>,
        options?: RequestOptions
      ): Promise<T[]>;
      fromJSON(json: any, override?: boolean): T;
      pinAll(objects: Object[]): Promise<void>;
      pinAllWithName(name: string, objects: Object[]): Promise<void>;
      registerSubclass(className: string, clazz: new (options?: any) => T): void;
      saveAll<T extends readonly Object[]>(list: T, options?: Object.SaveAllOptions): Promise<T>;
      unPinAll(objects: Object[]): Promise<void>;
      unPinAllObjects(): Promise<void>;
      unPinAllObjectsWithName(name: string): Promise<void>;
      unPinAllWithName(name: string, objects: Object[]): Promise<void>;
    }
    interface ObjectConstructor extends ObjectStatic {
      new <T extends Attributes>(className: string, attributes: T, options?: any): Object<T>;
      new (className?: string, attributes?: Attributes, options?: any): Object;
    }
    const Object: ObjectConstructor;

    namespace Object {
      interface DestroyOptions extends SuccessFailureOptions, WaitOption, ScopeOptions {}

      interface DestroyAllOptions extends BatchSizeOption, ScopeOptions {}

      interface FetchAllOptions extends SuccessFailureOptions, ScopeOptions {}

      interface FetchOptions extends SuccessFailureOptions, ScopeOptions {}

      interface SaveOptions
        extends CascadeSaveOption,
          SuccessFailureOptions,
          SilentOption,
          ScopeOptions,
          ContextOption,
          WaitOption {}

      interface SaveAllOptions extends BatchSizeOption, ScopeOptions {}

      interface SetOptions extends ErrorOption, SilentOption {
        promise?: any;
      }

      type Encode<T> = T extends Object
        ? ReturnType<T['toJSON']> | Pointer
        : T extends ACL | GeoPoint | Polygon | Relation | File
          ? ReturnType<T['toJSON']>
          : T extends Date
            ? { __type: 'Date'; iso: string }
            : T extends RegExp
              ? string
              : T extends Array<infer R>
                ? Array<Encode<R>>
                : T extends object
                  ? ToJSON<T>
                  : T;

      type ToJSON<T> = {
        [K in keyof T]: Encode<T[K]>;
      };
    }

    class Polygon {
      constructor(arg1: GeoPoint[] | number[][]);
      containsPoint(point: GeoPoint): boolean;
      equals(other: any): boolean;
      toJSON(): any;
    }

    interface Installation<T extends Attributes = Attributes> extends Object<T> {
      badge: any;
      channels: string[];
      timeZone: any;
      deviceType: string;
      pushType: string;
      installationId: string;
      deviceToken: string;
      channelUris: string;
      appName: string;
      appVersion: string;
      parseVersion: string;
      appIdentifier: string;
    }
    interface InstallationConstructor extends ObjectStatic<Installation> {
      new <T extends Attributes>(attributes: T): Installation<T>;
      new (): Installation;
    }
    const Installation: InstallationConstructor;

    class Query<T extends Object = Object> {
      objectClass: any;
      className: string;

      constructor(objectClass: string | (new (...args: any[]) => T | Object));

      static and<U extends Object>(...args: Array<Query<U>>): Query<U>;
      static fromJSON<U extends Object>(className: string | (new () => U), json: any): Query<U>;
      static nor<U extends Object>(...args: Array<Query<U>>): Query<U>;
      static or<U extends Object>(...var_args: Array<Query<U>>): Query<U>;

      addAscending<K extends keyof T['attributes'] | keyof BaseAttributes>(key: K | K[]): this;
      addDescending<K extends keyof T['attributes'] | keyof BaseAttributes>(key: K | K[]): this;
      ascending<K extends keyof T['attributes'] | keyof BaseAttributes>(key: K | K[]): this;
      aggregate<V = any>(
        pipeline: Query.AggregationOptions | Query.AggregationOptions[]
      ): Promise<V>;
      containedBy<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        values: Array<T['attributes'][K] | (T['attributes'][K] extends Object ? string : never)>
      ): this;
      containedIn<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        values: Array<T['attributes'][K] | (T['attributes'][K] extends Object ? string : never)>
      ): this;
      contains<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        substring: string
      ): this;
      containsAll<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        values: any[]
      ): this;
      containsAllStartingWith<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        values: any[]
      ): this;
      count(options?: Query.CountOptions): Promise<number>;
      descending<K extends keyof T['attributes'] | keyof BaseAttributes>(key: K | K[]): this;
      doesNotExist<K extends keyof T['attributes'] | keyof BaseAttributes>(key: K): this;
      doesNotMatchKeyInQuery<
        U extends Object,
        K extends keyof T['attributes'] | keyof BaseAttributes,
        X extends Extract<keyof U['attributes'], string>,
      >(key: K, queryKey: X, query: Query<U>): this;
      doesNotMatchQuery<U extends Object, K extends keyof T['attributes']>(
        key: K,
        query: Query<U>
      ): this;
      distinct<K extends keyof T['attributes'], V = T['attributes'][K]>(key: K): Promise<V[]>;
      eachBatch(
        callback: (objs: T[]) => PromiseLike<void> | void,
        options?: Query.BatchOptions
      ): Promise<void>;
      each(
        callback: (obj: T) => PromiseLike<void> | void,
        options?: Query.BatchOptions
      ): Promise<void>;
      hint(value: string | object): this;
      explain(explain: boolean): this;
      map<U>(
        callback: (currentObject: T, index: number, query: Query) => PromiseLike<U> | U,
        options?: Query.BatchOptions
      ): Promise<U[]>;
      reduce(
        callback: (accumulator: T, currentObject: T, index: number) => PromiseLike<T> | T,
        initialValue?: undefined,
        options?: Query.BatchOptions
      ): Promise<T>;
      reduce<U>(
        callback: (accumulator: U, currentObject: T, index: number) => PromiseLike<U> | U,
        initialValue: U,
        options?: Query.BatchOptions
      ): Promise<U>;
      filter(
        callback: (currentObject: T, index: number, query: Query) => PromiseLike<boolean> | boolean,
        options?: Query.BatchOptions
      ): Promise<T[]>;
      endsWith<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        suffix: string
      ): this;
      equalTo<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        value:
          | T['attributes'][K]
          | (T['attributes'][K] extends Object
              ? Pointer
              : T['attributes'][K] extends Array<infer E>
                ? E
                : never)
      ): this;
      exclude<K extends keyof T['attributes'] | keyof BaseAttributes>(...keys: K[]): this;
      exists<K extends keyof T['attributes'] | keyof BaseAttributes>(key: K): this;
      find(options?: Query.FindOptions): Promise<T[]>;
      findAll(options?: Query.BatchOptions): Promise<T[]>;
      first(options?: Query.FirstOptions): Promise<T | undefined>;
      fromNetwork(): this;
      fromLocalDatastore(): this;
      fromPin(): this;
      fromPinWithName(name: string): this;
      cancel(): this;
      fullText<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        value: string,
        options?: Query.FullTextOptions
      ): this;
      get(objectId: string, options?: Query.GetOptions): Promise<T>;
      greaterThan<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        value: T['attributes'][K]
      ): this;
      greaterThanOrEqualTo<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        value: T['attributes'][K]
      ): this;
      include<K extends keyof T['attributes'] | keyof BaseAttributes>(...key: K[]): this;
      include<K extends keyof T['attributes'] | keyof BaseAttributes>(key: K[]): this;
      includeAll(): Query<T>;
      lessThan<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        value: T['attributes'][K]
      ): this;
      lessThanOrEqualTo<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        value: T['attributes'][K]
      ): this;
      limit(n: number): Query<T>;
      matches<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        regex: RegExp,
        modifiers?: string
      ): this;
      matchesKeyInQuery<
        U extends Object,
        K extends keyof T['attributes'],
        X extends Extract<keyof U['attributes'], string>,
      >(key: K, queryKey: X, query: Query<U>): this;
      matchesQuery<U extends Object, K extends keyof T['attributes']>(
        key: K,
        query: Query<U>
      ): this;
      near<K extends keyof T['attributes'] | keyof BaseAttributes>(key: K, point: GeoPoint): this;
      notContainedIn<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        values: Array<T['attributes'][K]>
      ): this;
      notEqualTo<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        value:
          | T['attributes'][K]
          | (T['attributes'][K] extends Object
              ? Pointer
              : T['attributes'][K] extends Array<infer E>
                ? E
                : never)
      ): this;
      polygonContains<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        point: GeoPoint
      ): this;
      select<K extends keyof T['attributes'] | keyof BaseAttributes>(...keys: K[]): this;
      select<K extends keyof T['attributes'] | keyof BaseAttributes>(keys: K[]): this;
      skip(n: number): Query<T>;
      sortByTextScore(): this;
      startsWith<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        prefix: string
      ): this;
      subscribe(sessionToken?: string): Promise<LiveQuerySubscription>;
      toJSON(): any;
      withJSON(json: any): this;
      withCount(includeCount?: boolean): this;
      withinGeoBox<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        southwest: GeoPoint,
        northeast: GeoPoint
      ): this;
      withinKilometers<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        point: GeoPoint,
        maxDistance: number,
        sorted?: boolean
      ): this;
      withinMiles<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        point: GeoPoint,
        maxDistance: number,
        sorted?: boolean
      ): this;
      withinPolygon<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        points: number[][]
      ): this;
      withinRadians<K extends keyof T['attributes'] | keyof BaseAttributes>(
        key: K,
        point: GeoPoint,
        maxDistance: number,
        sorted?: boolean
      ): this;
    }

    namespace Query {
      interface EachOptions extends SuccessFailureOptions, ScopeOptions {}
      interface CountOptions extends SuccessFailureOptions, ScopeOptions {}
      interface FindOptions extends SuccessFailureOptions, ScopeOptions, RawJSONOptions {}
      interface FirstOptions extends SuccessFailureOptions, ScopeOptions, RawJSONOptions {}
      interface GetOptions extends SuccessFailureOptions, ScopeOptions, RawJSONOptions {}

      interface AggregationOptions {
        group?: (Record<string, any> & { objectId?: string }) | undefined;
        match?: Record<string, any> | undefined;
        project?: Record<string, any> | undefined;
        limit?: number | undefined;
        skip?: number | undefined;

        sort?: Record<string, 1 | -1> | undefined;

        sample?: { size: number } | undefined;

        count?: string | undefined;

        lookup?:
          | {
              from: string;
              localField: string;
              foreignField: string;
              as: string;
            }
          | {
              from: string;
              let?: Record<string, any>;
              pipeline: Record<string, any>;
              as: string;
            }
          | undefined;

        graphLookup?:
          | {
              from: string;
              startWith?: string;
              connectFromField: string;
              connectToField: string;
              as: string;
              maxDepth?: number;
              depthField?: string;
              restrictSearchWithMatch?: Record<string, any>;
            }
          | undefined;

        facet?: Record<string, Array<Record<string, any>>> | undefined;

        unwind?:
          | {
              path: string;
              includeArrayIndex?: string;
              preserveNullAndEmptyArrays?: boolean;
            }
          | string
          | undefined;
      }

      interface FullTextOptions {
        language?: string | undefined;
        caseSensitive?: boolean | undefined;
        diacriticSensitive?: boolean | undefined;
      }

      interface BatchOptions extends FullOptions {
        batchSize?: number | undefined;
      }
    }

    class LiveQuerySubscription {
      constructor(id: string, query: string, sessionToken?: string);

      on(
        event: 'open' | 'create' | 'update' | 'enter' | 'leave' | 'delete' | 'close',
        listener: (object: Object) => void
      ): this;
      unsubscribe(): void;
    }

    namespace LiveQuery {
      function on(event: 'open' | 'close', listener: () => void): void;
      function on(event: 'error', listener: (error: any) => void): void;
    }

    interface Role<T extends Attributes = Attributes> extends Object<T> {
      getRoles(): Relation<Role, Role>;
      getUsers<U extends User>(): Relation<Role, U>;
      getName(): string;
      setName(name: string, options?: SuccessFailureOptions): any;
    }
    interface RoleConstructor extends ObjectStatic<Role> {
      new <T extends Attributes>(name: string, acl: ACL): Role<Partial<T>>;
      new (name: string, acl: ACL): Role;
    }
    const Role: RoleConstructor;

    class Config {
      static get(options?: UseMasterKeyOption): Promise<Config>;
      static current(): Config;
      static save(attr: any, options?: { [attr: string]: boolean }): Promise<Config>;

      get(attr: string): any;
      escape(attr: string): any;
    }

    interface Session<T extends Attributes = Attributes> extends Object<T> {
      getSessionToken(): string;
      isCurrentSessionRevocable(): boolean;
    }
    interface SessionConstructor extends ObjectStatic<Session> {
      new <T extends Attributes>(attributes: T): Session<T>;
      new (): Session;

      current(): Promise<Session>;
    }
    const Session: SessionConstructor;

    interface User<T extends Attributes = Attributes> extends Object<T> {
      signUp(attrs?: any, options?: SignUpOptions): Promise<this>;
      logIn(options?: FullOptions): Promise<this>;
      authenticated(): boolean;
      isCurrent(): boolean;
      isCurrentAsync(): Promise<boolean>;
      getEmail(): string | undefined;
      setEmail(email: string, options?: SuccessFailureOptions): boolean;
      getUsername(): string | undefined;
      setUsername(username: string, options?: SuccessFailureOptions): boolean;
      setPassword(password: string, options?: SuccessFailureOptions): boolean;
      getSessionToken(): string;
      linkWith: (
        provider: string | AuthProvider,
        options: { authData?: AuthData | undefined },
        saveOpts?: FullOptions
      ) => Promise<this>;
      _isLinked: (provider: string | AuthProvider) => boolean;
      _unlinkFrom: (provider: string | AuthProvider, options?: FullOptions) => Promise<this>;
    }
    interface UserConstructor extends ObjectStatic<User> {
      new <T extends Attributes>(attributes: T): User<T>;
      new (attributes?: Attributes): User;

      allowCustomUserClass(isAllowed: boolean): void;
      become<T extends User>(sessionToken: string, options?: UseMasterKeyOption): Promise<T>;
      current<T extends User>(): T | undefined;
      currentAsync<T extends User>(): Promise<T | null>;
      signUp<T extends User>(
        username: string,
        password: string,
        attrs: any,
        options?: SignUpOptions
      ): Promise<T>;
      logIn<T extends User>(username: string, password: string, options?: FullOptions): Promise<T>;
      logOut<T extends User>(): Promise<T>;
      requestPasswordReset<T extends User>(
        email: string,
        options?: SuccessFailureOptions
      ): Promise<T>;
      requestEmailVerification<T extends User>(
        email: string,
        options?: UseMasterKeyOption
      ): Promise<T>;
      extend(protoProps?: any, classProps?: any): any;
      hydrate<T extends User>(userJSON: any): Promise<T>;
      enableUnsafeCurrentUser(): void;
      disableUnsafeCurrentUser(): void;
      logInWith<T extends User>(
        provider: string | AuthProvider,
        options: { authData?: AuthData | undefined },
        saveOpts?: FullOptions
      ): Promise<T>;
      _registerAuthenticationProvider: (provider: AuthProvider) => void;
    }
    const User: UserConstructor;

    interface RestSchema {
      className: string;
      fields: {
        [key: string]: {
          type: string;
          targetClass?: string;
          required?: boolean;
          defaultValue?: string;
        };
      };
      classLevelPermissions: Schema.CLP;
      indexes?: {
        [key: string]: {
          [key: string]: any;
        };
      };
    }

    class Schema<T extends Object = any> {
      constructor(className: string);

      static all(): Promise<RestSchema[]>;

      addArray(key: Schema.AttrType<T, any[]>, options?: Schema.FieldOptions<any[]>): this;
      addBoolean(key: Schema.AttrType<T, boolean>, options?: Schema.FieldOptions<boolean>): this;
      addDate(key: Schema.AttrType<T, Date>, options?: Schema.FieldOptions<Date>): this;
      addField<T extends Schema.TYPE = any>(
        name: string,
        type?: T,
        options?: Schema.FieldOptions
      ): this;
      addFile(key: Schema.AttrType<T, File>, options?: Schema.FieldOptions<File>): this;
      addGeoPoint(key: Schema.AttrType<T, GeoPoint>, options?: Schema.FieldOptions<GeoPoint>): this;
      addIndex(name: string, index: Schema.Index): this;
      addNumber(key: Schema.AttrType<T, number>, options?: Schema.FieldOptions<number>): this;
      addObject(key: Schema.AttrType<T, object>, options?: Schema.FieldOptions<object>): this;
      addPointer(
        key: Schema.AttrType<T, Object | Pointer>,
        targetClass: string,
        options?: Schema.FieldOptions<Pointer>
      ): this;

      addPolygon(key: Schema.AttrType<T, Polygon>, options?: Schema.FieldOptions<Polygon>): this;

      addRelation(
        key: Schema.AttrType<T, Relation>,
        targetClass: string,
        options?: Schema.FieldOptions<Relation>
      ): this;
      addString(key: Schema.AttrType<T, string>, options?: Schema.FieldOptions<string>): this;
      delete(): Promise<any>;
      deleteField(name: string): this;
      deleteIndex(name: string): this;
      get(): Promise<RestSchema>;
      purge(): Promise<any>;
      save(): Promise<Schema>;
      setCLP(clp: Schema.CLP): this;
      update(): Promise<Schema>;
    }

    namespace Schema {
      type TYPE =
        | 'String'
        | 'Number'
        | 'Boolean'
        | 'Date'
        | 'File'
        | 'GeoPoint'
        | 'Polygon'
        | 'Array'
        | 'Object'
        | 'Pointer'
        | 'Relation';
      type FieldType =
        | string
        | number
        | boolean
        | Date
        | File
        | GeoPoint
        | Polygon
        | any[]
        | object
        | Pointer
        | Relation;
      type AttrType<T extends Object, V> = Extract<
        {
          [K in keyof T['attributes']]: T['attributes'][K] extends V ? K : never;
        }[keyof T['attributes']],
        string
      >;

      interface FieldOptions<
        T extends
          | string
          | number
          | boolean
          | Date
          | File
          | GeoPoint
          | Polygon
          | any[]
          | object
          | Pointer
          | Relation = any,
      > {
        required?: boolean | undefined;
        defaultValue?: T | undefined;
      }

      interface Index {
        [fieldName: string]: number | string;
      }

      interface CLPField {
        '*'?: boolean | undefined;
        requiresAuthentication?: boolean | undefined;

        [userIdOrRoleName: string]: boolean | undefined;
      }

      interface CLP {
        find?: CLPField | undefined;
        get?: CLPField | undefined;
        count?: CLPField | undefined;
        create?: CLPField | undefined;
        update?: CLPField | undefined;
        delete?: CLPField | undefined;
        addField?: CLPField | undefined;

        readUserFields?: string[] | undefined;

        writeUserFields?: string[] | undefined;
        protectedFields?: {
          [userIdOrRoleName: string]: string[];
        };
      }
    }

    namespace Analytics {
      function track(name: string, dimensions: any): Promise<any>;
    }

    namespace AnonymousUtils {
      function isLinked(user: User): boolean;
      function link(user: User, options?: ScopeOptions): Promise<User>;
      function logIn(options?: ScopeOptions): Promise<User>;
    }

    namespace FacebookUtils {
      function init(options?: any): void;
      function isLinked(user: User): boolean;
      function link(user: User, permissions: any, options?: SuccessFailureOptions): void;
      function logIn(permissions: any, options?: FullOptions): void;
      function unlink(user: User, options?: SuccessFailureOptions): void;
    }

    namespace Cloud {
      interface CookieOptions {
        domain?: string | undefined;
        expires?: Date | undefined;
        httpOnly?: boolean | undefined;
        maxAge?: number | undefined;
        path?: string | undefined;
        secure?: boolean | undefined;
      }

      interface JobRequest<T extends Params = Params> {
        params: T;
        message: (response: any) => void;
      }

      interface Params {
        [key: string]: any;
      }

      interface FunctionRequest<T extends Params = Params> {
        installationId?: string | undefined;
        master?: boolean | undefined;
        params: T;
        user?: User | undefined;
      }

      interface ValidatorField {
        type?: any;
        constant?: boolean | undefined;
        default?: any;
        options?: any[] | Function | undefined;
        error?: string | undefined;
        required?: boolean;
      }
      interface ValidatorFields {
        [field: string]: ValidatorField;
      }
      interface Validator {
        requireUser?: boolean | undefined;
        requireMaster?: boolean | undefined;
        validateMasterKey?: boolean | undefined;
        skipWithMasterKey?: boolean | undefined;
        requireAnyUserRoles?: string[] | Function | undefined;
        requireAllUserRoles?: string[] | Function | undefined;
        fields?: ValidatorFields | string[] | undefined;
        requireUserKeys?: ValidatorFields | string[] | undefined;
      }

      interface Cookie {
        name?: string | undefined;
        options?: CookieOptions | undefined;
        value?: string | undefined;
      }

      interface TriggerRequest<T = Object> {
        installationId?: string | undefined;
        master?: boolean | undefined;
        user?: User | undefined;
        ip: string;
        headers: any;
        triggerName: string;
        log: any;
        object: T;
        original?: T | undefined;
      }

      interface AfterSaveRequest<T = Object> extends TriggerRequest<T> {
        context: Record<string, unknown>;
      }
      interface AfterDeleteRequest<T = Object> extends TriggerRequest<T> {}
      interface BeforeDeleteRequest<T = Object> extends TriggerRequest<T> {}
      interface BeforeSaveRequest<T = Object> extends TriggerRequest<T> {
        context: Record<string, unknown>;
      }

      interface FileTriggerRequest extends TriggerRequest<File> {
        file: File;
        fileSize: number;
        contentLength: number;
      }

      enum ReadPreferenceOption {
        Primary = 'PRIMARY',
        PrimaryPreferred = 'PRIMARY_PREFERRED',
        Secondary = 'SECONDARY',
        SecondaryPreferred = 'SECONDARY_PREFERRED',
        Nearest = 'NEAREST',
      }

      interface BeforeFindRequest<T extends Object = Object> extends TriggerRequest<T> {
        query: Query<T>;
        count: boolean;
        isGet: boolean;
        readPreference?: ReadPreferenceOption | undefined;
      }

      interface AfterFindRequest<T = Object> extends TriggerRequest<T> {
        objects: T[];
      }

      function afterDelete<T extends Object = Object>(
        arg1: { new (): T } | string,
        func?: (request: AfterDeleteRequest<T>) => Promise<void> | void,
        validator?: Validator | ((request: FunctionRequest) => any)
      ): void;
      function afterSave<T extends Object = Object>(
        arg1: { new (): T } | string,
        func?: (request: AfterSaveRequest<T>) => Promise<void> | void,
        validator?: Validator | ((request: FunctionRequest) => any)
      ): void;
      function beforeDelete<T extends Object = Object>(
        arg1: { new (): T } | string,
        func?: (request: BeforeDeleteRequest<T>) => Promise<void> | void,
        validator?: Validator | ((request: FunctionRequest) => any)
      ): void;
      function beforeSave<T extends Object = Object>(
        arg1: { new (): T } | string,
        func?: (request: BeforeSaveRequest<T>) => Promise<void> | void,
        validator?: Validator | ((request: FunctionRequest) => any)
      ): void;
      function beforeFind<T extends Object = Object>(
        arg1: { new (): T } | string,
        func?: (
          request: BeforeFindRequest<T>
        ) => Promise<Query<T>> | Promise<void> | Query<T> | void,
        validator?: Validator | ((request: FunctionRequest) => any)
      ): void;
      function afterFind<T extends Object = Object>(
        arg1: { new (): T } | string,
        func?: (request: AfterFindRequest<T>) => any,
        validator?: Validator | ((request: FunctionRequest) => any)
      ): void;

      function beforeLogin(
        func?: (request: TriggerRequest<User>) => PromiseLike<void> | void
      ): void;
      function afterLogin(
        func?: (request: TriggerRequest<User>) => PromiseLike<void> | void,
        validator?: Validator | ((request: FunctionRequest) => any)
      ): void;
      function afterLogout(
        func?: (request: TriggerRequest<Session>) => PromiseLike<void> | void,
        validator?: Validator | ((request: FunctionRequest) => any)
      ): void;

      function beforeSaveFile(
        func?: (request: FileTriggerRequest) => PromiseLike<File> | void,
        validator?: Validator | ((request: FunctionRequest) => any)
      ): void;
      function afterSaveFile(
        func?: (request: FileTriggerRequest) => PromiseLike<void> | void,
        validator?: Validator | ((request: FunctionRequest) => any)
      ): void;
      function beforeDeleteFile(
        func?: (request: FileTriggerRequest) => PromiseLike<void> | void,
        validator?: Validator | ((request: FunctionRequest) => any)
      ): void;
      function afterDeleteFile(
        func?: (request: FileTriggerRequest) => PromiseLike<void> | void,
        validator?: Validator | ((request: FunctionRequest) => any)
      ): void;

      function define(
        name: string,
        func: (request: FunctionRequest) => any,
        validator?: Validator | ((request: FunctionRequest) => any)
      ): void;
      function define<T extends () => any>(
        name: string,
        func: (request: FunctionRequest<{}>) => Promise<ReturnType<T>> | ReturnType<T>,
        validator?: Validator | ((request: FunctionRequest) => any)
      ): void;
      function define<
        T extends (param: { [P in keyof Parameters<T>[0]]: Parameters<T>[0][P] }) => any,
      >(
        name: string,
        func: (
          request: FunctionRequest<Parameters<T>[0]>
        ) => Promise<ReturnType<T>> | ReturnType<T>,
        validator?: Validator | ((request: FunctionRequest) => any)
      ): void;

      function getJobsData(): Promise<Object>;

      function getJobStatus(jobStatusId: string): Promise<Object>;
      function job(name: string, func?: (request: JobRequest) => Promise<void> | void): void;
      function run(name: string, data?: Params, options?: RunOptions): Promise<any>;
      function run<T extends () => any>(
        name: string,
        data?: null,
        options?: RunOptions
      ): Promise<ReturnType<T>>;
      function run<
        T extends (param: { [P in keyof Parameters<T>[0]]: Parameters<T>[0][P] }) => any,
      >(name: string, data: Parameters<T>[0], options?: RunOptions): Promise<ReturnType<T>>;

      function startJob(jobName: string, data: any): Promise<string>;
      function useMasterKey(): void;

      interface RunOptions extends SuccessFailureOptions, ScopeOptions {}
    }

    namespace EventuallyQueue {
      interface QueueObject {
        queueId: string;
        action: string;
        object: Object;
        serverOptions: Object.SaveOptions | RequestOptions;
        id: string;
        className: string;
        hash: string;
        createdAt: Date;
      }
      type Queue = QueueObject[];

      function save(object: Object, serverOptions?: Object.SaveOptions): Promise<void>;
      function destroy(object: Object, serverOptions?: RequestOptions): Promise<void>;
      function getQueue(): Promise<any[]>;
      function clear(): Promise<void>;
      function length(): Promise<number>;
      function sendQueue(): Promise<boolean>;
      function poll(ms?: number): void;
      function stopPoll(): void;
      function isPolling(): boolean;
    }

    class Error {
      static OTHER_CAUSE: ErrorCode.OTHER_CAUSE;
      static INTERNAL_SERVER_ERROR: ErrorCode.INTERNAL_SERVER_ERROR;
      static CONNECTION_FAILED: ErrorCode.CONNECTION_FAILED;
      static OBJECT_NOT_FOUND: ErrorCode.OBJECT_NOT_FOUND;
      static INVALID_QUERY: ErrorCode.INVALID_QUERY;
      static INVALID_CLASS_NAME: ErrorCode.INVALID_CLASS_NAME;
      static MISSING_OBJECT_ID: ErrorCode.MISSING_OBJECT_ID;
      static INVALID_KEY_NAME: ErrorCode.INVALID_KEY_NAME;
      static INVALID_POINTER: ErrorCode.INVALID_POINTER;
      static INVALID_JSON: ErrorCode.INVALID_JSON;
      static COMMAND_UNAVAILABLE: ErrorCode.COMMAND_UNAVAILABLE;
      static NOT_INITIALIZED: ErrorCode.NOT_INITIALIZED;
      static INCORRECT_TYPE: ErrorCode.INCORRECT_TYPE;
      static INVALID_CHANNEL_NAME: ErrorCode.INVALID_CHANNEL_NAME;
      static PUSH_MISCONFIGURED: ErrorCode.PUSH_MISCONFIGURED;
      static OBJECT_TOO_LARGE: ErrorCode.OBJECT_TOO_LARGE;
      static OPERATION_FORBIDDEN: ErrorCode.OPERATION_FORBIDDEN;
      static CACHE_MISS: ErrorCode.CACHE_MISS;
      static INVALID_NESTED_KEY: ErrorCode.INVALID_NESTED_KEY;
      static INVALID_FILE_NAME: ErrorCode.INVALID_FILE_NAME;
      static INVALID_ACL: ErrorCode.INVALID_ACL;
      static TIMEOUT: ErrorCode.TIMEOUT;
      static INVALID_EMAIL_ADDRESS: ErrorCode.INVALID_EMAIL_ADDRESS;
      static MISSING_CONTENT_TYPE: ErrorCode.MISSING_CONTENT_TYPE;
      static MISSING_CONTENT_LENGTH: ErrorCode.MISSING_CONTENT_LENGTH;
      static INVALID_CONTENT_LENGTH: ErrorCode.INVALID_CONTENT_LENGTH;
      static FILE_TOO_LARGE: ErrorCode.FILE_TOO_LARGE;
      static FILE_SAVE_ERROR: ErrorCode.FILE_SAVE_ERROR;
      static DUPLICATE_VALUE: ErrorCode.DUPLICATE_VALUE;
      static INVALID_ROLE_NAME: ErrorCode.INVALID_ROLE_NAME;
      static EXCEEDED_QUOTA: ErrorCode.EXCEEDED_QUOTA;
      static SCRIPT_FAILED: ErrorCode.SCRIPT_FAILED;
      static VALIDATION_ERROR: ErrorCode.VALIDATION_ERROR;
      static INVALID_IMAGE_DATA: ErrorCode.INVALID_IMAGE_DATA;
      static UNSAVED_FILE_ERROR: ErrorCode.UNSAVED_FILE_ERROR;
      static INVALID_PUSH_TIME_ERROR: ErrorCode.INVALID_PUSH_TIME_ERROR;
      static FILE_DELETE_ERROR: ErrorCode.FILE_DELETE_ERROR;
      static REQUEST_LIMIT_EXCEEDED: ErrorCode.REQUEST_LIMIT_EXCEEDED;
      static INVALID_EVENT_NAME: ErrorCode.INVALID_EVENT_NAME;
      static USERNAME_MISSING: ErrorCode.USERNAME_MISSING;
      static PASSWORD_MISSING: ErrorCode.PASSWORD_MISSING;
      static USERNAME_TAKEN: ErrorCode.USERNAME_TAKEN;
      static EMAIL_TAKEN: ErrorCode.EMAIL_TAKEN;
      static EMAIL_MISSING: ErrorCode.EMAIL_MISSING;
      static EMAIL_NOT_FOUND: ErrorCode.EMAIL_NOT_FOUND;
      static SESSION_MISSING: ErrorCode.SESSION_MISSING;
      static MUST_CREATE_USER_THROUGH_SIGNUP: ErrorCode.MUST_CREATE_USER_THROUGH_SIGNUP;
      static ACCOUNT_ALREADY_LINKED: ErrorCode.ACCOUNT_ALREADY_LINKED;
      static INVALID_SESSION_TOKEN: ErrorCode.INVALID_SESSION_TOKEN;
      static LINKED_ID_MISSING: ErrorCode.LINKED_ID_MISSING;
      static INVALID_LINKED_SESSION: ErrorCode.INVALID_LINKED_SESSION;
      static UNSUPPORTED_SERVICE: ErrorCode.UNSUPPORTED_SERVICE;
      static AGGREGATE_ERROR: ErrorCode.AGGREGATE_ERROR;
      static FILE_READ_ERROR: ErrorCode.FILE_READ_ERROR;
      static X_DOMAIN_REQUEST: ErrorCode.X_DOMAIN_REQUEST;

      code: ErrorCode;
      message: string;

      constructor(code: ErrorCode, message: string);
    }

    namespace Op {
      interface BaseOperation {
        objects(): any[];
      }

      interface Add extends BaseOperation {
        toJSON(): any;
      }

      interface AddUnique extends BaseOperation {
        toJSON(): any;
      }

      interface Increment {
        amount: number;
        toJSON(): any;
      }

      interface Relation {
        added(): Object[];
        removed: Object[];
        toJSON(): any;
      }

      interface Set {
        value(): any;
        toJSON(): any;
      }

      interface Unset {
        toJSON(): any;
      }
    }

    namespace Push {
      function send<T>(data: PushData, options?: SendOptions): Promise<T>;

      interface PushData {
        channels?: string[] | undefined;
        push_time?: Date | undefined;
        expiration_time?: Date | undefined;
        expiration_interval?: number | undefined;
        where?: Query<Installation> | undefined;
        data?: any;
        alert?: string | undefined;
        badge?: string | undefined;
        sound?: string | undefined;
        title?: string | undefined;
        notification?: any;
        content_available?: any;
      }

      interface SendOptions extends UseMasterKeyOption {
        success?: (() => void) | undefined;
        error?: ((error: Error) => void) | undefined;
      }
    }

    namespace CoreManager {
      function set(key: string, value: any): void;
      function get(key: string): void;
    }

    function initialize(applicationId: string, javaScriptKey?: string, masterKey?: string): void;
    function setAsyncStorage(AsyncStorage: any): void;
    function dumpLocalDatastore(): Promise<{ [key: string]: any }>;
    function enableLocalDatastore(): void;
    function isLocalDatastoreEnabled(): boolean;
    function setLocalDatastoreController(controller: any): void;
    function setLocalDatastoreController(controller: any): void;
    function enableEncryptedUser(): void;
    function isEncryptedUserEnabled(): boolean;
  }
}

export default Parse;
