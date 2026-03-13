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
