import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: rootDir,
  publicDir: 'public',
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
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
