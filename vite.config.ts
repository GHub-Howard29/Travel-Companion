import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  // ⚠️ 嚴格修正：必須是斜線開頭、斜線結尾的儲存庫名稱，不可帶有 https:// 網址
  base: '/Travel-Companion/', 
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      manifest: {
        name: '九州自駕全能助手',
        short_name: '九州自駕',
        description: '2026 九州六日自駕旅遊小助手',
        theme_color: '#2e6b3e',
        background_color: '#fcfbfa',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})