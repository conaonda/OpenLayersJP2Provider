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
 * Applies Gaussian blur smoothing to RGBA data.
 * Uses a 3×3 Gaussian kernel [1,2,1; 2,4,2; 1,2,1]/16.
 * The blur parameter controls number of passes (iterations).
 * Alpha channel is not modified.
 */
export function applyBlur(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  passes: number,
): void {
  if (passes <= 0) return;
  const pixelCount = width * height;
  for (let p = 0; p < passes; p++) {
    const tmp = new Uint8ClampedArray(pixelCount * 4);
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
        const dstOff = (y * width + x) * 4;
        tmp[dstOff]     = Math.round(sumR / wSum);
        tmp[dstOff + 1] = Math.round(sumG / wSum);
        tmp[dstOff + 2] = Math.round(sumB / wSum);
        tmp[dstOff + 3] = rgba[dstOff + 3];
      }
    }
    rgba.set(tmp);
  }
}

/**
 * Applies sepia tone effect to RGBA data.
 * Uses ITU-R sepia transform matrix with intensity-based linear interpolation.
 * intensity=0: no change, intensity=1: full sepia.
 * Alpha channel is not modified.
 */
export function applySepia(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  intensity: number,
): void {
  if (intensity === 0) return;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const r = rgba[off], g = rgba[off + 1], b = rgba[off + 2];
    const sr = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
    const sg = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
    const sb = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
    rgba[off]     = Math.round(r + intensity * (sr - r));
    rgba[off + 1] = Math.round(g + intensity * (sg - g));
    rgba[off + 2] = Math.round(b + intensity * (sb - b));
  }
}

/**
 * Converts RGB pixels to grayscale using ITU-R BT.709 weights.
 * Each pixel: gray = 0.2126*R + 0.7152*G + 0.0722*B.
 * Alpha channel is not modified.
 */
export function applyGrayscale(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const gray = Math.round(0.2126 * rgba[off] + 0.7152 * rgba[off + 1] + 0.0722 * rgba[off + 2]);
    rgba[off] = rgba[off + 1] = rgba[off + 2] = gray;
  }
}

/**
 * Applies a color lookup table to single-band (grayscale) RGBA data.
 * The grayscale value (0~255) is used as an index into the 256-entry colorMap.
 * Each entry is an [R, G, B] tuple. Alpha channel is not modified.
 * Only applies when componentCount === 1; multi-channel images are ignored.
 */
/**
 * Validates the colorMap option.
 * Must be an array of exactly 256 entries, each an [R, G, B] tuple with values 0~255.
 * Returns true if valid, false otherwise.
 */
export function validateColorMap(
  colorMap: unknown,
): colorMap is Array<[number, number, number]> {
  if (!Array.isArray(colorMap) || colorMap.length !== 256) return false;
  for (let i = 0; i < 256; i++) {
    const entry = colorMap[i];
    if (
      !Array.isArray(entry) ||
      entry.length !== 3 ||
      typeof entry[0] !== 'number' ||
      typeof entry[1] !== 'number' ||
      typeof entry[2] !== 'number' ||
      entry[0] < 0 || entry[0] > 255 ||
      entry[1] < 0 || entry[1] > 255 ||
      entry[2] < 0 || entry[2] > 255
    ) {
      return false;
    }
  }
  return true;
}

export function applyColorMap(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  colorMap: Array<[number, number, number]>,
): void {
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const idx = rgba[off];
    const entry = colorMap[idx];
    rgba[off] = entry[0];
    rgba[off + 1] = entry[1];
    rgba[off + 2] = entry[2];
  }
}

/**
 * Reduces the number of color levels per RGB channel (posterize effect).
 * Each channel is quantized to the given number of levels (2~256).
 * Alpha channel is not modified.
 */
export function applyPosterize(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  levels: number,
): void {
  if (levels < 2 || levels >= 256) return;
  const step = 255 / (levels - 1);
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    rgba[off]     = Math.round(Math.round(rgba[off] / step) * step);
    rgba[off + 1] = Math.round(Math.round(rgba[off + 1] / step) * step);
    rgba[off + 2] = Math.round(Math.round(rgba[off + 2] / step) * step);
  }
}

/**
 * Applies a vignette effect: darkens pixels progressively from center to edges.
 * strength controls intensity (0=none, 1=full darkening at corners).
 * Formula: factor = 1 - strength * radius^2, where radius is normalized distance from center.
 * Alpha channel is not modified.
 */
