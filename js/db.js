// MEO Notes – tiny IndexedDB wrapper.
// Stores: 'kv' (vault + encrypted settings), 'notes' (encrypted notes), 'voices' (custom voice files, not secret).
const DB_NAME = 'meonotes';
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('voices')) db.createObjectStore('voices', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function run(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const os = tx.objectStore(store);
    let result;
    const r = fn(os);
    if (r) r.onsuccess = () => { result = r.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const db = {
  get: (store, key) => run(store, 'readonly', (os) => os.get(key)),
  put: (store, value, key) => run(store, 'readwrite', (os) => (key === undefined ? os.put(value) : os.put(value, key))),
  del: (store, key) => run(store, 'readwrite', (os) => os.delete(key)),
  all: (store) => run(store, 'readonly', (os) => os.getAll()),
  clear: (store) => run(store, 'readwrite', (os) => os.clear()),
  /** Replace the whole contents of a store in one transaction. */
  replaceAll: (store, values) => run(store, 'readwrite', (os) => { os.clear(); for (const v of values) os.put(v); }),
  async wipe() {
    if (dbp) { (await dbp).close(); dbp = null; }
    await new Promise((res, rej) => { const r = indexedDB.deleteDatabase(DB_NAME); r.onsuccess = res; r.onerror = () => rej(r.error); r.onblocked = res; });
  },
};
