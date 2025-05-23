jest.dontMock('../AnonymousUtils');
jest.dontMock('../CoreManager');
jest.dontMock('../CryptoController');
jest.dontMock('../decode');
jest.dontMock('../encode');
jest.dontMock('../isRevocableSession');
jest.dontMock('../LocalDatastore');
jest.dontMock('../ObjectStateMutations');
jest.dontMock('../parseDate');
jest.dontMock('../ParseError');
jest.dontMock('../ParseObject');
jest.dontMock('../ParseOp');
jest.dontMock('../ParseUser');
jest.dontMock('../promiseUtils');
jest.dontMock('../RESTController');
jest.dontMock('../SingleInstanceStateController');
jest.dontMock('../Storage');
jest.dontMock('../StorageController.default');
jest.dontMock('../TaskQueue');
jest.dontMock('../unique');
jest.dontMock('../UniqueInstanceStateController');
jest.dontMock('crypto-js/aes');
jest.dontMock('crypto-js/enc-utf8');

jest.mock('../uuid', () => {
  let value = 0;
  return () => value++;
});
jest.dontMock('./test_helpers/flushPromises');
jest.dontMock('./test_helpers/mockXHR');
jest.dontMock('./test_helpers/mockAsyncStorage');

const flushPromises = require('./test_helpers/flushPromises');
const mockAsyncStorage = require('./test_helpers/mockAsyncStorage');
const CoreManager = require('../CoreManager').default;
const CryptoController = require('../CryptoController').default;
const StorageController = require('../StorageController.default').default;
const LocalDatastore = require('../LocalDatastore').default;
const ParseObject = require('../ParseObject').default;
const ParseUser = require('../ParseUser').default;
const Storage = require('../Storage').default;
const ParseError = require('../ParseError').default;
const AnonymousUtils = require('../AnonymousUtils').default;

CoreManager.set('APPLICATION_ID', 'A');
CoreManager.set('JAVASCRIPT_KEY', 'B');
CoreManager.setCryptoController(CryptoController);
CoreManager.setStorageController(StorageController);

