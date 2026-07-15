import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'EAS Scanner',
        short_name: 'Scanner',
        description: 'Event Attendance System — offline-first scanner',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/events\/.+\/scanner-bootstrap/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'scanner-bootstrap' },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    // Caddy proxies public requests to scanner.eas.arrowtest.site on :443 → 127.0.0.1:5173.
    // Vite's preview server is gated on Host header by default in 5+; whitelist our subdomains.
    allowedHosts: [
      'scanner.eas.arrowtest.site',
      'web.eas.arrowtest.site',
      'eas.arrowtest.site',
      'api.eas.arrowtest.site',
      'localhost',
      '127.0.0.1',
    ],
  },
});
