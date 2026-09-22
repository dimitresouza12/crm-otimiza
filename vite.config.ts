import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/main.tsx',
      name: 'OtimizaCRM',
      formats: ['iife'],
      fileName: () => 'otimiza-crm.iife.js',
      cssFileName: 'otimiza-crm',
    },
  },
})
