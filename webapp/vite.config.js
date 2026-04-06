import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const backendUrl = env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
  const deployBasePath = env.VITE_DEPLOY_BASE_PATH || env.BASE_URL || '/'
  const normalizedBasePath = deployBasePath.endsWith('/') ? deployBasePath : `${deployBasePath}/`

  return {
    base: normalizedBasePath,
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
