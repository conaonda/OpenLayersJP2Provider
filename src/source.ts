import TileImage from 'ol/source/TileImage';
import TileLayer from 'ol/layer/Tile';
import TileGrid from 'ol/tilegrid/TileGrid';
import { Projection, get as getProjection } from 'ol/proj';
import { register } from 'ol/proj/proj4';
import proj4 from 'proj4';
import type Tile from 'ol/Tile';
import ImageTile from 'ol/ImageTile';
import type { TileProvider, TileProviderInfo, GeoInfo } from './tile-provider';
import { debugLog, debugWarn, debugError } from './debug-logger';

async function ensureProjection(
  epsgCode: number,
  resolver?: (epsgCode: number) => Promise<string | null>,
): Promise<void> {
  const code = `EPSG:${epsgCode}`;
  if (getProjection(code)) return;
  try {
    let def: string | null = null;
    if (resolver) {
      def = await resolver(epsgCode);
    } else {
      const resp = await fetch(`https://epsg.io/${epsgCode}.proj4`);
      def = await resp.text();
    }
    if (def && def.trim().startsWith('+')) {
      proj4.defs(code, def.trim());
      register(proj4);
      debugLog(`Registered projection ${code}`);
    }
  } catch (e) {
    debugWarn(`Failed to fetch projection ${code}:`, e);
  }
}

// Semaphore to limit concurrent tile loads
class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;
  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise(resolve => this.queue.push(resolve));
  }

  release() {
    this.active--;
    const next = this.queue.shift();
    if (next) {
      this.active++;
      next();
    }
  }
}

const DISPLAY_TILE_SIZE = 256;

export interface JP2LayerOptions {
  /** 동시 타일 로드 최대 수 (기본값: 4) */
  maxConcurrentTiles?: number;
  /** EPSG 코드에 대한 proj4 문자열을 반환하는 커스텀 resolver (기본값: epsg.io fetch) */
  projectionResolver?: (epsgCode: number) => Promise<string | null>;
  /** 픽셀 정규화 최소값 (16비트 이미지용) */
  minValue?: number;
  /** 픽셀 정규화 최대값 (16비트 이미지용) */
  maxValue?: number;
  /** 타일 로드 실패 시 재시도 횟수 (기본값: 0, 재시도 없음) */
  tileRetryCount?: number;
  /** 재시도 초기 delay (ms, 기본값: 500). exponential backoff 적용: delay * 2^attempt */
  tileRetryDelay?: number;
  /** 재시도 최대 delay 상한 (ms, 기본값: 5000) */
  tileRetryMaxDelay?: number;
  /** 모든 재시도 소진 후 최종 실패 시 호출되는 콜백 */
  onTileError?: (info: { col: number; row: number; decodeLevel: number; error: unknown }) => void;
  /** 타일 디코딩 성공 시 호출되는 콜백 */
  onTileLoad?: (info: { col: number; row: number; decodeLevel: number }) => void;
  /** 타일 로드 진행률 콜백 */
  onProgress?: (info: { loaded: number; total: number; failed: number }) => void;
  /** 레이어 초기 투명도 (0.0 ~ 1.0, 기본값: 1.0) */
  initialOpacity?: number;
}

export interface JP2LayerResult {
  layer: TileLayer<TileImage>;
  info: TileProviderInfo;
  projection: Projection;
  extent: [number, number, number, number];
  resolutions: number[];
  /** 내부 리소스(WebWorker 등)를 해제한다 */
  destroy: () => void;
}

