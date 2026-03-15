import { describe, it, expect } from 'vitest';
import { decodedBufferToRGBA, computeMinMax, applyNodata, applyGamma, applyBrightness, applyContrast, applySaturation, applyHue, applyInvert, applyThreshold, applyColorize, applySharpen, applyBlur, applySepia, applyGrayscale, applyColorMap, validateColorMap, applyPosterize, applyVignette, applyEdgeDetect, applyEmboss, applyPixelate, applyChannelSwap, applyColorBalance, applyExposure, applyLevels, validateLevels, applyNoise, applyTint, applyOutputLevels, validateOutputLevels, applyTemperature, applyFlip, applyDuotone, applyDodge, applyBurn, applySolarize, applyShadowsHighlights, applyClarity, applyCrossProcess, applyGrainFilm, applyHalftone, applyColorMatrix, applyAutoContrast, applyChromaKey, applyMedian } from './pixel-conversion';

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

describe('applyGrayscale', () => {
  it('converts RGB to grayscale using BT.709 weights', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255]);
    applyGrayscale(rgba, 1, 1);
    const expected = Math.round(0.2126 * 255);
    expect(rgba[0]).toBe(expected);
    expect(rgba[1]).toBe(expected);
    expect(rgba[2]).toBe(expected);
  });

  it('pure white stays white', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255]);
    applyGrayscale(rgba, 1, 1);
    expect(rgba[0]).toBe(255);
    expect(rgba[1]).toBe(255);
    expect(rgba[2]).toBe(255);
  });

  it('pure black stays black', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255]);
    applyGrayscale(rgba, 1, 1);
    expect(rgba[0]).toBe(0);
  });

  it('already gray pixel unchanged', () => {
    const rgba = new Uint8ClampedArray([128, 128, 128, 255]);
    applyGrayscale(rgba, 1, 1);
    expect(rgba[0]).toBe(128);
    expect(rgba[1]).toBe(128);
    expect(rgba[2]).toBe(128);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 100]);
    applyGrayscale(rgba, 1, 1);
    expect(rgba[3]).toBe(100);
  });
});

describe('applyColorMap', () => {
  it('maps grayscale values to colors via LUT', () => {
    // Create a simple colorMap: index 0 → blue, index 128 → green, index 255 → red
    const colorMap: Array<[number, number, number]> = Array.from({ length: 256 }, () => [0, 0, 0] as [number, number, number]);
    colorMap[0] = [0, 0, 255];
    colorMap[128] = [0, 255, 0];
    colorMap[255] = [255, 0, 0];

    const rgba = new Uint8ClampedArray([
      0, 0, 0, 255,
      128, 128, 128, 255,
      255, 255, 255, 255,
    ]);
    applyColorMap(rgba, 3, 1, colorMap);
    // pixel 0: index 0 → blue
    expect(rgba[0]).toBe(0);
    expect(rgba[1]).toBe(0);
    expect(rgba[2]).toBe(255);
    // pixel 1: index 128 → green
    expect(rgba[4]).toBe(0);
    expect(rgba[5]).toBe(255);
    expect(rgba[6]).toBe(0);
    // pixel 2: index 255 → red
    expect(rgba[8]).toBe(255);
    expect(rgba[9]).toBe(0);
    expect(rgba[10]).toBe(0);
  });

  it('alpha channel unchanged', () => {
    const colorMap: Array<[number, number, number]> = Array.from({ length: 256 }, () => [255, 0, 0] as [number, number, number]);
    const rgba = new Uint8ClampedArray([100, 100, 100, 50]);
    applyColorMap(rgba, 1, 1, colorMap);
    expect(rgba[3]).toBe(50);
  });
});

describe('validateColorMap', () => {
  const makeValidMap = (): Array<[number, number, number]> =>
    Array.from({ length: 256 }, (_, i) => [i, i, i] as [number, number, number]);

  it('should accept a valid 256-entry colorMap', () => {
    expect(validateColorMap(makeValidMap())).toBe(true);
  });

  it('should reject non-array input', () => {
    expect(validateColorMap(null)).toBe(false);
    expect(validateColorMap('string')).toBe(false);
    expect(validateColorMap(42)).toBe(false);
  });

  it('should reject array with wrong length', () => {
    expect(validateColorMap([[0, 0, 0]])).toBe(false);
    const tooMany = Array.from({ length: 257 }, () => [0, 0, 0]);
    expect(validateColorMap(tooMany)).toBe(false);
  });

  it('should reject entries with wrong tuple length', () => {
    const map = makeValidMap();
    (map[0] as unknown as number[]) = [0, 0];
    expect(validateColorMap(map)).toBe(false);
  });

  it('should reject entries with out-of-range values', () => {
    const map = makeValidMap();
    map[100] = [256, 0, 0];
    expect(validateColorMap(map)).toBe(false);
  });

  it('should reject entries with negative values', () => {
    const map = makeValidMap();
    map[50] = [-1, 0, 0];
    expect(validateColorMap(map)).toBe(false);
  });

  it('should reject entries with non-number values', () => {
    const map = makeValidMap();
    (map[0] as unknown) = ['a', 0, 0];
    expect(validateColorMap(map)).toBe(false);
  });
});

