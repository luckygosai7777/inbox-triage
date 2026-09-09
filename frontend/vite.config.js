import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API runs on Django at :8000. Proxying in dev keeps the browser on one
// origin, so the session cookie and CSRF token behave exactly as in production.
const proxy = {
  '/api': {
    target: process.env.VITE_API_TARGET || 'http://localhost:8000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  // `server` covers `vite dev`; `preview` needs its own copy, or the built
  // bundle has no route to the API.
  server: { port: 5173, proxy },
  preview: { port: 5173, proxy },
  build: { outDir: 'dist', sourcemap: true },
});
