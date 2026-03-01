export interface DecodedTile {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface GeoInfo {
  originX: number;
  originY: number;
  pixelScaleX: number;
  pixelScaleY: number;
  epsgCode: number;
}

export interface TileProviderInfo {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  tilesX: number;
  tilesY: number;
  componentCount: number;
  maxDecodeLevel: number;
  geoInfo?: GeoInfo;
}

export interface TileProvider {
  init(): Promise<TileProviderInfo>;
  getTile(col: number, row: number, decodeLevel: number): Promise<DecodedTile>;
  destroy(): void;
}