describe('applyPosterize', () => {
  it('levels < 2: no change', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyPosterize(rgba, 1, 1, 1);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
  });

  it('levels >= 256: no change', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyPosterize(rgba, 1, 1, 256);
    expect(rgba[0]).toBe(100);
  });

  it('levels=2: binary posterization', () => {
    const rgba = new Uint8ClampedArray([
      64, 64, 64, 255,
      192, 192, 192, 255,
    ]);
    applyPosterize(rgba, 2, 1, 2);
    // step = 255, round(64/255)*255 = 0, round(192/255)*255 = 255
    expect(rgba[0]).toBe(0);
    expect(rgba[4]).toBe(255);
  });

  it('levels=4: quantizes to 4 levels (0, 85, 170, 255)', () => {
    const rgba = new Uint8ClampedArray([40, 100, 180, 255]);
    applyPosterize(rgba, 1, 1, 4);
    // step = 85. round(40/85)*85 = 0*85=0, round(100/85)*85=1*85=85, round(180/85)*85=2*85=170
    expect(rgba[0]).toBe(0);
    expect(rgba[1]).toBe(85);
    expect(rgba[2]).toBe(170);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([100, 100, 100, 50]);
    applyPosterize(rgba, 1, 1, 4);
    expect(rgba[3]).toBe(50);
  });
});

describe('applyVignette', () => {
  it('strength=0: no change', () => {
    const rgba = new Uint8ClampedArray([200, 200, 200, 255]);
    applyVignette(rgba, 1, 1, 0);
    expect(rgba[0]).toBe(200);
  });

  it('center pixel is less affected than corner pixels', () => {
    // 3x3 image, all white
    const rgba = new Uint8ClampedArray(9 * 4);
    for (let i = 0; i < 9; i++) {
      rgba[i * 4] = 255;
      rgba[i * 4 + 1] = 255;
      rgba[i * 4 + 2] = 255;
      rgba[i * 4 + 3] = 255;
    }
    applyVignette(rgba, 3, 3, 1.0);
    // Center pixel (1,1) should be brighter than corner (0,0)
    const center = rgba[4 * 4]; // pixel index 4
    const corner = rgba[0];     // pixel index 0
    expect(center).toBeGreaterThan(corner);
  });

  it('strength=1: corners are significantly darkened', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255]);
    // 1x1 image: the single pixel is at center, radius=0, factor=1
    applyVignette(rgba, 1, 1, 1.0);
    // For 1x1, cx=0.5,cy=0.5, pixel at (0,0), dx=-0.5,dy=-0.5, dist=0.707, maxDist=0.707, radius=1, factor=1-1*1=0
    expect(rgba[0]).toBe(0);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([
      200, 200, 200, 50,
      200, 200, 200, 50,
      200, 200, 200, 50,
      200, 200, 200, 50,
    ]);
    applyVignette(rgba, 2, 2, 0.5);
    for (let i = 0; i < 4; i++) {
      expect(rgba[i * 4 + 3]).toBe(50);
    }
  });
});

describe('applyEdgeDetect', () => {
  it('uniform image produces zero output', () => {
    const rgba = new Uint8ClampedArray(9 * 4);
    for (let i = 0; i < 9; i++) {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 100;
      rgba[i * 4 + 3] = 255;
    }
    applyEdgeDetect(rgba, 3, 3);
    const center = 4 * 4;
    expect(rgba[center]).toBe(0);
    expect(rgba[center + 1]).toBe(0);
    expect(rgba[center + 2]).toBe(0);
  });

  it('detects edge at center pixel', () => {
    const rgba = new Uint8ClampedArray(9 * 4);
    for (let i = 0; i < 9; i++) rgba[i * 4 + 3] = 255;
    rgba[4 * 4] = rgba[4 * 4 + 1] = rgba[4 * 4 + 2] = 255;
    applyEdgeDetect(rgba, 3, 3);
    const center = 4 * 4;
    expect(rgba[center]).toBe(255);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([100, 100, 100, 50]);
    applyEdgeDetect(rgba, 1, 1);
    expect(rgba[3]).toBe(50);
  });
});

describe('applyEmboss', () => {
  it('uniform image: kernel sum applied with 128 offset', () => {
    const rgba = new Uint8ClampedArray(9 * 4);
    for (let i = 0; i < 9; i++) {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 100;
      rgba[i * 4 + 3] = 255;
    }
    applyEmboss(rgba, 3, 3);
    const center = 4 * 4;
    // kernel weights sum=1, so 100*1+128=228
    expect(rgba[center]).toBe(228);
  });

  it('produces different values for top-left vs bottom-right on gradient', () => {
    // 3x3 gradient: top-left dark, bottom-right bright
    const rgba = new Uint8ClampedArray(9 * 4);
    const values = [50, 55, 60, 55, 64, 70, 60, 70, 80];
    for (let i = 0; i < 9; i++) {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = values[i];
      rgba[i * 4 + 3] = 255;
    }
    applyEmboss(rgba, 3, 3);
    // Top-left and bottom-right should have different emboss values
    expect(rgba[0]).not.toBe(rgba[8 * 4]);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([100, 100, 100, 50]);
    applyEmboss(rgba, 1, 1);
    expect(rgba[3]).toBe(50);
  });
});

