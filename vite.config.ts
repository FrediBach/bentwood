import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Prepare the lazy SVG loader before the first upload to avoid a dev-server reload mid-import.
  optimizeDeps: { include: ['three/addons/loaders/SVGLoader.js'] },
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
})
