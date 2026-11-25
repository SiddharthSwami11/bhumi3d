import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type PluginOption } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import cesiumPlugin from 'vite-plugin-cesium'

const cesium = (cesiumPlugin as unknown as { default?: () => PluginOption } | (() => PluginOption))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const apiUrl = loadEnv(mode, process.cwd(), '').VITE_API_URL || 'http://localhost:8000'

  return {
    plugins: [
      react(),
      tailwindcss(),
      (typeof cesium === 'function' ? cesium() : (cesium.default ? cesium.default() : (cesiumPlugin as any)())) as PluginOption,
    ],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    optimizeDeps: {
      include: ['cesium'],
    },
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  }
})
