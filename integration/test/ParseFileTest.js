'use strict';

const assert = require('assert');
const Parse = require('../../node');

describe('Parse.File', () => {
  it('can save file with uri', async () => {
    // Try https
    const parseLogo =
      'https://raw.githubusercontent.com/parse-community/parse-server/master/.github/parse-server-logo.png';
    const file1 = new Parse.File('parse-server-logo', { uri: parseLogo });
    await file1.save();

    const object = new Parse.Object('TestObject');
    object.set('file1', file1);
    await object.save();

    const query = new Parse.Query('TestObject');
    let result = await query.get(object.id);

    assert.equal(file1.name(), result.get('file1').name());
    assert.equal(file1.url(), result.get('file1').url());

    // Try http
    const file2 = new Parse.File('parse-server-logo', { uri: file1.url() });
    await file2.save();

    object.set('file2', file2);
    await object.save();

    result = await query.get(object.id);
    assert.equal(file2.url(), result.get('file2').url());
  });

  it('can cancel save file with uri', async () => {
    const parseLogo =
      'https://raw.githubusercontent.com/parse-community/parse-server/master/.github/parse-server-logo.png';
    const file = new Parse.File('parse-server-logo', { uri: parseLogo });
    file.save().then(() => {
      assert.equal(file.name(), undefined);
      assert.equal(file.url(), undefined);
    });
    file.cancel();
  });

  it('can get file upload / download progress', async () => {
    const parseLogo =
      'https://raw.githubusercontent.com/parse-community/parse-server/master/.github/parse-server-logo.png';
    const file = new Parse.File('parse-server-logo', { uri: parseLogo });
    let progress = 0;
    await file.save({
      progress: (value, loaded, total) => {
        progress = value;
        expect(loaded).toBeDefined();
        expect(total).toBeDefined();
      },
    });
    expect(progress).toBe(1);
    progress = 0;
    file._data = null;
    await file.getData({
      progress: (value, loaded, total) => {
        progress = value;
        expect(loaded).toBeDefined();
        expect(total).toBeDefined();
      },
    });
    expect(progress).toBe(1);
  });

  it('can not get data from unsaved file', async () => {
    const file = new Parse.File('parse-server-logo', [61, 170, 236, 120]);
    file._data = null;
    try {
      await file.getData();
    } catch (e) {
      assert.equal(e.message, 'Cannot retrieve data for unsaved ParseFile.');
    }
  });

  it('can get file data from byte array', async () => {
    const file = new Parse.File('parse-server-logo', [61, 170, 236, 120]);
    let data = await file.getData();
    assert.equal(data, 'ParseA==');
    file._data = null;
    await file.save();
    assert.equal(file._data, null);
    data = await file.getData();
    assert.equal(data, 'ParseA==');
  });

  it('can get file data from base64 (saved)', async () => {
    const file = new Parse.File('parse-server-logo', { base64: 'ParseA==' });
    await file.save();
    let data = await file.getData();
    assert.equal(data, 'ParseA==');
    file._data = null;
    await file.save();
    assert.equal(file._data, null);
    data = await file.getData();
    assert.equal(data, 'ParseA==');
  });

  it('can get file data from base64 (unsaved)', async () => {
    const file = new Parse.File('parse-server-logo', { base64: 'ParseA==' });
    const data = await file.getData();
    assert.equal(data, 'ParseA==');
  });

  it('can get file data from full base64', async () => {
    const file = new Parse.File('parse-server-logo', {
      base64: 'data:image/jpeg;base64,ParseA==',
    });
    await file.save();
    let data = await file.getData();
    assert.equal(data, 'ParseA==');
    file._data = null;
    await file.save();
    assert.equal(file._data, null);
    data = await file.getData();
    assert.equal(data, 'ParseA==');
  });

  it('can delete file', async () => {
    const parseLogo =
      'https://raw.githubusercontent.com/parse-community/parse-server/master/.github/parse-server-logo.png';
    const file = new Parse.File('parse-server-logo', { uri: parseLogo });
    await file.save();
    const data = await file.getData();

    const deletedFile = await file.destroy();
    const deletedData = await file.getData();
    assert.equal(file, deletedFile);
    assert.notEqual(data, deletedData);
  });

  it('can handle delete file error', async () => {
    const parseLogo =
      'https://raw.githubusercontent.com/parse-community/parse-server/master/.github/parse-server-logo.png';
    const file = new Parse.File('parse-server-logo', { uri: parseLogo });
    try {
      await file.destroy();
      assert.equal(false, true);
    } catch (e) {
      assert.equal(e.code, Parse.Error.FILE_DELETE_ERROR);
    }
  });

  it('can save file to localDatastore', async () => {
    Parse.enableLocalDatastore();
    const file = new Parse.File('parse-js-sdk', [61, 170, 236, 120]);
    const object = new Parse.Object('TestObject');
    await object.pin();

    object.set('file', file);
    await object.save();

    const query = new Parse.Query(TestObject);
    query.fromLocalDatastore();
    query.equalTo('objectId', object.id);
    const results = await query.find();

    const url = results[0].get('file').url();
    assert.equal(results.length, 1);
    assert.notEqual(url, undefined);
    assert.equal(url, file.url());
  });
});
