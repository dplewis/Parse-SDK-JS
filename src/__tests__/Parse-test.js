jest.dontMock('../CoreManager');
jest.dontMock('../CryptoController');
jest.dontMock('../decode');
jest.dontMock('../encode');
jest.dontMock('../Parse');
jest.dontMock('../ParseObject');
jest.dontMock('../ParseOp');
jest.dontMock('../ParseLiveQuery');
jest.dontMock('../LocalDatastore');
jest.dontMock('crypto-js/aes');
jest.setMock('../EventuallyQueue', { poll: jest.fn() });

global.indexedDB = require('./test_helpers/mockIndexedDB');
const CoreManager = require('../CoreManager').default;
const ParseLiveQuery = require('../ParseLiveQuery').default;
const EventuallyQueue = require('../EventuallyQueue');
const Parse = require('../Parse');

CoreManager.setEventEmitter(require('events').EventEmitter);

describe('Parse module', () => {
  it('can be initialized with keys', () => {
    Parse.initialize('A', 'B');
    expect(CoreManager.get('APPLICATION_ID')).toBe('A');
    expect(CoreManager.get('JAVASCRIPT_KEY')).toBe('B');

    Parse._initialize('A', 'B', 'C', 'D');
    expect(CoreManager.get('APPLICATION_ID')).toBe('A');
    expect(CoreManager.get('JAVASCRIPT_KEY')).toBe('B');
    expect(CoreManager.get('MASTER_KEY')).toBe('C');
    expect(CoreManager.get('MAINTENANCE_KEY')).toBe('D');
  });

  it('enables master key use in the node build', () => {
    expect(typeof Parse.Cloud.useMasterKey).toBe('function');
    Parse.Cloud.useMasterKey();
    expect(CoreManager.get('USE_MASTER_KEY')).toBe(true);
  });

  it('should not start eventually queue poll in node build', () => {
    jest.spyOn(EventuallyQueue, 'poll').mockImplementationOnce(() => {});
    Parse.initialize('A', 'B');
    expect(EventuallyQueue.poll).toHaveBeenCalledTimes(0);
  });

  it('exposes certain keys as properties', () => {
    Parse.applicationId = '123';
    expect(CoreManager.get('APPLICATION_ID')).toBe('123');
    expect(Parse.applicationId).toBe('123');

    Parse.javaScriptKey = '456';
    expect(CoreManager.get('JAVASCRIPT_KEY')).toBe('456');
    expect(Parse.javaScriptKey).toBe('456');

    Parse.masterKey = '789';
    expect(CoreManager.get('MASTER_KEY')).toBe('789');
    expect(Parse.masterKey).toBe('789');

    Parse.maintenanceKey = '000';
    expect(CoreManager.get('MAINTENANCE_KEY')).toBe('000');
    expect(Parse.maintenanceKey).toBe('000');

    Parse.serverURL = 'http://example.com';
    expect(CoreManager.get('SERVER_URL')).toBe('http://example.com');
    expect(Parse.serverURL).toBe('http://example.com');

    Parse.liveQueryServerURL = 'https://example.com';
    expect(CoreManager.get('LIVEQUERY_SERVER_URL')).toBe('https://example.com');
    expect(Parse.liveQueryServerURL).toBe('https://example.com');
  });

  it('can set auth type and token', () => {
    Parse.serverAuthType = 'bearer';
    expect(CoreManager.get('SERVER_AUTH_TYPE')).toBe('bearer');
    expect(Parse.serverAuthType).toBe('bearer');

    Parse.serverAuthToken = 'some_token';
    expect(CoreManager.get('SERVER_AUTH_TOKEN')).toBe('some_token');
    expect(Parse.serverAuthToken).toBe('some_token');
  });

  it('can set idempotency', () => {
    expect(Parse.idempotency).toBe(false);
    Parse.idempotency = true;
    expect(CoreManager.get('IDEMPOTENCY')).toBe(true);
    expect(Parse.idempotency).toBe(true);
    Parse.idempotency = false;
    expect(Parse.idempotency).toBe(false);
  });

  it('can set LocalDatastoreController', () => {
    const controller = {
      fromPinWithName: function () {},
      pinWithName: function () {},
      unPinWithName: function () {},
      getAllContents: function () {},
      clear: function () {},
    };
    Parse.setLocalDatastoreController(controller);
    expect(CoreManager.getLocalDatastoreController()).toBe(controller);
  });

  it('cannot set EventuallyQueue controller with missing functions', () => {
    const controller = {};
    expect(() => (Parse.EventuallyQueue = controller)).toThrow(
      'EventuallyQueue must implement poll()'
    );
  });

  it('can set AsyncStorage', () => {
    const controller = {
      getItem: function () {},
      setItem: function () {},
      removeItem: function () {},
      getItemAsync: function () {},
      setItemAsync: function () {},
      removeItemAsync: function () {},
      clear: function () {},
    };

    Parse.setAsyncStorage(controller);
    expect(CoreManager.getAsyncStorage()).toBe(controller);
  });

  it('can enable LocalDatastore', () => {
    jest.spyOn(console, 'log').mockImplementationOnce(() => {});
    jest.spyOn(EventuallyQueue, 'poll').mockImplementationOnce(() => {});

    Parse.initialize(null, null);
    Parse.enableLocalDatastore();
    expect(console.log).toHaveBeenCalledWith(
      "'enableLocalDataStore' must be called after 'initialize'"
    );

    Parse.initialize('A', 'B');
    Parse.LocalDatastore.isEnabled = false;
    Parse.enableLocalDatastore();

    expect(Parse.LocalDatastore.isEnabled).toBe(true);
    expect(Parse.isLocalDatastoreEnabled()).toBe(true);
    expect(EventuallyQueue.poll).toHaveBeenCalledTimes(1);
    expect(EventuallyQueue.poll).toHaveBeenCalledWith(2000);

    EventuallyQueue.poll.mockClear();
    const polling = false;
    Parse.enableLocalDatastore(polling);
    expect(EventuallyQueue.poll).toHaveBeenCalledTimes(0);
  });

  it('can dump LocalDatastore', async () => {
    jest.spyOn(console, 'log').mockImplementationOnce(() => {});
    Parse.LocalDatastore.isEnabled = false;
    let LDS = await Parse.dumpLocalDatastore();
    expect(console.log).toHaveBeenCalledWith('Parse.enableLocalDatastore() must be called first');
    expect(LDS).toEqual({});
    Parse.LocalDatastore.isEnabled = true;
    const controller = {
      fromPinWithName: function () {},
      pinWithName: function () {},
      unPinWithName: function () {},
      getAllContents: function () {
        return Promise.resolve({ key: 'value' });
      },
      clear: function () {},
    };
    Parse.setLocalDatastoreController(controller);
    LDS = await Parse.dumpLocalDatastore();
    expect(LDS).toEqual({ key: 'value' });
  });

  it('can enable encrypter CurrentUser', () => {
    jest.spyOn(console, 'log').mockImplementationOnce(() => {});
    process.env.PARSE_BUILD = 'browser';
    Parse.encryptedUser = false;
    Parse.enableEncryptedUser();
    expect(Parse.encryptedUser).toBe(true);
    expect(Parse.isEncryptedUserEnabled()).toBe(true);
    process.env.PARSE_BUILD = 'node';
  });

  it('can set an encrypt token as String', () => {
    Parse.secret = 'My Super secret key';
    expect(CoreManager.get('ENCRYPTED_KEY')).toBe('My Super secret key');
    expect(Parse.secret).toBe('My Super secret key');
  });

  it('can set and get request batch size', () => {
    expect(CoreManager.get('REQUEST_BATCH_SIZE')).toBe(20);
    CoreManager.set('REQUEST_BATCH_SIZE', 4);
    expect(CoreManager.get('REQUEST_BATCH_SIZE')).toBe(4);
    CoreManager.set('REQUEST_BATCH_SIZE', 20);
  });

  it('can set and get live query', () => {
    const temp = Parse.LiveQuery;
    const LiveQuery = new ParseLiveQuery();
    Parse.LiveQuery = LiveQuery;
    expect(Parse.LiveQuery).toEqual(LiveQuery);
    Parse.LiveQuery = temp;
  });

  it('can set allowCustomObjectId', () => {
    expect(Parse.allowCustomObjectId).toBe(false);
    Parse.allowCustomObjectId = true;
    expect(CoreManager.get('ALLOW_CUSTOM_OBJECT_ID')).toBe(true);
    Parse.allowCustomObjectId = false;
  });

  it('getServerHealth', () => {
    const controller = {
      request: jest.fn(),
      ajax: jest.fn(),
    };
    CoreManager.setRESTController(controller);
    Parse.getServerHealth();
    const [method, path] = controller.request.mock.calls[0];
    expect(method).toBe('GET');
    expect(path).toBe('health');
  });

  it('_request', () => {
    const controller = {
      request: jest.fn(),
      ajax: jest.fn(),
    };
    CoreManager.setRESTController(controller);
    Parse._request('POST', 'classes/TestObject');
    const [method, path] = controller.request.mock.calls[0];
    expect(method).toBe('POST');
    expect(path).toBe('classes/TestObject');
  });

  it('_ajax', () => {
    const controller = {
      request: jest.fn(),
      ajax: jest.fn(),
    };
    CoreManager.setRESTController(controller);
    Parse._ajax('POST', 'classes/TestObject');
    const [method, path] = controller.ajax.mock.calls[0];
    expect(method).toBe('POST');
    expect(path).toBe('classes/TestObject');
  });

  it('_getInstallationId', () => {
    const controller = {
      currentInstallationId: () => '1234',
      currentInstallation: () => {},
      updateInstallationOnDisk: () => {},
    };
    CoreManager.setInstallationController(controller);
    expect(Parse._getInstallationId()).toBe('1234');
  });

  it('_decode', () => {
    expect(Parse._decode(null, 12)).toBe(12);
  });

  it('_encode', () => {
    expect(Parse._encode(12)).toBe(12);
  });

  it('can get IndexedDB storage', () => {
    jest.isolateModules(() => {
      expect(Parse.IndexedDB).toBeUndefined();
      process.env.PARSE_BUILD = 'browser';
      const ParseInstance = require('../Parse');
      ParseInstance.initialize('test', 'test');
      expect(ParseInstance.IndexedDB).toBeDefined();
      CoreManager.setStorageController(ParseInstance.IndexedDB);
      const currentStorage = CoreManager.getStorageController();
      expect(currentStorage).toEqual(ParseInstance.IndexedDB);
      process.env.PARSE_BUILD = 'node';
    });
  });

  it('can set EventuallyQueue', () => {
    const controller = {
      poll: function () {},
      save: function () {},
      destroy: function () {},
    };

    Parse.EventuallyQueue = controller;
    expect(CoreManager.getEventuallyQueue()).toBe(controller);
    expect(Parse.EventuallyQueue).toBe(controller);
  });
});