export function applyVignette(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  strength: number,
): void {
  if (strength === 0) return;
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const radius = Math.sqrt(dx * dx + dy * dy) / maxDist;
      const factor = Math.max(0, 1 - strength * radius * radius);
      const off = (y * width + x) * 4;
      rgba[off]     = Math.round(rgba[off] * factor);
      rgba[off + 1] = Math.round(rgba[off + 1] * factor);
      rgba[off + 2] = Math.round(rgba[off + 2] * factor);
    }
  }
}

/**
 * Applies Laplacian edge detection to RGBA data.
 * Kernel: [0,-1,0; -1,4,-1; 0,-1,0].
 * Alpha channel is not modified.
 */
export function applyEdgeDetect(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const pixelCount = width * height;
  const tmp = new Uint8ClampedArray(pixelCount * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const off = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = rgba[off + c] * 4;
        const top    = y > 0          ? rgba[((y - 1) * width + x) * 4 + c] : rgba[off + c];
        const bottom = y < height - 1 ? rgba[((y + 1) * width + x) * 4 + c] : rgba[off + c];
        const left   = x > 0          ? rgba[(y * width + x - 1) * 4 + c] : rgba[off + c];
        const right  = x < width - 1  ? rgba[(y * width + x + 1) * 4 + c] : rgba[off + c];
        tmp[off + c] = Math.max(0, Math.min(255, center - top - bottom - left - right));
      }
      tmp[off + 3] = rgba[off + 3];
    }
  }
  rgba.set(tmp);
}

/**
 * Applies emboss effect to RGBA data.
 * Kernel: [-2,-1,0; -1,1,1; 0,1,2]. Result offset by 128.
 * Alpha channel is not modified.
 */
export function applyEmboss(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const pixelCount = width * height;
  const tmp = new Uint8ClampedArray(pixelCount * 4);
  // Kernel weights indexed by (ky+1)*3+(kx+1)
  const kernel = [-2, -1, 0, -1, 1, 1, 0, 1, 2];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const off = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const ny = Math.max(0, Math.min(height - 1, y + ky));
            const nx = Math.max(0, Math.min(width - 1, x + kx));
            const w = kernel[(ky + 1) * 3 + (kx + 1)];
            sum += rgba[(ny * width + nx) * 4 + c] * w;
          }
        }
        tmp[off + c] = Math.max(0, Math.min(255, sum + 128));
      }
      tmp[off + 3] = rgba[off + 3];
    }
  }
  rgba.set(tmp);
}

/**
 * Applies pixelation (block mosaic) effect to RGBA data.
 * Divides the image into blocks of the given size and fills each block
 * with the average color of its pixels. Alpha channel is not modified.
 */
export function applyPixelate(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  blockSize: number,
): void {
  if (blockSize < 2) return;
  for (let by = 0; by < height; by += blockSize) {
    for (let bx = 0; bx < width; bx += blockSize) {
      const bw = Math.min(blockSize, width - bx);
      const bh = Math.min(blockSize, height - by);
      let sumR = 0, sumG = 0, sumB = 0;
      const count = bw * bh;
      for (let y = by; y < by + bh; y++) {
        for (let x = bx; x < bx + bw; x++) {
          const off = (y * width + x) * 4;
          sumR += rgba[off];
          sumG += rgba[off + 1];
          sumB += rgba[off + 2];
        }
      }
      const avgR = Math.round(sumR / count);
      const avgG = Math.round(sumG / count);
      const avgB = Math.round(sumB / count);
      for (let y = by; y < by + bh; y++) {
        for (let x = bx; x < bx + bw; x++) {
          const off = (y * width + x) * 4;
          rgba[off] = avgR;
          rgba[off + 1] = avgG;
          rgba[off + 2] = avgB;
        }
      }
    }
  }
}

/**
 * Swaps RGB channels according to the given order array.
 * order is a 3-element array where order[i] is the source channel index (0=R, 1=G, 2=B)
 * for output channel i. Invalid indices (outside 0-2) are ignored (channel unchanged).
 * Alpha channel is not modified.
 */
export function applyChannelSwap(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  order: [number, number, number],
): void {
  const valid = order.every(i => i >= 0 && i <= 2);
  if (!valid) return;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const r = rgba[off], g = rgba[off + 1], b = rgba[off + 2];
    const channels = [r, g, b];
    rgba[off] = channels[order[0]];
    rgba[off + 1] = channels[order[1]];
    rgba[off + 2] = channels[order[2]];
  }
}

/**
 * Adjusts RGB channels independently: out_ch = clamp(in_ch + offset_ch, 0, 255).
 * Each element of the balance tuple is clamped to -255~255.
 * Alpha channel is not modified.
 */
