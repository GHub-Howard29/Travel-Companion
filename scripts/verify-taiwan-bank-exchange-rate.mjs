import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const functionSource = readFileSync(
  resolve(projectRoot, "supabase/functions/taiwan-bank-exchange-rate/index.ts"),
  "utf8",
);
const configSource = readFileSync(
  resolve(projectRoot, "supabase/config.toml"),
  "utf8",
);
const clientSource = readFileSync(
  resolve(projectRoot, "src/services/taiwanBankExchangeRateService.ts"),
  "utf8",
);

// 1. 驗證 Edge Function 的 CORS 宣告必須包含專案客製標頭
assert.match(
  functionSource,
  /Access-Control-Allow-Headers[\s\S]*x-travel-companion-client-id/,
  "taiwan-bank-exchange-rate 必須放行 x-travel-companion-client-id 客製標頭。",
);
assert.match(
  functionSource,
  /Access-Control-Allow-Methods[\s\S]*POST[\s\S]*OPTIONS/,
  "taiwan-bank-exchange-rate 必須支援 POST 與 OPTIONS 方法。",
);
assert.match(
  functionSource,
  /request\.method === "OPTIONS"[\s\S]*Response\("ok"/,
  "taiwan-bank-exchange-rate 必須正確回應 OPTIONS preflight 請求。",
);

// 2. 驗證 config.toml 中該函式不強制閘道驗證 JWT
assert.match(
  configSource,
  /\[functions\.taiwan-bank-exchange-rate\][\s\S]*?verify_jwt\s*=\s*false/,
  "taiwan-bank-exchange-rate 在 config.toml 中必須設定 verify_jwt = false。",
);

// 3. 驗證前端服務呼叫名稱一致
assert.match(
  clientSource,
  /"taiwan-bank-exchange-rate"/,
  "前端服務必須呼叫 taiwan-bank-exchange-rate 函式。",
);

console.log("臺灣銀行參考匯率 Edge Function 與設定驗證通過。");
