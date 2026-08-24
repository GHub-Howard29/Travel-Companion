# Android PWA 本機實機測試流程

> 適用專案：Travel Companion
>
> 適用範圍：啟動畫面、manifest 色彩、Service Worker、HTML 等待畫面及 App 轉場測試
>
> 最後更新：2026-08-24

## 目的

單純調整啟動畫面圖樣、背景色或轉場時，不必每次都部署正式版本。本流程可先在電腦與 Android 實機驗證，確認結果後再進行正式合併、建立 tag 與部署。

## 測試層級

### 層級一：電腦瀏覽器快速預覽

在專案目錄執行：

```powershell
npm run dev
```

使用 Chrome 或 Edge 的開發者工具切換成手機尺寸。

適合驗證：

- HTML 等待底圖顏色。
- 圖示尺寸與位置。
- HTML 載入畫面切換至 App 的時機。
- 不同螢幕尺寸的版面。

限制：

- 無法真實呈現 Android 原生 Splash。
- 無法準確呈現 HyperOS 狀態列、陰影及底部導覽列。

## 層級二：Android 實機本機測試（建議）

### 前置需求

1. 電腦已安裝 Android Platform Tools，並可執行 `adb`。
2. Android 手機已開啟「開發人員選項」。
3. Android 手機已開啟「USB 偵錯」。
4. 以 USB 線連接手機與電腦。
5. 手機跳出 USB 偵錯授權時，允許目前電腦連線。

### 步驟一：確認手機連線

```powershell
adb devices
```

正常情況會看到裝置編號及 `device`。若顯示 `unauthorized`，請解鎖手機並接受 USB 偵錯授權。

### 步驟二：建立正式建置成品

在專案目錄執行：

```powershell
npm run build
```

建置必須通過 TypeScript、版本歷史驗證與 Vite PWA 產物產生。

### 步驟三：建立 USB 連接埠轉送

```powershell
adb reverse tcp:4173 tcp:4173
```

這會把手機的 `localhost:4173` 轉送至電腦的預覽伺服器。

### 步驟四：啟動正式成品預覽

```powershell
npm run preview -- --host 127.0.0.1
```

此終端機需保持開啟。若連接埠被占用，Vite 可能改用其他連接埠；此時必須以實際連接埠重新設定 `adb reverse`。

### 步驟五：從手機開啟測試網址

在手機 Chrome 開啟：

```text
http://localhost:4173/Travel-Companion/
```

`localhost` 在 Chrome 中屬於可使用 Service Worker 的安全環境，因此不需要將測試版本部署至公開 HTTPS 網站。

### 步驟六：安裝測試版 PWA

1. 在手機 Chrome 選單選擇「安裝應用程式」或「加到主畫面」。
2. 完成安裝後關閉 Chrome。
3. 從手機桌面開啟測試版 PWA。
4. 建議錄製螢幕，以便逐格比對啟動階段。

### 實機驗證項目

- Android 原生 Splash 是否使用正確圖示。
- 原生 Splash 的 `theme_color` 是否正確。
- 原生 Splash 的 `background_color` 是否正確。
- 是否只顯示一次 App 圖示。
- HTML 等待畫面是否使用指定背景色。
- 等待階段是否意外露出半完成的 App UI。
- App 完成後是否一次切換至操作介面。
- 上方狀態列及下方導覽列是否有明顯色差。
- 版本資訊是否顯示本次測試版本。
- Service Worker 更新後是否可正常重新進入 App。

## 修改後重新測試

manifest 與原生 Splash 可能被 Android 或 Chrome 快取。若修改圖示、`theme_color` 或 `background_color`，建議完整重置：

1. 從手機移除測試版 PWA。
2. 開啟 Chrome 的網站設定，清除 `localhost` 的網站資料。
3. 確認舊 Service Worker 與快取已清除。
4. 在電腦停止舊的 preview 伺服器。
5. 重新執行 `npm run build`。
6. 重新啟動 preview 伺服器。
7. 再次開啟測試網址並重新安裝 PWA。

若只重新整理頁面而未移除 PWA，Android 可能繼續顯示舊的原生 Splash。

## 結束測試

停止預覽伺服器：

```text
在執行 preview 的終端機按 Ctrl+C
```

移除 USB 連接埠轉送：

```powershell
adb reverse --remove tcp:4173
```

移除全部 ADB reverse 設定：

```powershell
adb reverse --remove-all
```

## 層級三：獨立 HTTPS 預覽站

需要讓多支手機或其他測試者驗證時，可建立獨立預覽環境，例如：

- 獨立 GitHub Pages 測試站。
- Cloudflare Pages Preview。
- 其他具 HTTPS 的暫存部署環境。

預覽環境應使用不同網址，避免覆蓋正式 Service Worker、快取及版本提示。

適合情境：

- 測試手機無法使用 USB 連接電腦。
- 需要多人或多廠牌手機驗證。
- 需要長時間保留候選版本。
- 正式發布前進行完整驗收。

## 建議開發流程

1. 在電腦瀏覽器快速確認版面。
2. 使用 ADB reverse 在 Android 實機安裝候選 PWA。
3. 清除舊 PWA 後測試原生 Splash 與完整轉場。
4. 必要時部署至獨立 HTTPS 預覽站進行多機驗證。
5. 驗證通過後才更新正式版本文件。
6. 最後執行 commit、push、合併、建立 tag 與正式部署。

## 常見問題

### `adb devices` 找不到手機

- 更換可傳輸資料的 USB 線。
- 將手機 USB 用途切換成檔案傳輸。
- 重新開啟 USB 偵錯。
- 安裝手機品牌所需的 Windows USB 驅動程式。

### 手機無法開啟 localhost

- 確認 preview 伺服器仍在執行。
- 確認 preview 實際使用的連接埠。
- 重新執行相同連接埠的 `adb reverse`。
- 執行 `adb devices`，確認裝置狀態仍為 `device`。

### 仍顯示舊啟動畫面

- 移除已安裝的測試版 PWA。
- 清除 Chrome 中 `localhost` 的網站資料。
- 重新 build，不要只重新啟動 preview。
- 確認 `dist/manifest.webmanifest` 已包含新設定。

### 底部導覽列顏色與設定不同

Android 三鍵導覽列及狀態列分隔效果可能由手機作業系統覆寫。PWA 可以提供主題色，但無法保證每個 Android 廠牌都完全按照指定色顯示。
