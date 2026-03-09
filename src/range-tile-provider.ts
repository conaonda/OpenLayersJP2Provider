import type { TileProvider, TileProviderInfo, DecodedTile, GeoInfo } from './tile-provider';
import { parseJP2, fetchTileData, type JP2Info, type TileIndex } from './jp2-parser';
import { WorkerPool } from './worker-pool';
import { buildTileCodestream } from './codestream-builder';
import { debugLog, debugWarn } from './debug-logger';

const IDB_NAME = 'jp2-tile-index';
const IDB_VERSION = 2;
const IDB_STORE = 'indices';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedIndex {
  url: string;
  cachedAt: number;
  tiles: TileIndex[];
  mainHeader: number[];
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  tilesX: number;
  tilesY: number;
  componentCount: number;
  geoInfo?: GeoInfo;
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(IDB_STORE)) {
        db.deleteObjectStore(IDB_STORE);
      }
      db.createObjectStore(IDB_STORE, { keyPath: 'url' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCachedIndex(url: string, ttlMs: number = DEFAULT_TTL_MS): Promise<CachedIndex | undefined> {
  try {
    const db = await openIDB();
    const cached: CachedIndex | undefined = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(url);
      req.onsuccess = () => resolve(req.result ?? undefined);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
    if (cached && (Date.now() - cached.cachedAt) > ttlMs) {
      await deleteCachedIndex(url);
      return undefined;
    }
    return cached;
  } catch {
    return undefined;
  }
}

async function deleteCachedIndex(url: string): Promise<void> {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(url);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // deletion failure is non-fatal
  }
}

async function setCachedIndex(data: CachedIndex): Promise<void> {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(data);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // caching failure is non-fatal
  }
}

// LRU cache for decoded JP2 tiles
class DecodedTileCache {
  private map = new Map<string, DecodedTile>();
  private keys: string[] = [];
  constructor(private maxSize: number) {}

  get(key: string): DecodedTile | undefined {
    const val = this.map.get(key);
    if (val) {
      // Move to end (most recently used)
      this.keys.splice(this.keys.indexOf(key), 1);
      this.keys.push(key);
    }
    return val;
  }

  set(key: string, value: DecodedTile) {
    if (this.map.has(key)) {
      this.keys.splice(this.keys.indexOf(key), 1);
    } else if (this.keys.length >= this.maxSize) {
      const evict = this.keys.shift()!;
      this.map.delete(evict);
    }
    this.keys.push(key);
    this.map.set(key, value);
  }
}

export class RangeTileProvider implements TileProvider {
  private info!: JP2Info;
  private pool = new WorkerPool();
  private maxDecodeLevel = 5;

  static async invalidateCache(url: string): Promise<void> {
    await deleteCachedIndex(url);
  }
  private cache = new DecodedTileCache(50);
  private inflight = new Map<string, Promise<DecodedTile>>();
  private globalMin?: number;
  private globalMax?: number;

  private cacheTTL: number;

  private userMin?: number;
  private userMax?: number;

  constructor(private url: string, options?: { cacheTTL?: number; minValue?: number; maxValue?: number }) {
    this.cacheTTL = options?.cacheTTL ?? DEFAULT_TTL_MS;
    this.userMin = options?.minValue;
    this.userMax = options?.maxValue;
  }

  async init(): Promise<TileProviderInfo> {
    this.pool.init();

    const cached = await getCachedIndex(this.url, this.cacheTTL);
    if (cached) {
      debugLog('Loaded tile index from IndexedDB cache');
      this.info = {
        width: cached.width,
        height: cached.height,
        tileWidth: cached.tileWidth,
        tileHeight: cached.tileHeight,
        tilesX: cached.tilesX,
        tilesY: cached.tilesY,
        componentCount: cached.componentCount,
        mainHeader: new Uint8Array(cached.mainHeader),
        tiles: cached.tiles,
        geoInfo: cached.geoInfo,
      };
    } else {
      debugLog('Parsing JP2 structure and building tile index...');
      this.info = await parseJP2(this.url);
      await setCachedIndex({
        url: this.url,
        cachedAt: Date.now(),
        tiles: this.info.tiles,
        mainHeader: Array.from(this.info.mainHeader),
        width: this.info.width,
        height: this.info.height,
        tileWidth: this.info.tileWidth,
        tileHeight: this.info.tileHeight,
        tilesX: this.info.tilesX,
        tilesY: this.info.tilesY,
        componentCount: this.info.componentCount,
        geoInfo: this.info.geoInfo,
      });
      debugLog('Tile index cached to IndexedDB');
    }

    const maxDim = Math.max(this.info.tileWidth, this.info.tileHeight);
    this.maxDecodeLevel = Math.floor(Math.log2(maxDim / 64));
    if (this.maxDecodeLevel < 0) this.maxDecodeLevel = 0;

    // Use user-provided min/max or compute from a sample tile
    if (this.userMin !== undefined && this.userMax !== undefined) {
      this.globalMin = this.userMin;
      this.globalMax = this.userMax;
      debugLog(`Using user-provided pixel range: min=${this.globalMin}, max=${this.globalMax}`);
    } else {
      await this._computeGlobalStats();
    }

    return {
      width: this.info.width,
      height: this.info.height,
      tileWidth: this.info.tileWidth,
      tileHeight: this.info.tileHeight,
      tilesX: this.info.tilesX,
      tilesY: this.info.tilesY,
      componentCount: this.info.componentCount,
      maxDecodeLevel: this.maxDecodeLevel,
      geoInfo: this.info.geoInfo,
    };
  }

