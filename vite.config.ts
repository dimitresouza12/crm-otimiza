import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
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
