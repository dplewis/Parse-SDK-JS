jest.dontMock('../canBeSerialized');
jest.dontMock('../CoreManager');

function mockObject(id, attributes) {
  this.id = id;
  this.attributes = attributes;
}
mockObject.registerSubclass = function () {};
jest.setMock('../ParseObject', {
  __esModule: true,
  default: mockObject,
});
const CoreManager = require('../CoreManager').default;
CoreManager.setParseObject(mockObject);

function mockFile(url) {
  this._url = url;
}
mockFile.prototype.url = function () {
  return this._url;
};
jest.setMock('../ParseFile', {
  __esModule: true,
  default: mockFile,
});

const canBeSerialized = require('../canBeSerialized').default;
const ParseFile = require('../ParseFile').default;
const ParseObject = require('../ParseObject').default;
const ParseRelation = require('../ParseRelation').default;

describe('canBeSerialized', () => {
  it('returns true for anything that is not a ParseObject', () => {
    expect(canBeSerialized(12)).toBe(true);
    expect(canBeSerialized('string')).toBe(true);
    expect(canBeSerialized(false)).toBe(true);
    expect(canBeSerialized([])).toBe(true);
    expect(canBeSerialized({})).toBe(true);
  });

  it('validates primitives', () => {
    const o = new ParseObject('oid', {
      a: 12,
      b: 'string',
      c: false,
    });
    expect(canBeSerialized(o)).toBe(true);
  });

  it('returns false when a child is an unsaved object or file', () => {
    let o = new ParseObject('oid', {
      a: new ParseObject(),
    });
    expect(canBeSerialized(o)).toBe(false);

    o = new ParseObject('oid', {
      a: new ParseObject('oid2', {}),
    });
    expect(canBeSerialized(o)).toBe(true);

    o = new ParseObject('oid', {
      a: new ParseFile(),
    });
    expect(canBeSerialized(o)).toBe(false);

    o = new ParseObject('oid', {
      a: new ParseFile('http://files.parsetfss.com/a/parse.txt'),
    });
    expect(canBeSerialized(o)).toBe(true);
  });

  it('returns true when all children have an id', () => {
    const child = new ParseObject('child', {});
    const parent = new ParseObject(undefined, {
      child: child,
    });
    child.attributes.parent = parent;
    expect(canBeSerialized(parent)).toBe(true);
    expect(canBeSerialized(child)).toBe(false);
  });

  it('returns true for relations', () => {
    const relation = new ParseRelation(null, null);
    const parent = new ParseObject(undefined, {
      child: relation,
    });
    expect(canBeSerialized(parent)).toBe(true);
  });

  it('traverses nested arrays and objects', () => {
    let o = new ParseObject('oid', {
      a: {
        a: {
          a: {
            b: new ParseObject(),
          },
        },
      },
    });
    expect(canBeSerialized(o)).toBe(false);

    o = new ParseObject('oid', {
      a: {
        a: {
          a: {
            b: new ParseObject('oid2'),
          },
        },
      },
    });
    expect(canBeSerialized(o)).toBe(true);

    o = new ParseObject('oid', {
      a: [
        1,
        2,
        3,
        {
          b: new ParseObject(),
        },
      ],
    });
    expect(canBeSerialized(o)).toBe(false);

    o = new ParseObject('oid', {
      a: [
        1,
        2,
        3,
        {
          b: new ParseObject('oid2'),
        },
      ],
    });
    expect(canBeSerialized(o)).toBe(true);
  });
});
