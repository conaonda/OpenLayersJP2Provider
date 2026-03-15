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