export async function createJP2TileLayer(
  provider: TileProvider,
  options?: JP2LayerOptions,
): Promise<JP2LayerResult> {
  const info = await provider.init();
  const { width, height, tileWidth, tileHeight, tilesX, tilesY, geoInfo } = info;

  // Compute resolutions in pixel space
  const maxRes = tileWidth / DISPLAY_TILE_SIZE;
  const numLevels = Math.log2(maxRes) + 1;
  const pixelResolutions: number[] = [];
  for (let i = 0; i < numLevels; i++) {
    pixelResolutions.push(maxRes / Math.pow(2, i));
  }

  let extent: [number, number, number, number];
  let resolutions: number[];
  let projection: Projection;

  if (geoInfo) {
    await ensureProjection(geoInfo.epsgCode, options?.projectionResolver);

    // For geographic CRS (e.g. EPSG:4326), origin may have lat/lon order.
    // OpenLayers expects X=lon, Y=lat. Detect and swap if needed.
    let { originX, originY, pixelScaleX, pixelScaleY } = geoInfo;
    const proj = getProjection(`EPSG:${geoInfo.epsgCode}`);
    const isGeographic = proj ? proj.getUnits() === 'degrees' : geoInfo.epsgCode === 4326;
    if (isGeographic) {
      const computedMaxX = originX + width * pixelScaleX;
      const computedMinY = originY - height * pixelScaleY;
      // If Y values are out of latitude range but X values look like latitude, swap
      if ((Math.abs(originY) > 90 || Math.abs(computedMinY) > 90) && Math.abs(originX) <= 90) {
        debugLog('Detected lat/lon axis swap in geo info, correcting...');
        [originX, originY] = [originY, originX];
        [pixelScaleX, pixelScaleY] = [pixelScaleY, pixelScaleX];
      }
    }

    // Geographic mode: compute extent and resolutions in CRS units
    const minX = originX;
    const maxY = originY;
    const maxX = minX + width * pixelScaleX;
    const minY = maxY - height * pixelScaleY;
    extent = [minX, minY, maxX, maxY];

    // Resolutions in CRS units per pixel
    resolutions = pixelResolutions.map(r => r * pixelScaleX);

    const existing = getProjection(`EPSG:${geoInfo.epsgCode}`);
    if (existing) {
      projection = existing as Projection;
    } else {
      projection = new Projection({
        code: `EPSG:${geoInfo.epsgCode}`,
        units: 'm',
        extent,
      });
    }
  } else {
    // Pixel mode (no geo info)
    extent = [0, 0, width, height];
    resolutions = pixelResolutions;
    projection = new Projection({
      code: 'jp2-image',
      units: 'pixels',
      extent,
    });
  }

  const origin: [number, number] = geoInfo
    ? [extent[0], extent[3]] // top-left in CRS
    : [0, height];

  const tileGrid = new TileGrid({
    extent,
    origin,
    resolutions,
    tileSize: [DISPLAY_TILE_SIZE, DISPLAY_TILE_SIZE],
  });

  const sem = new Semaphore(options?.maxConcurrentTiles ?? 4);
  const retryCount = options?.tileRetryCount ?? 0;
  const retryDelay = options?.tileRetryDelay ?? 500;
  const retryMaxDelay = options?.tileRetryMaxDelay ?? 5000;
  const onTileError = options?.onTileError;
  const onTileLoad = options?.onTileLoad;
  const onProgress = options?.onProgress;

  // Progress tracking state
  let progressTotal = 0;
  let progressLoaded = 0;
  let progressFailed = 0;

  const emitProgress = () => {
    if (onProgress) {
      onProgress({ loaded: progressLoaded, total: progressTotal, failed: progressFailed });
    }
  };

  const source = new TileImage({
    projection,
    tileGrid,
    tileUrlFunction: (tileCoord) => {
      const [z, x, y] = tileCoord;
      const subtilesPerAxis = tileWidth / DISPLAY_TILE_SIZE / pixelResolutions[z];

      const jp2Col = Math.floor(x / subtilesPerAxis);
      const jp2Row = Math.floor(y / subtilesPerAxis);
      const subCol = x % subtilesPerAxis;
      const subRow = y % subtilesPerAxis;

      if (jp2Row < 0 || jp2Row >= tilesY || jp2Col < 0 || jp2Col >= tilesX) {
        return undefined;
      }

      const decodeLevel = Math.round(Math.log2(pixelResolutions[z]));

      return `jp2:#col=${jp2Col}&row=${jp2Row}&dl=${decodeLevel}&sc=${subCol}&sr=${subRow}`;
    },
    tileLoadFunction: (tile: Tile, src: string) => {
      const match = src.match(/col=(\d+)&row=(\d+)&dl=(\d+)&sc=(\d+)&sr=(\d+)/);
      if (!match) {
        tile.setState(3);
        return;
      }

      const col = parseInt(match[1], 10);
      const row = parseInt(match[2], 10);
      const decodeLevel = parseInt(match[3], 10);
      const subCol = parseInt(match[4], 10);
      const subRow = parseInt(match[5], 10);

      const imageTile = tile as ImageTile;
      const img = imageTile.getImage() as HTMLImageElement;

      (async () => {
        progressTotal++;
        emitProgress();
        await sem.acquire();
        try {
          let decoded;
          let lastErr: unknown;
          for (let attempt = 0; attempt <= retryCount; attempt++) {
            try {
              decoded = await provider.getTile(col, row, decodeLevel);
              break;
            } catch (err) {
              lastErr = err;
              if (attempt < retryCount) {
                const delay = Math.min(retryDelay * Math.pow(2, attempt), retryMaxDelay);
                debugWarn(`Tile (${col},${row}) load failed (attempt ${attempt + 1}/${retryCount + 1}), retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
            }
          }
          if (!decoded) {
            debugError(`Failed to load tile (${col},${row}) sub(${subCol},${subRow}) after ${retryCount + 1} attempts:`, lastErr);
            if (onTileError) {
              onTileError({ col, row, decodeLevel, error: lastErr });
            }
            progressFailed++;
            emitProgress();
            tile.setState(3);
            return;
          }

          if (onTileLoad) {
            onTileLoad({ col, row, decodeLevel });
          }
          progressLoaded++;
          emitProgress();

          const canvas = document.createElement('canvas');
          canvas.width = DISPLAY_TILE_SIZE;
          canvas.height = DISPLAY_TILE_SIZE;
          const ctx = canvas.getContext('2d')!;

          const sx = subCol * DISPLAY_TILE_SIZE;
          const sy = subRow * DISPLAY_TILE_SIZE;
          const sw = Math.min(DISPLAY_TILE_SIZE, decoded.width - sx);
          const sh = Math.min(DISPLAY_TILE_SIZE, decoded.height - sy);

          if (sw > 0 && sh > 0) {
            const fullImage = new ImageData(
              new Uint8ClampedArray(decoded.data.buffer as ArrayBuffer),
              decoded.width,
              decoded.height,
            );

            const subData = ctx.createImageData(sw, sh);
            for (let r = 0; r < sh; r++) {
              const srcOffset = ((sy + r) * decoded.width + sx) * 4;
              const dstOffset = r * sw * 4;
              subData.data.set(
                fullImage.data.subarray(srcOffset, srcOffset + sw * 4),
                dstOffset,
              );
            }
            ctx.putImageData(subData, 0, 0);
          }

          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              img.onload = () => URL.revokeObjectURL(url);
              img.src = url;
            }
          });
        } catch (err) {
          debugError(`Failed to load tile (${col},${row}) sub(${subCol},${subRow}):`, err);
          tile.setState(3);
        } finally {
          sem.release();
        }
      })();
    },
  });

  const opacity = Math.max(0, Math.min(1, options?.initialOpacity ?? 1.0));

  const layer = geoInfo
    ? new TileLayer({ source, opacity })
    : new TileLayer({ source, extent, opacity });

  const destroy = () => {
    provider.destroy();
  };

  return { layer, info, projection, extent, resolutions, destroy };
}
