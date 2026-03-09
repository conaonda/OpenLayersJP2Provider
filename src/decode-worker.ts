import { decode } from '@abasb75/openjpeg';
import type { DecodedOpenJPEG } from '@abasb75/openjpeg/types';
import { decodedBufferToRGBA, computeMinMax } from './pixel-conversion';

export interface DecodeRequest {
  id: number;
  codestream: ArrayBuffer;
  decodeLevel?: number;
  minValue?: number;
  maxValue?: number;
  statsOnly?: boolean;
}

export interface DecodeResponse {
  id: number;
  data?: ArrayBuffer; // RGBA transferable
  width?: number;
  height?: number;
  error?: string;
  stats?: { min: number; max: number };
}

self.onmessage = async (e: MessageEvent<DecodeRequest>) => {
  const { id, codestream, decodeLevel, minValue, maxValue, statsOnly } = e.data;
  try {
    const result: DecodedOpenJPEG = await decode(
      codestream,
      decodeLevel != null ? { decodeLevel } : undefined,
    );

    const { width, height, componentCount, bitsPerSample } = result.frameInfo;

    if (statsOnly) {
      const stats = computeMinMax(new Uint8Array(result.decodedBuffer), width * height, componentCount, bitsPerSample);
      const resp: DecodeResponse = { id, width, height, stats: stats ?? undefined };
      (self as unknown as Worker).postMessage(resp);
      return;
    }

    const rgba = decodedBufferToRGBA(new Uint8Array(result.decodedBuffer), width, height, componentCount, bitsPerSample, minValue, maxValue);

    const resp: DecodeResponse = { id, data: rgba.buffer as ArrayBuffer, width, height };
    (self as unknown as Worker).postMessage(resp, [rgba.buffer]);
  } catch (err: any) {
    const resp: DecodeResponse = { id, error: err?.message ?? String(err) };
    (self as unknown as Worker).postMessage(resp);
  }
};
