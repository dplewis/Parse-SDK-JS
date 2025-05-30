import CoreManager from './CoreManager';
import { resolvingPromise } from './promiseUtils';
import type ParseQuery from './ParseQuery';
import type { EventEmitter } from 'events';

/**
 * Creates a new LiveQuery Subscription.
 * <a href="https://nodejs.org/api/events.html#events_class_eventemitter">cloud functions</a>.
 *
 * <p>Response Object - Contains data from the client that made the request
 * <ul>
 * <li>clientId</li>
 * <li>installationId - requires Parse Server 4.0.0+</li>
 * </ul>
 * </p>
 *
 * <p>Open Event - When you call query.subscribe(), we send a subscribe request to
 * the LiveQuery server, when we get the confirmation from the LiveQuery server,
 * this event will be emitted. When the client loses WebSocket connection to the
 * LiveQuery server, we will try to auto reconnect the LiveQuery server. If we
 * reconnect the LiveQuery server and successfully resubscribe the ParseQuery,
 * you'll also get this event.
 *
 * <pre>
 * subscription.on('open', (response) => {
 *
 * });</pre></p>
 *
 * <p>Create Event - When a new ParseObject is created and it fulfills the ParseQuery you subscribe,
 * you'll get this event. The object is the ParseObject which is created.
 *
 * <pre>
 * subscription.on('create', (object, response) => {
 *
 * });</pre></p>
 *
 * <p>Update Event - When an existing ParseObject (original) which fulfills the ParseQuery you subscribe
 * is updated (The ParseObject fulfills the ParseQuery before and after changes),
 * you'll get this event. The object is the ParseObject which is updated.
 * Its content is the latest value of the ParseObject.
 *
 * Parse-Server 3.1.3+ Required for original object parameter
 *
 * <pre>
 * subscription.on('update', (object, original, response) => {
 *
 * });</pre></p>
 *
 * <p>Enter Event - When an existing ParseObject's (original) old value doesn't fulfill the ParseQuery
 * but its new value fulfills the ParseQuery, you'll get this event. The object is the
 * ParseObject which enters the ParseQuery. Its content is the latest value of the ParseObject.
 *
 * Parse-Server 3.1.3+ Required for original object parameter
 *
 * <pre>
 * subscription.on('enter', (object, original, response) => {
 *
 * });</pre></p>
 *
 *
 * <p>Update Event - When an existing ParseObject's old value fulfills the ParseQuery but its new value
 * doesn't fulfill the ParseQuery, you'll get this event. The object is the ParseObject
 * which leaves the ParseQuery. Its content is the latest value of the ParseObject.
 *
 * <pre>
 * subscription.on('leave', (object, response) => {
 *
 * });</pre></p>
 *
 *
 * <p>Delete Event - When an existing ParseObject which fulfills the ParseQuery is deleted, you'll
 * get this event. The object is the ParseObject which is deleted.
 *
 * <pre>
 * subscription.on('delete', (object, response) => {
 *
 * });</pre></p>
 *
 *
 * <p>Close Event - When the client loses the WebSocket connection to the LiveQuery
 * server and we stop receiving events, you'll get this event.
 *
 * <pre>
 * subscription.on('close', () => {
 *
 * });</pre></p>
 */
class LiveQuerySubscription {
  id: string | number;
  query: ParseQuery;
  sessionToken?: string;
  subscribePromise: any;
  unsubscribePromise: any;
  subscribed: boolean;
  emitter: EventEmitter;
  on: EventEmitter['on'];
  emit: EventEmitter['emit'];
  /*
   * @param {string | number} id - subscription id
   * @param {string} query - query to subscribe to
   * @param {string} sessionToken - optional session token
   */
  constructor(id: string | number, query: ParseQuery, sessionToken?: string) {
    this.id = id;
    this.query = query;
    this.sessionToken = sessionToken;
    this.subscribePromise = resolvingPromise();
    this.unsubscribePromise = resolvingPromise();
    this.subscribed = false;
    const Emitter = CoreManager.getEventEmitter();
    this.emitter = new Emitter();

    this.on = (eventName, listener) => this.emitter.on(eventName, listener);
    this.emit = (eventName, ...args) => this.emitter.emit(eventName, ...args);
    // adding listener so process does not crash
    // best practice is for developer to register their own listener
    this.on('error', () => {});
  }

  /**
   * Close the subscription
   *
   * @returns {Promise}
   */
  unsubscribe(): Promise<void> {
    return CoreManager.getLiveQueryController()
      .getDefaultLiveQueryClient()
      .then(liveQueryClient => {
        this.emit('close');
        return liveQueryClient.unsubscribe(this);
      });
  }
}

export default LiveQuerySubscription;
