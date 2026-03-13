/**
 * Converts a decoded JPEG2000 buffer (8-bit or 16-bit) into RGBA pixel data.
 */
/**
 * Safely create a typed array view from a buffer that may be an ArrayBuffer
 * or a Uint8Array view (e.g. from WASM heap).
 */
function toUint16Array(buf: ArrayBuffer | Uint8Array): Uint16Array {
  if (buf instanceof ArrayBuffer) {
    return new Uint16Array(buf);
  }
  // Uint8Array view (e.g. WASM heap) — reinterpret bytes as 16-bit
  return new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
}

function getByteLength(buf: ArrayBuffer | Uint8Array): number {
  return buf instanceof ArrayBuffer ? buf.byteLength : buf.byteLength;
}

export function decodedBufferToRGBA(
  decodedBuffer: ArrayBuffer | Uint8Array,
  width: number,
  height: number,
  componentCount: number,
  bitsPerSample?: number,
  minValue?: number,
  maxValue?: number,
): Uint8ClampedArray {
  const pixelCount = width * height;
  const expectedBytes8 = pixelCount * componentCount;
  const bufByteLength = getByteLength(decodedBuffer);
  const is16bit = bitsPerSample != null ? bitsPerSample > 8 : bufByteLength >= expectedBytes8 * 2;
  const rgba = new Uint8ClampedArray(pixelCount * 4);

  if (is16bit) {
    const src = toUint16Array(decodedBuffer);

    // Use provided min/max range, or fall back to full bit-depth range
    const min = minValue ?? 0;
    const max = maxValue ?? ((bitsPerSample != null ? (1 << bitsPerSample) - 1 : 65535));
    const range = max - min || 1;

    if (componentCount === 3) {
      for (let i = 0; i < pixelCount; i++) {
        rgba[i * 4]     = ((src[i * 3]     - min) * 255 / range) | 0;
        rgba[i * 4 + 1] = ((src[i * 3 + 1] - min) * 255 / range) | 0;
        rgba[i * 4 + 2] = ((src[i * 3 + 2] - min) * 255 / range) | 0;
        rgba[i * 4 + 3] = 255;
      }
    } else if (componentCount === 1) {
      for (let i = 0; i < pixelCount; i++) {
        const v = ((src[i] - min) * 255 / range) | 0;
        rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
        rgba[i * 4 + 3] = 255;
      }
    } else if (componentCount === 4) {
      for (let i = 0; i < pixelCount; i++) {
        rgba[i * 4]     = ((src[i * 4]     - min) * 255 / range) | 0;
        rgba[i * 4 + 1] = ((src[i * 4 + 1] - min) * 255 / range) | 0;
        rgba[i * 4 + 2] = ((src[i * 4 + 2] - min) * 255 / range) | 0;
        rgba[i * 4 + 3] = ((src[i * 4 + 3] - min) * 255 / range) | 0;
      }
    }
  } else {
    const src = decodedBuffer instanceof ArrayBuffer
      ? new Uint8Array(decodedBuffer)
      : decodedBuffer;
    if (componentCount === 3) {
      for (let i = 0; i < pixelCount; i++) {
        rgba[i * 4]     = src[i * 3];
        rgba[i * 4 + 1] = src[i * 3 + 1];
        rgba[i * 4 + 2] = src[i * 3 + 2];
        rgba[i * 4 + 3] = 255;
      }
    } else if (componentCount === 1) {
      for (let i = 0; i < pixelCount; i++) {
        rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = src[i];
        rgba[i * 4 + 3] = 255;
      }
    } else if (componentCount === 4) {
      for (let i = 0; i < pixelCount; i++) {
        rgba[i * 4]     = src[i * 4];
        rgba[i * 4 + 1] = src[i * 4 + 1];
        rgba[i * 4 + 2] = src[i * 4 + 2];
        rgba[i * 4 + 3] = src[i * 4 + 3];
      }
    }
  }

  return rgba;
}

