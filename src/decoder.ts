import { decode } from '@abasb75/openjpeg';
import type { DecodedOpenJPEG } from '@abasb75/openjpeg/types';
import { decodedBufferToRGBA } from './pixel-conversion';

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
    tilesX: number,
  ): Promise<DecodeResult> {
    const actualW = Math.min(tileWidth, imageWidth - tileCol * tileWidth);
    const actualH = Math.min(tileHeight, imageHeight - tileRow * tileHeight);

    const header = new Uint8Array(mainHeader);
    const hv = new DataView(header.buffer, header.byteOffset, header.byteLength);

    const sizOffset = 4;
    const xsizOff = sizOffset + 4;
    hv.setUint32(xsizOff, actualW, false);
    hv.setUint32(xsizOff + 4, actualH, false);
    hv.setUint32(xsizOff + 8, 0, false);
    hv.setUint32(xsizOff + 12, 0, false);
    hv.setUint32(xsizOff + 16, actualW, false);
    hv.setUint32(xsizOff + 20, actualH, false);
    hv.setUint32(xsizOff + 24, 0, false);
    hv.setUint32(xsizOff + 28, 0, false);

    const tile = new Uint8Array(tileData);
    const tv = new DataView(tile.buffer, tile.byteOffset, tile.byteLength);
    tv.setUint16(4, 0, false);

    const eoc = new Uint8Array([0xFF, 0xD9]);
    const codestream = new Uint8Array(header.length + tile.length + 2);
    codestream.set(header, 0);
    codestream.set(tile, header.length);
    codestream.set(eoc, header.length + tile.length);

    return this.decode(codestream.buffer);
  }
}
