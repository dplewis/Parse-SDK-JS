jest.dontMock('../ParseFile');
jest.dontMock('../unsavedChildren');
jest.dontMock('../CoreManager');

function mockObject({ className, localId, id, attributes, dirty }) {
  this.className = className;
  this.localId = localId;
  this.id = id;
  this.attributes = attributes;
  this._dirty = !!dirty;
}
mockObject.registerSubclass = function () {};
mockObject.prototype = {
  _getId() {
    return this.id || this.localId;
  },
  dirty() {
    return this._dirty;
  },
};
jest.setMock('../ParseObject', {
  __esModule: true,
  default: mockObject,
});
const CoreManager = require('../CoreManager').default;
CoreManager.setParseObject(mockObject);

const ParseFile = require('../ParseFile').default;
const ParseObject = require('../ParseObject').default;
const ParseRelation = require('../ParseRelation').default;
const unsavedChildren = require('../unsavedChildren').default;

describe('unsavedChildren', () => {
  it('finds unsaved files', () => {
    const files = [
      new ParseFile('parse1.txt', [61, 170, 236, 120]),
      new ParseFile('parse2.txt', [61, 170, 236, 120]),
      new ParseFile('parse3.txt', [61, 170, 236, 120]),
    ];

    const f = new ParseObject({
      className: 'Folder',
      id: '121',
      attributes: {
        a: files[0],
        b: files[1],
        c: files[2],
      },
    });
    expect(unsavedChildren(f)).toEqual([files[0], files[1], files[2]]);

    f.attributes = {
      files: files,
    };
    expect(unsavedChildren(f)).toEqual([files[0], files[1], files[2]]);

    f.attributes = {
      files: {
        a: files[0],
        b: files[1],
        c: files[2],
      },
    };
    expect(unsavedChildren(f)).toEqual([files[0], files[1], files[2]]);
  });

  it('only returns unique files', () => {
    const file = new ParseFile('parse1.txt', [61, 170, 236, 120]);
    const f = new ParseObject({
      className: 'Folder',
      id: '121',
      attributes: {
        a: file,
        b: file,
        c: file,
      },
    });
    expect(unsavedChildren(f)).toEqual([file]);
  });

  it('finds unsaved child objects', () => {
    const a = new ParseObject({
      className: 'File',
      localId: 'local0',
      attributes: {},
      dirty: true,
    });
    const b = new ParseObject({
      className: 'File',
      localId: 'local1',
      attributes: {},
      dirty: true,
    });
    const f = new ParseObject({
      className: 'Folder',
      id: '121',
      attributes: {
        a: a,
        b: b,
      },
    });

    expect(unsavedChildren(f)).toEqual([a, b]);

    f.attributes = {
      contents: [a, b],
    };

    expect(unsavedChildren(f)).toEqual([a, b]);

    f.attributes = {
      contents: {
        a: a,
        b: b,
      },
    };

    expect(unsavedChildren(f)).toEqual([a, b]);
  });

  it('throws on nested objects without ids', () => {
    const a = new ParseObject({
      className: 'File',
      localId: 'local0',
      attributes: {},
      dirty: true,
    });
    const b = new ParseObject({
      className: 'File',
      localId: 'local1',
      attributes: {
        a: a,
      },
      dirty: true,
    });
    const f = new ParseObject({
      className: 'Folder',
      id: '121',
      attributes: {
        b: b,
      },
    });

    expect(unsavedChildren.bind(null, f)).toThrow('Cannot create a pointer to an unsaved Object.');
  });

  it('can explicitly allow nested objects without ids', () => {
    const a = new ParseObject({
      className: 'Folder',
      localId: 'local0',
      dirty: true,
      attributes: {},
    });
    const b = new ParseObject({
      className: 'Folder',
      localId: 'local1',
      dirty: true,
      attributes: {},
    });
    const c = new ParseObject({
      className: 'File',
      localId: 'local2',
      dirty: true,
      attributes: {},
    });

    a.attributes.items = [b];
    b.attributes.items = [c];

    expect(unsavedChildren(a, true)).toEqual([b, c]);
  });

  it('does not revisit objects', () => {
    const a = new ParseObject({
      className: 'File',
      id: '130',
      attributes: {
        b: new ParseObject({
          className: 'File',
          localId: '131',
          attributes: {},
          dirty: true,
        }),
      },
      dirty: true,
    });
    a.attributes.b.attributes.a = a;

    expect(unsavedChildren(a)).toEqual([a.attributes.b]);
  });

  it('skips Relation', () => {
    const relation = new ParseRelation(null, null);
    const f = new ParseObject({
      className: 'Folder',
      id: '121',
      attributes: {
        r: relation,
      },
    });
    expect(unsavedChildren(f)).toEqual([]);
  });
});
