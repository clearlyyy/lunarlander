// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      // Proxy Cesium API requests
      '/cesium': {
        target: 'https://api.cesium.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cesium/, ''),
      },
      // Proxy Cesium asset requests
      '/cesium-assets': {
        target: 'https://assets.ion.cesium.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cesium-assets/, ''),
      },
    },
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    include: ['ammo.js'],
  },
  base: '/',
});