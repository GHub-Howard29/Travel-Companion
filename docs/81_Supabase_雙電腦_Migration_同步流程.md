# Supabase 資料庫同步文件索引

為避免正式資料庫與測試資料庫同步規則混用，流程已拆分為兩份獨立操作文件：

1. **[正式 Supabase 資料庫 Migration 與部署流程](81_正式Supabase資料庫Migration流程.md)**：正式 schema／Migration 的權威來源、兩台開發電腦取得及套用 Migration、正式部署審查與核准。
2. **[本機測試資料庫同步流程](83_本機測試資料庫同步流程.md)**：各電腦本機測試 DB、Git fixture、動態對等 revision 同步與衝突停止條件。

測試 fixture 的完整生命週期、revision 格式、歷史證據及修正驗收清單另見《[雙電腦測試資料生命週期設計](archive/supabase-sync/82_雙電腦測試資料生命週期設計.md)》。

本文件僅作為舊入口的導覽索引；不得將其中任何流程視為另一份規範。日常操作依上列對應文件辦理。
