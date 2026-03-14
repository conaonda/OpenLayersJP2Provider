import { describe, it, expect } from 'vitest';
import { decodedBufferToRGBA, computeMinMax, applyNodata, applyGamma, applyBrightness, applyContrast, applySaturation, applyHue, applyInvert, applyThreshold, applyColorize, applySharpen, applyBlur, applySepia } from './pixel-conversion';

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

describe('applyNodata', () => {
  it('single nodata value on grayscale: matching pixels become transparent', () => {
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 255,
      128, 128, 128, 255,
      0, 0, 0, 255,
      255, 255, 255, 255,
    ]);
    applyNodata(rgba, 2, 2, 1, [0]);
    expect(rgba[3]).toBe(0);    // pixel 0: nodata
    expect(rgba[7]).toBe(255);  // pixel 1: kept
    expect(rgba[11]).toBe(0);   // pixel 2: nodata
    expect(rgba[15]).toBe(255); // pixel 3: kept
  });

  it('array of nodata values on grayscale', () => {
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 255,
      128, 128, 128, 255,
      255, 255, 255, 255,
    ]);
    applyNodata(rgba, 3, 1, 1, [0, 255]);
    expect(rgba[3]).toBe(0);    // 0 is nodata
    expect(rgba[7]).toBe(255);  // 128 is not nodata
    expect(rgba[11]).toBe(0);   // 255 is nodata
  });

  it('multi-channel: transparent only when all RGB match nodata', () => {
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 255,     // all match → transparent
      0, 128, 0, 255,   // not all match → opaque
      10, 10, 10, 255,  // all match → transparent
    ]);
    applyNodata(rgba, 3, 1, 3, [0, 10]);
    expect(rgba[3]).toBe(0);
    expect(rgba[7]).toBe(255);
    expect(rgba[11]).toBe(0);
  });

  it('undefined/empty nodata: no change (caller guards)', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255]);
    applyNodata(rgba, 1, 1, 1, []);
    expect(rgba[3]).toBe(255);
  });

  it('tolerance: pixels within tolerance of nodata become transparent', () => {
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 255,
      3, 3, 3, 255,
      5, 5, 5, 255,
      6, 6, 6, 255,
    ]);
    applyNodata(rgba, 2, 2, 1, [0], 5);
    expect(rgba[3]).toBe(0);    // 0: |0-0|=0 <= 5
    expect(rgba[7]).toBe(0);    // 3: |3-0|=3 <= 5
    expect(rgba[11]).toBe(0);   // 5: |5-0|=5 <= 5
    expect(rgba[15]).toBe(255); // 6: |6-0|=6 > 5
  });

  it('tolerance=0: behaves like exact match', () => {
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 255,
      1, 1, 1, 255,
    ]);
    applyNodata(rgba, 2, 1, 1, [0], 0);
    expect(rgba[3]).toBe(0);
    expect(rgba[7]).toBe(255);
  });
});

describe('applyGamma', () => {
  it('gamma=1.0: no change', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyGamma(rgba, 1, 1, 1.0);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
    expect(rgba[3]).toBe(255);
  });

  it('gamma=2.2: pixels become brighter', () => {
    const rgba = new Uint8ClampedArray([100, 100, 100, 255]);
    applyGamma(rgba, 1, 1, 2.2);
    // out = 255 * (100/255)^(1/2.2) ≈ 255 * 0.6467 ≈ 165
    expect(rgba[0]).toBeGreaterThan(100);
    expect(rgba[3]).toBe(255); // alpha unchanged
  });

  it('gamma<1: pixels become darker', () => {
    const rgba = new Uint8ClampedArray([200, 200, 200, 255]);
    applyGamma(rgba, 1, 1, 0.5);
    expect(rgba[0]).toBeLessThan(200);
    expect(rgba[3]).toBe(255);
  });

  it('preserves 0 and 255 values', () => {
    const rgba = new Uint8ClampedArray([0, 255, 128, 255]);
    applyGamma(rgba, 1, 1, 2.2);
    expect(rgba[0]).toBe(0);
    expect(rgba[1]).toBe(255);
  });
});

