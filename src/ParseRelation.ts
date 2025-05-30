import type ParseObject from './ParseObject';
import type ParseQuery from './ParseQuery';
import CoreManager from './CoreManager';

/**
 * Creates a new Relation for the given parent object and key. This
 * constructor should rarely be used directly, but rather created by
 * Parse.Object.relation.
 *
 * <p>
 * A class that is used to access all of the children of a many-to-many
 * relationship.  Each instance of Parse.Relation is associated with a
 * particular parent object and key.
 * </p>
 *
 * @alias Parse.Relation
 */
class ParseRelation<S extends ParseObject = ParseObject, T extends ParseObject = ParseObject> {
  parent?: S;
  key?: string;
  targetClassName?: string | null;

  /**
   * @param {Parse.Object} parent The parent of this relation.
   * @param {string} key The key for this relation on the parent.
   */
  constructor(parent?: S, key?: string) {
    this.parent = parent;
    this.key = key;
    this.targetClassName = null;
  }

  /*
   * Makes sure that this relation has the right parent and key.
   */
  _ensureParentAndKey(parent: S, key: string) {
    this.key = this.key || key;
    if (this.key !== key) {
      throw new Error('Internal Error. Relation retrieved from two different keys.');
    }
    if (this.parent) {
      if (this.parent.className !== parent.className) {
        throw new Error('Internal Error. Relation retrieved from two different Objects.');
      }
      if (this.parent.id) {
        if (this.parent.id !== parent.id) {
          throw new Error('Internal Error. Relation retrieved from two different Objects.');
        }
      } else if (parent.id) {
        this.parent = parent;
      }
    } else {
      this.parent = parent;
    }
  }

  /**
   * Adds a Parse.Object or an array of Parse.Objects to the relation.
   *
   * @param {(Parse.Object|Array)} objects The item or items to add.
   * @returns {Parse.Object} The parent of the relation.
   */
  add(objects: T | T[]): S {
    if (!Array.isArray(objects)) {
      objects = [objects];
    }
    const { RelationOp } = CoreManager.getParseOp();
    const change = new RelationOp(objects, []);
    const parent = this.parent;
    if (!parent) {
      throw new Error('Cannot add to a Relation without a parent');
    }
    if (objects.length === 0) {
      return parent;
    }
    parent.set(this.key, change);
    this.targetClassName = change._targetClassName;
    return parent;
  }

  /**
   * Removes a Parse.Object or an array of Parse.Objects from this relation.
   *
   * @param {(Parse.Object|Array)} objects The item or items to remove.
   */
  remove(objects: T | T[]): void {
    if (!Array.isArray(objects)) {
      objects = [objects];
    }
    const { RelationOp } = CoreManager.getParseOp();
    const change = new RelationOp([], objects);
    if (!this.parent) {
      throw new Error('Cannot remove from a Relation without a parent');
    }
    if (objects.length === 0) {
      return;
    }
    this.parent.set(this.key, change);
    this.targetClassName = change._targetClassName;
  }

  /**
   * Returns a JSON version of the object suitable for saving to disk.
   *
   * @returns {object} JSON representation of Relation
   */
  toJSON(): { __type: 'Relation'; className: string | null } {
    return {
      __type: 'Relation',
      className: this.targetClassName,
    };
  }

  /**
   * Returns a Parse.Query that is limited to objects in this
   * relation.
   *
   * @returns {Parse.Query} Relation Query
   */
  query(): ParseQuery<T> {
    let query;
    const parent = this.parent;
    if (!parent) {
      throw new Error('Cannot construct a query for a Relation without a parent');
    }
    const ParseQuery = CoreManager.getParseQuery();
    if (!this.targetClassName) {
      query = new ParseQuery(parent.className);
      query._extraOptions.redirectClassNameForKey = this.key;
    } else {
      query = new ParseQuery(this.targetClassName);
    }
    query._addCondition('$relatedTo', 'object', {
      __type: 'Pointer',
      className: parent.className,
      objectId: parent.id,
    });
    query._addCondition('$relatedTo', 'key', this.key);

    return query;
  }
}

export default ParseRelation;
