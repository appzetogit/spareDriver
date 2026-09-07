import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { firebaseMessagingSwPlugin } from './vite/firebaseMessagingSwPlugin.js'

export default defineConfig({
  plugins: [react(), tailwindcss(), firebaseMessagingSwPlugin()],

  preview: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: [
      "sparedriver.in",
      "www.sparedriver.in"
    ]
  },

  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@googlemaps')) return 'maps-vendor'
          if (id.includes('framer-motion')) return 'motion-vendor'
          if (id.includes('react-router')) return 'react-vendor'
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
            return 'react-vendor'
          }
        }
      }
    }
  }
});
