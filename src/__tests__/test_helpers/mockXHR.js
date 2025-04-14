/**
 * Mock fetch by pre-defining the statuses and results that it
 * return.
 * `results` is an array of objects of the form:
 *   { status: ..., response: ... }
 * where status is a HTTP status number and result is a JSON object to pass
 * alongside it.
 * `upload`.
 * @ignore
 */
function mockXHR(results) {
  let attempts = 0;
  global.fetch = async () => {
    const headers = {};
    return Promise.resolve({
      status: results[attempts].status,
      json: () => {
        const { response } = results[attempts];
        attempts++;
        return Promise.resolve(response);
      },
      headers: {
        get: header => headers[header],
        has: header => headers[header] !== undefined,
      },
    });
  };
}

module.exports = mockXHR;
