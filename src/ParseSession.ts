import CoreManager from './CoreManager';
import isRevocableSession from './isRevocableSession';
import ParseObject, { Attributes } from './ParseObject';
import ParseUser from './ParseUser';

import type { AttributeKey } from './ParseObject';
import type { RequestOptions, FullOptions } from './RESTController';

/**
 * <p>A Parse.Session object is a local representation of a revocable session.
 * This class is a subclass of a Parse.Object, and retains the same
 * functionality of a Parse.Object.</p>
 *
 * @alias Parse.Session
 * @augments Parse.Object
 */
class ParseSession<T extends Attributes = Attributes> extends ParseObject<T> {
  /**
   * @param {object} attributes The initial set of data to store in the user.
   */
  constructor(attributes?: T) {
    super('_Session');
    if (attributes && typeof attributes === 'object') {
      try {
        this.set((attributes || {}) as any);
      } catch (_) {
        throw new Error("Can't create an invalid Session");
      }
    }
  }

  /**
   * Returns the session token string.
   *
   * @returns {string}
   */
  getSessionToken(): string {
    const token = this.get('sessionToken' as AttributeKey<T>);
    if (typeof token === 'string') {
      return token;
    }
    return '';
  }

  static readOnlyAttributes(): string[] {
    return ['createdWith', 'expiresAt', 'installationId', 'restricted', 'sessionToken', 'user'];
  }

  /**
   * Retrieves the Session object for the currently logged in session.
   *
   * @param {object} options useMasterKey
   * @static
   * @returns {Promise} A promise that is resolved with the Parse.Session
   * object after it has been fetched. If there is no current user, the
   * promise will be rejected.
   */
  static current<T extends ParseSession>(options?: FullOptions): Promise<T> {
    const controller = CoreManager.getSessionController();
    const sessionOptions = ParseObject._getRequestOptions(options);

    return ParseUser.currentAsync().then(user => {
      if (!user) {
        return Promise.reject('There is no current user.');
      }
      sessionOptions.sessionToken = user.getSessionToken();
      return controller.getSession(sessionOptions) as Promise<T>;
    });
  }

  /**
   * Determines whether the current session token is revocable.
   * This method is useful for migrating Express.js or Node.js web apps to
   * use revocable sessions. If you are migrating an app that uses the Parse
   * SDK in the browser only, please use Parse.User.enableRevocableSession()
   * instead, so that sessions can be automatically upgraded.
   *
   * @static
   * @returns {boolean}
   */
  static isCurrentSessionRevocable(): boolean {
    const currentUser = ParseUser.current();
    if (currentUser) {
      return isRevocableSession(currentUser.getSessionToken() || '');
    }
    return false;
  }
}

ParseObject.registerSubclass('_Session', ParseSession);

const DefaultController = {
  getSession(options?: RequestOptions): Promise<ParseSession> {
    const RESTController = CoreManager.getRESTController();
    const session = new ParseSession();

    return RESTController.request('GET', 'sessions/me', {}, options).then(sessionData => {
      session._finishFetch(sessionData);
      session._setExisted(true);
      return session;
    });
  },
};

CoreManager.setSessionController(DefaultController);

export default ParseSession;