describe('applyBrightness', () => {
  it('brightness=0: no change', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyBrightness(rgba, 1, 1, 0);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
    expect(rgba[3]).toBe(255);
  });

  it('brightness=1: all pixels become 255', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyBrightness(rgba, 1, 1, 1);
    expect(rgba[0]).toBe(255);
    expect(rgba[1]).toBe(255);
    expect(rgba[2]).toBe(255);
    expect(rgba[3]).toBe(255);
  });

  it('brightness=-1: all pixels become 0', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyBrightness(rgba, 1, 1, -1);
    expect(rgba[0]).toBe(0);
    expect(rgba[1]).toBe(0);
    expect(rgba[2]).toBe(0);
    expect(rgba[3]).toBe(255);
  });

  it('positive brightness increases pixel values', () => {
    const rgba = new Uint8ClampedArray([100, 100, 100, 255]);
    applyBrightness(rgba, 1, 1, 0.5);
    // 100 + 128 = 228
    expect(rgba[0]).toBe(228);
    expect(rgba[3]).toBe(255);
  });

  it('clamps to 0-255 range', () => {
    const rgba = new Uint8ClampedArray([200, 50, 100, 255]);
    applyBrightness(rgba, 1, 1, 0.5);
    expect(rgba[0]).toBe(255); // 200+128 clamped
    expect(rgba[1]).toBe(178); // 50+128
  });
});

describe('applyContrast', () => {
  it('contrast=1.0: no change', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyContrast(rgba, 1, 1, 1.0);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
    expect(rgba[3]).toBe(255);
  });

  it('contrast=0: all pixels become 128 (mid-gray)', () => {
    const rgba = new Uint8ClampedArray([0, 100, 255, 255]);
    applyContrast(rgba, 1, 1, 0);
    expect(rgba[0]).toBe(128);
    expect(rgba[1]).toBe(128);
    expect(rgba[2]).toBe(128);
    expect(rgba[3]).toBe(255);
  });

  it('contrast=2: doubles contrast', () => {
    const rgba = new Uint8ClampedArray([192, 64, 128, 255]);
    applyContrast(rgba, 1, 1, 2);
    // (192-128)*2+128 = 256 → clamped to 255
    expect(rgba[0]).toBe(255);
    // (64-128)*2+128 = 0
    expect(rgba[1]).toBe(0);
    // (128-128)*2+128 = 128
    expect(rgba[2]).toBe(128);
    expect(rgba[3]).toBe(255);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([100, 100, 100, 200]);
    applyContrast(rgba, 1, 1, 2);
    expect(rgba[3]).toBe(200);
  });
});

describe('applySaturation', () => {
  it('saturation=1.0: no change', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applySaturation(rgba, 1, 1, 1.0);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
    expect(rgba[3]).toBe(255);
  });

  it('saturation=0: grayscale', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255]);
    applySaturation(rgba, 1, 1, 0);
    // gray = 0.2126*255 + 0.7152*0 + 0.0722*0 ≈ 54
    const gray = Math.round(0.2126 * 255);
    expect(rgba[0]).toBe(gray);
    expect(rgba[1]).toBe(gray);
    expect(rgba[2]).toBe(gray);
    expect(rgba[3]).toBe(255);
  });

  it('saturation=2: oversaturated', () => {
    const rgba = new Uint8ClampedArray([200, 100, 100, 255]);
    applySaturation(rgba, 1, 1, 2);
    expect(rgba[0]).toBeGreaterThan(200);
    expect(rgba[1]).toBeLessThan(100);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 128]);
    applySaturation(rgba, 1, 1, 0);
    expect(rgba[3]).toBe(128);
  });
});

describe('applyHue', () => {
  it('hue=0: no change', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255]);
    applyHue(rgba, 1, 1, 0);
    expect(rgba[0]).toBe(255);
    expect(rgba[1]).toBe(0);
    expect(rgba[2]).toBe(0);
    expect(rgba[3]).toBe(255);
  });

  it('hue=360: full rotation returns to original', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255]);
    applyHue(rgba, 1, 1, 360);
    expect(rgba[0]).toBe(255);
    expect(rgba[1]).toBe(0);
    expect(rgba[2]).toBe(0);
  });

  it('hue=120: red shifts toward green', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255]);
    applyHue(rgba, 1, 1, 120);
    // Red (H=0) + 120° → H=120° → green
    expect(rgba[0]).toBeLessThan(255);
    expect(rgba[1]).toBeGreaterThan(0);
  });

  it('achromatic pixels unchanged', () => {
    const rgba = new Uint8ClampedArray([128, 128, 128, 255]);
    applyHue(rgba, 1, 1, 90);
    expect(rgba[0]).toBe(128);
    expect(rgba[1]).toBe(128);
    expect(rgba[2]).toBe(128);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 100]);
    applyHue(rgba, 1, 1, 180);
    expect(rgba[3]).toBe(100);
  });
});

