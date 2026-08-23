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
      registerType: 'prompt',
      injectRegister: false,
      // 👇 【關鍵修正】新增 Workbox 設定，確保 json、svg 等檔案納入離線快取
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        globIgnores: ['**/app-version.json'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: '/Travel-Companion/index.html',
        navigateFallbackAllowlist: [/^\/Travel-Companion\/(?:.*)?$/],
        // 這會強制打包公用資料夾與編譯後的所有靜態與資料檔案
      },
      manifest: {
        name: '我的旅行小幫手',
        short_name: '旅行小幫手',
        description: '我的最佳旅遊隨身特助',
        // Android PWA splash screen uses these manifest colors while the app
        // bundle is loading. Keep them aligned with the travel artwork rather
        // than the page's neutral content background.
        theme_color: '#0b75b8',
        background_color: '#0589d6',
        display: 'standalone',
        orientation: 'portrait',
        id: '/Travel-Companion/',
        start_url: '/Travel-Companion/',
        scope: '/Travel-Companion/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  build: {
    // Excel 匯出模組約 930 kB，但已改為使用者匯出時才下載。
    // 以 1 MB 為非首屏 chunk 警告門檻，初始 bundle 仍應維持在 500 kB 以下。
    chunkSizeWarningLimit: 1000,
  },
})