export function applyColorBalance(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  balance: [number, number, number],
): void {
  const rOff = Math.max(-255, Math.min(255, Math.round(balance[0])));
  const gOff = Math.max(-255, Math.min(255, Math.round(balance[1])));
  const bOff = Math.max(-255, Math.min(255, Math.round(balance[2])));
  if (rOff === 0 && gOff === 0 && bOff === 0) return;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    rgba[off]     = rgba[off] + rOff;
    rgba[off + 1] = rgba[off + 1] + gOff;
    rgba[off + 2] = rgba[off + 2] + bOff;
  }
}

/**
 * Applies exposure (multiplicative brightness) to RGB channels: out = clamp(in * exposure, 0, 255).
 * exposure=1.0: no change, >1.0: brighter, <1.0: darker.
 * Alpha channel is not modified.
 */
export function applyExposure(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  exposure: number,
): void {
  if (exposure === 1.0) return;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    rgba[off]     = Math.round(Math.max(0, Math.min(255, rgba[off] * exposure)));
    rgba[off + 1] = Math.round(Math.max(0, Math.min(255, rgba[off + 1] * exposure)));
    rgba[off + 2] = Math.round(Math.max(0, Math.min(255, rgba[off + 2] * exposure)));
  }
}

/**
 * Validates and normalizes levels input values.
 * Clamps inputMin/inputMax to 0-255 range.
 * If inputMin > inputMax, swaps them and returns swapped=true.
 */
export function validateLevels(
  inputMin: number,
  inputMax: number,
): { inputMin: number; inputMax: number; swapped: boolean } {
  let min = Math.max(0, Math.min(255, Math.round(inputMin)));
  let max = Math.max(0, Math.min(255, Math.round(inputMax)));
  let swapped = false;
  if (min > max) {
    [min, max] = [max, min];
    swapped = true;
  }
  return { inputMin: min, inputMax: max, swapped };
}

/**
 * Remaps pixel input levels: maps [inputMin, inputMax] → [0, 255] linearly.
 * Values below inputMin become 0, values above inputMax become 255.
 * Alpha channel is not modified.
 */
export function applyLevels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  inputMin: number,
  inputMax: number,
): void {
  if (inputMin === 0 && inputMax === 255) return;
  const range = inputMax - inputMin || 1;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    rgba[off]     = Math.round(Math.max(0, Math.min(255, (rgba[off] - inputMin) * 255 / range)));
    rgba[off + 1] = Math.round(Math.max(0, Math.min(255, (rgba[off + 1] - inputMin) * 255 / range)));
    rgba[off + 2] = Math.round(Math.max(0, Math.min(255, (rgba[off + 2] - inputMin) * 255 / range)));
  }
}

/**
 * Adds random noise to RGB channels: out = clamp(in + random(-noise, +noise), 0, 255).
 * noise=0: no change. Recommended range: 0~50 (higher values severely degrade image quality).
 * Values above 255 are clipped to 255 at the caller level.
 * Alpha channel is not modified.
 */
export function applyNoise(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  noise: number,
): void {
  if (noise === 0) return;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    rgba[off]     = Math.max(0, Math.min(255, Math.round(rgba[off]     + (Math.random() * 2 - 1) * noise)));
    rgba[off + 1] = Math.max(0, Math.min(255, Math.round(rgba[off + 1] + (Math.random() * 2 - 1) * noise)));
    rgba[off + 2] = Math.max(0, Math.min(255, Math.round(rgba[off + 2] + (Math.random() * 2 - 1) * noise)));
  }
}

/**
 * Applies a tint color overlay by blending original pixels with the tint color.
 * Formula: result = original * (1 - strength) + tint * strength.
 * strength defaults to 0.5 if not provided. Alpha channel is not modified.
 */
export function applyTint(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  strength: number = 0.5,
): void {
  if (strength === 0) return;
  const s = Math.max(0, Math.min(1, strength));
  const inv = 1 - s;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    rgba[off]     = Math.round(rgba[off] * inv + r * s);
    rgba[off + 1] = Math.round(rgba[off + 1] * inv + g * s);
    rgba[off + 2] = Math.round(rgba[off + 2] * inv + b * s);
  }
}

/**
 * Remaps pixel output levels: maps [0, 255] → [outputMin, outputMax] linearly.
 * Alpha channel is not modified.
 */
export function applyOutputLevels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  outputMin: number,
  outputMax: number,
): void {
  if (outputMin === 0 && outputMax === 255) return;
  const range = outputMax - outputMin;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    rgba[off]     = Math.round(Math.max(0, Math.min(255, outputMin + rgba[off] * range / 255)));
    rgba[off + 1] = Math.round(Math.max(0, Math.min(255, outputMin + rgba[off + 1] * range / 255)));
    rgba[off + 2] = Math.round(Math.max(0, Math.min(255, outputMin + rgba[off + 2] * range / 255)));
  }
}

