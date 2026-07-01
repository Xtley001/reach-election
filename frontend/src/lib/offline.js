/* REACH Election — Offline Queue (IndexedDB)
   Spec from 08_SECURITY.md IndexedDB Security section.

   Rules:
   - DB name: 'reach-offline-v1'  (versioned for cache-busting)
   - Store:   'sync_queue'
   - Items:   { id, type, payload, created_at, retry_count }
   - type:    'add_voter' | 'log_contact'
   - Max retry: 10 — after 10 failed syncs move to 'error_queue'
   - Never stores: access tokens, OTP codes, other agents' data

   AUDIT 6.3 — PRODUCT DECISION FLAGGED, not auto-resolved here: queued
   payloads include full voter PII (name, phone, PVC status, political
   support level) unencrypted at rest in IndexedDB until they sync. On a
   lost/compromised field-agent device this is exposed for as long as it's
   queued. This is a reasonable tradeoff for the offline-first requirement,
   but should be a conscious, documented one — paired at minimum with
   wiping local data on logout (see wipeAllOfflineData(), called from
   useAuth's logout()) and ideally with device-level encryption requirements
   communicated to field staff. Full at-rest encryption of the IndexedDB
   payloads themselves would be a larger design change and is left as a
   product decision.
*/

const DB_NAME    = 'reach-offline-v1';
const DB_VERSION = 1;
const QUEUE      = 'sync_queue';
const ERRORS     = 'error_queue';
const MAX_RETRY  = 10;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(QUEUE)) {
        const s = db.createObjectStore(QUEUE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('type', 'type', { unique: false });
      }
      if (!db.objectStoreNames.contains(ERRORS)) {
        db.createObjectStore(ERRORS, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

export async function queueAction(type, payload) {
  const db = await openDB();
  const tx = db.transaction(QUEUE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(QUEUE).add({
      type,
      payload,
      created_at: new Date().toISOString(),
      retry_count: 0,
    });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function getPendingSync() {
  const db    = await openDB();
  const tx    = db.transaction(QUEUE, 'readonly');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(QUEUE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function incrementRetry(id, db_instance = null) {
  const db = db_instance || await openDB();
  const tx = db.transaction(QUEUE, 'readwrite');
  const store = tx.objectStore(QUEUE);
  return new Promise((resolve, reject) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result;
      if (!item) { resolve(); return; }
      item.retry_count = (item.retry_count || 0) + 1;
      if (item.retry_count >= MAX_RETRY) {
        // Move to error store
        store.delete(id);
        db.transaction(ERRORS, 'readwrite').objectStore(ERRORS).add({
          ...item,
          failed_at: new Date().toISOString(),
        });
      } else {
        store.put(item);
      }
      resolve(item.retry_count);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function clearSynced(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(QUEUE, 'readwrite').objectStore(QUEUE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

export async function getPendingCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(QUEUE, 'readonly').objectStore(QUEUE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function getErrorCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(ERRORS, 'readonly').objectStore(ERRORS).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function clearAllErrors() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(ERRORS, 'readwrite').objectStore(ERRORS).clear();
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// Audit 6.3 mitigation: clear any still-queued/unsynced voter PII from this
// device. Intended to be called on logout. Note this discards any not-yet-
// synced offline actions — callers should warn the user if getPendingCount()
// is non-zero before logging out, so field work isn't silently lost.
export async function wipeAllOfflineData() {
  const db = await openDB();
  await Promise.all([
    new Promise((resolve, reject) => {
      const req = db.transaction(QUEUE, 'readwrite').objectStore(QUEUE).clear();
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    }),
    new Promise((resolve, reject) => {
      const req = db.transaction(ERRORS, 'readwrite').objectStore(ERRORS).clear();
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    }),
  ]);
}
