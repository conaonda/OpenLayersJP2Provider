import { debugLog, debugWarn } from './debug-logger';

export interface TileIndex {
  tileId: number;
  offset: number;     // absolute file offset
  length: number;     // tile-part byte count (Psot)
}

export interface GeoInfo {
  originX: number;       // top-left X in CRS units
  originY: number;       // top-left Y in CRS units
  pixelScaleX: number;   // CRS units per pixel (X)
  pixelScaleY: number;   // CRS units per pixel (Y)
  epsgCode: number;      // EPSG code (e.g. 4326, 3857, 5186)
}

export interface JP2Info {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  tilesX: number;
  tilesY: number;
  componentCount: number;
  mainHeader: Uint8Array;  // cached for reuse
  tiles: TileIndex[];
  geoInfo?: GeoInfo;
}

async function fetchRange(url: string, start: number, end: number): Promise<ArrayBuffer> {
  const resp = await fetch(url, {
    headers: { Range: `bytes=${start}-${end}` },
  });
  if (!resp.ok && resp.status !== 206) {
    throw new Error(`Range request failed: ${resp.status}`);
  }
  return resp.arrayBuffer();
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, false); // big-endian
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

// GeoJP2 UUID: b14bf8bd-083d-4b43-a5ae-8cd7d5a6ce03
const GEOJP2_UUID = [0xb1,0x4b,0xf8,0xbd,0x08,0x3d,0x4b,0x43,0xa5,0xae,0x8c,0xd7,0xd5,0xa6,0xce,0x03];

interface PendingBox {
  type: 'uuid' | 'xml';
  fileOffset: number;
  length: number;
}

interface JP2Boxes {
  jp2cOffset: number;
  geoInfo?: GeoInfo;
  pendingGeoBoxes: PendingBox[];
}

/** Recursively scan JP2 boxes, including inside asoc superboxes. */
function scanJP2Boxes(data: Uint8Array, dataFileOffset = 0): JP2Boxes {
  let jp2cOffset = -1;
  let geoInfo: GeoInfo | undefined;
  const pendingGeoBoxes: PendingBox[] = [];

  function scan(start: number, end: number) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = start;
    while (offset + 8 <= end) {
      let boxLen = readUint32(view, offset);
      const boxType = readUint32(view, offset + 4);
      let headerSize = 8;

      if (boxLen === 1 && offset + 16 <= end) {
        boxLen = Number(view.getBigUint64(offset + 8, false));
        headerSize = 16;
      }
      // boxLen === 0 means "box extends to end of file" per ISO 15444-1
      if (boxLen === 0) {
        boxLen = end - offset;
      }
      if (boxLen < headerSize) break;
      const boxEnd = offset + boxLen;
      const clampedEnd = Math.min(boxEnd, end);

      // jp2c = 0x6A703263
      if (boxType === 0x6A703263) {
        jp2cOffset = offset + headerSize;
      }

      // uuid = 0x75756964
      if (boxType === 0x75756964) {
        if (offset + headerSize + 16 <= end) {
          const uuidMatch = GEOJP2_UUID.every((b, i) => data[offset + headerSize + i] === b);
          if (uuidMatch) {
            const tiffStart = offset + headerSize + 16;
            if (boxEnd > end) {
              // Box content truncated — mark as pending
              pendingGeoBoxes.push({ type: 'uuid', fileOffset: dataFileOffset + offset, length: boxLen });
            } else if (clampedEnd > tiffStart) {
              geoInfo = geoInfo || parseGeoTIFF(data.subarray(tiffStart, clampedEnd));
            }
          }
        } else if (boxLen > headerSize + 16) {
          // Can't even read UUID bytes — pending
          pendingGeoBoxes.push({ type: 'uuid', fileOffset: dataFileOffset + offset, length: boxLen });
        }
      }

      // xml = 0x786D6C20 (GMLJP2)
      if (boxType === 0x786D6C20 && !geoInfo) {
        const xmlStart = offset + headerSize;
        if (boxEnd > end) {
          // Truncated XML box
          pendingGeoBoxes.push({ type: 'xml', fileOffset: dataFileOffset + offset, length: boxLen });
        } else if (clampedEnd > xmlStart) {
          const xmlStr = new TextDecoder().decode(data.subarray(xmlStart, clampedEnd));
          geoInfo = parseGMLJP2(xmlStr);
        }
      }

      // asoc = 0x61736F63 — recurse into superbox
      if (boxType === 0x61736F63) {
        scan(offset + headerSize, clampedEnd);
      }

      // Use boxLen (not clampedEnd) to jump to next box even if content was truncated
      offset += boxLen;
    }
  }

  scan(0, data.length);
  if (jp2cOffset < 0) throw new Error('jp2c box not found');
  return { jp2cOffset, geoInfo, pendingGeoBoxes };
}