describe('applyPixelate', () => {
  it('blockSize < 2: no change', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyPixelate(rgba, 1, 1, 1);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
  });

  it('fills block with average color', () => {
    // 2x2 image, blockSize=2 → single block
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 255,     100, 0, 0, 255,
      0, 100, 0, 255,   0, 0, 100, 255,
    ]);
    applyPixelate(rgba, 2, 2, 2);
    // avg R=25, G=25, B=25
    for (let i = 0; i < 4; i++) {
      expect(rgba[i * 4]).toBe(25);
      expect(rgba[i * 4 + 1]).toBe(25);
      expect(rgba[i * 4 + 2]).toBe(25);
    }
  });

  it('handles non-uniform block sizes at edges', () => {
    // 3x1 image, blockSize=2 → block1=[0,1], block2=[2]
    const rgba = new Uint8ClampedArray([
      100, 100, 100, 255,
      200, 200, 200, 255,
      50, 50, 50, 255,
    ]);
    applyPixelate(rgba, 3, 1, 2);
    // block1 avg = 150, block2 avg = 50
    expect(rgba[0]).toBe(150);
    expect(rgba[4]).toBe(150);
    expect(rgba[8]).toBe(50);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([
      100, 100, 100, 50,
      200, 200, 200, 80,
      100, 100, 100, 50,
      200, 200, 200, 80,
    ]);
    applyPixelate(rgba, 2, 2, 2);
    expect(rgba[3]).toBe(50);
    expect(rgba[7]).toBe(80);
    expect(rgba[11]).toBe(50);
    expect(rgba[15]).toBe(80);
  });
});

describe('applyChannelSwap', () => {
  it('identity swap [0,1,2]: no change', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyChannelSwap(rgba, 1, 1, [0, 1, 2]);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
  });

  it('BGR swap [2,1,0]: swaps R and B', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyChannelSwap(rgba, 1, 1, [2, 1, 0]);
    expect(rgba[0]).toBe(200);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(100);
  });

  it('arbitrary swap [1,2,0]: R←G, G←B, B←R', () => {
    const rgba = new Uint8ClampedArray([10, 20, 30, 255]);
    applyChannelSwap(rgba, 1, 1, [1, 2, 0]);
    expect(rgba[0]).toBe(20);
    expect(rgba[1]).toBe(30);
    expect(rgba[2]).toBe(10);
  });

  it('invalid indices: no change', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyChannelSwap(rgba, 1, 1, [3, 1, 0]);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 50]);
    applyChannelSwap(rgba, 1, 1, [2, 1, 0]);
    expect(rgba[3]).toBe(50);
  });
});

describe('applyColorBalance', () => {
  it('adds offset to each channel independently', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyColorBalance(rgba, 1, 1, [30, -10, -20]);
    expect(rgba[0]).toBe(130);
    expect(rgba[1]).toBe(140);
    expect(rgba[2]).toBe(180);
  });

  it('clamps to 0-255', () => {
    const rgba = new Uint8ClampedArray([10, 250, 128, 255]);
    applyColorBalance(rgba, 1, 1, [-20, 20, 0]);
    expect(rgba[0]).toBe(0);   // clamped
    expect(rgba[1]).toBe(255); // clamped
    expect(rgba[2]).toBe(128);
  });

  it('no-op when all zeros', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyColorBalance(rgba, 1, 1, [0, 0, 0]);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 50]);
    applyColorBalance(rgba, 1, 1, [10, 10, 10]);
    expect(rgba[3]).toBe(50);
  });
});

describe('applyExposure', () => {
  it('multiplies RGB channels by exposure factor', () => {
    const rgba = new Uint8ClampedArray([100, 200, 50, 255]);
    applyExposure(rgba, 1, 1, 1.5);
    expect(rgba[0]).toBe(150);
    expect(rgba[1]).toBe(255); // clamped from 300
    expect(rgba[2]).toBe(75);
  });

  it('darkens with exposure < 1', () => {
    const rgba = new Uint8ClampedArray([100, 200, 50, 255]);
    applyExposure(rgba, 1, 1, 0.5);
    expect(rgba[0]).toBe(50);
    expect(rgba[1]).toBe(100);
    expect(rgba[2]).toBe(25);
  });

  it('no-op when exposure is 1.0', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyExposure(rgba, 1, 1, 1.0);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 50]);
    applyExposure(rgba, 1, 1, 2.0);
    expect(rgba[3]).toBe(50);
  });
});

describe('applyLevels', () => {
  it('no change when inputMin=0 and inputMax=255', () => {
    const rgba = new Uint8ClampedArray([50, 100, 200, 255]);
    applyLevels(rgba, 1, 1, 0, 255);
    expect(rgba[0]).toBe(50);
    expect(rgba[1]).toBe(100);
    expect(rgba[2]).toBe(200);
  });

  it('remaps [50, 200] to [0, 255]', () => {
    const rgba = new Uint8ClampedArray([50, 125, 200, 255]);
    applyLevels(rgba, 1, 1, 50, 200);
    expect(rgba[0]).toBe(0);
    expect(rgba[1]).toBe(128);
    expect(rgba[2]).toBe(255);
  });

  it('clamps values below inputMin to 0', () => {
    const rgba = new Uint8ClampedArray([10, 10, 10, 255]);
    applyLevels(rgba, 1, 1, 50, 200);
    expect(rgba[0]).toBe(0);
    expect(rgba[1]).toBe(0);
    expect(rgba[2]).toBe(0);
  });

  it('clamps values above inputMax to 255', () => {
    const rgba = new Uint8ClampedArray([250, 250, 250, 255]);
    applyLevels(rgba, 1, 1, 50, 200);
    expect(rgba[0]).toBe(255);
    expect(rgba[1]).toBe(255);
    expect(rgba[2]).toBe(255);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 50]);
    applyLevels(rgba, 1, 1, 50, 200);
    expect(rgba[3]).toBe(50);
  });
});

