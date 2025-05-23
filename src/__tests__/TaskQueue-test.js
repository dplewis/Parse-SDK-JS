jest.autoMockOff();

const TaskQueue = require('../TaskQueue').default;
const { resolvingPromise } = require('../promiseUtils');
const flushPromises = require('./test_helpers/flushPromises');

describe('TaskQueue', () => {
  it('is initialized with an empty queue', () => {
    const q = new TaskQueue();
    expect(q.queue).toEqual([]);
  });

  it('runs a single task immediately', async () => {
    const q = new TaskQueue();
    let resolve;
    const p = new Promise(res => (resolve = res));
    let called = false;
    let completed = false;
    q.enqueue(() => {
      called = true;
      return p.then(() => {
        completed = true;
      });
    });
    expect(called).toBe(true);
    expect(completed).toBe(false);
    resolve();
    await flushPromises();
    expect(completed).toBe(true);
  });

  it('rejects the enqueue promise when the task errors', async () => {
    expect.assertions(2);
    const q = new TaskQueue();
    let reject;
    const p = new Promise((_, rej) => (reject = rej));
    let called = false;
    const t = q.enqueue(() => {
      called = true;
      return p;
    });
    expect(called).toBe(true);
    reject('error');
    try {
      await t;
    } catch (e) {
      expect(e).toBe('error');
    }
  });

  it('can execute a chain of tasks', async () => {
    const q = new TaskQueue();
    const called = [false, false, false];
    const completed = [false, false, false];
    const promises = [resolvingPromise(), resolvingPromise(), resolvingPromise()];
    q.enqueue(() => {
      called[0] = true;
      return promises[0].then(() => {
        completed[0] = true;
      });
    });
    q.enqueue(() => {
      called[1] = true;
      return promises[1].then(() => {
        completed[1] = true;
      });
    });
    q.enqueue(() => {
      called[2] = true;
      return promises[2].then(() => {
        completed[2] = true;
      });
    });
    expect(called).toEqual([true, false, false]);
    expect(completed).toEqual([false, false, false]);
    promises[0].resolve();
    await flushPromises();
    expect(called).toEqual([true, true, false]);
    expect(completed).toEqual([true, false, false]);
    expect(q.queue.length).toBe(2);
    promises[1].resolve();
    await flushPromises();
    expect(called).toEqual([true, true, true]);
    expect(completed).toEqual([true, true, false]);
    expect(q.queue.length).toBe(1);
    promises[2].resolve();
    await flushPromises();
    expect(completed).toEqual([true, true, true]);
    expect(q.queue.length).toBe(0);
  });

  it('continues the chain when a task errors', async () => {
    const q = new TaskQueue();
    const called = [false, false, false];
    const promises = [resolvingPromise(), resolvingPromise(), resolvingPromise()];
    q.enqueue(() => {
      called[0] = true;
      return promises[0];
    }).catch(() => {}); // need to catch here as we're using async/await and it fails the test
    q.enqueue(() => {
      called[1] = true;
      return promises[1];
    });
    q.enqueue(() => {
      called[2] = true;
      return promises[2];
    });
    expect(called).toEqual([true, false, false]);
    promises[0].catch(() => {});
    promises[0].reject('oops');
    await flushPromises();
    expect(called).toEqual([true, true, false]);
    expect(q.queue.length).toBe(2);
    promises[1].resolve();
    await flushPromises();
    expect(called).toEqual([true, true, true]);
    expect(q.queue.length).toBe(1);
    promises[2].resolve();
    await flushPromises();
    expect(q.queue.length).toBe(0);
  });

  it('continues the chain when all tasks errors', async () => {
    const q = new TaskQueue();
    const called = [false, false, false];
    const promises = [resolvingPromise(), resolvingPromise(), resolvingPromise()];
    q.enqueue(() => {
      called[0] = true;
      return promises[0];
    }).catch(() => {});

    q.enqueue(() => {
      called[1] = true;
      return promises[1];
    }).catch(() => {});

    q.enqueue(() => {
      called[2] = true;
      return promises[2];
    }).catch(() => {});

    expect(called).toEqual([true, false, false]);

    promises[0].catch(() => {});
    promises[0].reject('1 oops');
    await flushPromises();
    expect(called).toEqual([true, true, false]);
    expect(q.queue.length).toBe(2);

    promises[1].catch(() => {});
    promises[1].reject('2 oops');
    await flushPromises();
    expect(called).toEqual([true, true, true]);
    expect(q.queue.length).toBe(1);

    promises[2].catch(() => {});
    promises[2].reject('3 oops');
    await flushPromises();
    expect(q.queue.length).toBe(0);
  });
});