/** Parse GeoTIFF IFD from GeoJP2 UUID payload. */
function parseGeoTIFF(data: Uint8Array): GeoInfo | undefined {
  if (data.length < 8) return undefined;
  const le = data[0] === 0x49 && data[1] === 0x49; // 'II' = little-endian
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const r16 = (o: number) => view.getUint16(o, le);
  const r32 = (o: number) => view.getUint32(o, le);
  const rF64 = (o: number) => view.getFloat64(o, le);

  const magic = r16(2);
  if (magic !== 42) return undefined;

  const ifdOffset = r32(4);
  if (ifdOffset + 2 > data.length) return undefined;
  const count = r16(ifdOffset);

  let pixelScale: number[] | undefined;
  let tiepoint: number[] | undefined;
  let geoKeys: number[] | undefined;

  for (let i = 0; i < count; i++) {
    const entryOff = ifdOffset + 2 + i * 12;
    if (entryOff + 12 > data.length) break;

    const tag = r16(entryOff);
    const type = r16(entryOff + 2);
    const cnt = r32(entryOff + 4);
    const valOff = r32(entryOff + 8);

    if (tag === 33550 && type === 12) { // ModelPixelScaleTag, DOUBLE
      const off = cnt * 8 > 4 ? valOff : entryOff + 8;
      if (off + cnt * 8 <= data.length) {
        pixelScale = [];
        for (let j = 0; j < cnt; j++) pixelScale.push(rF64(off + j * 8));
      }
    }

    if (tag === 33922 && type === 12) { // ModelTiepointTag, DOUBLE
      const off = cnt * 8 > 4 ? valOff : entryOff + 8;
      if (off + cnt * 8 <= data.length) {
        tiepoint = [];
        for (let j = 0; j < cnt; j++) tiepoint.push(rF64(off + j * 8));
      }
    }

    if (tag === 34735 && type === 3) { // GeoKeyDirectoryTag, SHORT
      const off = cnt * 2 > 4 ? valOff : entryOff + 8;
      if (off + cnt * 2 <= data.length) {
        geoKeys = [];
        for (let j = 0; j < cnt; j++) geoKeys.push(r16(off + j * 2));
      }
    }
  }

  if (!pixelScale || !tiepoint || pixelScale.length < 2 || tiepoint.length < 6) return undefined;

  // Extract EPSG from GeoKeys
  let epsgCode = 0;
  let isGeographic = false;
  if (geoKeys && geoKeys.length >= 4) {
    const numKeys = geoKeys[3];
    for (let k = 0; k < numKeys; k++) {
      const base = 4 + k * 4;
      if (base + 3 >= geoKeys.length) break;
      const keyId = geoKeys[base];
      const tiffTagLoc = geoKeys[base + 1];
      // const count = geoKeys[base + 2];
      const value = geoKeys[base + 3];
      // ProjectedCSTypeGeoKey=3072, GeographicTypeGeoKey=2048
      if (keyId === 2048 && tiffTagLoc === 0 && value > 0) {
        epsgCode = value;
        isGeographic = true;
      }
      if (keyId === 3072 && tiffTagLoc === 0 && value > 0) {
        epsgCode = value;
        isGeographic = false;
      }
    }
  }

  if (epsgCode === 0) {
    debugWarn('GeoJP2: could not determine EPSG code from GeoKeys');
    return undefined;
  }

  // Tiepoint: [I, J, K, X, Y, Z] — pixel (I,J) maps to CRS (X,Y)
  let originX = tiepoint[3] - tiepoint[0] * pixelScale[0];
  let originY = tiepoint[4] + tiepoint[1] * pixelScale[1];
  let scaleX = pixelScale[0];
  let scaleY = pixelScale[1];

  // For geographic CRS (e.g. EPSG:4326), GeoTIFF tiepoints may store
  // lat/lon order. Detect and swap if originY is out of latitude range
  // but originX is within latitude range.
  if (isGeographic && Math.abs(originY) > 90 && Math.abs(originX) <= 90) {
    debugLog('GeoJP2: detected lat/lon axis swap, correcting...');
    [originX, originY] = [originY, originX];
    [scaleX, scaleY] = [scaleY, scaleX];
  }

  debugLog(`GeoJP2: EPSG:${epsgCode}, origin=(${originX}, ${originY}), scale=(${scaleX}, ${scaleY}), geographic=${isGeographic}`);

  return {
    originX,
    originY,
    pixelScaleX: scaleX,
    pixelScaleY: scaleY,
    epsgCode,
  };
}