describe('applyNoise', () => {
  it('does nothing when noise is 0', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyNoise(rgba, 1, 1, 0);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
  });

  it('modifies RGB channels within ±noise range', () => {
    const noise = 10;
    const original = [100, 150, 200];
    const rgba = new Uint8ClampedArray([...original, 255]);
    applyNoise(rgba, 1, 1, noise);
    expect(rgba[0]).toBeGreaterThanOrEqual(original[0] - noise);
    expect(rgba[0]).toBeLessThanOrEqual(original[0] + noise);
    expect(rgba[1]).toBeGreaterThanOrEqual(original[1] - noise);
    expect(rgba[1]).toBeLessThanOrEqual(original[1] + noise);
    expect(rgba[2]).toBeGreaterThanOrEqual(original[2] - noise);
    expect(rgba[2]).toBeLessThanOrEqual(original[2] + noise);
  });

  it('clamps output to 0-255', () => {
    const rgba = new Uint8ClampedArray([0, 255, 128, 255]);
    applyNoise(rgba, 1, 1, 255);
    expect(rgba[0]).toBeGreaterThanOrEqual(0);
    expect(rgba[0]).toBeLessThanOrEqual(255);
    expect(rgba[1]).toBeGreaterThanOrEqual(0);
    expect(rgba[1]).toBeLessThanOrEqual(255);
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 77]);
    applyNoise(rgba, 1, 1, 50);
    expect(rgba[3]).toBe(77);
  });
});

describe('validateLevels', () => {
  it('returns values unchanged when valid', () => {
    const result = validateLevels(50, 200);
    expect(result).toEqual({ inputMin: 50, inputMax: 200, swapped: false });
  });

  it('clamps values to 0-255 range', () => {
    const result = validateLevels(-10, 300);
    expect(result).toEqual({ inputMin: 0, inputMax: 255, swapped: false });
  });

  it('swaps when inputMin > inputMax', () => {
    const result = validateLevels(200, 50);
    expect(result).toEqual({ inputMin: 50, inputMax: 200, swapped: true });
  });

  it('rounds fractional values', () => {
    const result = validateLevels(10.7, 200.3);
    expect(result).toEqual({ inputMin: 11, inputMax: 200, swapped: false });
  });

  it('handles equal values', () => {
    const result = validateLevels(128, 128);
    expect(result).toEqual({ inputMin: 128, inputMax: 128, swapped: false });
  });
});

describe('applyTint', () => {
  it('no-op when strength=0', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyTint(rgba, 1, 1, 255, 0, 0, 0);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
  });

  it('full tint when strength=1', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyTint(rgba, 1, 1, 255, 0, 0, 1);
    expect(rgba[0]).toBe(255);
    expect(rgba[1]).toBe(0);
    expect(rgba[2]).toBe(0);
  });

  it('blends at strength=0.5 (default)', () => {
    const rgba = new Uint8ClampedArray([100, 200, 0, 255]);
    applyTint(rgba, 1, 1, 0, 0, 100);
    // default strength=0.5: result = original*0.5 + tint*0.5
    expect(rgba[0]).toBe(50);   // 100*0.5 + 0*0.5
    expect(rgba[1]).toBe(100);  // 200*0.5 + 0*0.5
    expect(rgba[2]).toBe(50);   // 0*0.5 + 100*0.5
  });

  it('alpha channel unchanged', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 77]);
    applyTint(rgba, 1, 1, 255, 0, 0, 0.5);
    expect(rgba[3]).toBe(77);
  });

  it('clamps strength to 0-1 range', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyTint(rgba, 1, 1, 255, 0, 0, 2.0);
    // strength clamped to 1.0
    expect(rgba[0]).toBe(255);
    expect(rgba[1]).toBe(0);
    expect(rgba[2]).toBe(0);
  });
});

describe('applyOutputLevels', () => {
  it('outputMin=0, outputMax=128 → max pixel value 128', () => {
    const rgba = new Uint8ClampedArray([255, 128, 0, 255]);
    applyOutputLevels(rgba, 1, 1, 0, 128);
    expect(rgba[0]).toBe(128);
    expect(rgba[1]).toBe(64);
    expect(rgba[2]).toBe(0);
    expect(rgba[3]).toBe(255);
  });

  it('outputMin=128, outputMax=255 → min pixel value 128', () => {
    const rgba = new Uint8ClampedArray([0, 128, 255, 255]);
    applyOutputLevels(rgba, 1, 1, 128, 255);
    expect(rgba[0]).toBe(128);
    expect(rgba[1]).toBe(192);
    expect(rgba[2]).toBe(255);
    expect(rgba[3]).toBe(255);
  });

  it('no-op when outputMin=0, outputMax=255', () => {
    const rgba = new Uint8ClampedArray([100, 200, 50, 255]);
    applyOutputLevels(rgba, 1, 1, 0, 255);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(200);
    expect(rgba[2]).toBe(50);
  });
});

