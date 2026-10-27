import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on :4000; proxying keeps everything on one origin
// so the httpOnly refresh cookie works exactly as in production.
const api = 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: Object.fromEntries(['/api', '/p/', '/invite/', '/verify-email', '/reset-password', '/billing/'].map((p) => [p, api])),
  },
  build: { sourcemap: false },
});
