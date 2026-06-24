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
      // 👇 【關鍵修正】新增 Workbox 設定，確保 json、svg 等檔案納入離線快取
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        // 這會強制打包公用資料夾與編譯後的所有靜態與資料檔案
      },
      manifest: {
        name: '我的旅行小幫手',
        short_name: '旅行小幫手',
        description: '我的最佳旅遊隨身特助',
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