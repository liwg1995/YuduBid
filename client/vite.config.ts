import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const productionCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: yibiao-asset: http: https:",
  "font-src 'self' data:",
  "connect-src 'self' http: https: ws: wss:",
  "media-src 'self' data: blob: yibiao-asset:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-src 'none'",
  "form-action 'none'",
].join('; ');

function productionCspPlugin(): Plugin {
  return {
    name: 'yibiao-production-csp',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [{
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: productionCsp,
        },
        injectTo: 'head-prepend',
      }],
    },
  };
}

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [react(), ...(command === 'build' ? [productionCspPlugin()] : [])],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
}));
