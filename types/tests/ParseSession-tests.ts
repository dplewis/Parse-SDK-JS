import Parse from 'parse';

describe('Parse.Session Type Definitions', () => {
  it('constructor', () => {
    // $ExpectType ParseSession<Attributes>
    new Parse.Session();

    // $ExpectType ParseSession<{ example: number; }>
    new Parse.Session({ example: 100 });

    // $ExpectType ParseSession<{ example: number; }>
    new Parse.Session<{ example: number }>();

    // $ExpectType ParseSession<{ example: number; }>
    new Parse.Session<{ example: number }>({ example: 100 });

    // $ExpectError
    new Parse.Session<{ example: number }>({ example: 'hello' });
  });

  it('static methods', async () => {
    // $ExpectType boolean
    Parse.Session.isCurrentSessionRevocable();

    // $ExpectType string[]
    Parse.Session.readOnlyAttributes();

    // $ExpectType ParseSession<Attributes>
    await Parse.Session.current();

    // $ExpectType ParseSession<{ example: string; }>
    await Parse.Session.current<Parse.Session<{ example: string }>>();
  });

  it('instance methods', () => {
    const session = new Parse.Session();

    // $ExpectType string
    session.getSessionToken();
  });
});
