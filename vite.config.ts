import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

export default defineConfig({
  base: '/love-bites/',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['images/*', 'icons/*'],
      manifest: {
        name: 'Love Bites',
        short_name: 'Love Bites',
        description: 'Swipe, plan, shop and cook.',
        id: '/love-bites/',
        start_url: '/love-bites/',
        scope: '/love-bites/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FF62B5',
        theme_color: '#FF62B5',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell and all catalogue JSON work offline. Recipe photos are cached on view, capped.
        globPatterns: ['**/*.{js,css,html,woff2,png,webp,svg,json}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/www\.themealdb\.com\/images\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'recipe-photos',
              expiration: { maxEntries: 160, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
  },
});