/**
 * Applies gamma correction to RGB channels: out = 255 * (in/255)^(1/gamma).
 * Alpha channel is not modified.
 */
export function applyGamma(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  gamma: number,
): void {
  if (gamma === 1.0) return;
  const invGamma = 1 / gamma;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    rgba[off]     = Math.round(255 * Math.pow(rgba[off] / 255, invGamma));
    rgba[off + 1] = Math.round(255 * Math.pow(rgba[off + 1] / 255, invGamma));
    rgba[off + 2] = Math.round(255 * Math.pow(rgba[off + 2] / 255, invGamma));
  }
}

/**
 * Applies nodata transparency: sets alpha=0 for pixels matching any nodata value.
 * For single-channel images, the grayscale value is checked.
 * For multi-channel images, all RGB channels must match a nodata value.
 */
export function applyNodata(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  componentCount: number,
  nodataValues: number[],
  tolerance: number = 0,
): void {
  const pixelCount = width * height;
  const matchesNodata = tolerance > 0
    ? (v: number) => nodataValues.some(nd => Math.abs(v - nd) <= tolerance)
    : (v: number) => nodataValues.includes(v);

  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    let isNodata: boolean;
    if (componentCount === 1) {
      isNodata = matchesNodata(rgba[off]);
    } else {
      isNodata = matchesNodata(rgba[off])
        && matchesNodata(rgba[off + 1])
        && matchesNodata(rgba[off + 2]);
    }
    if (isNodata) {
      rgba[off + 3] = 0;
    }
  }
}

/**
 * Applies brightness adjustment to RGB channels: out = in + brightness * 255.
 * Alpha channel is not modified.
 */
export function applyBrightness(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  brightness: number,
): void {
  if (brightness === 0) return;
  const offset = Math.round(brightness * 255);
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    rgba[off]     = rgba[off] + offset;
    rgba[off + 1] = rgba[off + 1] + offset;
    rgba[off + 2] = rgba[off + 2] + offset;
  }
}

/**
 * Applies contrast adjustment to RGB channels: out = (in - 128) * contrast + 128.
 * Alpha channel is not modified.
 */
export function applyContrast(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  contrast: number,
): void {
  if (contrast === 1.0) return;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    rgba[off]     = (rgba[off] - 128) * contrast + 128;
    rgba[off + 1] = (rgba[off + 1] - 128) * contrast + 128;
    rgba[off + 2] = (rgba[off + 2] - 128) * contrast + 128;
  }
}

/**
 * Applies saturation adjustment to RGB channels.
 * saturation=0: grayscale, saturation=1: original, saturation>1: oversaturated.
 * Alpha channel is not modified.
 */
export function applySaturation(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  saturation: number,
): void {
  if (saturation === 1.0) return;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const r = rgba[off], g = rgba[off + 1], b = rgba[off + 2];
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    rgba[off]     = Math.round(gray + saturation * (r - gray));
    rgba[off + 1] = Math.round(gray + saturation * (g - gray));
    rgba[off + 2] = Math.round(gray + saturation * (b - gray));
  }
}

/**
 * Applies hue rotation to RGB channels.
 * hueDegrees=0: no change, 180: complementary colors.
 * Uses RGB→HSL→RGB conversion. Alpha channel is not modified.
 */
export function applyHue(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  hueDegrees: number,
): void {
  if (hueDegrees === 0) return;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const r = rgba[off] / 255, g = rgba[off + 1] / 255, b = rgba[off + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) continue; // achromatic, no hue to rotate
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    h = ((h + hueDegrees / 360) % 1 + 1) % 1;
    // HSL to RGB
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    rgba[off]     = Math.round(hue2rgb(p, q, h + 1/3) * 255);
    rgba[off + 1] = Math.round(hue2rgb(p, q, h) * 255);
    rgba[off + 2] = Math.round(hue2rgb(p, q, h - 1/3) * 255);
  }
}

