import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base './' so the built app works both at a domain root (Vercel/Netlify)
// and when published as a set of relative files (Artifact demo).
// `vite build --mode artifact` produces a single self-contained bundle in dist-single/ (demo pubblicata).
export default defineConfig(({ mode }) => {
  const single = mode === 'artifact'
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    build: {
      target: 'es2020',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      outDir: single ? 'dist-single' : 'dist',
      rollupOptions: {
        output: single
          ? { inlineDynamicImports: true }
          : {
              // La mappa (Leaflet) e il runtime React cambiano di rado: chunk separati, cache più lunga
              manualChunks(id: string) {
                if (id.includes('node_modules/leaflet/')) return 'leaflet'
                if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react'
                return undefined
              },
            },
      },
    },
    server: { host: true, port: 5173 },
    preview: { host: true, port: 4173 },
  }
})
