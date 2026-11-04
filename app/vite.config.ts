import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // o motor do Whisper (~21 MB) só é baixado/cacheado quando o usuário usa voz
        globIgnores: ['**/*.wasm'],
        runtimeCaching: [{ urlPattern: /\.wasm$/, handler: 'CacheFirst', options: { cacheName: 'wasm' } }],
      },
      manifest: { name: 'Rabisco', short_name: 'Rabisco', display: 'standalone', theme_color: '#111' },
    }),
  ],
  // Tauri/Capacitor carregam arquivos locais: caminhos relativos
  base: './',
})
