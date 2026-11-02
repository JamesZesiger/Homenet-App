import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          shell: resolve('src/preload/shell.ts'),
          guest: resolve('src/preload/guest.ts'),
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
  },
})
