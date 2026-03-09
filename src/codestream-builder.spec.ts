import { describe, it, expect } from 'vitest';
import { buildTileCodestream } from './codestream-builder';

describe('buildTileCodestream', () => {
  it('patches SIZ dimensions, resets tile index, and appends EOC', () => {
    // Create a minimal 40-byte header (enough for SIZ fields up to offset 36)
    const header = new Uint8Array(40);
    // Create a minimal tile part with SOT marker (10 bytes min: FF90 + length + tile index)
    const tileData = new Uint8Array([0xFF, 0x90, 0x00, 0x0A, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);

    const result = buildTileCodestream(header, tileData, 256, 128);

    // Check total length: header(40) + tile(10) + EOC(2)
    expect(result.length).toBe(52);

    const dv = new DataView(result.buffer, result.byteOffset, result.byteLength);

    // SIZ patched dimensions at offset 8
    expect(dv.getUint32(8, false)).toBe(256);   // Xsiz = actualW
    expect(dv.getUint32(12, false)).toBe(128);  // Ysiz = actualH
    expect(dv.getUint32(16, false)).toBe(0);    // XOsiz
    expect(dv.getUint32(20, false)).toBe(0);    // YOsiz
    expect(dv.getUint32(24, false)).toBe(256);  // XTsiz
    expect(dv.getUint32(28, false)).toBe(128);  // YTsiz

    // Tile index reset to 0
    expect(dv.getUint16(44, false)).toBe(0);

    // EOC marker at end
    expect(result[50]).toBe(0xFF);
    expect(result[51]).toBe(0xD9);
  });

  it('does not mutate the original header or tileData', () => {
    const header = new Uint8Array(40);
    header[8] = 0x01;
    const headerCopy = new Uint8Array(header);

    const tileData = new Uint8Array([0xFF, 0x90, 0x00, 0x0A, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00]);
    const tileCopy = new Uint8Array(tileData);

    buildTileCodestream(header, tileData, 100, 100);

    // Originals should be unchanged
    expect(header).toEqual(headerCopy);
    expect(tileData).toEqual(tileCopy);
  });
});
