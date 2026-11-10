import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const isTest = Boolean(process.env.VITEST)

export default defineConfig({
  root: rootDir,
  publicDir: 'public',
  plugins: [
    !isTest &&
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: [
          'favicon.svg',
          'favicon.png',
          'images/brand/apple-touch-icon.png',
          'images/brand/logo-mark.svg',
          'images/brand/logo-mark.png',
          'images/brand/pwa-192.png',
          'images/brand/pwa-512.png',
          'images/brand/pwa-maskable-512.png',
        ],
        manifest: {
          name: 'GYM CONTROL',
          short_name: 'GYM',
          description: 'سامانهٔ مدیریت باشگاه آذر',
          lang: 'fa',
          dir: 'rtl',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          id: '/',
          background_color: '#0a1520',
          theme_color: '#0a1520',
          categories: ['fitness', 'business', 'productivity'],
          icons: [
            {
              src: '/images/brand/pwa-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/images/brand/pwa-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/images/brand/pwa-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // MPA: offline SPA fallback only for `/` — never rewrite /manager etc. to landing.
          navigateFallback: 'index.html',
          navigateFallbackAllowlist: [/^\/$/],
          navigateFallbackDenylist: [/^\/api/],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          globPatterns: [
            '**/*.{js,css,html,ico,png,svg,woff,woff2,webmanifest,json}',
          ],
          globIgnores: ['**/proposals/**'],
          runtimeCaching: [
            {
              // Never cache API JSON (membership, money, auth, OTP).
              urlPattern: ({ url }) => url.pathname.startsWith('/api'),
              handler: 'NetworkOnly',
              method: 'GET',
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api'),
              handler: 'NetworkOnly',
              method: 'POST',
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api'),
              handler: 'NetworkOnly',
              method: 'PUT',
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api'),
              handler: 'NetworkOnly',
              method: 'PATCH',
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api'),
              handler: 'NetworkOnly',
              method: 'DELETE',
            },
            {
              // Same-origin static images/fonts if missed by precache.
              urlPattern: ({ request, url }) =>
                url.pathname.startsWith('/api') === false &&
                (request.destination === 'image' ||
                  request.destination === 'font'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'gym-static-ui',
                expiration: {
                  maxEntries: 64,
                  maxAgeSeconds: 60 * 60 * 24 * 14,
                },
              },
            },
          ],
        },
        devOptions: {
          // Keep SW off in `vite` day-to-day; use build+preview to test install.
          enabled: false,
        },
      }),
  ].filter(Boolean),
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(rootDir, 'index.html'),
        login: path.resolve(rootDir, 'login/index.html'),
        receptionist: path.resolve(rootDir, 'receptionist/index.html'),
        manager: path.resolve(rootDir, 'manager/index.html'),
        trainer: path.resolve(rootDir, 'trainer/index.html'),
        athlete: path.resolve(rootDir, 'athlete/index.html'),
        athleteLogin: path.resolve(rootDir, 'athlete/login.html'),
        devLogs: path.resolve(rootDir, 'dev-logs/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
