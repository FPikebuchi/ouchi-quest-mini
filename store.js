import { initialState, validateState } from './model.js';
const DB = 'ouchi-quest-mini';
let connection;
export function openStore() {
  if (connection) return Promise.resolve(connection);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('data');
    request.onerror = () => reject(new Error('端末内保存を開けません。Safariの通常モードで開いてください。'));
    request.onblocked = () => reject(new Error('別のタブを閉じて、開き直してください。'));
    request.onsuccess = () => {
      const db = request.result;
      connection = db;
      db.onversionchange = () => { db.close(); if (connection === db) connection = null; };
      db.onclose = () => { if (connection === db) connection = null; };
      resolve(db);
    };
  });
}
// Creates the transaction and its requests synchronously (no await in between).
// iOS Safari can drop the IndexedDB connection while the app is in the background,
// so a dead connection is reopened once instead of failing until the app restarts.
async function run(mode, setup) {
  for (let attempt = 0; ; attempt++) {
    const db = await openStore();
    let tx;
    try { tx = db.transaction('data', mode); }
    catch {
      if (connection === db) connection = null;
      try { db.close(); } catch {}
      if (attempt) throw new Error('端末内保存に接続できません。アプリを閉じて開き直してください。記録は変更されていません。');
      continue;
    }
    return new Promise((resolve, reject) => setup(tx, resolve, reject));
  }
}
// One read/write transaction serializes updates, including simultaneous tabs.
export function updateStore(change = s => s) {
  return run('readwrite', (tx, resolve, reject) => {
    const store = tx.objectStore('data');
    const request = store.get('state');
    let result, cause;
    request.onsuccess = () => {
      try {
        result = validateState(change(validateState(request.result ?? initialState())));
        store.put(result, 'state');
      } catch (error) { cause = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(cause ?? new Error('保存できませんでした。空き容量とSafariの設定を確認してください。記録は変更されていません。'));
  });
}
export function readRaw() {
  return run('readonly', (tx, resolve, reject) => {
    const request = tx.objectStore('data').get('state');
    tx.oncomplete = () => resolve(request.result ?? initialState());
    tx.onabort = tx.onerror = () => reject(new Error('保存データを読み出せませんでした。'));
  });
}
export async function replaceStore(source) {
  const validated = validateState(source);
  return run('readwrite', (tx, resolve, reject) => {
    tx.objectStore('data').put(validated, 'state');
    tx.oncomplete = () => resolve(validated);
    tx.onabort = tx.onerror = () => reject(new Error('復元を保存できませんでした。元のデータは保持されています。'));
  });
}