/** Parse GMLJP2 XML for geo info. */
function parseGMLJP2(xml: string): GeoInfo | undefined {
  try {
    // Extract srsName
    const srsMatch = xml.match(/srsName\s*=\s*["']([^"']+)["']/);
    if (!srsMatch) return undefined;
    const srs = srsMatch[1];
    const epsgMatch = srs.match(/(?:EPSG[:/]+)(\d+)/i);
    if (!epsgMatch) return undefined;
    const epsgCode = parseInt(epsgMatch[1], 10);

    // Try RectifiedGrid origin + offsetVector
    const originMatch = xml.match(/<gml:pos[^>]*>\s*([\d.eE+-]+)\s+([\d.eE+-]+)/);
    const offsetMatches = [...xml.matchAll(/<gml:offsetVector[^>]*>\s*([\d.eE+-]+)\s+([\d.eE+-]+)/g)];

    if (originMatch && offsetMatches.length >= 2) {
      const ox = parseFloat(originMatch[1]);
      const oy = parseFloat(originMatch[2]);
      // offsetVector[0] = row direction, offsetVector[1] = col direction typically
      const v0x = parseFloat(offsetMatches[0][1]);
      const v0y = parseFloat(offsetMatches[0][2]);
      const v1x = parseFloat(offsetMatches[1][1]);
      const v1y = parseFloat(offsetMatches[1][2]);
      const pixelScaleX = Math.abs(v1x) || Math.abs(v0x);
      const pixelScaleY = Math.abs(v0y) || Math.abs(v1y);

      if (pixelScaleX > 0 && pixelScaleY > 0) {
        debugLog(`GMLJP2: EPSG:${epsgCode}, origin=(${ox}, ${oy}), scale=(${pixelScaleX}, ${pixelScaleY})`);
        return { originX: ox, originY: oy, pixelScaleX, pixelScaleY, epsgCode };
      }
    }

    // Try Envelope lowerCorner/upperCorner (need image dimensions later)
    const lowerMatch = xml.match(/<gml:lowerCorner[^>]*>\s*([\d.eE+-]+)\s+([\d.eE+-]+)/);
    const upperMatch = xml.match(/<gml:upperCorner[^>]*>\s*([\d.eE+-]+)\s+([\d.eE+-]+)/);
    if (lowerMatch && upperMatch) {
      // Store envelope — pixelScale will be computed later with image dimensions
      debugLog(`GMLJP2: EPSG:${epsgCode}, envelope found (pixelScale needs image dimensions)`);
      // For now, return with placeholder scales — caller should compute
      return {
        originX: parseFloat(lowerMatch[2]),
        originY: parseFloat(upperMatch[1]),
        pixelScaleX: 0, // placeholder
        pixelScaleY: 0,
        epsgCode,
      };
    }
  } catch {
    // non-fatal
  }
  return undefined;
}

