import TileImage from 'ol/source/TileImage';
import { JP2Decoder } from './decoder';
import TileState from 'ol/TileState';

export interface JP2SourceOptions {
  url: string;
  decoder?: JP2Decoder;
  tileGrid?: any; // Allow custom tile grid
}

export class JP2Source extends TileImage {
  private decoder: JP2Decoder;
  private jp2Url: string;

  constructor(options: JP2SourceOptions) {
    super({
      state: 'loading',
      tileGrid: options.tileGrid,
      wrapX: false
    });

    this.jp2Url = options.url;
    this.decoder = options.decoder || new JP2Decoder();
    
    this.setTileLoadFunction(this.jp2TileLoadFunction.bind(this));
    this.initialize();
  }

  private async initialize() {
    await this.decoder.init();
    this.setState('ready');
  }

  private async jp2TileLoadFunction(tile: any, src: string) {
    const coord = tile.getTileCoord();
    const z = coord[0];
    const x = coord[1];
    const y = coord[2];

    try {
      // In a real implementation, we would fetch the bitstream
      // and decode only the requested tile region.
      // For now, we simulate decoding from the source URL.
      const response = await fetch(this.jp2Url);
      if (!response.ok) throw new Error('Failed to fetch JP2');
      
      const arrayBuffer = await response.arrayBuffer();
      const rgbaData = await this.decoder.decode(arrayBuffer);

      // Create a canvas to hold the decoded tile data
      const canvas = document.createElement('canvas');
      canvas.width = 256; // Default tile size
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const imageData = new ImageData(rgbaData, 256, 256);
        ctx.putImageData(imageData, 0, 0);
        tile.setImage(canvas);
      }
    } catch (error) {
      console.error('JP2 Tile Load Error:', error);
      tile.setState(TileState.ERROR);
    }
  }
}
