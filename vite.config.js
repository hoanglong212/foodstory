import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('chart.js')) {
            return 'chart'
          }
          if (id.includes('vue') || id.includes('pinia')) {
            return 'vue-vendor'
          }
          if (id.includes('axios')) {
            return 'http-vendor'
          }

          return 'vendor'
        },
      },
    },
  },
})
