import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'openlayersjp2provider',
    },
    rollupOptions: {
      external: (id: string) => id === 'proj4' || id === 'ol' || id.startsWith('ol/'),
    },
  },
  server: {
    proxy: {
      '/proxy/gcs-sentinel2': {
        target: 'https://storage.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/gcs-sentinel2/, ''),
      },
    },
  },
});