  async getTile(col: number, row: number, decodeLevel: number): Promise<DecodedTile> {
    const cacheKey = `${col}:${row}:${decodeLevel}`;

    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // Deduplicate concurrent requests for the same tile
    const existing = this.inflight.get(cacheKey);
    if (existing) return existing;

    const promise = this._decodeTile(col, row, decodeLevel);
    this.inflight.set(cacheKey, promise);
    try {
      const result = await promise;
      this.cache.set(cacheKey, result);
      return result;
    } finally {
      this.inflight.delete(cacheKey);
    }
  }

  private async _computeGlobalStats(): Promise<void> {
    try {
      // Pick a center tile for representative statistics
      const centerCol = Math.floor(this.info.tilesX / 2);
      const centerRow = Math.floor(this.info.tilesY / 2);
      const tileId = centerRow * this.info.tilesX + centerCol;
      const tileIndex = this.info.tiles.find(t => t.tileId === tileId) ?? this.info.tiles[0];
      if (!tileIndex) return;

      const { tileWidth, tileHeight, width: imgW, height: imgH, mainHeader } = this.info;
      const col = tileIndex.tileId % this.info.tilesX;
      const row = Math.floor(tileIndex.tileId / this.info.tilesX);

      const tileData = await fetchTileData(this.url, tileIndex);
      const actualW = Math.min(tileWidth, imgW - col * tileWidth);
      const actualH = Math.min(tileHeight, imgH - row * tileHeight);

      const codestream = buildTileCodestream(mainHeader, new Uint8Array(tileData), actualW, actualH);

      // Decode at highest reduction level for speed
      const statsLevel = Math.max(this.maxDecodeLevel, 2);
      const resp = await this.pool.computeStats(codestream.buffer as ArrayBuffer, statsLevel > 0 ? statsLevel : undefined);
      if (resp.stats) {
        this.globalMin = resp.stats.min;
        this.globalMax = resp.stats.max;
        debugLog(`Global stats from sample tile: min=${this.globalMin}, max=${this.globalMax}`);
      }
    } catch (err) {
      debugWarn('Failed to compute global stats, using full-range fallback:', err);
    }
  }

  private async _decodeTile(col: number, row: number, decodeLevel: number): Promise<DecodedTile> {
    const { tilesX, tileWidth, tileHeight, width: imgW, height: imgH, mainHeader } = this.info;
    const tileId = row * tilesX + col;
    const tileIndex = this.info.tiles.find(t => t.tileId === tileId);
    if (!tileIndex) throw new Error(`Tile ${tileId} not found`);

    const tileData = await fetchTileData(this.url, tileIndex);

    const actualW = Math.min(tileWidth, imgW - col * tileWidth);
    const actualH = Math.min(tileHeight, imgH - row * tileHeight);

    const codestream = buildTileCodestream(mainHeader, new Uint8Array(tileData), actualW, actualH);

    const resp = await this.pool.decode(codestream.buffer as ArrayBuffer, decodeLevel > 0 ? decodeLevel : undefined, this.globalMin, this.globalMax);
    if (resp.error) throw new Error(resp.error);

    debugLog(`Tile (${col},${row}) decoded: ${resp.width}x${resp.height} (decodeLevel=${decodeLevel})`);
    return {
      data: new Uint8ClampedArray(resp.data!),
      width: resp.width!,
      height: resp.height!,
    };
  }

  destroy() {
    this.pool.destroy();
  }
}
