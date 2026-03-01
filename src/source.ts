import TileImage from 'ol/source/TileImage';
import TileLayer from 'ol/layer/Tile';
import TileGrid from 'ol/tilegrid/TileGrid';
import { Projection, get as getProjection } from 'ol/proj';
import type Tile from 'ol/Tile';
import ImageTile from 'ol/ImageTile';
import type { TileProvider, TileProviderInfo, GeoInfo } from './tile-provider';

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

export interface JP2LayerResult {
  layer: TileLayer<TileImage>;
  info: TileProviderInfo;
  projection: Projection;
  extent: [number, number, number, number];
  resolutions: number[];
}

export async function createJP2TileLayer(
  provider: TileProvider,
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
    // Geographic mode: compute extent and resolutions in CRS units
    const minX = geoInfo.originX;
    const maxY = geoInfo.originY;
    const maxX = minX + width * geoInfo.pixelScaleX;
    const minY = maxY - height * geoInfo.pixelScaleY;
    extent = [minX, minY, maxX, maxY];

    // Resolutions in CRS units per pixel
    resolutions = pixelResolutions.map(r => r * geoInfo.pixelScaleX);

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

  const sem = new Semaphore(4);

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
        await sem.acquire();
        try {
          const decoded = await provider.getTile(col, row, decodeLevel);

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
          console.error(`Failed to load tile (${col},${row}) sub(${subCol},${subRow}):`, err);
          tile.setState(3);
        } finally {
          sem.release();
        }
      })();
    },
  });

  const layer = geoInfo
    ? new TileLayer({ source })
    : new TileLayer({ source, extent });

  return { layer, info, projection, extent, resolutions };
}
