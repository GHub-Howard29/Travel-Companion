import { readFileSync } from "node:fs";

const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

export const parseEnvironmentFile = (filePath) => {
  const result = {};
  const source = readFileSync(filePath, "utf8");

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  return result;
};

export const isLoopbackHostname = (hostname) => {
  const normalized = hostname.trim().toLowerCase();
  if (LOOPBACK_HOSTNAMES.has(normalized)) return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(normalized)) return true;
  return normalized === "::ffff:127.0.0.1";
};

export const validateProductionSupabaseUrl = (value) => {
  if (!value?.trim()) {
    throw new Error(
      "缺少 VITE_SUPABASE_URL；正式建置必須提供 HTTPS production Supabase origin。",
    );
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "VITE_SUPABASE_URL 格式無效；正式建置必須提供 HTTPS production Supabase origin。",
    );
  }

  if (url.protocol !== "https:") {
    throw new Error(
      "VITE_SUPABASE_URL 必須使用 HTTPS；localhost、127.0.0.1 或其他 HTTP 本機位址不可用於正式建置。",
    );
  }
  if (isLoopbackHostname(url.hostname)) {
    throw new Error(
      "VITE_SUPABASE_URL 不得指向 localhost、127.0.0.1、0.0.0.0 或 ::1；請改用 production Supabase origin。",
    );
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("VITE_SUPABASE_URL 必須是純 HTTPS origin，不可包含帳密、路徑、查詢或 fragment。");
  }

  return url.origin;
};

export const resolveProductionEnvironment = ({ fileValues, processValues }) => {
  const supabaseUrl =
    processValues.VITE_SUPABASE_URL?.trim() || fileValues.VITE_SUPABASE_URL?.trim();
  const supabaseAnonKey =
    processValues.VITE_SUPABASE_ANON_KEY?.trim() ||
    fileValues.VITE_SUPABASE_ANON_KEY?.trim();

  const normalizedUrl = validateProductionSupabaseUrl(supabaseUrl);
  if (!supabaseAnonKey) {
    throw new Error(
      "缺少 VITE_SUPABASE_ANON_KEY；請在正式環境來源提供 publishable/anon key（驗證不會輸出其內容）。",
    );
  }

  return {
    VITE_SUPABASE_URL: normalizedUrl,
    VITE_SUPABASE_ANON_KEY: supabaseAnonKey,
  };
};