describe('validateOutputLevels', () => {
  it('clamps to 0-255 range', () => {
    const result = validateOutputLevels(-10, 300);
    expect(result.outputMin).toBe(0);
    expect(result.outputMax).toBe(255);
    expect(result.swapped).toBe(false);
  });

  it('swaps when min > max', () => {
    const result = validateOutputLevels(200, 100);
    expect(result.outputMin).toBe(100);
    expect(result.outputMax).toBe(200);
    expect(result.swapped).toBe(true);
  });
});

describe('applyTemperature', () => {
  it('no-op when temperature=0', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyTemperature(rgba, 1, 1, 0);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
  });

  it('temperature=50 → R increases, B decreases', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyTemperature(rgba, 1, 1, 50);
    expect(rgba[0]).toBeGreaterThan(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBeLessThan(200);
  });

  it('temperature=-50 → B increases, R decreases', () => {
    const rgba = new Uint8ClampedArray([200, 150, 100, 255]);
    applyTemperature(rgba, 1, 1, -50);
    expect(rgba[0]).toBeLessThan(200);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBeGreaterThan(100);
  });

  it('clamps to 0-255', () => {
    const rgba = new Uint8ClampedArray([250, 150, 5, 255]);
    applyTemperature(rgba, 1, 1, 100);
    expect(rgba[0]).toBe(255);
    expect(rgba[2]).toBe(0);
  });
});

describe('applyFlip', () => {
  it('horizontal flip swaps left-right', () => {
    // 2x1 image: [R, G]
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,   0, 255, 0, 255,
    ]);
    applyFlip(rgba, 2, 1, true, false);
    expect(rgba[0]).toBe(0);    // was green
    expect(rgba[1]).toBe(255);
    expect(rgba[4]).toBe(255);  // was red
    expect(rgba[5]).toBe(0);
  });

  it('vertical flip swaps top-bottom', () => {
    // 1x2 image: [R, G]
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,   0, 255, 0, 255,
    ]);
    applyFlip(rgba, 1, 2, false, true);
    expect(rgba[0]).toBe(0);    // was green (bottom)
    expect(rgba[1]).toBe(255);
    expect(rgba[4]).toBe(255);  // was red (top)
    expect(rgba[5]).toBe(0);
  });

  it('both horizontal and vertical', () => {
    // 2x2: [A, B, C, D] → flip both → [D, C, B, A]
    const rgba = new Uint8ClampedArray([
      10, 0, 0, 255,  20, 0, 0, 255,
      30, 0, 0, 255,  40, 0, 0, 255,
    ]);
    applyFlip(rgba, 2, 2, true, true);
    expect(rgba[0]).toBe(40);
    expect(rgba[4]).toBe(30);
    expect(rgba[8]).toBe(20);
    expect(rgba[12]).toBe(10);
  });

  it('no-op when both false', () => {
    const rgba = new Uint8ClampedArray([100, 200, 50, 255]);
    applyFlip(rgba, 1, 1, false, false);
    expect(rgba[0]).toBe(100);
  });
});

describe('applyDuotone', () => {
  it('maps black pixel to shadows color', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255]);
    applyDuotone(rgba, 1, 1, [20, 10, 80], [255, 230, 150]);
    expect(rgba[0]).toBe(20);
    expect(rgba[1]).toBe(10);
    expect(rgba[2]).toBe(80);
    expect(rgba[3]).toBe(255);
  });

  it('maps white pixel to highlights color', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255]);
    applyDuotone(rgba, 1, 1, [20, 10, 80], [255, 230, 150]);
    expect(rgba[0]).toBe(255);
    expect(rgba[1]).toBe(230);
    expect(rgba[2]).toBe(150);
    expect(rgba[3]).toBe(255);
  });

  it('interpolates mid-gray between shadows and highlights', () => {
    const rgba = new Uint8ClampedArray([128, 128, 128, 255]);
    applyDuotone(rgba, 1, 1, [0, 0, 0], [255, 255, 255]);
    // lum ≈ 128/255 ≈ 0.502
    expect(rgba[0]).toBeGreaterThan(120);
    expect(rgba[0]).toBeLessThan(135);
  });
});

describe('applyDodge', () => {
  it('no-op when dodge=0', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyDodge(rgba, 1, 1, 0);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
  });

  it('brightens pixels proportionally to their brightness', () => {
    const rgba = new Uint8ClampedArray([200, 50, 0, 255]);
    applyDodge(rgba, 1, 1, 0.5);
    // bright pixel (200) should increase more than dark pixel (50)
    expect(rgba[0]).toBeGreaterThan(200);
    expect(rgba[1]).toBeGreaterThan(50);
    // dark pixel (0) stays 0
    expect(rgba[2]).toBe(0);
  });

  it('clamps to 255', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255]);
    applyDodge(rgba, 1, 1, 1.0);
    expect(rgba[0]).toBe(255);
  });
});

describe('applyBurn', () => {
  it('no-op when burn=0', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyBurn(rgba, 1, 1, 0);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
  });

  it('darkens dark pixels more than bright pixels', () => {
    const rgba = new Uint8ClampedArray([50, 200, 255, 255]);
    applyBurn(rgba, 1, 1, 0.5);
    // dark pixel (50) should decrease relatively more
    expect(rgba[0]).toBeLessThan(50);
    // bright pixel stays closer to original
    expect(rgba[1]).toBeLessThan(200);
    // max bright (255) stays 255: 255 * (1 - 0.5 * 0) = 255
    expect(rgba[2]).toBe(255);
  });

  it('preserves alpha', () => {
    const rgba = new Uint8ClampedArray([100, 100, 100, 128]);
    applyBurn(rgba, 1, 1, 0.5);
    expect(rgba[3]).toBe(128);
  });
});

