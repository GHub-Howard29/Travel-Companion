import assert from "node:assert/strict";

import {
  isLoopbackHostname,
  resolveProductionEnvironment,
  validateProductionSupabaseUrl,
} from "./lib/production-environment.mjs";

for (const hostname of [
  "localhost",
  "127.0.0.1",
  "127.8.9.10",
  "0.0.0.0",
  "::1",
  "::ffff:127.0.0.1",
]) {
  assert.equal(isLoopbackHostname(hostname), true, `${hostname} 必須判定為 loopback`);
}

assert.equal(
  validateProductionSupabaseUrl("https://example-project.supabase.co"),
  "https://example-project.supabase.co",
);

for (const invalidUrl of [
  "http://127.0.0.1:54321",
  "https://localhost",
  "https://127.0.0.2",
  "https://example-project.supabase.co/rest/v1",
]) {
  assert.throws(() => validateProductionSupabaseUrl(invalidUrl));
}

assert.deepEqual(
  resolveProductionEnvironment({
    fileValues: {
      VITE_SUPABASE_URL: "https://file-project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "file-key",
    },
    processValues: {
      VITE_SUPABASE_URL: "https://ci-project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "ci-key",
    },
  }),
  {
    VITE_SUPABASE_URL: "https://ci-project.supabase.co",
    VITE_SUPABASE_ANON_KEY: "ci-key",
  },
);

console.log("V3.9.2 正式建置環境驗證通過：HTTPS production origin 可用，HTTP／loopback 已拒絕。");