/**
 * Validates and normalizes outputLevels input values.
 * Clamps outputMin/outputMax to 0-255 range.
 * If outputMin > outputMax, swaps them and returns swapped=true.
 */
export function validateOutputLevels(
  outputMin: number,
  outputMax: number,
): { outputMin: number; outputMax: number; swapped: boolean } {
  let min = Math.max(0, Math.min(255, Math.round(outputMin)));
  let max = Math.max(0, Math.min(255, Math.round(outputMax)));
  let swapped = false;
  if (min > max) {
    [min, max] = [max, min];
    swapped = true;
  }
  return { outputMin: min, outputMax: max, swapped };
}

/**
 * Adjusts color temperature of RGB channels.
 * Positive values add warmth (increase R, decrease B), negative add coolness (increase B, decrease R).
 * Range: -100 to +100. Alpha channel is not modified.
 */
export function applyTemperature(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  temperature: number,
): void {
  if (temperature === 0) return;
  const t = Math.max(-100, Math.min(100, temperature));
  const rShift = Math.round(t * 255 / 100);
  const bShift = Math.round(-t * 255 / 100);
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    rgba[off]     = Math.max(0, Math.min(255, rgba[off] + rShift));
    rgba[off + 2] = Math.max(0, Math.min(255, rgba[off + 2] + bShift));
  }
}

/**
 * Flips image horizontally (left-right) and/or vertically (top-bottom).
 * Alpha channel is included in the flip.
 */
export function applyFlip(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  horizontal: boolean,
  vertical: boolean,
): void {
  if (!horizontal && !vertical) return;
  if (horizontal) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < Math.floor(width / 2); x++) {
        const left = (y * width + x) * 4;
        const right = (y * width + (width - 1 - x)) * 4;
        for (let c = 0; c < 4; c++) {
          const tmp = rgba[left + c];
          rgba[left + c] = rgba[right + c];
          rgba[right + c] = tmp;
        }
      }
    }
  }
  if (vertical) {
    for (let y = 0; y < Math.floor(height / 2); y++) {
      for (let x = 0; x < width; x++) {
        const top = (y * width + x) * 4;
        const bottom = ((height - 1 - y) * width + x) * 4;
        for (let c = 0; c < 4; c++) {
          const tmp = rgba[top + c];
          rgba[top + c] = rgba[bottom + c];
          rgba[bottom + c] = tmp;
        }
      }
    }
  }
}

/**
 * Applies vibrance adjustment — selectively boosts saturation of less-saturated colors.
 * vibrance > 0: boost low-saturation colors, vibrance < 0: desaturate low-saturation colors.
 * Range: -1 to 1. Already-saturated colors are affected less to prevent oversaturation.
 * Alpha channel is not modified.
 */
export function applyVibrance(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  vibrance: number,
): void {
  if (vibrance === 0) return;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const r = rgba[off], g = rgba[off + 1], b = rgba[off + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // Current saturation ratio (0 = gray, 1 = fully saturated)
    const sat = max === 0 ? 0 : (max - min) / max;
    // Scale factor: low saturation → stronger effect
    const amount = vibrance * (1 - sat);
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    rgba[off]     = Math.round(Math.max(0, Math.min(255, gray + (1 + amount) * (r - gray))));
    rgba[off + 1] = Math.round(Math.max(0, Math.min(255, gray + (1 + amount) * (g - gray))));
    rgba[off + 2] = Math.round(Math.max(0, Math.min(255, gray + (1 + amount) * (b - gray))));
  }
}

/**
 * Validates curves option: each channel array must have exactly 256 entries with values 0~255.
 * Returns true if valid.
 */
export function validateCurves(
  curves: unknown,
): curves is { r?: number[]; g?: number[]; b?: number[]; all?: number[] } {
  if (typeof curves !== 'object' || curves === null || Array.isArray(curves)) return false;
  const obj = curves as Record<string, unknown>;
  for (const key of ['r', 'g', 'b', 'all']) {
    const arr = obj[key];
    if (arr === undefined) continue;
    if (!Array.isArray(arr) || arr.length !== 256) return false;
    for (let i = 0; i < 256; i++) {
      if (typeof arr[i] !== 'number' || arr[i] < 0 || arr[i] > 255) return false;
    }
  }
  return true;
}

/**
 * Applies tone curves to RGB channels using LUT (Look-Up Table) mapping.
 * `all` curve is applied first (common to all channels), then per-channel curves.
 * Each curve is a 256-element array mapping input value (index) to output value.
 * Alpha channel is not modified.
 */
