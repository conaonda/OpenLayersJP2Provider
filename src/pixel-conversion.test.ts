import { describe, it, expect } from 'vitest';
import { decodedBufferToRGBA, computeMinMax } from './pixel-conversion';

describe('decodedBufferToRGBA', () => {
  it('8-bit, 3ch: RGB to RGBA with alpha=255', () => {
    const src = new Uint8Array([255,0,0, 0,255,0, 0,0,255, 255,255,255]);
    const rgba = decodedBufferToRGBA(src.buffer, 2, 2, 3);
    expect(rgba).toEqual(new Uint8ClampedArray([
      255,0,0,255,  0,255,0,255,  0,0,255,255,  255,255,255,255,
    ]));
  });

  it('8-bit, 1ch: grayscale to RGBA', () => {
    const src = new Uint8Array([0, 128, 255, 64]);
    const rgba = decodedBufferToRGBA(src.buffer, 2, 2, 1);
    expect(rgba).toEqual(new Uint8ClampedArray([
      0,0,0,255,  128,128,128,255,  255,255,255,255,  64,64,64,255,
    ]));
  });

  it('8-bit, 4ch: RGBA passthrough', () => {
    const src = new Uint8Array([10,20,30,40, 50,60,70,80, 90,100,110,120, 130,140,150,160]);
    const rgba = decodedBufferToRGBA(src.buffer, 2, 2, 4);
    expect(rgba).toEqual(new Uint8ClampedArray(src));
  });

  it('16-bit, 1ch with global min/max: proper normalization', () => {
    // values: 100, 200, 300, 400 with global range 100-400
    const src = new Uint16Array([100, 200, 300, 400]);
    const rgba = decodedBufferToRGBA(src.buffer, 2, 2, 1, 16, 100, 400);
    // (v - 100) * 255 / 300 | 0
    expect(rgba[0]).toBe(0);   // (100-100)*255/300 = 0
    expect(rgba[4]).toBe(85);  // (200-100)*255/300 = 85
    expect(rgba[8]).toBe(170); // (300-100)*255/300 = 170
    expect(rgba[12]).toBe(255); // (400-100)*255/300 = 255
    expect(rgba[3]).toBe(255);
    // R=G=B for grayscale
    expect(rgba[0]).toBe(rgba[1]);
    expect(rgba[0]).toBe(rgba[2]);
  });

  it('16-bit, 3ch with global min/max: RGB normalization', () => {
    const src = new Uint16Array([
      100, 200, 300,
      400, 100, 200,
      300, 400, 100,
      200, 300, 400,
    ]);
    const rgba = decodedBufferToRGBA(src.buffer, 2, 2, 3, 16, 100, 400);
    // range=300
    expect(rgba[0]).toBe(0);    // (100-100)*255/300
    expect(rgba[1]).toBe(85);   // (200-100)*255/300
    expect(rgba[2]).toBe(170);  // (300-100)*255/300
    expect(rgba[3]).toBe(255);
  });

  it('16-bit, uniform values with global range: consistent mapping', () => {
    const src = new Uint16Array([500, 500, 500, 500]);
    const rgba = decodedBufferToRGBA(src.buffer, 2, 2, 1, 16, 0, 1000);
    // (500-0)*255/1000 = 127
    const expected = (500 * 255 / 1000) | 0;
    expect(rgba[0]).toBe(expected);
    expect(rgba[4]).toBe(expected);
    expect(rgba[3]).toBe(255);
  });

  it('16-bit without min/max: falls back to full bit-depth range', () => {
    const src = new Uint16Array([0, 32767, 65535, 0]);
    const rgba = decodedBufferToRGBA(src.buffer, 2, 2, 1, 16);
    // maxVal=65535, min=0 → (v * 255 / 65535) | 0
    expect(rgba[0]).toBe(0);
    expect(rgba[4]).toBe(127);
    expect(rgba[8]).toBe(255);
  });

  it('16-bit fallback: no bitsPerSample uses byteLength heuristic', () => {
    const src16 = new Uint16Array([32768]);
    const rgba16 = decodedBufferToRGBA(src16.buffer, 1, 1, 1);
    // fallback: maxVal=65535, (32768*255/65535)|0 = 127
    expect(rgba16[0]).toBe(127);

    const src8 = new Uint8Array([200]);
    const rgba8 = decodedBufferToRGBA(src8.buffer, 1, 1, 1);
    expect(rgba8[0]).toBe(200);
  });

  it('16-bit from WASM-like Uint8Array view: correct reinterpretation', () => {
    // Simulate WASM heap: a larger ArrayBuffer with our data at an offset
    const u16data = new Uint16Array([100, 200, 300, 400]);
    const heap = new ArrayBuffer(1024);
    const offset = 128;
    new Uint8Array(heap).set(new Uint8Array(u16data.buffer), offset);
    const wasmView = new Uint8Array(heap, offset, u16data.byteLength);

    const rgba = decodedBufferToRGBA(wasmView, 2, 2, 1, 16, 100, 400);
    expect(rgba[0]).toBe(0);   // (100-100)*255/300
    expect(rgba[4]).toBe(85);  // (200-100)*255/300
    expect(rgba[8]).toBe(170); // (300-100)*255/300
    expect(rgba[12]).toBe(255); // (400-100)*255/300
  });
});

describe('computeMinMax', () => {
  it('returns min/max for 16-bit data', () => {
    const src = new Uint16Array([100, 500, 200, 1000]);
    const result = computeMinMax(src.buffer, 4, 1, 16);
    expect(result).toEqual({ min: 100, max: 1000 });
  });

  it('returns min/max from WASM-like Uint8Array view', () => {
    const u16data = new Uint16Array([100, 500, 200, 1000]);
    const heap = new ArrayBuffer(1024);
    const offset = 64;
    new Uint8Array(heap).set(new Uint8Array(u16data.buffer), offset);
    const wasmView = new Uint8Array(heap, offset, u16data.byteLength);
    const result = computeMinMax(wasmView, 4, 1, 16);
    expect(result).toEqual({ min: 100, max: 1000 });
  });

  it('returns null for 8-bit data', () => {
    const src = new Uint8Array([100, 200]);
    const result = computeMinMax(src.buffer, 2, 1, 8);
    expect(result).toBeNull();
  });
});
