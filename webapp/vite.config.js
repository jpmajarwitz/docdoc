import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          root: resolve(__dirname, 'index.html'),
          ai: resolve(__dirname, 'index-ai.html'),
          dd: resolve(__dirname, 'index-dd.html'),
          dm: resolve(__dirname, 'index-dm.html'),
          d2d: resolve(__dirname, 'index-d2d.html')
        }
      }
    },
    server: {
      proxy: {
        '/api': backendUrl
      }
    }
  }
})