export function applyCurves(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  curves: { r?: number[]; g?: number[]; b?: number[]; all?: number[] },
): void {
  const { r: rCurve, g: gCurve, b: bCurve, all: allCurve } = curves;
  if (!rCurve && !gCurve && !bCurve && !allCurve) return;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    let r = rgba[off], g = rgba[off + 1], b = rgba[off + 2];
    // Apply common curve first
    if (allCurve) {
      r = allCurve[r];
      g = allCurve[g];
      b = allCurve[b];
    }
    // Apply per-channel curves
    if (rCurve) r = rCurve[r];
    if (gCurve) g = gCurve[g];
    if (bCurve) b = bCurve[b];
    rgba[off] = Math.max(0, Math.min(255, r));
    rgba[off + 1] = Math.max(0, Math.min(255, g));
    rgba[off + 2] = Math.max(0, Math.min(255, b));
  }
}

/**
 * Applies duotone effect: maps pixel luminance to a two-color gradient.
 * Shadows color is used for dark pixels, highlights color for bright pixels.
 * Alpha channel is not modified.
 */
export function applyDuotone(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  shadows: [number, number, number],
  highlights: [number, number, number],
): void {
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const lum = (0.2126 * rgba[off] + 0.7152 * rgba[off + 1] + 0.0722 * rgba[off + 2]) / 255;
    rgba[off]     = Math.round(shadows[0] + lum * (highlights[0] - shadows[0]));
    rgba[off + 1] = Math.round(shadows[1] + lum * (highlights[1] - shadows[1]));
    rgba[off + 2] = Math.round(shadows[2] + lum * (highlights[2] - shadows[2]));
  }
}

/**
 * Applies dodge effect: selectively brightens highlights.
 * Formula: result = pixel / (1 - dodge * normalized), where normalized = pixel / 255.
 * dodge=0: no change, dodge=1: maximum dodge.
 * Alpha channel is not modified.
 */
export function applyDodge(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  dodge: number,
): void {
  if (dodge === 0) return;
  const d = Math.max(0, Math.min(1, dodge));
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    for (let c = 0; c < 3; c++) {
      const v = rgba[off + c];
      const normalized = v / 255;
      const divisor = 1 - d * normalized;
      rgba[off + c] = Math.round(Math.max(0, Math.min(255, divisor <= 0 ? 255 : v / divisor)));
    }
  }
}

/**
 * Applies burn effect: selectively darkens shadows.
 * Formula: result = pixel * (1 - burn * (1 - normalized)), where normalized = pixel / 255.
 * burn=0: no change, burn=1: maximum burn.
 * Alpha channel is not modified.
 */
export function applyBurn(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  burn: number,
): void {
  if (burn === 0) return;
  const b = Math.max(0, Math.min(1, burn));
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    for (let c = 0; c < 3; c++) {
      const v = rgba[off + c];
      const normalized = v / 255;
      rgba[off + c] = Math.round(Math.max(0, Math.min(255, v * (1 - b * (1 - normalized)))));
    }
  }
}

/**
 * Applies solarization effect: inverts pixels with channel values above the threshold.
 * For each RGB channel, if value >= threshold, output = 255 - value; otherwise unchanged.
 * Alpha channel is not modified.
 */
export function applySolarize(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
): void {
  const t = Math.max(0, Math.min(255, Math.round(threshold)));
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    if (rgba[off] >= t) rgba[off] = 255 - rgba[off];
    if (rgba[off + 1] >= t) rgba[off + 1] = 255 - rgba[off + 1];
    if (rgba[off + 2] >= t) rgba[off + 2] = 255 - rgba[off + 2];
  }
}

/**
 * Adjusts shadows and highlights independently based on pixel luminance.
 * shadows: -100~100, positive brightens dark areas, negative darkens them.
 * highlights: -100~100, negative darkens bright areas, positive brightens them.
 * Alpha channel is not modified.
 */
export function applyShadowsHighlights(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  shadows: number,
  highlights: number,
): void {
  if (shadows === 0 && highlights === 0) return;
  const sAmount = Math.max(-100, Math.min(100, shadows)) / 100;
  const hAmount = Math.max(-100, Math.min(100, highlights)) / 100;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const lum = (0.2126 * rgba[off] + 0.7152 * rgba[off + 1] + 0.0722 * rgba[off + 2]) / 255;
    // Shadow weight: strong for dark pixels, fades for bright
    const shadowWeight = 1 - lum;
    // Highlight weight: strong for bright pixels, fades for dark
    const highlightWeight = lum;
    const adjustment = sAmount * shadowWeight + hAmount * highlightWeight;
    const shift = adjustment * 255;
    rgba[off]     = Math.round(Math.max(0, Math.min(255, rgba[off] + shift)));
    rgba[off + 1] = Math.round(Math.max(0, Math.min(255, rgba[off + 1] + shift)));
    rgba[off + 2] = Math.round(Math.max(0, Math.min(255, rgba[off + 2] + shift)));
  }
}

