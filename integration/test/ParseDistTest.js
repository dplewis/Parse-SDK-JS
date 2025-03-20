const puppeteer = require('puppeteer');
const { resolvingPromise } = require('../../lib/node/promiseUtils');

let browser = null;
let page = null;
for (const fileName of ['parse.js', 'parse.min.js']) {
  describe(`Parse Dist Test ${fileName}`, () => {
    beforeEach(async () => {
      browser = await puppeteer.launch({
        args: ['--disable-web-security', '--incognito', '--no-sandbox'],
      });
      const context = await browser.createBrowserContext();
      page = await context.newPage();
      await page.setCacheEnabled(false);
      await page.goto(`http://localhost:1337/${fileName}`);
    });

    afterEach(async () => {
      await page.close();
      await browser.close();
    });

    it('can save an object', async () => {
      const response = await page.evaluate(async () => {
        const object = await new Parse.Object('TestObject').save();
        return object.id;
      });
      expect(response).toBeDefined();
      const obj = await new Parse.Query('TestObject').first();
      expect(obj).toBeDefined();
      expect(obj.id).toEqual(response);
    });

    it('can query an object', async () => {
      const obj = await new Parse.Object('TestObjects').save();
      const response = await page.evaluate(async () => {
        const object = await new Parse.Query('TestObjects').first();
        return object.id;
      });
      expect(response).toBeDefined();
      expect(obj).toBeDefined();
      expect(obj.id).toEqual(response);
    });

    it('can cancel save file with uri', async () => {
      let requestsCount = 0;
      let abortedCount = 0;
      const promise = resolvingPromise();
      await page.setRequestInterception(true);
      page.on('request', request => {
        if (!request.url().includes('favicon.ico')) {
          requestsCount += 1;
        }
        request.continue();
      });
      page.on('requestfailed', request => {
        if (
          request.failure().errorText === 'net::ERR_ABORTED' &&
          !request.url().includes('favicon.ico')
        ) {
          abortedCount += 1;
          promise.resolve();
        }
      });
      await page.evaluate(async () => {
        const parseLogo =
          'https://raw.githubusercontent.com/parse-community/parse-server/master/.github/parse-server-logo.png';
        const file = new Parse.File('parse-server-logo', { uri: parseLogo });
        file.save().then(() => {});

        return new Promise(resolve => {
          const intervalId = setInterval(() => {
            if (file._requestTask && typeof file._requestTask.abort === 'function') {
              file.cancel();
              clearInterval(intervalId);
              resolve();
            }
          }, 1);
        });
      });
      await promise;
      expect(requestsCount).toBe(1);
      expect(abortedCount).toBe(1);
    });

    it('can encrypt a user', async () => {
      const user = new Parse.User();
      user.setUsername('usernameENC');
      user.setPassword('passwordENC');
      await user.signUp();
      const response = await page.evaluate(async () => {
        Parse.secret = 'My Secret Key';
        await Parse.User.logIn('usernameENC', 'passwordENC');
        const current = await Parse.User.currentAsync();
        Parse.secret = undefined;
        return current.id;
      });
      expect(response).toBeDefined();
      expect(user.id).toEqual(response);
    });
  });
}
