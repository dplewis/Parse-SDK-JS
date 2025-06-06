/**
 * Creates a new GeoPoint with any of the following forms:<br>
 *   <pre>
 *   new GeoPoint(otherGeoPoint)
 *   new GeoPoint(30, 30)
 *   new GeoPoint([30, 30])
 *   new GeoPoint({latitude: 30, longitude: 30})
 *   new GeoPoint()  // defaults to (0, 0)
 *   </pre>
 * <p>Represents a latitude / longitude point that may be associated
 * with a key in a ParseObject or used as a reference point for geo queries.
 * This allows proximity-based queries on the key.</p>
 *
 * <p>Only one key in a class may contain a GeoPoint.</p>
 *
 * <p>Example:<pre>
 *   var point = new Parse.GeoPoint(30.0, -20.0);
 *   var object = new Parse.Object("PlaceObject");
 *   object.set("location", point);
 *   object.save();</pre></p>
 *
 * @alias Parse.GeoPoint
 */
/* global navigator */
class ParseGeoPoint {
  _latitude: number;
  _longitude: number;

  /**
   * @param {(number[] | object | number)} arg1 Either a list of coordinate pairs, an object with `latitude`, `longitude`, or the latitude or the point.
   * @param {number} arg2 The longitude of the GeoPoint
   */
  constructor(
    arg1?: [number, number] | { latitude: number; longitude: number } | number,
    arg2?: number
  ) {
    if (Array.isArray(arg1)) {
      ParseGeoPoint._validate(arg1[0], arg1[1]);
      this._latitude = arg1[0];
      this._longitude = arg1[1];
    } else if (typeof arg1 === 'object') {
      ParseGeoPoint._validate(arg1.latitude, arg1.longitude);
      this._latitude = arg1.latitude;
      this._longitude = arg1.longitude;
    } else if (arg1 !== undefined && arg2 !== undefined) {
      ParseGeoPoint._validate(arg1, arg2);
      this._latitude = arg1;
      this._longitude = arg2;
    } else {
      this._latitude = 0;
      this._longitude = 0;
    }
  }

  /**
   * North-south portion of the coordinate, in range [-90, 90].
   * Throws an exception if set out of range in a modern browser.
   *
   * @property {number} latitude
   * @returns {number}
   */
  get latitude(): number {
    return this._latitude;
  }

  set latitude(val: number) {
    ParseGeoPoint._validate(val, this.longitude);
    this._latitude = val;
  }

  /**
   * East-west portion of the coordinate, in range [-180, 180].
   * Throws if set out of range in a modern browser.
   *
   * @property {number} longitude
   * @returns {number}
   */
  get longitude(): number {
    return this._longitude;
  }

  set longitude(val: number) {
    ParseGeoPoint._validate(this.latitude, val);
    this._longitude = val;
  }

  /**
   * Returns a JSON representation of the GeoPoint, suitable for Parse.
   *
   * @returns {object}
   */
  toJSON(): { __type: string; latitude: number; longitude: number } {
    ParseGeoPoint._validate(this._latitude, this._longitude);
    return {
      __type: 'GeoPoint',
      latitude: this._latitude,
      longitude: this._longitude,
    };
  }

  equals(other: any): boolean {
    return (
      other instanceof ParseGeoPoint &&
      this.latitude === other.latitude &&
      this.longitude === other.longitude
    );
  }

  /**
   * Returns the distance from this GeoPoint to another in radians.
   *
   * @param {Parse.GeoPoint} point the other Parse.GeoPoint.
   * @returns {number}
   */
  radiansTo(point: ParseGeoPoint): number {
    const d2r = Math.PI / 180.0;
    const lat1rad = this.latitude * d2r;
    const long1rad = this.longitude * d2r;
    const lat2rad = point.latitude * d2r;
    const long2rad = point.longitude * d2r;
    const deltaLat = lat1rad - lat2rad;
    const deltaLong = long1rad - long2rad;
    const sinDeltaLatDiv2 = Math.sin(deltaLat / 2);
    const sinDeltaLongDiv2 = Math.sin(deltaLong / 2);
    // Square of half the straight line chord distance between both points.
    let a =
      sinDeltaLatDiv2 * sinDeltaLatDiv2 +
      Math.cos(lat1rad) * Math.cos(lat2rad) * sinDeltaLongDiv2 * sinDeltaLongDiv2;
    a = Math.min(1.0, a);
    return 2 * Math.asin(Math.sqrt(a));
  }

  /**
   * Returns the distance from this GeoPoint to another in kilometers.
   *
   * @param {Parse.GeoPoint} point the other Parse.GeoPoint.
   * @returns {number}
   */
  kilometersTo(point: ParseGeoPoint): number {
    return this.radiansTo(point) * 6371.0;
  }

  /**
   * Returns the distance from this GeoPoint to another in miles.
   *
   * @param {Parse.GeoPoint} point the other Parse.GeoPoint.
   * @returns {number}
   */
  milesTo(point: ParseGeoPoint): number {
    return this.radiansTo(point) * 3958.8;
  }

  /*
   * Throws an exception if the given lat-long is out of bounds.
   */
  static _validate(latitude: number, longitude: number) {
    if (
      isNaN(latitude) ||
      isNaN(longitude) ||
      typeof latitude !== 'number' ||
      typeof longitude !== 'number'
    ) {
      throw new TypeError('GeoPoint latitude and longitude must be valid numbers');
    }
    if (latitude < -90.0) {
      throw new TypeError('GeoPoint latitude out of bounds: ' + latitude + ' < -90.0.');
    }
    if (latitude > 90.0) {
      throw new TypeError('GeoPoint latitude out of bounds: ' + latitude + ' > 90.0.');
    }
    if (longitude < -180.0) {
      throw new TypeError('GeoPoint longitude out of bounds: ' + longitude + ' < -180.0.');
    }
    if (longitude > 180.0) {
      throw new TypeError('GeoPoint longitude out of bounds: ' + longitude + ' > 180.0.');
    }
  }

  /**
   * Creates a GeoPoint with the user's current location, if available.
   *
   * @param {object} options The options.
   * @param {boolean} [options.enableHighAccuracy] A boolean value that indicates the application would like to receive the best possible results.
   *  If true and if the device is able to provide a more accurate position, it will do so.
   *  Note that this can result in slower response times or increased power consumption (with a GPS chip on a mobile device for example).
   *  On the other hand, if false, the device can take the liberty to save resources by responding more quickly and/or using less power. Default: false.
   * @param {number} [options.timeout] A positive long value representing the maximum length of time (in milliseconds) the device is allowed to take in order to return a position.
   *  The default value is Infinity, meaning that getCurrentPosition() won't return until the position is available.
   * @param {number} [options.maximumAge] A positive long value indicating the maximum age in milliseconds of a possible cached position that is acceptable to return.
   *  If set to 0, it means that the device cannot use a cached position and must attempt to retrieve the real current position.
   *  If set to Infinity the device must return a cached position regardless of its age. Default: 0.
   * @static
   * @returns {Promise<Parse.GeoPoint>} User's current location
   */
  static current(options): Promise<ParseGeoPoint> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        location => {
          resolve(new ParseGeoPoint(location.coords.latitude, location.coords.longitude));
        },
        reject,
        options
      );
    });
  }
}

export default ParseGeoPoint;
