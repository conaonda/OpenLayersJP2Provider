import OpenJPEGWASM from '@abasb75/openjpeg';

export interface JP2Metadata {
  width: number;
  height: number;
  numComponents: number;
  precision: number;
  isTiled: boolean;
  tileSize?: { width: number; height: number };
}

export class JP2Decoder {
  private openjpegjs: any = null;

  /**
   * Initializes the WASM decoder.
   */
  async init(): Promise<void> {
    if (this.openjpegjs) return;

    console.log('Loading JP2 WASM module (@abasb75/openjpeg)...');
    try {
      this.openjpegjs = await OpenJPEGWASM();
      console.log('JP2 WASM module loaded successfully.');
    } catch (error) {
      console.error('Failed to load JP2 WASM module:', error);
      throw error;
    }
  }

  /**
   * Decodes a JPEG2000 bitstream into raw RGBA data.
   */
  async decode(data: ArrayBuffer): Promise<Uint8ClampedArray> {
    if (!this.openjpegjs) {
      throw new Error('Decoder not initialized. Call init() first.');
    }

    const decoder = new this.openjpegjs.J2KDecoder();
    try {
      // Copy encoded data to WASM memory
      const encodedBuffer = decoder.getEncodedBuffer(data.byteLength);
      encodedBuffer.set(new Uint8Array(data));

      // Decode the JP2 data
      decoder.decode();

      // Get frame information
      const frameInfo = decoder.getFrameInfo();
      const { width, height, components } = frameInfo;

      // Get the decoded buffer (raw pixel data)
      const decodedBuffer = decoder.getDecodedBuffer();
      const decodedArray = new Uint8Array(decodedBuffer);

      // Convert to RGBA if it's not already
      // OpenJPEG usually decodes into component-interleaved or planar formats
      // For simplicity in this provider, we assume it's RGB and convert to RGBA
      const rgba = new Uint8ClampedArray(width * height * 4);
      
      if (components.length === 3) {
        // Simple RGB to RGBA conversion
        for (let i = 0; i < width * height; i++) {
          rgba[i * 4] = decodedArray[i * 3];     // R
          rgba[i * 4 + 1] = decodedArray[i * 3 + 1]; // G
          rgba[i * 4 + 2] = decodedArray[i * 3 + 2]; // B
          rgba[i * 4 + 3] = 255;                 // A
        }
      } else if (components.length === 1) {
        // Grayscale to RGBA conversion
        for (let i = 0; i < width * height; i++) {
          const val = decodedArray[i];
          rgba[i * 4] = val;
          rgba[i * 4 + 1] = val;
          rgba[i * 4 + 2] = val;
          rgba[i * 4 + 3] = 255;
        }
      } else if (components.length === 4) {
        // Already RGBA (or CMYK, but we'll assume RGBA)
        rgba.set(decodedArray);
      }

      return rgba;
    } catch (error) {
      console.error('Decoding failed:', error);
      throw error;
    } finally {
      // Free the decoder instance
      decoder.delete();
    }
  }
}
