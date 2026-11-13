console.error("此舊版 db:sync:local 流程已停用。請依 docs/83_本機測試資料庫同步流程.md 分別執行 /下載資料庫；本入口不再自動套用 migrations 或準備回歸資料。");
process.exitCode = 1;