/** Parse SIZ marker from codestream to extract image/tile dimensions. */
function parseSIZ(data: Uint8Array, csOffset: number): {
  width: number; height: number;
  tileWidth: number; tileHeight: number;
  componentCount: number;
  sizEnd: number; // offset after SIZ marker segment
} {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // codestream starts with SOC (0xFF4F) then SIZ (0xFF51)
  let pos = csOffset;
  const soc = readUint16(view, pos);
  if (soc !== 0xFF4F) throw new Error(`Expected SOC marker, got 0x${soc.toString(16)}`);
  pos += 2;

  const sizMarker = readUint16(view, pos);
  if (sizMarker !== 0xFF51) throw new Error(`Expected SIZ marker, got 0x${sizMarker.toString(16)}`);
  pos += 2;

  const lsiz = readUint16(view, pos);
  pos += 2;

  // Skip Rsiz (2 bytes)
  pos += 2;

  const xsiz = readUint32(view, pos); pos += 4;
  const ysiz = readUint32(view, pos); pos += 4;
  const xOsiz = readUint32(view, pos); pos += 4;
  const yOsiz = readUint32(view, pos); pos += 4;
  const xtSiz = readUint32(view, pos); pos += 4;
  const ytSiz = readUint32(view, pos); pos += 4;
  // Skip XTOsiz, YTOsiz (8 bytes)
  pos += 8;
  const csiz = readUint16(view, pos);

  const width = xsiz - xOsiz;
  const height = ysiz - yOsiz;

  // sizEnd = start of SIZ marker + 2 (marker) + lsiz
  const sizEnd = csOffset + 2 + 2 + lsiz;

  return {
    width, height,
    tileWidth: xtSiz, tileHeight: ytSiz,
    componentCount: csiz,
    sizEnd,
  };
}

/**
 * Build the main header bytes: everything from SOC up to (not including) the first SOT marker.
 * We scan from the SIZ end looking for SOT (0xFF90).
 */
function findFirstSOT(data: Uint8Array, afterSIZ: number, csOffset: number): number {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = afterSIZ;
  while (pos + 2 <= data.length) {
    const marker = readUint16(view, pos);
    if (marker === 0xFF90) {
      return pos; // SOT found
    }
    if ((marker & 0xFF00) !== 0xFF00) {
      throw new Error(`Invalid marker 0x${marker.toString(16)} at offset ${pos}`);
    }
    // Skip marker segment: marker(2) + Lxx(2) + Lxx-2 bytes
    if (pos + 4 > data.length) break;
    const segLen = readUint16(view, pos + 2);
    pos += 2 + segLen;
  }
  throw new Error('SOT marker not found in initial data');
}

/**
 * Parse JP2 file via HTTP Range requests and build tile index.
 */