describe('applyInvert', () => {
  it('inverts RGB channels', () => {
    const rgba = new Uint8ClampedArray([0, 128, 255, 255]);
    applyInvert(rgba, 1, 1);
    expect(rgba[0]).toBe(255);
    expect(rgba[1]).toBe(127);
    expect(rgba[2]).toBe(0);
    expect(rgba[3]).toBe(255);
  });

  it('double invert returns to original', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 128]);
    applyInvert(rgba, 1, 1);
    applyInvert(rgba, 1, 1);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([100, 100, 100, 50]);
    applyInvert(rgba, 1, 1);
    expect(rgba[3]).toBe(50);
  });
});

describe('applyThreshold', () => {
  it('pixels above threshold become white, below become black', () => {
    const rgba = new Uint8ClampedArray([
      200, 200, 200, 255,  // lum ≈ 200 → white
      50, 50, 50, 255,     // lum ≈ 50 → black
    ]);
    applyThreshold(rgba, 2, 1, 128);
    expect(rgba[0]).toBe(255);
    expect(rgba[1]).toBe(255);
    expect(rgba[2]).toBe(255);
    expect(rgba[4]).toBe(0);
    expect(rgba[5]).toBe(0);
    expect(rgba[6]).toBe(0);
  });

  it('exact threshold value becomes white', () => {
    const rgba = new Uint8ClampedArray([128, 128, 128, 255]);
    applyThreshold(rgba, 1, 1, 128);
    expect(rgba[0]).toBe(255);
  });

  it('uses luminance formula for color pixels', () => {
    // Pure red: lum = 0.2126*255 ≈ 54.2
    const rgba = new Uint8ClampedArray([255, 0, 0, 255]);
    applyThreshold(rgba, 1, 1, 55);
    expect(rgba[0]).toBe(0); // lum < 55
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([200, 200, 200, 100]);
    applyThreshold(rgba, 1, 1, 128);
    expect(rgba[3]).toBe(100);
  });
});

describe('applyColorize', () => {
  it('applies orange tint to grayscale', () => {
    const rgba = new Uint8ClampedArray([128, 128, 128, 255]);
    applyColorize(rgba, 1, 1, [255, 128, 0]);
    // lum ≈ 128, t = 128/255 ≈ 0.502
    expect(rgba[0]).toBe(Math.round(128 / 255 * 255)); // 128
    expect(rgba[1]).toBe(Math.round(128 / 255 * 128)); // 64
    expect(rgba[2]).toBe(0);
    expect(rgba[3]).toBe(255);
  });

  it('white pixel gets full color', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255]);
    applyColorize(rgba, 1, 1, [255, 128, 0]);
    expect(rgba[0]).toBe(255);
    expect(rgba[1]).toBe(128);
    expect(rgba[2]).toBe(0);
  });

  it('black pixel stays black', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255]);
    applyColorize(rgba, 1, 1, [255, 128, 0]);
    expect(rgba[0]).toBe(0);
    expect(rgba[1]).toBe(0);
    expect(rgba[2]).toBe(0);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([128, 128, 128, 100]);
    applyColorize(rgba, 1, 1, [255, 0, 0]);
    expect(rgba[3]).toBe(100);
  });
});

describe('applySharpen', () => {
  it('amount=0: no change', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applySharpen(rgba, 1, 1, 0);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
    expect(rgba[3]).toBe(255);
  });

  it('sharpens edges in a 3x3 image', () => {
    // Center pixel brighter than neighbors → should become even brighter
    const rgba = new Uint8ClampedArray([
      50,50,50,255,   50,50,50,255,   50,50,50,255,
      50,50,50,255,   200,200,200,255, 50,50,50,255,
      50,50,50,255,   50,50,50,255,   50,50,50,255,
    ]);
    applySharpen(rgba, 3, 3, 1.0);
    // Center pixel (index 4) should be boosted
    const centerOff = 4 * 4;
    expect(rgba[centerOff]).toBeGreaterThan(200);
  });

  it('clamps to 0-255 range', () => {
    const rgba = new Uint8ClampedArray([
      0,0,0,255,   0,0,0,255,   0,0,0,255,
      0,0,0,255,   255,255,255,255, 0,0,0,255,
      0,0,0,255,   0,0,0,255,   0,0,0,255,
    ]);
    applySharpen(rgba, 3, 3, 1.0);
    const centerOff = 4 * 4;
    expect(rgba[centerOff]).toBe(255); // clamped
    // Corner should be clamped to 0
    expect(rgba[0]).toBeLessThanOrEqual(0);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([
      100,100,100,50,  100,100,100,50,  100,100,100,50,
      100,100,100,50,  200,200,200,50,  100,100,100,50,
      100,100,100,50,  100,100,100,50,  100,100,100,50,
    ]);
    applySharpen(rgba, 3, 3, 0.5);
    for (let i = 0; i < 9; i++) {
      expect(rgba[i * 4 + 3]).toBe(50);
    }
  });
});

