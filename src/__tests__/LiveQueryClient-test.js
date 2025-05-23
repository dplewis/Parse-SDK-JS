jest.dontMock('../LiveQueryClient');
jest.dontMock('../arrayContainsObject');
jest.dontMock('../canBeSerialized');
jest.dontMock('../CoreManager');
jest.dontMock('../decode');
jest.dontMock('../encode');
jest.dontMock('../equals');
jest.dontMock('../escape');
jest.dontMock('../promiseUtils');
jest.dontMock('../EventEmitter');
jest.dontMock('../ObjectStateMutations');
jest.dontMock('../parseDate');
jest.dontMock('../ParseError');
jest.dontMock('../ParseFile');
jest.dontMock('../ParseGeoPoint');
jest.dontMock('../ParseObject');
jest.dontMock('../ParseOp');
jest.dontMock('../RESTController');
jest.dontMock('../SingleInstanceStateController');
jest.dontMock('../TaskQueue');
jest.dontMock('../unique');
jest.dontMock('../UniqueInstanceStateController');
jest.dontMock('../unsavedChildren');
jest.dontMock('../ParseACL');
jest.dontMock('../ParseQuery');
jest.dontMock('../LiveQuerySubscription');
jest.dontMock('../LocalDatastore');
jest.dontMock('../WebSocketController');

jest.useFakeTimers();

const mockLocalDatastore = {
  isEnabled: false,
  _updateObjectIfPinned: jest.fn(),
};
jest.setMock('../LocalDatastore', mockLocalDatastore);

const CoreManager = require('../CoreManager').default;
const EventEmitter = require('../EventEmitter').default;
const LiveQueryClient = require('../LiveQueryClient').default;
const ParseObject = require('../ParseObject').default;
const ParseQuery = require('../ParseQuery').default;
const WebSocketController = require('../WebSocketController').default;
const { resolvingPromise } = require('../promiseUtils');
const events = require('events');

CoreManager.setLocalDatastore(mockLocalDatastore);
CoreManager.setWebSocketController(WebSocketController);

