import { decode } from '@abasb75/openjpeg';
import type { DecodedOpenJPEG } from '@abasb75/openjpeg/types';
import { decodedBufferToRGBA } from './pixel-conversion';
import { buildTileCodestream } from './codestream-builder';

export interface DecodeResult {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export class JP2Decoder {
  /**
   * Decodes a JPEG2000 bitstream into RGBA pixel data.
   */
  async decode(data: ArrayBuffer, decodeLevel?: number, minValue?: number, maxValue?: number): Promise<DecodeResult> {
    const result: DecodedOpenJPEG = await decode(data, decodeLevel != null ? { decodeLevel } : undefined);

    const { width, height, componentCount, bitsPerSample } = result.frameInfo;
    const rgba = decodedBufferToRGBA(result.decodedBuffer, width, height, componentCount, bitsPerSample, minValue, maxValue);
    console.log(`JP2 decoded: ${width}x${height}, ${componentCount}ch, ${bitsPerSample}bps`);
    return { data: rgba, width, height };
  }

  /**
   * Decodes a single tile by combining a patched mainHeader + tileData + EOC.
   */
  async decodeTile(
    mainHeader: Uint8Array,
    tileData: Uint8Array,
    tileCol: number,
    tileRow: number,
    tileWidth: number,
    tileHeight: number,
    imageWidth: number,
    imageHeight: number,
  ): Promise<DecodeResult> {
    const actualW = Math.min(tileWidth, imageWidth - tileCol * tileWidth);
    const actualH = Math.min(tileHeight, imageHeight - tileRow * tileHeight);

    const codestream = buildTileCodestream(mainHeader, tileData, actualW, actualH);
    return this.decode(codestream.buffer as ArrayBuffer);
  }
}
