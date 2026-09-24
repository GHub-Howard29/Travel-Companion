Travel Companion 受控救援復原工具
================================

本工具不是 PWA，也不是離線匯出工具。它需要網路、Supabase publishable/anon key，
以及目前已登入且有該 Trip 編輯權限的 access token。禁止使用 service_role key。

預覽（預設，不寫入）：
  node restore-trip.mjs --input <救援JSON> --url <SUPABASE_URL> --publishable-key <KEY> --access-token <ACCESS_TOKEN>

互動式 CMD（建議日常使用）：
  從專案根目錄雙擊 `tools\trip-rescue-import\START-RESTORE.cmd`。
  依提示貼上救援 JSON 路徑、Supabase URL、publishable／anon key、access token，
  工具會先顯示預覽，再詢問是否執行（Y/N），最後要求輸入 `RESTORE TRIP`。
  救援檔欄位可直接貼上 `救援匯出_時間` 資料夾路徑；資料夾內只有一份 JSON 時會自動選取，
  若有多份 JSON，工具會列出清單讓你選擇，不必手動輸入檔名。

只驗證救援檔格式（不需要網路或金鑰）：
  node restore-trip.mjs --input <救援JSON> --validate-only

正式復原：
  在預覽內容確認正確後，加入 --apply；工具會再次要求輸入「RESTORE TRIP」。
  寫入前會在 --output 指定的資料夾建立 pre_restore 快照，並以雲端 trips.updated_at
  做樂觀鎖定；預覽後資料若被其他人修改，工具會停止，不會覆寫。

目前支援：完整 trips 列、other_info_items（含導遊分類測試卡片）、exchange_purchases 匯率紀錄、目前登入者所屬的私人清單、共用清單勾選狀態，以及具備 client_item_id 的帳本資料。
目前不寫入：其他使用者的私人清單、admin_users 權限表、Storage 附件與 IndexedDB 附件；工具不會用本機權限快取冒充遠端權限，也不會把附件路徑當成附件檔案。
`--replace-other-info` 會額外將救援檔不存在的現有其他資訊列標記刪除，請只在確認救援檔完整時使用。