/**
 * Applies clarity (local contrast enhancement) to RGBA data.
 * Uses unsharp mask on midtones: enhances detail in mid-brightness areas.
 * clarity: 0~100 (0=no change). Alpha channel is not modified.
 */
export function applyClarity(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  clarity: number,
): void {
  if (clarity <= 0) return;
  const amount = Math.min(100, clarity) / 100;
  const pixelCount = width * height;
  // Create blurred copy using 3x3 Gaussian kernel
  const blurred = new Float32Array(pixelCount * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0, sumG = 0, sumB = 0, wSum = 0;
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
      blurred[idx] = sumR / wSum;
      blurred[idx + 1] = sumG / wSum;
      blurred[idx + 2] = sumB / wSum;
    }
  }
  // Apply unsharp mask weighted by midtone strength
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const bIdx = i * 3;
    const lum = (0.2126 * rgba[off] + 0.7152 * rgba[off + 1] + 0.0722 * rgba[off + 2]) / 255;
    // Midtone weight: peaks at lum=0.5, fades at shadows/highlights
    const midWeight = 4 * lum * (1 - lum);
    const strength = amount * midWeight;
    rgba[off]     = Math.round(Math.max(0, Math.min(255, rgba[off]     + strength * (rgba[off]     - blurred[bIdx]))));
    rgba[off + 1] = Math.round(Math.max(0, Math.min(255, rgba[off + 1] + strength * (rgba[off + 1] - blurred[bIdx + 1]))));
    rgba[off + 2] = Math.round(Math.max(0, Math.min(255, rgba[off + 2] + strength * (rgba[off + 2] - blurred[bIdx + 2]))));
  }
}

/**
 * Applies cross-process film effect: applies different nonlinear curves to R/G/B channels.
 * Simulates slide film developed in negative chemistry.
 * intensity=0: no change, intensity=1: full cross-process effect.
 * Alpha channel is not modified.
 */
export function applyCrossProcess(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  intensity: number,
): void {
  if (intensity === 0) return;
  const t = Math.max(0, Math.min(1, intensity));
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const r = rgba[off] / 255;
    const g = rgba[off + 1] / 255;
    const b = rgba[off + 2] / 255;
    // R: S-curve boost (push highlights, crush shadows)
    const rOut = Math.max(0, Math.min(1, r + 0.3 * r * (1 - r) * (2 * r - 1 + 0.5)));
    // G: slight lift with mid-tone emphasis
    const gOut = Math.max(0, Math.min(1, g + 0.2 * g * (1 - g)));
    // B: crush — reduce overall, especially midtones
    const bOut = Math.max(0, Math.min(1, b - 0.15 * b * (1 - b)));
    rgba[off]     = Math.max(0, Math.min(255, Math.round(rgba[off]     + t * (rOut * 255 - rgba[off]))));
    rgba[off + 1] = Math.max(0, Math.min(255, Math.round(rgba[off + 1] + t * (gOut * 255 - rgba[off + 1]))));
    rgba[off + 2] = Math.max(0, Math.min(255, Math.round(rgba[off + 2] + t * (bOut * 255 - rgba[off + 2]))));
  }
}

/**
 * Applies film grain texture effect: adds luminance-dependent noise.
 * Darker areas receive stronger grain, simulating real film behavior.
 * intensity=0: no change, intensity=1: maximum grain.
 * Alpha channel is not modified.
 */
export function applyGrainFilm(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  intensity: number,
): void {
  if (intensity === 0) return;
  const t = Math.max(0, Math.min(1, intensity));
  const maxNoise = 50 * t;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const lum = (0.2126 * rgba[off] + 0.7152 * rgba[off + 1] + 0.0722 * rgba[off + 2]) / 255;
    // Darker pixels get stronger grain
    const grainStrength = maxNoise * (1 - lum * 0.7);
    const noise = (Math.random() * 2 - 1) * grainStrength;
    rgba[off]     = Math.round(Math.max(0, Math.min(255, rgba[off] + noise)));
    rgba[off + 1] = Math.round(Math.max(0, Math.min(255, rgba[off + 1] + noise)));
    rgba[off + 2] = Math.round(Math.max(0, Math.min(255, rgba[off + 2] + noise)));
  }
}

/**
 * Applies halftone dot pattern effect.
 * Divides image into dotSize×dotSize cells, computes average luminance,
 * and renders a circular dot sized by darkness. Pixels outside the dot become white.
 * dotSize < 2: no change.
 * Alpha channel is not modified.
 */
