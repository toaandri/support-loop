import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()], envDir: '..', server: {
  strictPort: true,
  proxy: { '/api': { target: `http://127.0.0.1:${process.env.PORT || 3000}`, changeOrigin: true } }
} });
