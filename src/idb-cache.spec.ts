import { describe, it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

// Stub indexedDB with an in-memory implementation before importing the module
const fakeIDB = new IDBFactory();
vi.stubGlobal('indexedDB', fakeIDB);

const { RangeTileProvider } = await import('./range-tile-provider');

const IDB_NAME = 'jp2-tile-index';
const IDB_STORE = 'indices';
const IDB_VERSION = 2;

/** Helper: open (or create) the same IDB used by range-tile-provider */
function openTestDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = fakeIDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'url' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function putEntry(url: string, cachedAt: number): Promise<void> {
  return openTestDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put({
          url,
          cachedAt,
          tiles: [],
          mainHeader: [],
          width: 0,
          height: 0,
          tileWidth: 256,
          tileHeight: 256,
          tilesX: 1,
          tilesY: 1,
          componentCount: 1,
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      }),
  );
}

function getEntry(url: string): Promise<unknown> {
  return openTestDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(url);
        req.onsuccess = () => { db.close(); resolve(req.result ?? undefined); };
        req.onerror = () => { db.close(); reject(req.error); };
      }),
  );
}

describe('RangeTileProvider.invalidateCache', () => {
  it('removes an existing entry from IndexedDB', async () => {
    const url = 'https://example.com/a.jp2';
    await putEntry(url, Date.now());
    expect(await getEntry(url)).toBeDefined();

    await RangeTileProvider.invalidateCache(url);

    expect(await getEntry(url)).toBeUndefined();
  });

  it('resolves without error when the entry does not exist', async () => {
    await expect(
      RangeTileProvider.invalidateCache('https://example.com/missing.jp2'),
    ).resolves.toBeUndefined();
  });
});