describe('ParseUser', () => {
  beforeEach(() => {
    ParseObject.enableSingleInstance();
    LocalDatastore._clear();
  });

  it('can be constructed with initial attributes', () => {
    let u = new ParseUser();
    expect(u.isCurrent()).toBe(false);
    expect(u.className).toBe('_User');
    expect(u instanceof ParseObject).toBe(true);

    u = new ParseUser({
      username: 'andrew',
      password: 'secret',
    });
    expect(u.get('username')).toBe('andrew');
    expect(u.get('password')).toBe('secret');

    expect(function () {
      new ParseUser({
        $$$: 'invalid',
      });
    }).toThrow("Can't create an invalid Parse User");
  });

  it('exposes certain attributes through special setters and getters', () => {
    const u = ParseObject.fromJSON({
      className: '_User',
      username: 'user12',
      email: 'user12@parse.com',
      sessionToken: '123abc',
    });
    expect(u instanceof ParseUser).toBe(true);
    expect(u.getUsername()).toBe('user12');
    expect(u.getEmail()).toBe('user12@parse.com');
    expect(u.getSessionToken()).toBe('123abc');

    const u2 = new ParseUser();
    u2.setUsername('bono');
    u2.setEmail('bono@u2.com');
    expect(u2.getUsername()).toBe('bono');
    expect(u2.getEmail()).toBe('bono@u2.com');
  });

  it('can handle invalid setters and getters', () => {
    const u = ParseObject.fromJSON({
      className: '_User',
      username: 123,
      email: 456,
      sessionToken: 789,
    });
    expect(u instanceof ParseUser).toBe(true);
    expect(u.getUsername()).toBe('');
    expect(u.getEmail()).toBe('');
    expect(u.getSessionToken()).toBe('');
  });

  it('can clone User objects', () => {
    const u = ParseObject.fromJSON({
      className: '_User',
      username: 'user12',
      email: 'user12@parse.com',
      sessionToken: '123abc',
    });

    const clone = u.clone();
    expect(clone.className).toBe('_User');
    expect(clone.get('username')).toBe('user12');
    expect(clone.get('email')).toBe('user12@parse.com');
    expect(clone.get('sessionToken')).toBe(undefined);
  });

  it('can create a new instance of a User', () => {
    ParseObject.disableSingleInstance();
    const o = ParseObject.fromJSON({
      className: '_User',
      objectId: 'U111',
      username: 'u111',
      email: 'u111@parse.com',
      sesionToken: '1313',
    });
    let o2 = o.newInstance();
    expect(o.id).toBe(o2.id);
    expect(o.className).toBe(o2.className);
    expect(o.get('username')).toBe(o2.get('username'));
    expect(o.get('sessionToken')).toBe(o2.get('sessionToken'));
    expect(o).not.toBe(o2);
    o.set({ admin: true });
    expect(o2.get('admin')).toBe(undefined);
    o2 = o.newInstance();
    expect(o2.get('admin')).toBe(true);
    ParseObject.enableSingleInstance();
  });

  it('makes session tokens readonly', () => {
    const u = new ParseUser();
    expect(u.set.bind(u, 'sessionToken', 'token')).toThrow(
      'Cannot modify readonly attribute: sessionToken'
    );
  });

  it('does not allow current user actions on node servers', () => {
    expect(ParseUser.become.bind(null, 'token')).toThrow(
      'It is not memory-safe to become a user in a server environment'
    );
  });

  it('can sign up a new user', done => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request(method, path, body) {
        expect(method).toBe('POST');
        expect(path).toBe('users');
        expect(body.username).toBe('username');
        expect(body.password).toBe('password');

        return Promise.resolve(
          {
            objectId: 'uid',
          },
          201
        );
      },
      ajax() {},
    });
    ParseUser.signUp(null, 'password').then(
      () => {
        // Should not be reached
        expect(true).toBe(false);
      },
      error => {
        expect(error.message).toBe('Cannot sign up user with an empty username.');
      }
    );
    ParseUser.signUp('username').then(
      () => {
        // Should not be reached
        expect(true).toBe(false);
      },
      error => {
        expect(error.message).toBe('Cannot sign up user with an empty password.');
      }
    );
    ParseUser.signUp('username', 'password').then(u => {
      expect(u.id).toBe('uid');
      expect(u.get('username')).toBe('username');
      expect(u.get('password')).toBe(undefined);
      expect(u.isCurrent()).toBe(true);

      expect(ParseUser.current()).toBe(u);
      ParseUser._clearCache();
      const current = ParseUser.current();
      expect(current instanceof ParseUser).toBe(true);
      expect(current.id).toBe('uid');
      expect(current.getUsername()).toBe('username');
      expect(current.get('password')).toBe(undefined);
      done();
    });
  });

  it('can log in as a user', done => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request(method, path, body) {
        expect(method).toBe('POST');
        expect(path).toBe('login');
        expect(body.username).toBe('username');
        expect(body.password).toBe('password');

        return Promise.resolve(
          {
            objectId: 'uid2',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });
    ParseUser.logIn('username', 'password').then(u => {
      expect(u.id).toBe('uid2');
      expect(u.getSessionToken()).toBe('123abc');
      expect(u.isCurrent()).toBe(true);
      expect(u.authenticated()).toBe(true);
      expect(ParseUser.current()).toBe(u);
      ParseUser._clearCache();
      const current = ParseUser.current();
      expect(current instanceof ParseUser).toBe(true);
      expect(current.id).toBe('uid2');
      expect(current.authenticated()).toBe(true);
      done();
    });
  });

  it('can log in as a user with options', async () => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request(method, path, body, options) {
        expect(method).toBe('POST');
        expect(path).toBe('login');
        expect(body.username).toBe('username');
        expect(body.password).toBe('password');
        expect(options.useMasterKey).toBe(true);
        expect(options.installationId).toBe('installation1234');
        return Promise.resolve(
          {
            objectId: 'uid2',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });
    const user = await ParseUser.logIn('username', 'password', {
      useMasterKey: true,
      installationId: 'installation1234',
    });
    expect(user.id).toBe('uid2');
  });

  it('can log in as a user with POST method', done => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request(method, path, body) {
        expect(method).toBe('GET');
        expect(path).toBe('login');
        expect(body.username).toBe('username');
        expect(body.password).toBe('password');

        return Promise.resolve(
          {
            objectId: 'uid2',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });
    ParseUser.logIn('username', 'password', { usePost: false }).then(u => {
      expect(u.id).toBe('uid2');
      expect(u.getSessionToken()).toBe('123abc');
      expect(u.isCurrent()).toBe(true);
      expect(u.authenticated()).toBe(true);
      expect(ParseUser.current()).toBe(u);
      ParseUser._clearCache();
      const current = ParseUser.current();
      expect(current instanceof ParseUser).toBe(true);
      expect(current.id).toBe('uid2');
      expect(current.authenticated()).toBe(true);
      done();
    });
  });

  it('fail login when invalid username or password is used', done => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    ParseUser.logIn({}, 'password')
      .then(null, err => {
        expect(err.code).toBe(ParseError.OTHER_CAUSE);
        expect(err.message).toBe('Username must be a string.');

        return ParseUser.logIn('username', {});
      })
      .then(null, err => {
        expect(err.code).toBe(ParseError.OTHER_CAUSE);
        expect(err.message).toBe('Password must be a string.');

        done();
      });
  });

  describe('loginWithAdditional', () => {
    it('loginWithAdditonal fails with invalid payload', async () => {
      ParseUser.enableUnsafeCurrentUser();
      ParseUser._clearCache();
      CoreManager.setRESTController({
        request(method, path, body) {
          expect(method).toBe('POST');
          expect(path).toBe('login');
          expect(body.username).toBe('username');
          expect(body.password).toBe('password');
          expect(body.authData).toEqual({ mfa: { key: '1234' } });

          return Promise.resolve(
            {
              objectId: 'uid2',
              username: 'username',
              sessionToken: '123abc',
              authDataResponse: {
                mfa: { enabled: true },
              },
            },
            200
          );
        },
        ajax() {},
      });
      const response = await ParseUser.logInWithAdditionalAuth('username', 'password', {
        mfa: { key: '1234' },
      });
      expect(response instanceof ParseUser).toBe(true);
      expect(response.get('authDataResponse')).toEqual({ mfa: { enabled: true } });
    });

    it('loginWithAdditonal fails with invalid payload', async () => {
      ParseUser.enableUnsafeCurrentUser();
      ParseUser._clearCache();
      await expect(ParseUser.logInWithAdditionalAuth({}, 'password', {})).rejects.toThrowError(
        new ParseError(ParseError.OTHER_CAUSE, 'Username must be a string.')
      );
      await expect(ParseUser.logInWithAdditionalAuth('username', {}, {})).rejects.toThrowError(
        new ParseError(ParseError.OTHER_CAUSE, 'Password must be a string.')
      );
      await expect(
        ParseUser.logInWithAdditionalAuth('username', 'password', '')
      ).rejects.toThrowError(new ParseError(ParseError.OTHER_CAUSE, 'Auth must be an object.'));
    });
  });

  it('preserves changes when logging in', done => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request(method, path, body) {
        expect(method).toBe('POST');
        expect(path).toBe('login');
        expect(body.username).toBe('username');
        expect(body.password).toBe('password');

        return Promise.resolve(
          {
            objectId: 'uid3',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });
    const u = new ParseUser({
      username: 'username',
      password: 'password',
    });
    u.set('count', 5);
    u.logIn().then(() => {
      expect(u.id).toBe('uid3');
      expect(u.dirtyKeys()).toEqual(['count']);
      expect(u.get('count')).toBe(5);
      done();
    });
  });

  it('does not allow loginAs without id', done => {
    try {
      ParseUser.loginAs(null, null);
    } catch (e) {
      expect(e.message).toBe('Cannot log in as user with an empty user id');
      done();
    }
  });

  it('can login as a user with an objectId', async () => {
    ParseUser.disableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request(method, path, body, options) {
        expect(method).toBe('POST');
        expect(path).toBe('loginAs');
        expect(body.userId).toBe('uid4');
        expect(options.useMasterKey).toBe(true);

        return Promise.resolve(
          {
            objectId: 'uid4',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });

    const user = await ParseUser.loginAs('uid4');
    expect(user.id).toBe('uid4');
    expect(user.isCurrent()).toBe(false);
    expect(user.existed()).toBe(true);
  });

  it('can loginAs a user with async storage', async () => {
    const currentStorage = CoreManager.getStorageController();
    CoreManager.setStorageController(mockAsyncStorage);
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request(method, path, body, options) {
        expect(method).toBe('POST');
        expect(path).toBe('loginAs');
        expect(body.userId).toBe('uid5');
        expect(options.useMasterKey).toBe(true);
        return Promise.resolve(
          {
            objectId: 'uid5',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });

    const user = await ParseUser.loginAs('uid5');
    expect(user.id).toBe('uid5');
    expect(user.isCurrent()).toBe(true);
    expect(user.existed()).toBe(true);
    CoreManager.setStorageController(currentStorage);
  });

  it('can become a user with a session token', done => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request(method, path, _body, options) {
        expect(method).toBe('GET');
        expect(path).toBe('users/me');
        expect(options.sessionToken).toBe('123abc');

        return Promise.resolve(
          {
            objectId: 'uid3',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });

    ParseUser.become('123abc').then(u => {
      expect(u.id).toBe('uid3');
      expect(u.isCurrent()).toBe(true);
      expect(u.existed()).toBe(true);
      done();
    });
  });

  it('can become a user with async storage', async () => {
    const currentStorage = CoreManager.getStorageController();
    CoreManager.setStorageController(mockAsyncStorage);
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request(method, path, _body, options) {
        expect(method).toBe('GET');
        expect(path).toBe('users/me');
        expect(options.sessionToken).toBe('123abc');
        expect(options.useMasterKey).toBe(true);
        return Promise.resolve(
          {
            objectId: 'uid3',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });

    const u = await ParseUser.become('123abc', { useMasterKey: true });
    expect(u.id).toBe('uid3');
    expect(u.isCurrent()).toBe(true);
    expect(u.existed()).toBe(true);
    CoreManager.setStorageController(currentStorage);
  });

  it('cannot get synchronous current user with async storage', async () => {
    const StorageController = CoreManager.getStorageController();
    CoreManager.setStorageController(mockAsyncStorage);
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    expect(() => {
      ParseUser.current();
    }).toThrow(
      'Cannot call currentUser() when using a platform with an async storage system. Call currentUserAsync() instead.'
    );

    CoreManager.setStorageController(StorageController);
  });

  it('can hydrate a user with sessionToken in server environment', async () => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    const user = await ParseUser.hydrate({
      objectId: 'uid3',
      username: 'username',
      sessionToken: '123abc',
    });
    expect(user.id).toBe('uid3');
    expect(user.isCurrent()).toBe(true);
    expect(user.existed()).toBe(true);
  });

  it('can hydrate a user with sessionToken in non server environment', async () => {
    ParseUser.disableUnsafeCurrentUser();
    ParseUser._clearCache();
    const user = await ParseUser.hydrate({
      objectId: 'uid3',
      username: 'username',
      sessionToken: '123abc',
    });
    expect(user.id).toBe('uid3');
    expect(user.isCurrent()).toBe(false);
    expect(user.existed()).toBe(true);
  });

  it('can hydrate a user without sessionToken', async () => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    await ParseUser.logOut();
    const user = await ParseUser.hydrate({
      objectId: 'uid3',
      username: 'username',
    });
    expect(user.id).toBe('uid3');
    expect(user.isCurrent()).toBe(false);
    expect(user.existed()).toBe(true);
  });

  it('can send a password reset request', () => {
    CoreManager.setRESTController({
      request(method, path, body) {
        expect(method).toBe('POST');
        expect(path).toBe('requestPasswordReset');
        expect(body).toEqual({ email: 'me@parse.com' });

        return Promise.resolve({}, 200);
      },
      ajax() {},
    });

    ParseUser.requestPasswordReset('me@parse.com');

    CoreManager.setRESTController({
      request(method, path, body, options) {
        expect(method).toBe('POST');
        expect(path).toBe('requestPasswordReset');
        expect(body).toEqual({ email: 'me@parse.com' });
        expect(options.useMasterKey).toBe(true);
        return Promise.resolve({}, 200);
      },
      ajax() {},
    });

    ParseUser.requestPasswordReset('me@parse.com', { useMasterKey: true });
  });

  it('can log out a user', done => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid5',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });
    ParseUser.logIn('username', 'password')
      .then(u => {
        expect(ParseUser.current()).toBe(u);
        CoreManager.setRESTController({
          request() {
            // Shouldn't be called
            expect(true).toBe(false);
            return Promise.resolve({}, 200);
          },
          ajax() {},
        });
        return ParseUser.logOut();
      })
      .then(() => {
        expect(ParseUser.current()).toBe(null);
        done();
      });
  });

  it('can revoke a session on logout', done => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid6',
            username: 'username',
            sessionToken: 'r:123abc',
          },
          200
        );
      },
      ajax() {},
    });
    ParseUser.logIn('username', 'password')
      .then(u => {
        expect(ParseUser.current()).toBe(u);
        CoreManager.setRESTController({
          request(method, path, _body, options) {
            expect(method).toBe('POST');
            expect(path).toBe('logout');
            expect(options).toEqual({
              sessionToken: 'r:123abc',
            });
            return Promise.resolve({}, 200);
          },
          ajax() {},
        });
        return ParseUser.logOut();
      })
      .then(() => {
        expect(ParseUser.current()).toBe(null);
        done();
      });
  });

  it('can get the current user asynchronously', done => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    Storage._clear();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid6',
            username: 'username',
            sessionToken: 'r:123abc',
          },
          200
        );
      },
      ajax() {},
    });

    ParseUser.currentAsync()
      .then(u => {
        expect(u).toBe(null);
        return ParseUser.logIn('username', 'password');
      })
      .then(u => {
        expect(u instanceof ParseUser).toBe(true);
        return ParseUser.currentAsync();
      })
      .then(u => {
        expect(u instanceof ParseUser).toBe(true);
        expect(u.getUsername()).toBe('username');
        expect(u.id).toBe('uid6');

        ParseUser.disableUnsafeCurrentUser();
        return ParseUser.currentAsync();
      })
      .then(u => {
        expect(u).toBe(null);
        done();
      });
  });

  it('can inflate users stored from previous SDK versions', done => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    Storage._clear();
    const path = Storage.generatePath('currentUser');
    Storage.setItem(
      path,
      JSON.stringify({
        _id: 'abc',
        _sessionToken: '12345',
        objectId: 'abc',
        username: 'bob',
        count: 12,
      })
    );
    ParseUser.currentAsync().then(u => {
      expect(u instanceof ParseUser).toBe(true);
      expect(u.getUsername()).toBe('bob');
      expect(u.id).toBe('abc');
      expect(u.getSessionToken()).toBe('12345');

      ParseUser._clearCache();
      const user = ParseUser.current();
      expect(user instanceof ParseUser).toBe(true);
      expect(user.getUsername()).toBe('bob');
      expect(user.id).toBe('abc');
      expect(user.getSessionToken()).toBe('12345');
      done();
    });
  });

  it('can inflate users stored from previous SDK versions override _id', done => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    Storage._clear();
    const path = Storage.generatePath('currentUser');
    Storage.setItem(
      path,
      JSON.stringify({
        _id: 'abc',
        _sessionToken: '12345',
        objectId: 'SET',
        username: 'bob',
        count: 12,
      })
    );
    ParseUser.currentAsync().then(u => {
      expect(u instanceof ParseUser).toBe(true);
      expect(u.getUsername()).toBe('bob');
      expect(u.id).toBe('abc');
      expect(u.getSessionToken()).toBe('12345');

      ParseUser._clearCache();
      const user = ParseUser.current();
      expect(user instanceof ParseUser).toBe(true);
      expect(user.getUsername()).toBe('bob');
      expect(user.id).toBe('abc');
      expect(user.getSessionToken()).toBe('12345');
      done();
    });
  });

  it('updates the current user on disk when saved', done => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    Storage._clear();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid5',
          },
          201
        );
      },
      ajax() {},
    });

    ParseUser.signUp('updater', 'password')
      .then(u => {
        expect(u.isCurrent()).toBe(true);
        ParseUser._clearCache();
        CoreManager.setRESTController({
          request() {
            return Promise.resolve({}, 200);
          },
          ajax() {},
        });
        return u.save({ count: 12 });
      })
      .then(u => {
        ParseUser._clearCache();
        ParseObject._clearAllState();
        expect(u.attributes).toEqual({});
        expect(u.get('count')).toBe(undefined);
        return ParseUser.currentAsync();
      })
      .then(current => {
        expect(current.id).toBe('uid5');
        expect(current.get('count')).toBe(12);
        done();
      });
  });

  it('removes the current user from disk when destroyed', async () => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    Storage._clear();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid9',
          },
          201
        );
      },
      ajax() {},
    });

    const u = await ParseUser.signUp('destroyed', 'password');
    expect(u.isCurrent()).toBe(true);
    CoreManager.setRESTController({
      request() {
        return Promise.resolve({}, 200);
      },
      ajax() {},
    });
    await u.destroy();

    expect(ParseUser.current()).toBe(null);
    const current = await ParseUser.currentAsync();

    expect(current).toBe(null);
    await u.destroy();
  });

  it('updates the current user on disk when fetched', done => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    Storage._clear();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid6',
          },
          200
        );
      },
      ajax() {},
    });

    ParseUser.signUp('spot', 'fetch')
      .then(u => {
        expect(u.isCurrent()).toBe(true);
        ParseUser._clearCache();
        CoreManager.setRESTController({
          request() {
            return Promise.resolve(
              {
                count: 15,
              },
              200
            );
          },
          ajax() {},
        });
        return u.fetch();
      })
      .then(u => {
        ParseUser._clearCache();
        ParseObject._clearAllState();
        expect(u.attributes).toEqual({});
        expect(u.get('count')).toBe(undefined);
        return ParseUser.currentAsync();
      })
      .then(current => {
        expect(current.id).toBe('uid6');
        expect(current.get('count')).toBe(15);
        done();
      });
  });

  it('updates the current user on disk when fetched with include', async () => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    Storage._clear();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid6',
          },
          200
        );
      },
      ajax() {},
    });
    const child = new ParseObject('TestObject');
    child.set('foo', 'bar');
    await child.save();

    let u = await ParseUser.signUp('spot', 'fetchWithInclude');
    expect(u.isCurrent()).toBe(true);
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            child: child.toJSON(),
            count: 15,
          },
          200
        );
      },
      ajax() {},
    });
    u = await u.fetchWithInclude('child');

    ParseUser._clearCache();
    ParseObject._clearAllState();
    expect(u.attributes).toEqual({});
    expect(u.get('count')).toBe(undefined);
    const current = await ParseUser.currentAsync();
    expect(current.id).toBe('uid6');
    expect(current.get('count')).toBe(15);
    expect(current.get('child').foo).toBe('bar');
  });

  it('does not update non-auth user when fetched with include', async () => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    Storage._clear();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid6',
          },
          200
        );
      },
      ajax() {},
    });
    const child = new ParseObject('TestObject');
    child.set('foo', 'bar');
    await child.save();

    const u = await ParseUser.signUp('spot', 'fetchWithInclude');
    await ParseUser.logOut();
    expect(u.isCurrent()).toBe(false);
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            child: child.toJSON(),
            count: 15,
          },
          200
        );
      },
      ajax() {},
    });
    const fetchedUser = await u.fetchWithInclude('child');

    const current = await ParseUser.currentAsync();
    expect(current).toBe(null);
    expect(fetchedUser.get('count')).toBe(15);
    expect(fetchedUser.get('child').foo).toBe('bar');
  });

  it('clears the current user on disk when logged out', done => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    Storage._clear();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid5',
          },
          201
        );
      },
      ajax() {},
    });

    const path = Storage.generatePath('currentUser');
    ParseUser.signUp('temporary', 'password')
      .then(u => {
        expect(u.isCurrent()).toBe(true);
        expect(Storage.getItem(path)).not.toBe(null);
        ParseUser._clearCache();
        CoreManager.setRESTController({
          request() {
            return Promise.resolve({}, 200);
          },
          ajax() {},
        });
        return ParseUser.logOut();
      })
      .then(() => {
        ParseUser._clearCache();
        expect(ParseUser.current()).toBe(null);
        expect(Storage.getItem(path)).toBe(null);
        done();
      });
  });

  it('can retreive a user with sessionToken (me)', async () => {
    ParseUser.disableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request(method, path, _body, options) {
        expect(method).toBe('GET');
        expect(path).toBe('users/me');
        expect(options.sessionToken).toBe('123abc');
        return Promise.resolve(
          {
            objectId: 'uid3',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });

    const user = await ParseUser.me('123abc');
    expect(user.id).toBe('uid3');
    expect(user.isCurrent()).toBe(false);
    expect(user.existed()).toBe(true);
  });

  it('can retreive a user with sessionToken and masterKey(me)', async () => {
    ParseUser.disableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request(method, path, _body, options) {
        expect(method).toBe('GET');
        expect(path).toBe('users/me');
        expect(options.sessionToken).toBe('123abc');
        expect(options.useMasterKey).toBe(true);
        return Promise.resolve(
          {
            objectId: 'uid3',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });

    const user = await ParseUser.me('123abc', { useMasterKey: true });
    expect(user.id).toBe('uid3');
    expect(user.isCurrent()).toBe(false);
    expect(user.existed()).toBe(true);
  });

  it('can logout user with sessionToken', async () => {
    ParseUser.disableUnsafeCurrentUser();
    ParseUser._clearCache();
    Storage._clear();
    const RESTController = {
      request() {
        return Promise.resolve({}, 200);
      },
      ajax() {},
    };
    jest.spyOn(RESTController, 'request');
    CoreManager.setRESTController(RESTController);

    await ParseUser.logOut({ sessionToken: '1234' });

    expect(RESTController.request).toHaveBeenCalledWith(
      'POST',
      'logout',
      {},
      { sessionToken: '1234' }
    );
  });

  it('can get error when recursive _linkWith call fails', done => {
    CoreManager.setRESTController({
      request(method, path, body) {
        expect(method).toBe('POST');
        expect(path).toBe('users');
        expect(body.authData.test).toEqual({
          id: 'id',
          access_token: 'access_token',
        });
        const error = new ParseError(
          ParseError.ACCOUNT_ALREADY_LINKED,
          'Another user is already linked to this facebook id.'
        );
        return Promise.reject(error);
      },
      ajax() {},
    });
    const provider = {
      authenticate(options) {
        if (options.success) {
          options.success(this, {
            id: 'id',
            access_token: 'access_token',
          });
        }
      },

      restoreAuthentication() {},

      getAuthType() {
        return 'test';
      },

      deauthenticate() {},
    };

    ParseUser.logInWith(provider, {}).then(
      () => {
        // Should not run
      },
      error => {
        expect(error.code).toBe(ParseError.ACCOUNT_ALREADY_LINKED);
        expect(error.message).toBe('Another user is already linked to this facebook id.');
        done();
      }
    );
  });

  it('can sync anonymous user with current user', async () => {
    const provider = AnonymousUtils._getAuthProvider();
    expect(AnonymousUtils.isRegistered()).toBe(true);

    jest.spyOn(provider, 'restoreAuthentication');

    const object = new ParseUser();
    object.set('authData', provider.getAuthData());

    jest.spyOn(object, 'isCurrent').mockImplementationOnce(() => true);

    const spy = jest
      .spyOn(ParseUser, 'currentAsync')
      .mockImplementationOnce(() => Promise.resolve(object));

    ParseUser._registerAuthenticationProvider(provider);

    await flushPromises();

    expect(ParseUser.currentAsync).toHaveBeenCalledTimes(1);
    expect(provider.restoreAuthentication).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('can strip anonymous user on linkWith', async () => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uidstrip',
            sessionToken: 'r:123abc',
            authData: {
              anonymous: {
                id: 'anonymousId',
              },
            },
          },
          200
        );
      },
      ajax() {},
    });
    const user = await AnonymousUtils.logIn();

    expect(user.get('authData').anonymous).toBeDefined();

    ParseUser._setCurrentUserCache(user);

    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uidstrip',
            sessionToken: 'r:123abc',
            authData: {
              test: {
                id: 'id',
                access_token: 'access_token',
              },
            },
          },
          200
        );
      },
      ajax() {},
    });
    const provider = {
      authenticate(options) {
        if (options.success) {
          options.success(this, {
            id: 'id',
            access_token: 'access_token',
          });
        }
      },
      restoreAuthentication() {},
      getAuthType() {
        return 'test';
      },
      deauthenticate() {},
    };

    await user.linkWith(provider, null, { useMasterKey: true });

    expect(user.get('authData')).toEqual({
      test: { id: 'id', access_token: 'access_token' },
    });
  });

  it('can restore anonymous user on linkWith failure', async () => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uidrestore',
            sessionToken: 'r:123abc',
            authData: {
              anonymous: {
                id: 'anonymousId',
              },
            },
          },
          200
        );
      },
      ajax() {},
    });
    const user = await AnonymousUtils.logIn();
    expect(user.get('authData').anonymous).toBeDefined();

    ParseUser._setCurrentUserCache(user);

    const provider = {
      authenticate(options) {
        if (options.success) {
          options.success(this, {
            id: 'id',
            access_token: 'access_token',
          });
        }
      },
      restoreAuthentication() {},
      getAuthType() {
        return 'test';
      },
      deauthenticate() {},
    };

    const UserController = CoreManager.getUserController();
    CoreManager.setUserController({
      linkWith(user) {
        expect(user.get('authData').anonymous).toEqual(null);
        return Promise.reject('authentication error');
      },
      currentUserAsync() {},
      setCurrentUser() {},
      currentUser() {},
      signUp() {},
      logIn() {},
      become() {},
      logOut() {},
      me() {},
      requestPasswordReset() {},
      upgradeToRevocableSession() {},
      requestEmailVerification() {},
      verifyPassword() {},
    });
    try {
      await user.linkWith(provider, null, { useMasterKey: true });
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBe('authentication error');
    }
    expect(user.get('authData')).toEqual({ anonymous: { id: 'anonymousId' } });
    CoreManager.setUserController(UserController);
  });

  it('can logout anonymous user', async () => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid5',
            sessionToken: 'r:123abc',
            authData: {
              anonymous: {
                id: 'anonymousId',
              },
            },
          },
          200
        );
      },
      ajax() {},
    });
    const user = await AnonymousUtils.logIn();
    jest.spyOn(user, 'destroy');
    ParseUser._setCurrentUserCache(user);

    await ParseUser.logOut();
    expect(ParseUser.current()).toBe(null);
  });

  it('can unlink', async () => {
    const provider = AnonymousUtils._getAuthProvider();
    ParseUser._registerAuthenticationProvider(provider);
    const user = new ParseUser();
    jest.spyOn(user, 'linkWith');
    user._unlinkFrom(provider);
    expect(user.linkWith).toHaveBeenCalledTimes(1);
    expect(user.linkWith).toHaveBeenCalledWith(provider, { authData: null }, undefined);
  });

  it('can unlink with options', async () => {
    const provider = AnonymousUtils._getAuthProvider();
    ParseUser._registerAuthenticationProvider(provider);
    const user = new ParseUser();
    jest.spyOn(user, 'linkWith').mockImplementationOnce((authProvider, authData, saveOptions) => {
      expect(authProvider).toEqual(provider.getAuthType());
      expect(authData).toEqual({ authData: null });
      expect(saveOptions).toEqual({ useMasterKey: true });
      return Promise.resolve();
    });
    user._unlinkFrom(provider.getAuthType(), { useMasterKey: true });
    expect(user.linkWith).toHaveBeenCalledTimes(1);
  });

  it('can logout anonymous user when login new user', async () => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid5',
            sessionToken: 'r:123abc',
            authData: {
              anonymous: {
                id: 'anonymousId',
              },
            },
          },
          200
        );
      },
      ajax() {},
    });
    const user = await AnonymousUtils.logIn();
    jest.spyOn(user, 'destroy');
    ParseUser._setCurrentUserCache(user);

    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid2',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });
    await ParseUser.logIn('username', 'password');
    expect(ParseUser.current().id).not.toBe(user.id);
  });

  it('strip anonymity when we set username', () => {
    const user = new ParseUser();
    const authData = {
      anonymous: {
        id: 'anonymousId',
      },
    };
    user.set('authData', authData);
    expect(user.get('authData').anonymous.id).toBe('anonymousId');

    // Set username should strip anonymous authData
    user.setUsername('test');
    expect(user.getUsername()).toBe('test');
    expect(user.get('authData').anonymous).toBe(null);
  });

  it('maintains the session token when refetched', done => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    Storage._clear();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uidfetch',
            username: 'temporary',
            number: 123,
            sessionToken: 'abc141',
          },
          201
        );
      },
      ajax() {},
    });

    ParseUser.signUp('temporary', 'password').then(u => {
      expect(u.getSessionToken()).toBe('abc141');
      expect(u.get('number')).toBe(123);
      ParseUser._clearCache();

      const u2 = ParseObject.fromJSON(
        {
          objectId: 'uidfetch',
          className: '_User',
          username: 'temporary',
        },
        true
      );
      expect(u.getSessionToken()).toBe('abc141');
      expect(u2.getSessionToken()).toBe('abc141');
      expect(u.get('number')).toBe(undefined);
      expect(u2.get('number')).toBe(undefined);
      done();
    });
  });

  it('can linkWith options', async () => {
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request(_method, _path, _body, options) {
        expect(options).toEqual(expect.objectContaining({ useMasterKey: true }));
        return Promise.resolve(
          {
            objectId: 'uid5',
            sessionToken: 'r:123abc',
            authData: {
              test: {
                id: 'id',
                access_token: 'access_token',
              },
            },
          },
          200
        );
      },
      ajax() {},
    });
    const provider = {
      authenticate(options) {
        if (options.success) {
          options.success(this, {
            id: 'id',
            access_token: 'access_token',
          });
        }
      },
      restoreAuthentication() {},
      getAuthType() {
        return 'test';
      },
      deauthenticate() {},
    };

    const user = new ParseUser();
    await user._linkWith(provider, null, { useMasterKey: true });

    expect(user.get('authData')).toEqual({
      test: { id: 'id', access_token: 'access_token' },
    });
  });

  it('can linkWith async', async () => {
    const currentStorage = CoreManager.getStorageController();
    CoreManager.setStorageController(mockAsyncStorage);
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid5Async',
            sessionToken: 'r:123abc',
            authData: {
              test: {
                id: 'id',
                access_token: 'access_token',
              },
            },
          },
          200
        );
      },
      ajax() {},
    });
    const provider = {
      authenticate(options) {
        if (options.success) {
          options.success(this, {
            id: 'id',
            access_token: 'access_token',
          });
        }
      },
      restoreAuthentication() {},
      getAuthType() {
        return 'test';
      },
      deauthenticate() {},
    };

    const user = new ParseUser();
    await user.linkWith(provider, null, { useMasterKey: true });

    expect(user.get('authData')).toEqual({
      test: { id: 'id', access_token: 'access_token' },
    });
    CoreManager.setStorageController(currentStorage);
  });

  it('handle linkWith authentication failure', async () => {
    const provider = {
      authenticate(options) {
        if (options.error) {
          options.error(this, {
            message: 'authentication failed',
          });
        }
      },
      restoreAuthentication() {},
      getAuthType() {
        return 'test';
      },
      deauthenticate() {},
    };

    const user = new ParseUser();
    try {
      await user.linkWith(provider, null);
      expect(false).toBe(true);
    } catch (e) {
      expect(e.message).toBe('authentication failed');
    }
  });

  it('can linkWith if no provider', async () => {
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid6',
            sessionToken: 'r:123abc',
            authData: {
              testProvider: {
                id: 'test',
              },
            },
          },
          200
        );
      },
      ajax() {},
    });
    const user = new ParseUser();
    await user._linkWith('testProvider', { authData: { id: 'test' } });
    expect(user.get('authData')).toEqual({ testProvider: { id: 'test' } });

    jest.spyOn(user, 'linkWith');

    await user._unlinkFrom('testProvider');
    const authProvider = user.linkWith.mock.calls[0][0];
    expect(authProvider).toBe('testProvider');
  });

  it('cannot linkWith invalid authData', async () => {
    ParseUser._clearCache();
    const user = new ParseUser();
    user.set('authData', 1234);
    try {
      await user.linkWith('testProvider', { authData: { id: 'test' } });
      expect(false).toBe(true);
    } catch (e) {
      expect(e.message).toBe('Invalid type: authData field should be an object');
    }
  });

  it('_synchronizeAuthData can unlink on failure to restore auth ', async () => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();

    const provider = {
      restoreAuthentication() {
        return false;
      },
      getAuthType() {
        return 'test';
      },
    };

    const user = new ParseUser();
    user.id = 'sync123';
    user.set('authData', { test: true });

    ParseUser._setCurrentUserCache(user);
    jest.spyOn(user, '_unlinkFrom');
    user._synchronizeAuthData(provider);
    expect(user._unlinkFrom).toHaveBeenCalledTimes(1);
  });

  it('_isLinked', () => {
    const user = new ParseUser();
    const provider = {
      getAuthType: () => 'customAuth',
    };

    user.set('authData', { customAuth: true });
    expect(user._isLinked(provider)).toBe(true);
    expect(user._isLinked('customAuth')).toBe(true);

    user.set('authData', 1234);
    expect(user._isLinked(provider)).toBe(false);
  });

  it('_cleanupAuthData', () => {
    ParseUser.enableUnsafeCurrentUser();
    const user = new ParseUser();
    user.id = 'cleanupData1';
    user.set('authData', { toRemove: null, test: true });
    user._cleanupAuthData();
    expect(user.get('authData')).toEqual({ toRemove: null, test: true });

    ParseUser._setCurrentUserCache(user);
    user._cleanupAuthData();
    expect(user.get('authData')).toEqual({ test: true });

    user.set('authData', 1234);
    user._cleanupAuthData();
    expect(user.get('authData')).toEqual(1234);
  });

  it('_logOutWith', () => {
    const user = new ParseUser();
    user.id = 'logout1234';
    const provider = {
      deauthenticate: jest.fn(),
    };
    user._logOutWith(provider);
    expect(provider.deauthenticate).toHaveBeenCalledTimes(0);

    ParseUser._setCurrentUserCache(user);
    user._logOutWith(provider);
    expect(provider.deauthenticate).toHaveBeenCalledTimes(1);
  });

  it('_logInWith', async () => {
    ParseUser.disableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid10',
            sessionToken: 'r:123abc',
            authData: {
              test: {
                id: 'id',
                access_token: 'access_token',
              },
            },
          },
          200
        );
      },
      ajax() {},
    });
    const provider = {
      authenticate(options) {
        if (options.success) {
          options.success(this, {
            id: 'id',
            access_token: 'access_token',
          });
        }
      },
      restoreAuthentication() {},
      getAuthType() {
        return 'test';
      },
      deauthenticate() {},
    };

    const user = await ParseUser._logInWith(provider, null, {
      useMasterKey: true,
    });
    expect(user.get('authData')).toEqual({
      test: { id: 'id', access_token: 'access_token' },
    });
  });

  it('can encrypt user', async () => {
    CoreManager.set('ENCRYPTED_USER', true);
    CoreManager.set('ENCRYPTED_KEY', 'hello');

    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    Storage._clear();
    let u = null;
    CoreManager.setRESTController({
      request(method, path, body) {
        expect(method).toBe('POST');
        expect(path).toBe('login');
        expect(body.username).toBe('username');
        expect(body.password).toBe('password');

        return Promise.resolve(
          {
            objectId: 'uid2',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });
    u = await ParseUser.logIn('username', 'password');
    // Clear cache to read from disk
    ParseUser._clearCache();

    expect(u.id).toBe('uid2');
    expect(u.getSessionToken()).toBe('123abc');
    expect(u.isCurrent()).toBe(true);
    expect(u.authenticated()).toBe(true);

    const currentUser = ParseUser.current();
    expect(currentUser.id).toBe('uid2');

    ParseUser._clearCache();

    const currentUserAsync = await ParseUser.currentAsync();
    expect(currentUserAsync.id).toEqual('uid2');

    const path = Storage.generatePath('currentUser');
    const encryptedUser = Storage.getItem(path);
    const crypto = CoreManager.getCryptoController();
    const decryptedUser = crypto.decrypt(encryptedUser, 'hello');
    expect(JSON.parse(decryptedUser).objectId).toBe(u.id);

    CoreManager.set('ENCRYPTED_USER', false);
    CoreManager.set('ENCRYPTED_KEY', null);
    Storage._clear();
  });

  it('can encrypt user with custom CryptoController', async () => {
    CoreManager.set('ENCRYPTED_USER', true);
    CoreManager.set('ENCRYPTED_KEY', 'hello');
    const ENCRYPTED_DATA = 'encryptedString';

    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    Storage._clear();
    let u = null;
    CoreManager.setRESTController({
      request(method, path, body) {
        expect(method).toBe('POST');
        expect(path).toBe('login');
        expect(body.username).toBe('username');
        expect(body.password).toBe('password');

        return Promise.resolve(
          {
            objectId: 'uid2',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });
    const CustomCrypto = {
      encrypt(_obj, secretKey) {
        expect(secretKey).toBe('hello');
        return ENCRYPTED_DATA;
      },
      decrypt(encryptedText, secretKey) {
        expect(encryptedText).toBe(ENCRYPTED_DATA);
        expect(secretKey).toBe('hello');
        return JSON.stringify(u.toJSON());
      },
    };
    CoreManager.setCryptoController(CustomCrypto);
    u = await ParseUser.logIn('username', 'password');
    // Clear cache to read from disk
    ParseUser._clearCache();

    expect(u.id).toBe('uid2');
    expect(u.getSessionToken()).toBe('123abc');
    expect(u.isCurrent()).toBe(true);
    expect(u.authenticated()).toBe(true);
    expect(ParseUser.current().id).toBe('uid2');

    const path = Storage.generatePath('currentUser');
    const userStorage = Storage.getItem(path);
    expect(userStorage).toBe(ENCRYPTED_DATA);
    CoreManager.set('ENCRYPTED_USER', false);
    CoreManager.set('ENCRYPTED_KEY', null);
    Storage._clear();
  });

  it('can static signup a user with installationId', async () => {
    ParseUser.disableUnsafeCurrentUser();
    ParseUser._clearCache();
    const installationId = '12345678';
    CoreManager.setRESTController({
      request(method, path, _body, options) {
        expect(method).toBe('POST');
        expect(path).toBe('users');
        expect(options.installationId).toBe(installationId);
        expect(options.useMasterKey).toBe(true);
        return Promise.resolve(
          {
            objectId: 'uid3',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });

    const user = await ParseUser.signUp('username', 'password', null, {
      installationId,
      useMasterKey: true,
    });
    expect(user.id).toBe('uid3');
    expect(user.isCurrent()).toBe(false);
    expect(user.existed()).toBe(true);
  });

  it('can signup a user with installationId', async () => {
    ParseUser.disableUnsafeCurrentUser();
    ParseUser._clearCache();
    const installationId = '12345678';
    CoreManager.setRESTController({
      request(method, path, _body, options) {
        expect(method).toBe('POST');
        expect(path).toBe('users');
        expect(options.installationId).toBe(installationId);
        return Promise.resolve(
          {
            objectId: 'uid3',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });

    const user = new ParseUser();
    user.setUsername('name');
    user.setPassword('pass');
    await user.signUp(null, { installationId });
    expect(user.id).toBe('uid3');
    expect(user.isCurrent()).toBe(false);
    expect(user.existed()).toBe(true);
  });

  it('can signup with context', async () => {
    CoreManager.setRESTController({
      ajax() {},
      request() {
        return Promise.resolve(
          {
            objectId: 'uid3',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
    });
    const controller = CoreManager.getRESTController();
    jest.spyOn(controller, 'request');
    const context = { a: 'a' };
    const user = new ParseUser();
    user.setUsername('name');
    user.setPassword('pass');
    await user.signUp(null, { context });
    expect(controller.request.mock.calls[0][3].context).toEqual(context);
  });

  it('can login with context', async () => {
    CoreManager.setRESTController({
      ajax() {},
      request() {
        return Promise.resolve(
          {
            objectId: 'uid33',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
    });
    const controller = CoreManager.getRESTController();
    jest.spyOn(controller, 'request');
    const context = { a: 'a' };
    await ParseUser.logIn('username', 'password', { context });
    expect(controller.request.mock.calls[0][3].context).toEqual(context);
  });

  it('can verify user password', async () => {
    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid2',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });
    const user = await ParseUser.verifyPassword('username', 'password');
    expect(user.objectId).toBe('uid2');
    expect(user.username).toBe('username');

    const notStatic = new ParseUser();
    notStatic.setUsername('username');
    const userAgain = await notStatic.verifyPassword('password', {
      useMasterKey: true,
    });
    expect(userAgain.objectId).toBe('uid2');
    expect(userAgain.username).toBe('username');

    CoreManager.setRESTController({
      request() {
        const parseError = new ParseError(
          ParseError.OBJECT_NOT_FOUND,
          'Invalid username/password.'
        );
        return Promise.reject(parseError);
      },
      ajax() {},
    });

    try {
      await ParseUser.verifyPassword('username', 'wrong password');
    } catch (error) {
      expect(error.code).toBe(101);
      expect(error.message).toBe('Invalid username/password.');
    }
    try {
      await ParseUser.verifyPassword(null, 'password');
    } catch (error) {
      expect(error.code).toBe(-1);
      expect(error.message).toBe('Username must be a string.');
    }

    try {
      await ParseUser.verifyPassword('username', null);
    } catch (error) {
      expect(error.code).toBe(-1);
      expect(error.message).toBe('Password must be a string.');
    }
  });

  it('can send an email verification request', () => {
    CoreManager.setRESTController({
      request(method, path, body) {
        expect(method).toBe('POST');
        expect(path).toBe('verificationEmailRequest');
        expect(body).toEqual({ email: 'me@parse.com' });

        return Promise.resolve({}, 200);
      },
      ajax() {},
    });

    ParseUser.requestEmailVerification('me@parse.com');

    CoreManager.setRESTController({
      request(method, path, body, options) {
        expect(method).toBe('POST');
        expect(path).toBe('verificationEmailRequest');
        expect(body).toEqual({ email: 'me@parse.com' });
        expect(options.useMasterKey).toBe(true);
        return Promise.resolve({}, 200);
      },
      ajax() {},
    });
    ParseUser.requestEmailVerification('me@parse.com', { useMasterKey: true });
  });

  it('allowCustomUserClass', () => {
    expect(CoreManager.get('PERFORM_USER_REWRITE')).toBe(true);
    ParseUser.allowCustomUserClass(true);
    expect(CoreManager.get('PERFORM_USER_REWRITE')).toBe(false);
    ParseUser.allowCustomUserClass(false);
    expect(CoreManager.get('PERFORM_USER_REWRITE')).toBe(true);
  });

  it('enableRevocableSession', async () => {
    const result = await ParseUser.enableRevocableSession();
    expect(CoreManager.get('FORCE_REVOCABLE_SESSION')).toBe(true);
    expect(result).toBeUndefined();

    ParseUser.enableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid2',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });
    const user = await ParseUser.logIn('username', 'password');
    jest.spyOn(user, '_upgradeToRevocableSession');
    await ParseUser.enableRevocableSession({ useMasterKey: true });
    expect(user._upgradeToRevocableSession).toHaveBeenCalled();
  });

  it('upgradeToRevocableSession', async () => {
    try {
      const unsavedUser = new ParseUser();
      await unsavedUser._upgradeToRevocableSession();
    } catch (e) {
      expect(e.message).toBe('Cannot upgrade a user with no session token');
    }

    ParseUser.disableUnsafeCurrentUser();
    ParseUser._clearCache();
    CoreManager.setRESTController({
      request() {
        return Promise.resolve(
          {
            objectId: 'uid2',
            username: 'username',
            sessionToken: '123abc',
          },
          200
        );
      },
      ajax() {},
    });
    const user = await ParseUser.logIn('username', 'password');
    const upgradedUser = await user._upgradeToRevocableSession();
    expect(user).toEqual(upgradedUser);
  });

  it('extend', () => {
    let CustomUser = ParseUser.extend();
    expect(CustomUser instanceof ParseUser);

    CustomUser = ParseUser.extend(
      { test: true, className: 'Item' },
      { test: false, className: 'Item' }
    );
    expect(CustomUser instanceof ParseUser);

    const user = new CustomUser();
    expect(user.test).toBe(true);
  });
});