export async function parseJP2(url: string): Promise<JP2Info> {
  // Step 1: Read initial chunk to find jp2c, geo info, and parse SIZ
  const initialSize = 262144; // 256KB to capture geo metadata boxes
  const initialData = new Uint8Array(await fetchRange(url, 0, initialSize - 1));
  const { jp2cOffset, geoInfo: initialGeoInfo, pendingGeoBoxes } = scanJP2Boxes(initialData);

  // If geo info not found but there are truncated geo boxes, fetch and parse them
  let geoInfo = initialGeoInfo;
  if (!geoInfo && pendingGeoBoxes.length > 0) {
    for (const pending of pendingGeoBoxes) {
      try {
        const boxData = new Uint8Array(await fetchRange(url, pending.fileOffset, pending.fileOffset + pending.length - 1));
        const view = new DataView(boxData.buffer, boxData.byteOffset, boxData.byteLength);
        let headerSize = 8;
        const boxLen = readUint32(view, 0);
        if (boxLen === 1) headerSize = 16;

        if (pending.type === 'uuid') {
          const tiffStart = headerSize + 16;
          if (boxData.length > tiffStart) {
            geoInfo = parseGeoTIFF(boxData.subarray(tiffStart));
          }
        } else {
          const xmlStr = new TextDecoder().decode(boxData.subarray(headerSize));
          geoInfo = parseGMLJP2(xmlStr);
        }
        if (geoInfo) break;
      } catch (e) {
        debugWarn(`Failed to fetch pending geo box at offset ${pending.fileOffset}:`, e);
      }
    }
  }

  const siz = parseSIZ(initialData, jp2cOffset);
  const firstSOTOffset = findFirstSOT(initialData, siz.sizEnd, jp2cOffset);

  // Main header = from codestream start to first SOT
  const mainHeader = initialData.slice(jp2cOffset, firstSOTOffset);

  const tilesX = Math.ceil(siz.width / siz.tileWidth);
  const tilesY = Math.ceil(siz.height / siz.tileHeight);
  const totalTiles = tilesX * tilesY;

  debugLog(`JP2 info: ${siz.width}x${siz.height}, tiles ${tilesX}x${tilesY} (${totalTiles}), tile size ${siz.tileWidth}x${siz.tileHeight}`);

  // Step 2: Sequential SOT scan to build tile index
  const tiles: TileIndex[] = [];
  let sotOffset = firstSOTOffset; // absolute file offset of current SOT

  for (let i = 0; i < totalTiles; i++) {
    // Read 12 bytes of SOT marker segment
    const sotData = new Uint8Array(await fetchRange(url, sotOffset, sotOffset + 11));
    const view = new DataView(sotData.buffer);

    const marker = readUint16(view, 0);
    if (marker !== 0xFF90) {
      throw new Error(`Expected SOT marker at offset ${sotOffset}, got 0x${marker.toString(16)}`);
    }

    const lsot = readUint16(view, 2); // should be 10
    const isot = readUint16(view, 4); // tile index
    const psot = readUint32(view, 6); // tile-part length (includes SOT)

    if (psot === 0) {
      throw new Error(`Psot=0 (last tile extends to EOC) not supported for tile ${isot}`);
    }

    tiles.push({
      tileId: isot,
      offset: sotOffset,
      length: psot,
    });

    // Next SOT is at current offset + psot
    sotOffset += psot;

    if ((i + 1) % 50 === 0) {
      debugLog(`Indexed ${i + 1}/${totalTiles} tiles...`);
    }
  }

  debugLog(`Tile index complete: ${tiles.length} tiles indexed`);

  // If GMLJP2 envelope had placeholder pixelScale, compute from image dimensions
  let finalGeoInfo = geoInfo;
  if (finalGeoInfo && finalGeoInfo.pixelScaleX === 0) {
    // We had envelope only — need to compute from dimensions
    // This is a best-effort fallback
    finalGeoInfo = undefined;
  }

  return {
    width: siz.width,
    height: siz.height,
    tileWidth: siz.tileWidth,
    tileHeight: siz.tileHeight,
    tilesX,
    tilesY,
    componentCount: siz.componentCount,
    mainHeader,
    tiles,
    geoInfo: finalGeoInfo,
  };
}

/**
 * Fetch tile data for a specific tile by its index entry.
 */
export async function fetchTileData(url: string, tile: TileIndex): Promise<Uint8Array> {
  const data = await fetchRange(url, tile.offset, tile.offset + tile.length - 1);
  return new Uint8Array(data);
}
