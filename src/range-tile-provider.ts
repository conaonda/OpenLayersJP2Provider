import type { TileProvider, TileProviderInfo, DecodedTile, GeoInfo } from './tile-provider';
import { parseJP2, fetchTileData, type JP2Info, type TileIndex } from './jp2-parser';
import { WorkerPool } from './worker-pool';

const IDB_NAME = 'jp2-tile-index';
const IDB_VERSION = 1;
const IDB_STORE = 'indices';

interface CachedIndex {
  url: string;
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
      req.result.createObjectStore(IDB_STORE, { keyPath: 'url' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCachedIndex(url: string): Promise<CachedIndex | undefined> {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(url);
      req.onsuccess = () => resolve(req.result ?? undefined);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return undefined;
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
  private cache = new DecodedTileCache(50);
  private inflight = new Map<string, Promise<DecodedTile>>();
  private globalMin?: number;
  private globalMax?: number;

  constructor(private url: string) {}

  async init(): Promise<TileProviderInfo> {
    this.pool.init();

    const cached = await getCachedIndex(this.url);
    if (cached) {
      console.log('Loaded tile index from IndexedDB cache');
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
      console.log('Parsing JP2 structure and building tile index...');
      this.info = await parseJP2(this.url);
      await setCachedIndex({
        url: this.url,
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
      console.log('Tile index cached to IndexedDB');
    }

    const maxDim = Math.max(this.info.tileWidth, this.info.tileHeight);
    this.maxDecodeLevel = Math.floor(Math.log2(maxDim / 64));
    if (this.maxDecodeLevel < 0) this.maxDecodeLevel = 0;

    // Compute global min/max from a sample tile for proper 16-bit normalization
    await this._computeGlobalStats();

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

      const header = new Uint8Array(mainHeader);
      const hv = new DataView(header.buffer, header.byteOffset, header.byteLength);
      const xsizOff = 8;
      hv.setUint32(xsizOff, actualW, false);
      hv.setUint32(xsizOff + 4, actualH, false);
      hv.setUint32(xsizOff + 8, 0, false);
      hv.setUint32(xsizOff + 12, 0, false);
      hv.setUint32(xsizOff + 16, actualW, false);
      hv.setUint32(xsizOff + 20, actualH, false);
      hv.setUint32(xsizOff + 24, 0, false);
      hv.setUint32(xsizOff + 28, 0, false);

      const tile = new Uint8Array(tileData);
      const tv = new DataView(tile.buffer, tile.byteOffset, tile.byteLength);
      tv.setUint16(4, 0, false);

      const eoc = new Uint8Array([0xFF, 0xD9]);
      const codestream = new Uint8Array(header.length + tile.length + 2);
      codestream.set(header, 0);
      codestream.set(tile, header.length);
      codestream.set(eoc, header.length + tile.length);

      // Decode at highest reduction level for speed
      const statsLevel = Math.max(this.maxDecodeLevel, 2);
      const resp = await this.pool.computeStats(codestream.buffer, statsLevel > 0 ? statsLevel : undefined);
      if (resp.stats) {
        this.globalMin = resp.stats.min;
        this.globalMax = resp.stats.max;
        console.log(`Global stats from sample tile: min=${this.globalMin}, max=${this.globalMax}`);
      }
    } catch (err) {
      console.warn('Failed to compute global stats, using full-range fallback:', err);
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

    const header = new Uint8Array(mainHeader);
    const hv = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const xsizOff = 8;
    hv.setUint32(xsizOff, actualW, false);
    hv.setUint32(xsizOff + 4, actualH, false);
    hv.setUint32(xsizOff + 8, 0, false);
    hv.setUint32(xsizOff + 12, 0, false);
    hv.setUint32(xsizOff + 16, actualW, false);
    hv.setUint32(xsizOff + 20, actualH, false);
    hv.setUint32(xsizOff + 24, 0, false);
    hv.setUint32(xsizOff + 28, 0, false);

    const tile = new Uint8Array(tileData);
    const tv = new DataView(tile.buffer, tile.byteOffset, tile.byteLength);
    tv.setUint16(4, 0, false);

    const eoc = new Uint8Array([0xFF, 0xD9]);
    const codestream = new Uint8Array(header.length + tile.length + 2);
    codestream.set(header, 0);
    codestream.set(tile, header.length);
    codestream.set(eoc, header.length + tile.length);

    const resp = await this.pool.decode(codestream.buffer, decodeLevel > 0 ? decodeLevel : undefined, this.globalMin, this.globalMax);
    if (resp.error) throw new Error(resp.error);

    console.log(`Tile (${col},${row}) decoded: ${resp.width}x${resp.height} (decodeLevel=${decodeLevel})`);
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