describe('applySolarize', () => {
  it('inverts channels above threshold', () => {
    const rgba = new Uint8ClampedArray([200, 100, 50, 255]);
    applySolarize(rgba, 1, 1, 128);
    expect(rgba[0]).toBe(55);  // 200 >= 128 → 255-200=55
    expect(rgba[1]).toBe(100); // 100 < 128 → unchanged
    expect(rgba[2]).toBe(50);  // 50 < 128 → unchanged
  });

  it('preserves alpha', () => {
    const rgba = new Uint8ClampedArray([200, 200, 200, 128]);
    applySolarize(rgba, 1, 1, 128);
    expect(rgba[3]).toBe(128);
  });

  it('threshold=0 inverts all channels', () => {
    const rgba = new Uint8ClampedArray([100, 50, 0, 255]);
    applySolarize(rgba, 1, 1, 0);
    expect(rgba[0]).toBe(155);
    expect(rgba[1]).toBe(205);
    expect(rgba[2]).toBe(255);
  });
});

describe('applyShadowsHighlights', () => {
  it('brightens shadows with positive shadows value', () => {
    const rgba = new Uint8ClampedArray([30, 30, 30, 255]);
    applyShadowsHighlights(rgba, 1, 1, 50, 0);
    expect(rgba[0]).toBeGreaterThan(30);
    expect(rgba[1]).toBeGreaterThan(30);
    expect(rgba[2]).toBeGreaterThan(30);
  });

  it('darkens highlights with negative highlights value', () => {
    const rgba = new Uint8ClampedArray([220, 220, 220, 255]);
    applyShadowsHighlights(rgba, 1, 1, 0, -50);
    expect(rgba[0]).toBeLessThan(220);
  });

  it('no change when both are 0', () => {
    const rgba = new Uint8ClampedArray([100, 100, 100, 255]);
    applyShadowsHighlights(rgba, 1, 1, 0, 0);
    expect(rgba[0]).toBe(100);
  });

  it('preserves alpha', () => {
    const rgba = new Uint8ClampedArray([100, 100, 100, 128]);
    applyShadowsHighlights(rgba, 1, 1, 50, -50);
    expect(rgba[3]).toBe(128);
  });
});

describe('applyClarity', () => {
  it('no change when clarity=0', () => {
    const rgba = new Uint8ClampedArray([100, 100, 100, 255]);
    applyClarity(rgba, 1, 1, 0);
    expect(rgba[0]).toBe(100);
  });

  it('enhances midtone contrast on larger image', () => {
    // 3x3 image with uniform midtone center, darker surroundings
    const rgba = new Uint8ClampedArray(3 * 3 * 4);
    for (let i = 0; i < 9; i++) {
      const off = i * 4;
      rgba[off] = rgba[off + 1] = rgba[off + 2] = 80;
      rgba[off + 3] = 255;
    }
    // Center pixel brighter
    rgba[4 * 4] = rgba[4 * 4 + 1] = rgba[4 * 4 + 2] = 140;
    applyClarity(rgba, 3, 3, 100);
    // Center pixel should be pushed further from its blurred value (enhanced)
    expect(rgba[4 * 4]).toBeGreaterThanOrEqual(140);
  });

  it('preserves alpha', () => {
    const rgba = new Uint8ClampedArray([128, 128, 128, 100]);
    applyClarity(rgba, 1, 1, 50);
    expect(rgba[3]).toBe(100);
  });
});

describe('applyCrossProcess', () => {
  it('no change when intensity=0', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    const orig = new Uint8ClampedArray(rgba);
    applyCrossProcess(rgba, 1, 1, 0);
    expect(rgba[0]).toBe(orig[0]);
    expect(rgba[1]).toBe(orig[1]);
    expect(rgba[2]).toBe(orig[2]);
  });

  it('modifies channels differently at intensity=1', () => {
    const rgba = new Uint8ClampedArray([128, 128, 128, 255]);
    applyCrossProcess(rgba, 1, 1, 1);
    // R and G should be boosted, B should be reduced
    expect(rgba[0]).not.toBe(128);
    expect(rgba[1]).not.toBe(128);
    expect(rgba[2]).not.toBe(128);
  });

  it('preserves alpha', () => {
    const rgba = new Uint8ClampedArray([128, 128, 128, 100]);
    applyCrossProcess(rgba, 1, 1, 1);
    expect(rgba[3]).toBe(100);
  });
});

describe('applyGrainFilm', () => {
  it('no change when intensity=0', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    const orig = new Uint8ClampedArray(rgba);
    applyGrainFilm(rgba, 1, 1, 0);
    expect(rgba[0]).toBe(orig[0]);
    expect(rgba[1]).toBe(orig[1]);
    expect(rgba[2]).toBe(orig[2]);
  });

  it('dark pixels get stronger grain than bright pixels on average', () => {
    // Statistical test: run many times and check variance
    let darkVariance = 0;
    let brightVariance = 0;
    const runs = 1000;
    for (let r = 0; r < runs; r++) {
      const dark = new Uint8ClampedArray([30, 30, 30, 255]);
      applyGrainFilm(dark, 1, 1, 1);
      darkVariance += Math.abs(dark[0] - 30);

      const bright = new Uint8ClampedArray([230, 230, 230, 255]);
      applyGrainFilm(bright, 1, 1, 1);
      brightVariance += Math.abs(bright[0] - 230);
    }
    expect(darkVariance / runs).toBeGreaterThan(brightVariance / runs);
  });

  it('preserves alpha', () => {
    const rgba = new Uint8ClampedArray([128, 128, 128, 100]);
    applyGrainFilm(rgba, 1, 1, 1);
    expect(rgba[3]).toBe(100);
  });
});

