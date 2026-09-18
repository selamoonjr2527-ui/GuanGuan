import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
      // GUANGUAN_APP_ICON_V22
        // Safer for a live queue/payment app: a new version waits until the app
        // is restarted instead of forcing a reload while the organizer is editing.
        registerType: 'prompt',
        injectRegister: 'auto',
        includeAssets: [
          'pwa-192x192.png',
          'pwa-512x512.png',
          'apple-touch-icon.png',
        ],
        manifest: {
        name: 'GuanGuan',
        short_name: 'GuanGuan',
        description: 'ระบบจัดก๊วนแบดมินตัน GuanGuan',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0758b8',
        theme_color: '#0758b8',
        icons: [
          {
            src: '/icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
        workbox: {
          cleanupOutdatedCaches: true,
          navigateFallback: '/index.html',
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