export function applyHalftone(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  dotSize: number,
): void {
  if (dotSize < 2) return;
  const s = Math.round(dotSize);
  for (let by = 0; by < height; by += s) {
    for (let bx = 0; bx < width; bx += s) {
      const bw = Math.min(s, width - bx);
      const bh = Math.min(s, height - by);
      // Compute average luminance of the cell
      let sumLum = 0;
      const count = bw * bh;
      for (let y = by; y < by + bh; y++) {
        for (let x = bx; x < bx + bw; x++) {
          const off = (y * width + x) * 4;
          sumLum += 0.2126 * rgba[off] + 0.7152 * rgba[off + 1] + 0.0722 * rgba[off + 2];
        }
      }
      const avgLum = sumLum / count / 255; // 0=dark, 1=bright
      // Dot radius: use full cell size to avoid edge artifacts at tile boundaries
      const maxRadius = s / 2;
      const dotRadius = maxRadius * (1 - avgLum);
      const cx = bx + s / 2;
      const cy = by + s / 2;
      const r2 = dotRadius * dotRadius;
      for (let y = by; y < by + bh; y++) {
        for (let x = bx; x < bx + bw; x++) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          const off = (y * width + x) * 4;
          if (dx * dx + dy * dy > r2) {
            // Outside dot → white
            rgba[off] = rgba[off + 1] = rgba[off + 2] = 255;
          }
          // Inside dot → keep original color
        }
      }
    }
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

/**
 * Applies histogram equalization to RGB channels independently.
 * Redistributes pixel intensity to span the full 0–255 range uniformly,
 * improving contrast in low-dynamic-range images.
 * Alpha channel is not modified.
 */
export function applyHistogramEqualize(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const pixelCount = width * height;
  if (pixelCount === 0) return;

  for (let ch = 0; ch < 3; ch++) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < pixelCount; i++) {
      hist[rgba[i * 4 + ch]]++;
    }

    const cdf = new Uint32Array(256);
    cdf[0] = hist[0];
    for (let v = 1; v < 256; v++) {
      cdf[v] = cdf[v - 1] + hist[v];
    }

    let cdfMin = 0;
    for (let v = 0; v < 256; v++) {
      if (cdf[v] > 0) { cdfMin = cdf[v]; break; }
    }

    const denom = pixelCount - cdfMin;
    if (denom <= 0) continue;

    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      lut[v] = Math.round((cdf[v] - cdfMin) / denom * 255);
    }

    for (let i = 0; i < pixelCount; i++) {
      rgba[i * 4 + ch] = lut[rgba[i * 4 + ch]];
    }
  }
}

/**
 * Applies split-toning color grading: shadows receive one tint, highlights another.
 * The balance parameter controls the luminance threshold between shadow and highlight regions.
 * Alpha channel is not modified.
 */
export function applyColorGrade(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: {
    shadows?: [number, number, number];
    highlights?: [number, number, number];
    balance?: number;
    strength?: number;
  },
): void {
  const shadows = options.shadows ?? [0, 0, 0];
  const highlights = options.highlights ?? [255, 255, 255];
  const balance = Math.max(0, Math.min(255, options.balance ?? 128));
  const strength = Math.max(0, Math.min(1, options.strength ?? 0.3));
  if (strength === 0) return;

  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const r = rgba[off];
    const g = rgba[off + 1];
    const b = rgba[off + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    let tone: [number, number, number];
    let t: number;
    if (lum < balance) {
      tone = shadows;
      t = balance > 0 ? (balance - lum) / balance : 0;
    } else {
      tone = highlights;
      t = balance < 255 ? (lum - balance) / (255 - balance) : 0;
    }
    const blend = t * strength;
    rgba[off]     = Math.max(0, Math.min(255, Math.round(r + blend * (tone[0] - r))));
    rgba[off + 1] = Math.max(0, Math.min(255, Math.round(g + blend * (tone[1] - g))));
    rgba[off + 2] = Math.max(0, Math.min(255, Math.round(b + blend * (tone[2] - b))));
  }
}

/**
 * 4×4 선형 색상 변환 행렬을 적용한다.
 * matrix는 row-major 순서의 16개 원소 배열 [R→R, R→G, R→B, R→A, G→R, ...].
 * 각 픽셀의 [R,G,B,A]에 행렬을 곱한 후 0~255로 클램프한다.
 */