describe('applyHalftone', () => {
  it('no change when dotSize < 2', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    const orig = new Uint8ClampedArray(rgba);
    applyHalftone(rgba, 1, 1, 0);
    expect(rgba[0]).toBe(orig[0]);
    expect(rgba[1]).toBe(orig[1]);
    expect(rgba[2]).toBe(orig[2]);
  });

  it('bright areas produce smaller dots (more white)', () => {
    // 4x4 white image → all white (dot radius ≈ 0)
    const white = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 4 * 4; i++) {
      white[i * 4] = white[i * 4 + 1] = white[i * 4 + 2] = 255;
      white[i * 4 + 3] = 255;
    }
    applyHalftone(white, 4, 4, 4);
    // Should remain mostly white
    let whiteCount = 0;
    for (let i = 0; i < 16; i++) {
      if (white[i * 4] === 255) whiteCount++;
    }
    expect(whiteCount).toBe(16);
  });

  it('dark areas produce larger dots (less white)', () => {
    // 4x4 black image → should have dot, not all white
    const black = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 4 * 4; i++) {
      black[i * 4] = black[i * 4 + 1] = black[i * 4 + 2] = 0;
      black[i * 4 + 3] = 255;
    }
    applyHalftone(black, 4, 4, 4);
    let blackCount = 0;
    for (let i = 0; i < 16; i++) {
      if (black[i * 4] === 0) blackCount++;
    }
    expect(blackCount).toBeGreaterThan(0);
  });

  it('preserves alpha', () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i++) {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 128;
      rgba[i * 4 + 3] = 100;
    }
    applyHalftone(rgba, 4, 4, 4);
    for (let i = 0; i < 16; i++) {
      expect(rgba[i * 4 + 3]).toBe(100);
    }
  });
});

describe('applyColorMatrix', () => {
  it('identity matrix leaves pixels unchanged', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    const identity = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    applyColorMatrix(rgba, 1, 1, identity);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
    expect(rgba[3]).toBe(255);
  });

  it('channel swap matrix swaps R and B', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    const swapRB = [
      0, 0, 1, 0,
      0, 1, 0, 0,
      1, 0, 0, 0,
      0, 0, 0, 1,
    ];
    applyColorMatrix(rgba, 1, 1, swapRB);
    expect(rgba[0]).toBe(200); // was B
    expect(rgba[1]).toBe(150); // G unchanged
    expect(rgba[2]).toBe(100); // was R
    expect(rgba[3]).toBe(255);
  });

  it('clamps values to 0-255', () => {
    const rgba = new Uint8ClampedArray([200, 200, 200, 255]);
    const bright = [
      2, 0, 0, 0,
      0, 2, 0, 0,
      0, 0, 2, 0,
      0, 0, 0, 1,
    ];
    applyColorMatrix(rgba, 1, 1, bright);
    expect(rgba[0]).toBe(255);
    expect(rgba[1]).toBe(255);
    expect(rgba[2]).toBe(255);
  });

  it('ignores invalid matrix length', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyColorMatrix(rgba, 1, 1, [1, 0, 0]);
    expect(rgba[0]).toBe(100); // unchanged
  });
});

describe('applyAutoContrast', () => {
  it('stretches 50-200 range to 0-255', () => {
    // 2x1 image: pixel1=[50,100,150,255], pixel2=[200,200,200,255]
    const rgba = new Uint8ClampedArray([50, 100, 150, 255, 200, 200, 200, 255]);
    applyAutoContrast(rgba, 2, 1);
    // R: min=50, max=200, range=150 → 50→0, 200→255
    expect(rgba[0]).toBe(0);
    expect(rgba[4]).toBe(255);
    // G: min=100, max=200, range=100 → 100→0, 200→255
    expect(rgba[1]).toBe(0);
    expect(rgba[5]).toBe(255);
    // B: min=150, max=200, range=50 → 150→0, 200→255
    expect(rgba[2]).toBe(0);
    expect(rgba[6]).toBe(255);
    // Alpha unchanged
    expect(rgba[3]).toBe(255);
    expect(rgba[7]).toBe(255);
  });

  it('single-color tile remains unchanged', () => {
    const rgba = new Uint8ClampedArray([128, 128, 128, 255, 128, 128, 128, 255]);
    applyAutoContrast(rgba, 2, 1);
    expect(rgba[0]).toBe(128);
    expect(rgba[1]).toBe(128);
    expect(rgba[2]).toBe(128);
  });

  it('already full-range pixels stay the same', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    applyAutoContrast(rgba, 2, 1);
    expect(rgba[0]).toBe(0);
    expect(rgba[4]).toBe(255);
  });
});

