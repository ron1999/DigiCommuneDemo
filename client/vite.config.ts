import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Phaser is a big library; this just silences the size warning.
    chunkSizeWarningLimit: 1600,
  },
});
