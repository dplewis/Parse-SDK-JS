jest.autoMockOff();
jest.useFakeTimers();
jest.mock('../uuid', () => {
  let value = 1000;
  return () => (value++).toString();
});

const CoreManager = require('../CoreManager').default;
const RESTController = require('../RESTController').default;
const flushPromises = require('./test_helpers/flushPromises');
const mockXHR = require('./test_helpers/mockXHR');
const mockWeChat = require('./test_helpers/mockWeChat');

global.wx = mockWeChat;

CoreManager.setInstallationController({
  currentInstallationId() {
    return Promise.resolve('iid');
  },
  currentInstallation() {},
  updateInstallationOnDisk() {},
});
CoreManager.set('APPLICATION_ID', 'A');
CoreManager.set('JAVASCRIPT_KEY', 'B');
CoreManager.set('VERSION', 'V');

const headers = {
  'x-parse-job-status-id': '1234',
  'x-parse-push-status-id': '5678',
  'access-control-expose-headers': 'X-Parse-Job-Status-Id, X-Parse-Push-Status-Id',
};

describe('RESTController', () => {
  it('throws if there is no XHR implementation', () => {
    RESTController._setXHR(null);
    expect(RESTController._getXHR()).toBe(null);
    expect(RESTController.ajax.bind(null, 'GET', 'users/me', {})).toThrow(
      'Cannot make a request: No definition of XMLHttpRequest was found.'
    );
  });

  it('opens a XHR with the correct verb and headers', () => {
    const xhr = {
      setRequestHeader: jest.fn(),
      open: jest.fn(),
      send: jest.fn(),
    };
    RESTController._setXHR(function () {
      return xhr;
    });
    RESTController.ajax('GET', 'users/me', {}, { 'X-Parse-Session-Token': '123' });
    expect(xhr.setRequestHeader.mock.calls[0]).toEqual(['X-Parse-Session-Token', '123']);
    expect(xhr.open.mock.calls[0]).toEqual(['GET', 'users/me', true]);
    expect(xhr.send.mock.calls[0][0]).toEqual({});
  });

  it('resolves with the result of the AJAX request', done => {
    RESTController._setXHR(mockXHR([{ status: 200, response: { success: true } }]));
    RESTController.ajax('POST', 'users', {}).then(({ response, status }) => {
      expect(response).toEqual({ success: true });
      expect(status).toBe(200);
      done();
    });
  });

  it('retries on 5XX errors', done => {
    RESTController._setXHR(
      mockXHR([{ status: 500 }, { status: 500 }, { status: 200, response: { success: true } }])
    );
    RESTController.ajax('POST', 'users', {}).then(({ response, status }) => {
      expect(response).toEqual({ success: true });
      expect(status).toBe(200);
      done();
    });
    jest.runAllTimers();
  });

  it('retries on connection failure', done => {
    RESTController._setXHR(
      mockXHR([{ status: 0 }, { status: 0 }, { status: 0 }, { status: 0 }, { status: 0 }])
    );
    RESTController.ajax('POST', 'users', {}).then(null, err => {
      expect(err).toBe('Unable to connect to the Parse API');
      done();
    });
    jest.runAllTimers();
  });

  it('returns a connection error on network failure', async () => {
    expect.assertions(2);
    RESTController._setXHR(
      mockXHR([{ status: 0 }, { status: 0 }, { status: 0 }, { status: 0 }, { status: 0 }])
    );
    RESTController.request('GET', 'classes/MyObject', {}, { sessionToken: '1234' }).then(
      null,
      err => {
        expect(err.code).toBe(100);
        expect(err.message).toBe('XMLHttpRequest failed: "Unable to connect to the Parse API"');
      }
    );
    await flushPromises();
    jest.runAllTimers();
  });

  it('aborts after too many failures', async () => {
    expect.assertions(1);
    RESTController._setXHR(
      mockXHR([
        { status: 500 },
        { status: 500 },
        { status: 500 },
        { status: 500 },
        { status: 500 },
        { status: 200, response: { success: true } },
      ])
    );
    RESTController.ajax('POST', 'users', {}).then(null, xhr => {
      expect(xhr).not.toBe(undefined);
    });
    await flushPromises();
    jest.runAllTimers();
  });

  it('rejects 1XX status codes', done => {
    RESTController._setXHR(mockXHR([{ status: 100 }]));
    RESTController.ajax('POST', 'users', {}).then(null, xhr => {
      expect(xhr).not.toBe(undefined);
      done();
    });
    jest.runAllTimers();
  });

  it('can make formal JSON requests', async () => {
    const xhr = {
      setRequestHeader: jest.fn(),
      open: jest.fn(),
      send: jest.fn(),
    };
    RESTController._setXHR(function () {
      return xhr;
    });
    RESTController.request('GET', 'classes/MyObject', {}, { sessionToken: '1234' });
    await flushPromises();
    expect(xhr.open.mock.calls[0]).toEqual([
      'POST',
      'https://api.parse.com/1/classes/MyObject',
      true,
    ]);
    expect(JSON.parse(xhr.send.mock.calls[0][0])).toEqual({
      _method: 'GET',
      _ApplicationId: 'A',
      _JavaScriptKey: 'B',
      _ClientVersion: 'V',
      _InstallationId: 'iid',
      _SessionToken: '1234',
    });
  });

  it('handles request errors', done => {
    RESTController._setXHR(
      mockXHR([
        {
          status: 400,
          response: {
            code: -1,
            error: 'Something bad',
          },
        },
      ])
    );
    RESTController.request('GET', 'classes/MyObject', {}, {}).then(null, error => {
      expect(error.code).toBe(-1);
      expect(error.message).toBe('Something bad');
      done();
    });
  });

  it('handles invalid responses', done => {
    const XHR = function () {};
    XHR.prototype = {
      open: function () {},
      setRequestHeader: function () {},
      send: function () {
        this.status = 200;
        this.responseText = '{';
        this.readyState = 4;
        this.onreadystatechange();
      },
    };
    RESTController._setXHR(XHR);
    RESTController.request('GET', 'classes/MyObject', {}, {}).then(null, error => {
      expect(error.code).toBe(100);
      expect(error.message.indexOf('XMLHttpRequest failed')).toBe(0);
      done();
    });
  });

  it('handles invalid errors', done => {
    const XHR = function () {};
    XHR.prototype = {
      open: function () {},
      setRequestHeader: function () {},
      send: function () {
        this.status = 400;
        this.responseText = '{';
        this.readyState = 4;
        this.onreadystatechange();
      },
    };
    RESTController._setXHR(XHR);
    RESTController.request('GET', 'classes/MyObject', {}, {}).then(null, error => {
      expect(error.code).toBe(107);
      expect(error.message).toBe('Received an error with invalid JSON from Parse: {');
      done();
    });
  });

  it('handles x-parse-job-status-id header', async () => {
    const XHR = function () {};
    XHR.prototype = {
      open: function () {},
      setRequestHeader: function () {},
      getResponseHeader: function (header) {
        return headers[header];
      },
      getAllResponseHeaders: function () {
        return Object.keys(headers)
          .map(key => `${key}: ${headers[key]}`)
          .join('\n');
      },
      send: function () {
        this.status = 200;
        this.responseText = '{}';
        this.readyState = 4;
        this.onreadystatechange();
      },
    };
    RESTController._setXHR(XHR);
    const response = await RESTController.request(
      'GET',
      'classes/MyObject',
      {},
      { returnStatus: true }
    );
    expect(response._headers['X-Parse-Job-Status-Id']).toBe('1234');
  });

  it('handles x-parse-push-status-id header', async () => {
    const XHR = function () {};
    XHR.prototype = {
      open: function () {},
      setRequestHeader: function () {},
      getResponseHeader: function (header) {
        return headers[header];
      },
      getAllResponseHeaders: function () {
        return Object.keys(headers)
          .map(key => `${key}: ${headers[key]}`)
          .join('\n');
      },
      send: function () {
        this.status = 200;
        this.responseText = '{}';
        this.readyState = 4;
        this.onreadystatechange();
      },
    };
    RESTController._setXHR(XHR);
    const response = await RESTController.request('POST', 'push', {}, { returnStatus: true });
    expect(response._headers['X-Parse-Push-Status-Id']).toBe('5678');
  });

  it('does not call getRequestHeader with no headers or no getAllResponseHeaders', async () => {
    const XHR = function () {};
    XHR.prototype = {
      open: function () {},
      setRequestHeader: function () {},
      getResponseHeader: jest.fn(),
      send: function () {
        this.status = 200;
        this.responseText = '{"result":"hello"}';
        this.readyState = 4;
        this.onreadystatechange();
      },
    };
    RESTController._setXHR(XHR);
    await RESTController.request('GET', 'classes/MyObject', {}, {});
    expect(XHR.prototype.getResponseHeader.mock.calls.length).toBe(0);

    XHR.prototype.getAllResponseHeaders = jest.fn();
    await RESTController.request('GET', 'classes/MyObject', {}, {});
    expect(XHR.prototype.getAllResponseHeaders.mock.calls.length).toBe(1);
    expect(XHR.prototype.getResponseHeader.mock.calls.length).toBe(0);
  });

  it('does not invoke Chrome browser console error on getResponseHeader', async () => {
    const headers = {
      'access-control-expose-headers': 'a, b, c',
      a: 'value',
      b: 'value',
      c: 'value',
    };
    const XHR = function () {};
    XHR.prototype = {
      open: function () {},
      setRequestHeader: function () {},
      getResponseHeader: jest.fn(key => {
        if (Object.keys(headers).includes(key)) {
          return headers[key];
        }
        throw new Error('Chrome creates a console error here.');
      }),
      getAllResponseHeaders: jest.fn(() => {
        return Object.keys(headers)
          .map(key => `${key}: ${headers[key]}`)
          .join('\r\n');
      }),
      send: function () {
        this.status = 200;
        this.responseText = '{"result":"hello"}';
        this.readyState = 4;
        this.onreadystatechange();
      },
    };
    RESTController._setXHR(XHR);
    await RESTController.request('GET', 'classes/MyObject', {}, {});
    expect(XHR.prototype.getAllResponseHeaders.mock.calls.length).toBe(1);
    expect(XHR.prototype.getResponseHeader.mock.calls.length).toBe(4);
  });

  it('handles invalid header', async () => {
    const XHR = function () {};
    XHR.prototype = {
      open: function () {},
      setRequestHeader: function () {},
      getResponseHeader: function () {
        return null;
      },
      send: function () {
        this.status = 200;
        this.responseText = '{"result":"hello"}';
        this.readyState = 4;
        this.onreadystatechange();
      },
      getAllResponseHeaders: function () {
        return null;
      },
    };
    RESTController._setXHR(XHR);
    const response = await RESTController.request('GET', 'classes/MyObject', {}, {});
    expect(response.result).toBe('hello');
  });

  it('idempotency - sends requestId header', async () => {
    CoreManager.set('IDEMPOTENCY', true);
    const requestIdHeader = header => 'X-Parse-Request-Id' === header[0];
    const xhr = {
      setRequestHeader: jest.fn(),
      open: jest.fn(),
      send: jest.fn(),
    };
    RESTController._setXHR(function () {
      return xhr;
    });
    RESTController.request('POST', 'classes/MyObject', {}, {});
    await flushPromises();
    expect(xhr.setRequestHeader.mock.calls.filter(requestIdHeader)).toEqual([
      ['X-Parse-Request-Id', '1000'],
    ]);
    xhr.setRequestHeader.mockClear();

    RESTController.request('PUT', 'classes/MyObject', {}, {});
    await flushPromises();
    expect(xhr.setRequestHeader.mock.calls.filter(requestIdHeader)).toEqual([
      ['X-Parse-Request-Id', '1001'],
    ]);
    CoreManager.set('IDEMPOTENCY', false);
  });

  it('idempotency - handle requestId on network retries', done => {
    CoreManager.set('IDEMPOTENCY', true);
    RESTController._setXHR(
      mockXHR([{ status: 500 }, { status: 500 }, { status: 200, response: { success: true } }])
    );
    RESTController.ajax('POST', 'users', {}).then(({ response, status, xhr }) => {
      // X-Parse-Request-Id should be the same for all retries
      const requestIdHeaders = xhr.setRequestHeader.mock.calls.filter(
        header => 'X-Parse-Request-Id' === header[0]
      );
      expect(requestIdHeaders.every(header => header[1] === requestIdHeaders[0][1])).toBeTruthy();
      expect(requestIdHeaders.length).toBe(3);
      expect(response).toEqual({ success: true });
      expect(status).toBe(200);
      done();
    });
    jest.runAllTimers();
    CoreManager.set('IDEMPOTENCY', false);
  });

  it('idempotency - should properly handle url method not POST / PUT', () => {
    CoreManager.set('IDEMPOTENCY', true);
    const xhr = {
      setRequestHeader: jest.fn(),
      open: jest.fn(),
      send: jest.fn(),
    };
    RESTController._setXHR(function () {
      return xhr;
    });
    RESTController.ajax('GET', 'users/me', {}, {});
    const requestIdHeaders = xhr.setRequestHeader.mock.calls.filter(
      header => 'X-Parse-Request-Id' === header[0]
    );
    expect(requestIdHeaders.length).toBe(0);
    CoreManager.set('IDEMPOTENCY', false);
  });

  it('handles aborted requests', done => {
    const XHR = function () {};
    XHR.prototype = {
      open: function () {},
      setRequestHeader: function () {},
      send: function () {
        this.status = 0;
        this.responseText = '{"foo":"bar"}';
        this.readyState = 4;
        this.onabort();
        this.onreadystatechange();
      },
    };
    RESTController._setXHR(XHR);
    RESTController.request('GET', 'classes/MyObject', {}, {}).then(() => {
      done();
    });
  });

  it('attaches the session token of the current user', async () => {
    CoreManager.setUserController({
      currentUserAsync() {
        return Promise.resolve({ getSessionToken: () => '5678' });
      },
      setCurrentUser() {},
      currentUser() {},
      signUp() {},
      logIn() {},
      become() {},
      logOut() {},
      me() {},
      requestPasswordReset() {},
      upgradeToRevocableSession() {},
      linkWith() {},
      requestEmailVerification() {},
      verifyPassword() {},
    });

    const xhr = {
      setRequestHeader: jest.fn(),
      open: jest.fn(),
      send: jest.fn(),
    };
    RESTController._setXHR(function () {
      return xhr;
    });
    RESTController.request('GET', 'classes/MyObject', {}, {});
    await flushPromises();
    expect(JSON.parse(xhr.send.mock.calls[0][0])).toEqual({
      _method: 'GET',
      _ApplicationId: 'A',
      _JavaScriptKey: 'B',
      _ClientVersion: 'V',
      _InstallationId: 'iid',
      _SessionToken: '5678',
    });
    CoreManager.set('UserController', undefined); // Clean up
  });

  it('attaches no session token when there is no current user', async () => {
    CoreManager.setUserController({
      currentUserAsync() {
        return Promise.resolve(null);
      },
      setCurrentUser() {},
      currentUser() {},
      signUp() {},
      logIn() {},
      become() {},
      logOut() {},
      me() {},
      requestPasswordReset() {},
      upgradeToRevocableSession() {},
      linkWith() {},
      requestEmailVerification() {},
      verifyPassword() {},
    });

    const xhr = {
      setRequestHeader: jest.fn(),
      open: jest.fn(),
      send: jest.fn(),
    };
    RESTController._setXHR(function () {
      return xhr;
    });
    RESTController.request('GET', 'classes/MyObject', {}, {});
    await flushPromises();
    expect(JSON.parse(xhr.send.mock.calls[0][0])).toEqual({
      _method: 'GET',
      _ApplicationId: 'A',
      _JavaScriptKey: 'B',
      _ClientVersion: 'V',
      _InstallationId: 'iid',
    });
    CoreManager.set('UserController', undefined); // Clean up
  });

  it('sends the revocable session upgrade header when the config flag is set', async () => {
    CoreManager.set('FORCE_REVOCABLE_SESSION', true);
    const xhr = {
      setRequestHeader: jest.fn(),
      open: jest.fn(),
      send: jest.fn(),
    };
    RESTController._setXHR(function () {
      return xhr;
    });
    RESTController.request('GET', 'classes/MyObject', {}, {});
    await flushPromises();
    xhr.onreadystatechange();
    expect(JSON.parse(xhr.send.mock.calls[0][0])).toEqual({
      _method: 'GET',
      _ApplicationId: 'A',
      _JavaScriptKey: 'B',
      _ClientVersion: 'V',
      _InstallationId: 'iid',
      _RevocableSession: '1',
    });
    CoreManager.set('FORCE_REVOCABLE_SESSION', false); // Clean up
  });

  it('sends the master key when requested', async () => {
    CoreManager.set('MASTER_KEY', 'M');
    const xhr = {
      setRequestHeader: jest.fn(),
      open: jest.fn(),
      send: jest.fn(),
    };
    RESTController._setXHR(function () {
      return xhr;
    });
    RESTController.request('GET', 'classes/MyObject', {}, { useMasterKey: true });
    await flushPromises();
    expect(JSON.parse(xhr.send.mock.calls[0][0])).toEqual({
      _method: 'GET',
      _ApplicationId: 'A',
      _MasterKey: 'M',
      _ClientVersion: 'V',
      _InstallationId: 'iid',
    });
  });

  it('sends the maintenance key when requested', async () => {
    CoreManager.set('MAINTENANCE_KEY', 'MK');
    const xhr = {
      setRequestHeader: jest.fn(),
      open: jest.fn(),
      send: jest.fn(),
    };
    RESTController._setXHR(function () {
      return xhr;
    });
    RESTController.request('GET', 'classes/MyObject', {}, { useMaintenanceKey: true });
    await flushPromises();
    expect(JSON.parse(xhr.send.mock.calls[0][0])).toEqual({
      _method: 'GET',
      _ApplicationId: 'A',
      _JavaScriptKey: 'B',
      _MaintenanceKey: 'MK',
      _ClientVersion: 'V',
      _InstallationId: 'iid',
    });
  });

  it('includes the status code when requested', done => {
    RESTController._setXHR(mockXHR([{ status: 200, response: { success: true } }]));
    RESTController.request('POST', 'users', {}, { returnStatus: true }).then(response => {
      expect(response).toEqual(expect.objectContaining({ success: true }));
      expect(response._status).toBe(200);
      done();
    });
  });

  it('throws when attempted to use an unprovided master key', () => {
    CoreManager.set('MASTER_KEY', undefined);
    const xhr = {
      setRequestHeader: jest.fn(),
      open: jest.fn(),
      send: jest.fn(),
    };
    RESTController._setXHR(function () {
      return xhr;
    });
    expect(function () {
      RESTController.request('GET', 'classes/MyObject', {}, { useMasterKey: true });
    }).toThrow('Cannot use the Master Key, it has not been provided.');
  });

  it('sends auth header when the auth type and token flags are set', async () => {
    CoreManager.set('SERVER_AUTH_TYPE', 'Bearer');
    CoreManager.set('SERVER_AUTH_TOKEN', 'some_random_token');
    const credentialsHeader = header => 'Authorization' === header[0];
    const xhr = {
      setRequestHeader: jest.fn(),
      open: jest.fn(),
      send: jest.fn(),
    };
    RESTController._setXHR(function () {
      return xhr;
    });
    RESTController.request('GET', 'classes/MyObject', {}, {});
    await flushPromises();
    expect(xhr.setRequestHeader.mock.calls.filter(credentialsHeader)).toEqual([
      ['Authorization', 'Bearer some_random_token'],
    ]);
    CoreManager.set('SERVER_AUTH_TYPE', null);
    CoreManager.set('SERVER_AUTH_TOKEN', null);
  });

  it('reports upload/download progress of the AJAX request when callback is provided', done => {
    const xhr = mockXHR([{ status: 200, response: { success: true } }], {
      progress: {
        lengthComputable: true,
        loaded: 5,
        total: 10,
      },
    });
    RESTController._setXHR(xhr);

    const options = {
      progress: function () {},
    };
    jest.spyOn(options, 'progress');

    RESTController.ajax('POST', 'files/upload.txt', {}, {}, options).then(
      ({ response, status }) => {
        expect(options.progress).toHaveBeenCalledWith(0.5, 5, 10, {
          type: 'download',
        });
        expect(options.progress).toHaveBeenCalledWith(0.5, 5, 10, {
          type: 'upload',
        });
        expect(response).toEqual({ success: true });
        expect(status).toBe(200);
        done();
      }
    );
  });

  it('does not set upload progress listener when callback is not provided to avoid CORS pre-flight', () => {
    const xhr = {
      setRequestHeader: jest.fn(),
      open: jest.fn(),
      upload: jest.fn(),
      send: jest.fn(),
    };
    RESTController._setXHR(function () {
      return xhr;
    });
    RESTController.ajax('POST', 'users', {});
    expect(xhr.upload.onprogress).toBeUndefined();
  });

  it('does not upload progress when total is uncomputable', done => {
    const xhr = mockXHR([{ status: 200, response: { success: true } }], {
      progress: {
        lengthComputable: false,
        loaded: 5,
        total: 0,
      },
    });
    RESTController._setXHR(xhr);

    const options = {
      progress: function () {},
    };
    jest.spyOn(options, 'progress');

    RESTController.ajax('POST', 'files/upload.txt', {}, {}, options).then(
      ({ response, status }) => {
        expect(options.progress).toHaveBeenCalledWith(null, null, null, {
          type: 'upload',
        });
        expect(response).toEqual({ success: true });
        expect(status).toBe(200);
        done();
      }
    );
  });

  it('opens a XHR with the custom headers', () => {
    CoreManager.set('REQUEST_HEADERS', { 'Cache-Control': 'max-age=3600' });
    const xhr = {
      setRequestHeader: jest.fn(),
      open: jest.fn(),
      send: jest.fn(),
    };
    RESTController._setXHR(function () {
      return xhr;
    });
    RESTController.ajax('GET', 'users/me', {}, { 'X-Parse-Session-Token': '123' });
    expect(xhr.setRequestHeader.mock.calls[3]).toEqual(['Cache-Control', 'max-age=3600']);
    expect(xhr.open.mock.calls[0]).toEqual(['GET', 'users/me', true]);
    expect(xhr.send.mock.calls[0][0]).toEqual({});
    CoreManager.set('REQUEST_HEADERS', {});
  });

  it('can handle installationId option', async () => {
    const xhr = {
      setRequestHeader: jest.fn(),
      open: jest.fn(),
      send: jest.fn(),
    };
    RESTController._setXHR(function () {
      return xhr;
    });
    RESTController.request(
      'GET',
      'classes/MyObject',
      {},
      { sessionToken: '1234', installationId: '5678' }
    );
    await flushPromises();
    expect(xhr.open.mock.calls[0]).toEqual([
      'POST',
      'https://api.parse.com/1/classes/MyObject',
      true,
    ]);
    expect(JSON.parse(xhr.send.mock.calls[0][0])).toEqual({
      _method: 'GET',
      _ApplicationId: 'A',
      _JavaScriptKey: 'B',
      _ClientVersion: 'V',
      _InstallationId: '5678',
      _SessionToken: '1234',
    });
  });

  it('can handle wechat request', async () => {
    const XHR = require('../Xhr.weapp').default;
    const xhr = new XHR();
    jest.spyOn(xhr, 'open');
    jest.spyOn(xhr, 'send');
    RESTController._setXHR(function () {
      return xhr;
    });
    RESTController.request(
      'GET',
      'classes/MyObject',
      {},
      { sessionToken: '1234', installationId: '5678' }
    );
    await flushPromises();
    expect(xhr.open.mock.calls[0]).toEqual([
      'POST',
      'https://api.parse.com/1/classes/MyObject',
      true,
    ]);
    expect(JSON.parse(xhr.send.mock.calls[0][0])).toEqual({
      _method: 'GET',
      _ApplicationId: 'A',
      _JavaScriptKey: 'B',
      _ClientVersion: 'V',
      _InstallationId: '5678',
      _SessionToken: '1234',
    });
  });

  it('can handle wechat ajax', async () => {
    const XHR = require('../Xhr.weapp').default;
    const xhr = new XHR();
    jest.spyOn(xhr, 'open');
    jest.spyOn(xhr, 'send');
    jest.spyOn(xhr, 'setRequestHeader');
    RESTController._setXHR(function () {
      return xhr;
    });
    const headers = { 'X-Parse-Session-Token': '123' };
    RESTController.ajax('GET', 'users/me', {}, headers);
    expect(xhr.setRequestHeader.mock.calls[0]).toEqual(['X-Parse-Session-Token', '123']);
    expect(xhr.open.mock.calls[0]).toEqual(['GET', 'users/me', true]);
    expect(xhr.send.mock.calls[0][0]).toEqual({});
    xhr.responseHeader = headers;
    expect(xhr.getAllResponseHeaders().includes('X-Parse-Session-Token')).toBe(true);
    expect(xhr.getResponseHeader('X-Parse-Session-Token')).toBe('123');
    xhr.abort();
    xhr.abort();
  });
});