describe('applyChromaKey', () => {
  it('exact match (tolerance=0) makes pixel transparent', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    applyChromaKey(rgba, 2, 1, [255, 0, 0], 0);
    expect(rgba[3]).toBe(0);   // red pixel → transparent
    expect(rgba[7]).toBe(255); // green pixel → unchanged
  });

  it('tolerance>0 makes nearby colors transparent', () => {
    // color [100,100,100], pixel [105,100,100] → distance = 5
    const rgba = new Uint8ClampedArray([105, 100, 100, 255]);
    applyChromaKey(rgba, 1, 1, [100, 100, 100], 5);
    expect(rgba[3]).toBe(0); // within tolerance
  });

  it('pixel outside tolerance stays opaque', () => {
    // color [100,100,100], pixel [110,100,100] → distance = 10
    const rgba = new Uint8ClampedArray([110, 100, 100, 255]);
    applyChromaKey(rgba, 1, 1, [100, 100, 100], 5);
    expect(rgba[3]).toBe(255); // outside tolerance
  });

  it('tolerance at exact boundary makes pixel transparent', () => {
    // color [0,0,0], pixel [3,4,0] → distance = sqrt(9+16) = 5
    const rgba = new Uint8ClampedArray([3, 4, 0, 255]);
    applyChromaKey(rgba, 1, 1, [0, 0, 0], 5);
    expect(rgba[3]).toBe(0); // exactly at tolerance boundary
  });

  it('default tolerance=0 requires exact match', () => {
    const rgba = new Uint8ClampedArray([0, 0, 1, 255]);
    applyChromaKey(rgba, 1, 1, [0, 0, 0]);
    expect(rgba[3]).toBe(255); // off by 1 → opaque
  });

  it('large tolerance makes all similar colors transparent', () => {
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,
      200, 50, 50, 255,
      0, 255, 0, 255,
    ]);
    applyChromaKey(rgba, 3, 1, [255, 0, 0], 100);
    expect(rgba[3]).toBe(0);   // exact match
    expect(rgba[7]).toBe(0);   // within tolerance (dist ≈ 86.6)
    expect(rgba[11]).toBe(255); // far away
  });
});

describe('applyMedian', () => {
  it('removes single salt pixel in 3x3 neighborhood (kernelSize=3)', () => {
    // 3x3 image: center pixel is salt (255,255,255), rest are (50,50,50)
    const v = 50;
    const rgba = new Uint8ClampedArray([
      v,v,v,255, v,v,v,255, v,v,v,255,
      v,v,v,255, 255,255,255,255, v,v,v,255,
      v,v,v,255, v,v,v,255, v,v,v,255,
    ]);
    applyMedian(rgba, 3, 3, 3);
    // center pixel should become 50 (median of eight 50s and one 255)
    const center = 4 * 4; // pixel index 4
    expect(rgba[center]).toBe(v);
    expect(rgba[center + 1]).toBe(v);
    expect(rgba[center + 2]).toBe(v);
    expect(rgba[center + 3]).toBe(255); // alpha unchanged
  });

  it('preserves uniform pixels', () => {
    const rgba = new Uint8ClampedArray([
      100,100,100,255, 100,100,100,255,
      100,100,100,255, 100,100,100,255,
    ]);
    applyMedian(rgba, 2, 2, 3);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(100);
    expect(rgba[2]).toBe(100);
  });

  it('clamps kernelSize to 3-11 range', () => {
    const rgba = new Uint8ClampedArray([50,50,50,255, 200,200,200,255, 50,50,50,255, 200,200,200,255]);
    // kernelSize 99 should be clamped to 11, should not throw
    applyMedian(rgba, 2, 2, 99);
    expect(rgba[3]).toBe(255); // alpha preserved
  });

  it('even kernelSize is rounded up to odd', () => {
    const v = 50;
    const rgba = new Uint8ClampedArray([
      v,v,v,255, v,v,v,255, v,v,v,255,
      v,v,v,255, 255,255,255,255, v,v,v,255,
      v,v,v,255, v,v,v,255, v,v,v,255,
    ]);
    applyMedian(rgba, 3, 3, 4); // 4 → 5 (kernelSize=5, radius=2)
    const center = 4 * 4;
    expect(rgba[center]).toBe(v); // still median of mostly 50s
  });

  it('kernelSize=5 uses 5x5 window', () => {
    // 5x5 image: center pixel is salt, rest are (30,30,30)
    const v = 30;
    const pixels = [];
    for (let i = 0; i < 25; i++) {
      if (i === 12) pixels.push(255, 255, 255, 255);
      else pixels.push(v, v, v, 255);
    }
    const rgba = new Uint8ClampedArray(pixels);
    applyMedian(rgba, 5, 5, 5);
    const center = 12 * 4;
    expect(rgba[center]).toBe(v);
  });

  it('edge pixels use only valid neighbors (skip boundary)', () => {
    // 3x3 image, check corner pixel (0,0) which has only 4 neighbors with kernelSize=3
    const rgba = new Uint8ClampedArray([
      10,10,10,255, 20,20,20,255, 30,30,30,255,
      40,40,40,255, 50,50,50,255, 60,60,60,255,
      70,70,70,255, 80,80,80,255, 90,90,90,255,
    ]);
    applyMedian(rgba, 3, 3, 3);
    // corner (0,0) neighbors: [10,20,40,50] → sorted [10,20,40,50] → median index 2 = 40
    // (4 elements, mid = 4>>1 = 2, so value at index 2 = 40)
    expect(rgba[0]).toBe(40);
  });
});