describe('applyBlur', () => {
  it('passes=0: no change', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyBlur(rgba, 1, 1, 0);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
    expect(rgba[3]).toBe(255);
  });

  it('blurs a 3x3 image with bright center', () => {
    const rgba = new Uint8ClampedArray([
      0,0,0,255,   0,0,0,255,   0,0,0,255,
      0,0,0,255,   255,255,255,255, 0,0,0,255,
      0,0,0,255,   0,0,0,255,   0,0,0,255,
    ]);
    applyBlur(rgba, 3, 3, 1);
    // Center pixel should be reduced (blurred)
    const centerOff = 4 * 4;
    expect(rgba[centerOff]).toBeLessThan(255);
    expect(rgba[centerOff]).toBeGreaterThan(0);
    // Corner pixels should gain some brightness
    expect(rgba[0]).toBeGreaterThan(0);
  });

  it('multiple passes increase blur effect', () => {
    const make = () => new Uint8ClampedArray([
      0,0,0,255,   0,0,0,255,   0,0,0,255,
      0,0,0,255,   255,255,255,255, 0,0,0,255,
      0,0,0,255,   0,0,0,255,   0,0,0,255,
    ]);
    const rgba1 = make();
    applyBlur(rgba1, 3, 3, 1);
    const rgba2 = make();
    applyBlur(rgba2, 3, 3, 2);
    // Center should be more reduced with 2 passes
    const centerOff = 4 * 4;
    expect(rgba2[centerOff]).toBeLessThan(rgba1[centerOff]);
  });

  it('uniform image unchanged', () => {
    const rgba = new Uint8ClampedArray([
      100,100,100,255, 100,100,100,255,
      100,100,100,255, 100,100,100,255,
    ]);
    applyBlur(rgba, 2, 2, 1);
    expect(rgba[0]).toBe(100);
    expect(rgba[4]).toBe(100);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([
      100,100,100,50,  100,100,100,50,  100,100,100,50,
      100,100,100,50,  200,200,200,50,  100,100,100,50,
      100,100,100,50,  100,100,100,50,  100,100,100,50,
    ]);
    applyBlur(rgba, 3, 3, 1);
    for (let i = 0; i < 9; i++) {
      expect(rgba[i * 4 + 3]).toBe(50);
    }
  });
});

describe('applySepia', () => {
  it('intensity=0: no change', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applySepia(rgba, 1, 1, 0);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
    expect(rgba[3]).toBe(255);
  });

  it('intensity=1: full sepia tone', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    const r = 100, g = 150, b = 200;
    const sr = Math.min(255, Math.round(r * 0.393 + g * 0.769 + b * 0.189));
    const sg = Math.min(255, Math.round(r * 0.349 + g * 0.686 + b * 0.168));
    const sb = Math.min(255, Math.round(r * 0.272 + g * 0.534 + b * 0.131));
    applySepia(rgba, 1, 1, 1);
    expect(rgba[0]).toBe(sr);
    expect(rgba[1]).toBe(sg);
    expect(rgba[2]).toBe(sb);
  });

  it('intensity=0.5: 50% blend', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    const r = 100, g = 150, b = 200;
    const sr = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
    const expected = Math.round(r + 0.5 * (sr - r));
    applySepia(rgba, 1, 1, 0.5);
    expect(rgba[0]).toBe(expected);
  });

  it('sepia R >= G >= B (warm tone)', () => {
    const rgba = new Uint8ClampedArray([128, 128, 128, 255]);
    applySepia(rgba, 1, 1, 1);
    expect(rgba[0]).toBeGreaterThanOrEqual(rgba[1]);
    expect(rgba[1]).toBeGreaterThanOrEqual(rgba[2]);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 100]);
    applySepia(rgba, 1, 1, 1);
    expect(rgba[3]).toBe(100);
  });
});
