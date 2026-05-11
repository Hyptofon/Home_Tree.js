import { defineConfig } from 'vite';

/**
 * Vite infrastructure config.
 *
 * A project-scoped cache directory avoids stale Windows file locks in the
 * default dependency optimizer cache, while manual chunks keep the app bundle
 * split along stable engine/vendor boundaries.
 */
export default defineConfig({
  cacheDir: '.vite-house-cache',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/');
          if (normalizedId.includes('@dimforge/rapier3d-compat')) return 'physics';
          if (normalizedId.includes('/three/') || normalizedId.includes('/postprocessing/')) {
            return 'rendering';
          }
          if (normalizedId.includes('/node_modules/')) return 'vendor';
          return undefined;
        },
      },
    },
  },
});