/**
 * Inverts RGB channels: out = 255 - in.
 * Alpha channel is not modified.
 */
export function applyInvert(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    rgba[off]     = 255 - rgba[off];
    rgba[off + 1] = 255 - rgba[off + 1];
    rgba[off + 2] = 255 - rgba[off + 2];
  }
}

/**
 * Applies threshold binarization based on luminance.
 * Pixels with luminance >= threshold become 255 (white), otherwise 0 (black).
 * Alpha channel is not modified.
 */
export function applyThreshold(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
): void {
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const lum = 0.2126 * rgba[off] + 0.7152 * rgba[off + 1] + 0.0722 * rgba[off + 2];
    const v = lum >= threshold ? 255 : 0;
    rgba[off] = rgba[off + 1] = rgba[off + 2] = v;
  }
}

/**
 * Applies colorization to grayscale RGBA data.
 * Computes luminance and multiplies by the given RGB color.
 * Formula: out_ch = lum/255 * color_ch
 * Alpha channel is not modified.
 */
export function applyColorize(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  color: [number, number, number],
): void {
  const [cr, cg, cb] = color;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const lum = 0.2126 * rgba[off] + 0.7152 * rgba[off + 1] + 0.0722 * rgba[off + 2];
    const t = lum / 255;
    rgba[off]     = Math.round(t * cr);
    rgba[off + 1] = Math.round(t * cg);
    rgba[off + 2] = Math.round(t * cb);
  }
}

/**
 * Applies unsharp masking sharpening to RGBA data.
 * Uses a 3x3 Gaussian blur, then: out = clamp(original + amount * (original - blurred)).
 * Alpha channel is not modified.
 */
export function applySharpen(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
): void {
  if (amount === 0) return;
  const pixelCount = width * height;
  // Create blurred copy using 3x3 Gaussian kernel [1,2,1; 2,4,2; 1,2,1] / 16
  const blurred = new Float32Array(pixelCount * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0, sumG = 0, sumB = 0;
      let wSum = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const ny = y + ky, nx = x + kx;
          if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue;
          const w = (kx === 0 && ky === 0) ? 4 : (kx === 0 || ky === 0) ? 2 : 1;
          const off = (ny * width + nx) * 4;
          sumR += rgba[off] * w;
          sumG += rgba[off + 1] * w;
          sumB += rgba[off + 2] * w;
          wSum += w;
        }
      }
      const idx = (y * width + x) * 3;
      blurred[idx]     = sumR / wSum;
      blurred[idx + 1] = sumG / wSum;
      blurred[idx + 2] = sumB / wSum;
    }
  }
  // Apply unsharp mask
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const bIdx = i * 3;
    rgba[off]     = Math.round(Math.max(0, Math.min(255, rgba[off]     + amount * (rgba[off]     - blurred[bIdx]))));
    rgba[off + 1] = Math.round(Math.max(0, Math.min(255, rgba[off + 1] + amount * (rgba[off + 1] - blurred[bIdx + 1]))));
    rgba[off + 2] = Math.round(Math.max(0, Math.min(255, rgba[off + 2] + amount * (rgba[off + 2] - blurred[bIdx + 2]))));
  }
}

/**
 * Computes min/max values from a decoded 16-bit buffer.
 */
export function computeMinMax(
  decodedBuffer: ArrayBuffer | Uint8Array,
  pixelCount: number,
  componentCount: number,
  bitsPerSample?: number,
): { min: number; max: number } | null {
  const expectedBytes8 = pixelCount * componentCount;
  const bufByteLength = getByteLength(decodedBuffer);
  const is16bit = bitsPerSample != null ? bitsPerSample > 8 : bufByteLength >= expectedBytes8 * 2;
  if (!is16bit) return null;

  const src = toUint16Array(decodedBuffer);
  let min = src[0], max = src[0];
  for (let i = 1; i < src.length; i++) {
    if (src[i] < min) min = src[i];
    if (src[i] > max) max = src[i];
  }
  return { min, max };
}
