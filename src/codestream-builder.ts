/**
 * Builds a single-tile JP2 codestream by patching the SIZ marker in the
 * main header, resetting the tile index, and appending EOC.
 */
export function buildTileCodestream(
  mainHeader: Uint8Array,
  tileData: Uint8Array,
  actualW: number,
  actualH: number,
): Uint8Array {
  const header = new Uint8Array(mainHeader);
  const hv = new DataView(header.buffer, header.byteOffset, header.byteLength);

  // SIZ marker is at offset 4 from SOC (0xFF4F); Xsiz starts at byte 8
  const xsizOff = 8;
  hv.setUint32(xsizOff, actualW, false);
  hv.setUint32(xsizOff + 4, actualH, false);
  hv.setUint32(xsizOff + 8, 0, false);   // XOsiz
  hv.setUint32(xsizOff + 12, 0, false);  // YOsiz
  hv.setUint32(xsizOff + 16, actualW, false);  // XTsiz
  hv.setUint32(xsizOff + 20, actualH, false);  // YTsiz
  hv.setUint32(xsizOff + 24, 0, false);  // XTOsiz
  hv.setUint32(xsizOff + 28, 0, false);  // YTOsiz

  const tile = new Uint8Array(tileData);
  const tv = new DataView(tile.buffer, tile.byteOffset, tile.byteLength);
  tv.setUint16(4, 0, false); // Reset tile index to 0

  const eoc = new Uint8Array([0xFF, 0xD9]);
  const codestream = new Uint8Array(header.length + tile.length + 2);
  codestream.set(header, 0);
  codestream.set(tile, header.length);
  codestream.set(eoc, header.length + tile.length);

  return codestream;
}
