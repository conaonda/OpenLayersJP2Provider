import { defineConfig } from 'vite';

export default defineConfig({
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
