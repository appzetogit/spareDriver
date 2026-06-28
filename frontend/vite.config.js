import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { firebaseMessagingSwPlugin } from './vite/firebaseMessagingSwPlugin.js'

export default defineConfig({
  plugins: [react(), tailwindcss(), firebaseMessagingSwPlugin()],
  // server: {
  //   port: 5173,
  //   host: true,
  // },
  build: {
    // Bump the warning threshold to 800kb — our biggest single chunk (the
    // Google Maps loader) is right around the default 500kb noise floor.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Force a stable vendor split so:
        //   1. React/router land in `react-vendor` (cacheable across deploys)
        //   2. The huge Google Maps SDK lives in its own `maps-vendor` chunk
        //      so only routes that need a map pay for it
        //   3. framer-motion (also heavy) gets its own `motion-vendor` chunk
        // Everything else flows into the lazy route chunks naturally — that's
        // what gives us the user/driver/admin separation.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@googlemaps')) return 'maps-vendor'
          if (id.includes('framer-motion')) return 'motion-vendor'
          if (id.includes('react-router')) return 'react-vendor'
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
            return 'react-vendor'
          }
          return undefined
        },
      },
    },
  },
})
