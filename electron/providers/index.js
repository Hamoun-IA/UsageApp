// Registry des adapters de provider. Sera rempli en Task 1.7.

function get(name) {
  return undefined; // No providers yet; scheduler will skip (see line 46 of scheduler.js)
}

function list() {
  return []; // Empty list; main.js IPC handler will return []
}

module.exports = { get, list, providers: {} };
