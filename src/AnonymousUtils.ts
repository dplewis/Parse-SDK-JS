import ParseUser from './ParseUser';
import type { RequestOptions } from './RESTController';
import uuidv4 from './uuid';

let registered = false;

/**
 * Provides utility functions for working with Anonymously logged-in users. <br />
 * Anonymous users have some unique characteristics:
 * <ul>
 *  <li>Anonymous users don't need a user name or password.</li>
 *  <ul>
 *    <li>Once logged out, an anonymous user cannot be recovered.</li>
 *  </ul>
 *  <li>signUp converts an anonymous user to a standard user with the given username and password.</li>
 *  <ul>
 *    <li>Data associated with the anonymous user is retained.</li>
 *  </ul>
 *  <li>logIn switches users without converting the anonymous user.</li>
 *  <ul>
 *    <li>Data associated with the anonymous user will be lost.</li>
 *  </ul>
 *  <li>Service logIn (e.g. Facebook, Twitter) will attempt to convert
 *  the anonymous user into a standard user by linking it to the service.</li>
 *  <ul>
 *    <li>If a user already exists that is linked to the service, it will instead switch to the existing user.</li>
 *  </ul>
 *  <li>Service linking (e.g. Facebook, Twitter) will convert the anonymous user
 *  into a standard user by linking it to the service.</li>
 * </ul>
 *
 * @class Parse.AnonymousUtils
 * @static
 */
const AnonymousUtils = {
  /**
   * Gets whether the user has their account linked to anonymous user.
   *
   * @function isLinked
   * @name Parse.AnonymousUtils.isLinked
   * @param {Parse.User} user User to check for.
   *     The user must be logged in on this device.
   * @returns {boolean} <code>true</code> if the user has their account
   *     linked to an anonymous user.
   * @static
   */
  isLinked(user: ParseUser): boolean {
    const provider = this._getAuthProvider();
    return user._isLinked(provider.getAuthType());
  },

  /**
   * Logs in a user Anonymously.
   *
   * @function logIn
   * @name Parse.AnonymousUtils.logIn
   * @param {object} options MasterKey / SessionToken.
   * @returns {Promise} Logged in user
   * @static
   */
  logIn(options?: RequestOptions): Promise<ParseUser> {
    const provider = this._getAuthProvider();
    return ParseUser.logInWith(provider.getAuthType(), provider.getAuthData(), options);
  },

  /**
   * Links Anonymous User to an existing PFUser.
   *
   * @function link
   * @name Parse.AnonymousUtils.link
   * @param {Parse.User} user User to link. This must be the current user.
   * @param {object} options MasterKey / SessionToken.
   * @returns {Promise} Linked with User
   * @static
   */
  link(user: ParseUser, options?: RequestOptions): Promise<ParseUser> {
    const provider = this._getAuthProvider();
    return user.linkWith(provider.getAuthType(), provider.getAuthData(), options);
  },

  /**
   * Returns true if Authentication Provider has been registered for use.
   *
   * @function isRegistered
   * @name Parse.AnonymousUtils.isRegistered
   * @returns {boolean}
   * @static
   */
  isRegistered(): boolean {
    return registered;
  },

  _getAuthProvider() {
    const provider = {
      restoreAuthentication() {
        return true;
      },

      getAuthType() {
        return 'anonymous';
      },

      getAuthData() {
        return {
          authData: {
            id: uuidv4(),
          },
        };
      },
    };
    if (!registered) {
      ParseUser._registerAuthenticationProvider(provider);
      registered = true;
    }
    return provider;
  },
};

export default AnonymousUtils;