export function applyColorMatrix(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  matrix: number[],
): void {
  if (matrix.length !== 16) return;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const r = rgba[off];
    const g = rgba[off + 1];
    const b = rgba[off + 2];
    const a = rgba[off + 3];
    rgba[off]     = Math.max(0, Math.min(255, Math.round(matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * a)));
    rgba[off + 1] = Math.max(0, Math.min(255, Math.round(matrix[4] * r + matrix[5] * g + matrix[6] * b + matrix[7] * a)));
    rgba[off + 2] = Math.max(0, Math.min(255, Math.round(matrix[8] * r + matrix[9] * g + matrix[10] * b + matrix[11] * a)));
    rgba[off + 3] = Math.max(0, Math.min(255, Math.round(matrix[12] * r + matrix[13] * g + matrix[14] * b + matrix[15] * a)));
  }
}

/**
 * 타일별 자동 대비 스트레칭.
 * 각 RGB 채널의 min/max를 구한 뒤 0~255로 선형 재매핑한다.
 * 단색 타일(min === max)은 변경하지 않는다.
 */
export function applyAutoContrast(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const pixelCount = width * height;
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;

  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const r = rgba[off], g = rgba[off + 1], b = rgba[off + 2];
    if (r < rMin) rMin = r; if (r > rMax) rMax = r;
    if (g < gMin) gMin = g; if (g > gMax) gMax = g;
    if (b < bMin) bMin = b; if (b > bMax) bMax = b;
  }

  const rRange = rMax - rMin;
  const gRange = gMax - gMin;
  const bRange = bMax - bMin;
  if (rRange === 0 && gRange === 0 && bRange === 0) return;

  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    if (rRange > 0) rgba[off]     = Math.round((rgba[off] - rMin) / rRange * 255);
    if (gRange > 0) rgba[off + 1] = Math.round((rgba[off + 1] - gMin) / gRange * 255);
    if (bRange > 0) rgba[off + 2] = Math.round((rgba[off + 2] - bMin) / bRange * 255);
  }
}

/**
 * 특정 RGB 색상과 유클리드 거리가 tolerance 이내인 픽셀의 알파를 0으로 설정한다 (크로마키 효과).
 * @param rgba - RGBA 픽셀 데이터
 * @param width - 이미지 너비
 * @param height - 이미지 높이
 * @param color - 투명 처리할 RGB 색상 [R, G, B]
 * @param tolerance - 색상 허용 오차 (유클리드 거리, 기본값: 0)
 */
export function applyChromaKey(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  color: [number, number, number],
  tolerance: number = 0,
): void {
  const [cr, cg, cb] = color;
  const tolSq = tolerance * tolerance;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const dr = rgba[off] - cr;
    const dg = rgba[off + 1] - cg;
    const db = rgba[off + 2] - cb;
    if (dr * dr + dg * dg + db * db <= tolSq) {
      rgba[off + 3] = 0;
    }
  }
}

/**
 * 중앙값 필터를 적용하여 salt-and-pepper 노이즈를 제거한다.
 * 각 픽셀 주변 kernelSize² 윈도우의 R/G/B 중앙값을 선택한다. 알파는 변경하지 않는다.
 * 가장자리 처리: 경계 밖 픽셀은 건너뛰고(skip) 유효 이웃만으로 중앙값 계산 (클램프 아님).
 * @param rgba - RGBA 픽셀 데이터
 * @param width - 이미지 너비
 * @param height - 이미지 높이
 * @param kernelSize - 커널 크기 (홀수, 3~11). 짝수면 +1 처리. 범위 밖이면 클램프.
 */
export function applyMedian(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  kernelSize: number,
): void {
  kernelSize = Math.max(3, Math.min(11, Math.round(kernelSize)));
  if (kernelSize % 2 === 0) kernelSize++;
  const radius = (kernelSize - 1) / 2;
  const pixelCount = width * height;
  const out = new Uint8ClampedArray(pixelCount * 4);
  const maxSamples = kernelSize * kernelSize;

  const rBuf = new Uint8Array(maxSamples);
  const gBuf = new Uint8Array(maxSamples);
  const bBuf = new Uint8Array(maxSamples);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const off = (ny * width + nx) * 4;
          rBuf[count] = rgba[off];
          gBuf[count] = rgba[off + 1];
          bBuf[count] = rgba[off + 2];
          count++;
        }
      }
      const rSorted = rBuf.subarray(0, count).sort();
      const gSorted = gBuf.subarray(0, count).sort();
      const bSorted = bBuf.subarray(0, count).sort();
      const mid = count >> 1;

      const outOff = (y * width + x) * 4;
      out[outOff] = rSorted[mid];
      out[outOff + 1] = gSorted[mid];
      out[outOff + 2] = bSorted[mid];
      out[outOff + 3] = rgba[(y * width + x) * 4 + 3];
    }
  }

  rgba.set(out);
}
