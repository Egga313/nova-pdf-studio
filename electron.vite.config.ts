import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// المسارات المختصرة المشتركة بين العمليات الثلاث (main / preload / renderer)
const aliases = {
  '@shared': resolve('src/shared'),
  '@modules': resolve('src/modules'),
  '@main': resolve('src/main'),
  '@renderer': resolve('src/renderer/src')
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: aliases },
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts') } }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: aliases },
    build: {
      rollupOptions: { input: { index: resolve('src/preload/index.ts') } }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    resolve: { alias: aliases },
    build: {
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } }
    },
    // pdf.js worker و tesseract يحتاجان إلى تحميل أصول WASM/Worker كملفات
    assetsInclude: ['**/*.wasm', '**/*.traineddata']
  }
})