describe('LiveQueryClient', () => {
  beforeEach(() => {
    mockLocalDatastore.isEnabled = false;
    CoreManager.setEventEmitter(EventEmitter);
  });

  it('serverURL required', () => {
    expect(() => {
      new LiveQueryClient({});
    }).toThrow('You need to set a proper Parse LiveQuery server url before using LiveQueryClient');
  });

  it('WebSocketController required', done => {
    const WebSocketImplementation = CoreManager.getWebSocketController();
    CoreManager.setWebSocketController();
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    liveQueryClient.on('error', error => {
      expect(error).toBe('Can not find WebSocket implementation');
      CoreManager.setWebSocketController(WebSocketImplementation);
      done();
    });
    liveQueryClient.open();
  });

  it('can handle open / close states', () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    expect(liveQueryClient.shouldOpen()).toBe(true);
    liveQueryClient.close();
    expect(liveQueryClient.shouldOpen()).toBe(true);
    liveQueryClient.open();
    expect(liveQueryClient.shouldOpen()).toBe(false);
  });

  it('set undefined sessionToken default', () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
    });
    expect(liveQueryClient.sessionToken).toBe(undefined);
  });

  it('can connect to server', () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    // Mock _getWebSocketImplementation
    liveQueryClient._getWebSocketImplementation = function () {
      return jest.fn();
    };
    // Mock handlers
    liveQueryClient._handleWebSocketOpen = jest.fn();
    liveQueryClient._handleWebSocketMessage = jest.fn();
    liveQueryClient._handleWebSocketClose = jest.fn();
    liveQueryClient._handleWebSocketError = jest.fn();

    liveQueryClient.open();

    // Verify inner state
    expect(liveQueryClient.state).toEqual('connecting');
    // Verify handlers
    liveQueryClient.socket.onopen({});
    expect(liveQueryClient._handleWebSocketOpen).toBeCalled();
    liveQueryClient.socket.onmessage({});
    expect(liveQueryClient._handleWebSocketMessage).toBeCalled();
    liveQueryClient.socket.onclose();
    expect(liveQueryClient._handleWebSocketClose).toBeCalled();
    liveQueryClient.socket.onerror();
    expect(liveQueryClient._handleWebSocketError).toBeCalled();
  });

  it('can handle WebSocket open message', () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    liveQueryClient.socket = {
      send: jest.fn(),
    };

    liveQueryClient._handleWebSocketOpen();

    expect(liveQueryClient.socket.send).toBeCalled();
    const messageStr = liveQueryClient.socket.send.mock.calls[0][0];
    const message = JSON.parse(messageStr);
    expect(message.op).toEqual('connect');
    expect(message.applicationId).toEqual('applicationId');
    expect(message.javascriptKey).toEqual('javascriptKey');
    expect(message.masterKey).toEqual('masterKey');
    expect(message.sessionToken).toEqual('sessionToken');
  });

  it('can handle WebSocket connected response message', async () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    const data = {
      op: 'connected',
      clientId: 1,
    };
    const event = {
      data: JSON.stringify(data),
    };
    // Register checked in advance
    let isChecked = false;
    liveQueryClient.on('open', function () {
      isChecked = true;
    });

    liveQueryClient._handleWebSocketMessage(event);

    expect(isChecked).toBe(true);
    expect(liveQueryClient.id).toBe(1);
    await liveQueryClient.connectPromise;
    expect(liveQueryClient.state).toEqual('connected');
  });

  it('can handle WebSocket reconnect on connected response message', async () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    const data = {
      op: 'connected',
      clientId: 1,
    };
    const event = {
      data: JSON.stringify(data),
    };
    // Register checked in advance
    let isChecked = false;
    liveQueryClient.on('open', function () {
      isChecked = true;
    });
    jest.spyOn(liveQueryClient, 'resubscribe');
    liveQueryClient._handleReconnect();
    liveQueryClient._handleWebSocketMessage(event);

    expect(isChecked).toBe(true);
    expect(liveQueryClient.id).toBe(1);
    await liveQueryClient.connectPromise;
    expect(liveQueryClient.state).toEqual('connected');
    expect(liveQueryClient.resubscribe).toHaveBeenCalledTimes(1);
  });

  it('can handle WebSocket subscribed response message', () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    // Add mock subscription
    const subscription = new events.EventEmitter();
    subscription.subscribePromise = resolvingPromise();

    liveQueryClient.subscriptions.set(1, subscription);
    const data = {
      op: 'subscribed',
      clientId: 1,
      requestId: 1,
    };
    const event = {
      data: JSON.stringify(data),
    };
    // Register checked in advance
    let isChecked = false;
    subscription.on('open', function () {
      isChecked = true;
    });

    liveQueryClient._handleWebSocketMessage(event);
    jest.runOnlyPendingTimers();
    expect(isChecked).toBe(true);
  });

  it('can handle WebSocket unsubscribed response message', () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    const subscription = new events.EventEmitter();
    subscription.subscribePromise = resolvingPromise();
    subscription.unsubscribePromise = resolvingPromise();

    liveQueryClient.subscriptions.set(1, subscription);
    const data = {
      op: 'unsubscribed',
      clientId: 1,
      requestId: 1,
    };
    const event = {
      data: JSON.stringify(data),
    };
    liveQueryClient._handleWebSocketMessage(event);
    expect(liveQueryClient.subscriptions.size).toBe(0);
  });

  it('can handle WebSocket error response message', async () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    const data = {
      op: 'error',
      clientId: 1,
      error: 'error',
    };
    const event = {
      data: JSON.stringify(data),
    };
    // Register checked in advance
    let isChecked = false;
    liveQueryClient.on('error', function (error) {
      isChecked = true;
      expect(error).toEqual('error');
    });
    try {
      liveQueryClient._handleWebSocketMessage(event);
      await liveQueryClient.connectPromise;
    } catch (error) {
      expect(error.message).toEqual('error');
    }

    expect(isChecked).toBe(true);
  });

  it('can handle WebSocket error while subscribing', async () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    const subscription = new events.EventEmitter();
    subscription.subscribePromise = resolvingPromise();
    liveQueryClient.subscriptions.set(1, subscription);

    const data = {
      op: 'error',
      clientId: 1,
      requestId: 1,
      error: 'error thrown',
    };
    const event = {
      data: JSON.stringify(data),
    };
    // Register checked in advance
    let isChecked = false;
    subscription.on('error', function (error) {
      isChecked = true;
      expect(error).toEqual('error thrown');
    });

    try {
      liveQueryClient._handleWebSocketMessage(event);
      await Promise.all([
        subscription.connectPromise,
        subscription.subscribePromise,
        liveQueryClient.connectPromise,
        liveQueryClient.subscribePromise,
      ]);
    } catch (e) {
      expect(e.message).toEqual('error thrown');
    }

    jest.runOnlyPendingTimers();
    expect(isChecked).toBe(true);
  });

  it('can handle WebSocket event response message', () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    // Add mock subscription
    const subscription = new events.EventEmitter();
    liveQueryClient.subscriptions.set(1, subscription);
    const object = new ParseObject('Test');
    object.set('key', 'value');
    const data = {
      op: 'create',
      clientId: 1,
      requestId: 1,
      object: object._toFullJSON(),
    };
    const event = {
      data: JSON.stringify(data),
    };
    // Register checked in advance
    let isChecked = false;
    subscription.on('create', function (parseObject) {
      isChecked = true;
      expect(parseObject.get('key')).toEqual('value');
      expect(parseObject.get('className')).toBeUndefined();
      expect(parseObject.get('__type')).toBeUndefined();
    });

    liveQueryClient._handleWebSocketMessage(event);

    expect(isChecked).toBe(true);
  });

  it('can handle WebSocket event response message without subscription', () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    const object = new ParseObject('Test');
    object.set('key', 'value');
    const data = {
      op: 'create',
      clientId: 1,
      requestId: 1,
      object: object._toFullJSON(),
    };
    const event = {
      data: JSON.stringify(data),
    };
    liveQueryClient._handleWebSocketMessage(event);
  });

  it('can handle WebSocket response with original', () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    // Add mock subscription
    const subscription = new events.EventEmitter();
    liveQueryClient.subscriptions.set(1, subscription);
    const object = new ParseObject('Test');
    const original = new ParseObject('Test');
    object.set('key', 'value');
    original.set('key', 'old');
    const data = {
      op: 'update',
      clientId: 1,
      requestId: 1,
      object: object._toFullJSON(),
      original: original._toFullJSON(),
    };
    const event = {
      data: JSON.stringify(data),
    };
    // Register checked in advance
    let isChecked = false;
    subscription.on('update', (parseObject, parseOriginalObject) => {
      isChecked = true;
      expect(parseObject.get('key')).toEqual('value');
      expect(parseObject.get('className')).toBeUndefined();
      expect(parseObject.get('__type')).toBeUndefined();

      expect(parseOriginalObject.get('key')).toEqual('old');
      expect(parseOriginalObject.get('className')).toBeUndefined();
      expect(parseOriginalObject.get('__type')).toBeUndefined();
    });

    liveQueryClient._handleWebSocketMessage(event);

    expect(isChecked).toBe(true);
  });

  it('can handle WebSocket response override data on update', () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    // Add mock subscription
    const subscription = new events.EventEmitter();
    liveQueryClient.subscriptions.set(1, subscription);
    const object = new ParseObject('Test');
    const original = new ParseObject('Test');
    object.set('key', 'value');
    original.set('key', 'old');
    const data = {
      op: 'update',
      clientId: 1,
      requestId: 1,
      object: object._toFullJSON(),
      original: original._toFullJSON(),
    };
    const event = {
      data: JSON.stringify(data),
    };

    jest
      .spyOn(mockLocalDatastore, '_updateObjectIfPinned')
      .mockImplementationOnce(() => Promise.resolve());

    const spy = jest
      .spyOn(ParseObject, 'fromJSON')
      .mockImplementationOnce(() => original)
      .mockImplementationOnce(() => object);

    mockLocalDatastore.isEnabled = true;

    let isChecked = false;
    subscription.on('update', () => {
      isChecked = true;
    });

    liveQueryClient._handleWebSocketMessage(event);
    const override = true;

    expect(ParseObject.fromJSON.mock.calls[1][1]).toEqual(override);
    expect(mockLocalDatastore._updateObjectIfPinned).toHaveBeenCalledTimes(1);

    expect(isChecked).toBe(true);
    spy.mockRestore();
  });

  it('can handle select in websocket payload', () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    // Add mock subscription
    const subscription = new events.EventEmitter();
    subscription.query = new ParseQuery('Test').select('foo');
    liveQueryClient.subscriptions.set(1, subscription);
    const object = new ParseObject('Test');
    const original = new ParseObject('Test');
    object.set('key', 'value');
    original.set('key', 'old');
    const data = {
      op: 'update',
      clientId: 1,
      requestId: 1,
      object: object._toFullJSON(),
      original: original._toFullJSON(),
    };
    const event = {
      data: JSON.stringify(data),
    };

    const spy = jest
      .spyOn(ParseObject, 'fromJSON')
      .mockImplementationOnce(() => original)
      .mockImplementationOnce(() => object);

    liveQueryClient._handleWebSocketMessage(event);
    expect(ParseObject.fromJSON.mock.calls[1][1]).toEqual(false);
    spy.mockRestore();
  });

  it('can handle WebSocket response unset field', async () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    // Add mock subscription
    const subscription = new events.EventEmitter();
    liveQueryClient.subscriptions.set(1, subscription);

    const object = new ParseObject('Test');
    const original = new ParseObject('Test');
    const pointer = new ParseObject('PointerTest');
    pointer.id = '1234';
    original.set('pointer', pointer);
    const data = {
      op: 'update',
      clientId: 1,
      requestId: 1,
      object: object._toFullJSON(),
      original: original._toFullJSON(),
    };
    const event = {
      data: JSON.stringify(data),
    };
    let isChecked = false;
    subscription.on('update', (parseObject, parseOriginalObject) => {
      isChecked = true;
      expect(parseObject.toJSON().pointer).toBeUndefined();
      expect(parseOriginalObject.toJSON().pointer.objectId).toEqual(pointer.id);
    });

    liveQueryClient._handleWebSocketMessage(event);

    expect(isChecked).toBe(true);
  });

  it('can handle WebSocket close message', () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    // Add mock subscription
    const subscription = new events.EventEmitter();
    liveQueryClient.subscriptions.set(1, subscription);
    // Register checked in advance
    let isChecked = false;
    subscription.on('close', function () {
      isChecked = true;
    });
    let isCheckedAgain = false;
    liveQueryClient.on('close', function () {
      isCheckedAgain = true;
    });

    liveQueryClient._handleWebSocketClose();

    expect(isChecked).toBe(true);
    expect(isCheckedAgain).toBe(true);
  });

  it('can handle WebSocket close message while disconnected', () => {
    CoreManager.setWebSocketController();
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    // Add mock subscription
    const subscription = new events.EventEmitter();
    liveQueryClient.subscriptions.set(1, subscription);
    // Register checked in advance
    let isChecked = false;
    subscription.on('close', function () {
      isChecked = true;
    });
    let isCheckedAgain = false;
    liveQueryClient.on('close', function () {
      isCheckedAgain = true;
    });
    liveQueryClient.open();
    liveQueryClient.close();
    liveQueryClient._handleWebSocketClose();

    expect(isChecked).toBe(true);
    expect(isCheckedAgain).toBe(true);
  });

  it('can handle reconnect', () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });

    liveQueryClient.open = jest.fn();

    const attempts = liveQueryClient.attempts;
    liveQueryClient._handleReconnect();
    expect(liveQueryClient.state).toEqual('reconnecting');

    jest.runOnlyPendingTimers();

    expect(liveQueryClient.attempts).toEqual(attempts + 1);
    expect(liveQueryClient.open).toBeCalled();
  });

  it('can handle reconnect and clear handler', () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });

    liveQueryClient.open = jest.fn();

    const attempts = liveQueryClient.attempts;
    liveQueryClient.state = 'disconnected';
    liveQueryClient._handleReconnect();
    expect(liveQueryClient.state).toEqual('disconnected');

    liveQueryClient.state = 'connected';
    liveQueryClient._handleReconnect();
    expect(liveQueryClient.state).toEqual('reconnecting');

    liveQueryClient._handleReconnect();
    jest.runOnlyPendingTimers();

    expect(liveQueryClient.attempts).toEqual(attempts + 1);
    expect(liveQueryClient.open).toBeCalled();
  });

  it('can handle WebSocket error message', () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    const error = {};
    let isChecked = false;
    liveQueryClient.on('error', function (errorAgain) {
      isChecked = true;
      expect(errorAgain).toEqual(error);
    });

    liveQueryClient._handleWebSocketError(error);

    expect(isChecked).toBe(true);
  });

  it('can handle WebSocket error message with subscriptions', done => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    const subscription = new events.EventEmitter();
    liveQueryClient.subscriptions.set(1, subscription);
    const error = {};
    subscription.on('error', errorAgain => {
      expect(errorAgain).toEqual(error);
      done();
    });

    liveQueryClient._handleWebSocketError(error);
  });

  it('can handle WebSocket reconnect on error event', async () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    expect(liveQueryClient.additionalProperties).toBe(true);
    const data = {
      op: 'error',
      code: 1,
      reconnect: true,
      error: 'Additional properties not allowed',
    };
    const event = {
      data: JSON.stringify(data),
    };
    let isChecked = false;
    liveQueryClient.on('error', function (error) {
      isChecked = true;
      expect(error).toEqual(data.error);
    });
    const spy = jest.spyOn(liveQueryClient, '_handleReconnect');
    try {
      liveQueryClient._handleWebSocketMessage(event);
      await liveQueryClient.connectPromise;
    } catch (e) {
      expect(e.message).toBe('Additional properties not allowed');
    }

    expect(isChecked).toBe(true);
    expect(liveQueryClient._handleReconnect).toHaveBeenCalledTimes(1);
    expect(liveQueryClient.additionalProperties).toBe(false);
    spy.mockRestore();
  });

  it('can handle WebSocket disconnect if already disconnected', async () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    const spy = jest.spyOn(liveQueryClient, '_handleReconnect');
    liveQueryClient.state = 'disconnected';
    liveQueryClient._handleWebSocketClose();
    expect(liveQueryClient._handleReconnect).toHaveBeenCalledTimes(0);
    spy.mockRestore();
  });

  it('can subscribe', async () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    liveQueryClient.socket = {
      send: jest.fn(),
    };
    const query = new ParseQuery('Test');
    query.equalTo('key', 'value');

    const subscribePromise = liveQueryClient.subscribe(query);
    const clientSub = liveQueryClient.subscriptions.get(1);
    clientSub.subscribePromise.resolve();

    const subscription = await subscribePromise;
    liveQueryClient.connectPromise.resolve();
    expect(subscription).toBe(clientSub);
    expect(liveQueryClient.requestId).toBe(2);
    await liveQueryClient.connectPromise;
    const messageStr = liveQueryClient.socket.send.mock.calls[0][0];
    const message = JSON.parse(messageStr);
    expect(message).toEqual({
      op: 'subscribe',
      requestId: 1,
      query: {
        className: 'Test',
        where: {
          key: 'value',
        },
      },
    });
  });

  it('can subscribe with sessionToken', async () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    liveQueryClient.socket = {
      send: jest.fn(),
    };
    const query = new ParseQuery('Test');
    query.equalTo('key', 'value');

    const subscribePromise = liveQueryClient.subscribe(query, 'mySessionToken');
    const clientSub = liveQueryClient.subscriptions.get(1);
    clientSub.subscribePromise.resolve();

    const subscription = await subscribePromise;
    liveQueryClient.connectPromise.resolve();
    expect(subscription).toBe(clientSub);
    expect(subscription.sessionToken).toBe('mySessionToken');
    expect(liveQueryClient.requestId).toBe(2);
    await liveQueryClient.connectPromise;
    const messageStr = liveQueryClient.socket.send.mock.calls[0][0];
    const message = JSON.parse(messageStr);
    expect(message).toEqual({
      op: 'subscribe',
      requestId: 1,
      sessionToken: 'mySessionToken',
      query: {
        className: 'Test',
        where: {
          key: 'value',
        },
      },
    });
  });

  it('can unsubscribe', async () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    liveQueryClient.socket = {
      send: jest.fn(),
    };
    const subscription = {
      id: 1,
      unsubscribePromise: resolvingPromise(),
    };
    liveQueryClient.subscriptions.set(1, subscription);

    liveQueryClient.unsubscribe(subscription);
    liveQueryClient.connectPromise.resolve();
    expect(liveQueryClient.subscriptions.size).toBe(1);
    await liveQueryClient.connectPromise;
    const messageStr = liveQueryClient.socket.send.mock.calls[0][0];
    const message = JSON.parse(messageStr);
    expect(message).toEqual({
      op: 'unsubscribe',
      requestId: 1,
    });
    const event = {
      data: JSON.stringify({
        op: 'unsubscribed',
        requestId: 1,
      }),
    };
    liveQueryClient._handleWebSocketMessage(event);
    expect(liveQueryClient.subscriptions.size).toBe(0);
  });

  it('can unsubscribe without subscription', async () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    liveQueryClient.socket = {
      send: jest.fn(),
    };
    liveQueryClient.unsubscribe();
    liveQueryClient.connectPromise.resolve();
    await liveQueryClient.connectPromise;
    expect(liveQueryClient.socket.send).toHaveBeenCalledTimes(0);
  });

  it('cannot subscribe on connection error', async () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    liveQueryClient.socket = {
      send: jest.fn(),
    };
    const query = new ParseQuery('Test');
    query.equalTo('key', 'value');

    const subscription = liveQueryClient.subscribe(query);
    liveQueryClient.connectPromise.reject(new Error('Unable to connect'));
    liveQueryClient.connectPromise.catch(() => {});
    try {
      await subscription.subscribePromise;
      expect(true).toBeFalse();
    } catch (e) {
      expect(e.message).toBe('Unable to connect');
    }
  });

  it('can resubscribe', async () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    liveQueryClient.socket = {
      send: jest.fn(),
    };
    const query = new ParseQuery('Test');
    query.equalTo('key', 'value');
    query.select(['key']);
    query.watch(['key']);
    liveQueryClient.subscribe(query);
    liveQueryClient.connectPromise.resolve();

    liveQueryClient.resubscribe();

    expect(liveQueryClient.requestId).toBe(2);
    await liveQueryClient.connectPromise;
    const messageStr = liveQueryClient.socket.send.mock.calls[0][0];
    const message = JSON.parse(messageStr);
    expect(message).toEqual({
      op: 'subscribe',
      requestId: 1,
      query: {
        className: 'Test',
        where: {
          key: 'value',
        },
        keys: ['key'],
        watch: ['key'],
      },
    });
  });

  it('can resubscribe with sessionToken', async () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    liveQueryClient.socket = {
      send: jest.fn(),
    };
    const query = new ParseQuery('Test');
    query.equalTo('key', 'value');
    query.select(['key']);
    query.watch(['key']);
    liveQueryClient.subscribe(query, 'mySessionToken');
    liveQueryClient.connectPromise.resolve();

    liveQueryClient.resubscribe();

    expect(liveQueryClient.requestId).toBe(2);
    await liveQueryClient.connectPromise;
    const messageStr = liveQueryClient.socket.send.mock.calls[0][0];
    const message = JSON.parse(messageStr);
    expect(message).toEqual({
      op: 'subscribe',
      requestId: 1,
      sessionToken: 'mySessionToken',
      query: {
        className: 'Test',
        where: {
          key: 'value',
        },
        keys: ['key'],
        watch: ['key'],
      },
    });
  });

  it('can close', () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    liveQueryClient.state = 'connected';
    liveQueryClient.socket = {
      close: jest.fn(),
    };
    const subscription = new events.EventEmitter();
    liveQueryClient.subscriptions.set(1, subscription);
    // Register checked in advance
    let isChecked = false;
    subscription.on('close', function () {
      isChecked = true;
    });
    let isCheckedAgain = false;
    liveQueryClient.on('close', function () {
      isCheckedAgain = true;
    });

    liveQueryClient.close();

    expect(liveQueryClient.subscriptions.size).toBe(0);
    expect(isChecked).toBe(true);
    expect(isCheckedAgain).toBe(true);
    expect(liveQueryClient.socket.close).toBeCalled();
    expect(liveQueryClient.state).toBe('disconnected');
  });

  it('can handle WebSocket subclass', () => {
    const MyExtendedClass = ParseObject.extend('MyExtendedClass');
    ParseObject.registerSubclass('MyExtendedClass', MyExtendedClass);

    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
      sessionToken: 'sessionToken',
    });
    // Add mock subscription
    const subscription = new events.EventEmitter();
    liveQueryClient.subscriptions.set(1, subscription);
    const object = new MyExtendedClass();
    object.set('key', 'value');
    const data = {
      op: 'create',
      clientId: 1,
      requestId: 1,
      object: object._toFullJSON(),
    };
    const event = {
      data: JSON.stringify(data),
    };
    // Register checked in advance
    let isChecked = false;
    subscription.on('create', function (parseObject) {
      isChecked = true;
      expect(parseObject instanceof MyExtendedClass).toBe(true);
      expect(parseObject.get('key')).toEqual('value');
      expect(parseObject.get('className')).toBeUndefined();
      expect(parseObject.get('__type')).toBeUndefined();
    });

    liveQueryClient._handleWebSocketMessage(event);

    expect(isChecked).toBe(true);
  });

  it('cannot subscribe without query', () => {
    const liveQueryClient = new LiveQueryClient({
      applicationId: 'applicationId',
      serverURL: 'ws://test',
      javascriptKey: 'javascriptKey',
      masterKey: 'masterKey',
    });
    const subscription = liveQueryClient.subscribe();
    expect(subscription).toBe(undefined);
  });
});
