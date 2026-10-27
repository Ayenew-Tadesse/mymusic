import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served by the API server at /admin; in development /api is proxied to it.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
  build: { sourcemap: false },
});
