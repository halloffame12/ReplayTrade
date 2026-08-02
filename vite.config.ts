import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
  },
  build: {
    // Split the heavy chart/icon libs out of the app bundle so they are cached
    // independently and the app chunk stays small.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-charts': ['lightweight-charts'],
          'vendor-icons': ['lucide-react'],
          'vendor-react': ['react', 'react-dom'],
        },
      },
    },
  },
});
