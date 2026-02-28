import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  base: './', // use relative paths so file:// loads assets correctly
  plugins: [vue()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-three': ['three'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-vue': ['vue']
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
