# ADR-001-S3：Client Lock、Pending 與 Recovery


### Pending Sync／version migration 審查（方案已記錄，尚待實作驗證）

既有 Pending state 同時保存 `baseDaysData`、`pendingDaysData` 及 `baseCloudUpdatedAt`。遷移至 itinerary version 時，timestamp 不可直接轉換成 version，但 `baseDaysData` 可作三方 merge 的資料基準；版本基準與資料 merge 基準應分離。

解決方案：

1. 保留舊 Pending 的 baseDaysData／pendingDaysData／conflict snapshot／resolution choices；將 baseCloudUpdatedAt 標示為 legacy metadata，不映射成 itinerary version。
2. Recovery 取得最新可信 Cloud daysData 與 itinerary version，使用原 baseDaysData、Pending daysData、最新 Cloud daysData 執行既有三方 merge engine。
3. 無衝突且 merge 結果需要保存時，建立新的 pending snapshot，以 Cloud version 作 CAS expected version；Save RPC 成功後更新 baseline/version。
4. CAS 失敗代表 Cloud 已再變動，重新 fetch version／daysData並再次 reconciliation；不可直接重送原 snapshot。
5. 有衝突時保留完整 Pending、最新 Cloud snapshot及 conflict／resolution state，等待使用者處理；無法安全 merge 時不得自動覆寫。
6. 舊 timestamp 不可信或缺失不影響三方資料比較；但若 baseDaysData、pendingDaysData 等必要 snapshot 不完整、格式損壞或 local storage state 無法辨識，需將 raw Pending record 保留／隔離並顯示 recovery error，不可因讀取函式回傳 null 就當作沒有 Pending 或清除資料。
7. migration／Recovery 必須能區分「不存在的 Pending」與「存在但無法解析／損壞的 Pending」；在安全修復或人工處理前，不得讓新保存覆蓋原始 recovery data。

此方案保留既有 merge engine與 local protection，version只負責 Cloud CAS；不將 timestamp baseline硬轉 version，也不要求重寫三方 merge。此項目前為架構審查／解決方案記錄，仍須在後續 Recovery integration test驗證。
