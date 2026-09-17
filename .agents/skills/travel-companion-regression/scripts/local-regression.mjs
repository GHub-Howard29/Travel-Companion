import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2] ?? "status";
const supportedModes = new Set(["status", "prepare", "browser-bootstrap", "browser-ambiguous-fixture", "verify", "full"]);

if (!supportedModes.has(mode)) {
  console.error(`不支援的模式：${mode}。可用模式：${[...supportedModes].join(", ")}`);
  process.exit(2);
}

const root = resolve(import.meta.dirname, "../../../..");
const commandName = (name) => process.platform === "win32" ? `${name}.cmd` : name;

const run = (command, args, options = {}) => execFileSync(commandName(command), args, {
  cwd: root,
  encoding: "utf8",
  shell: process.platform === "win32",
  stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  ...options,
});

const parseJsonOutput = (value, label) => {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`${label} 未回傳 JSON。`);
  return JSON.parse(value.slice(start, end + 1));
};

const readSupabaseStatus = () => {
  try {
    const output = run("npx", ["supabase", "status", "-o", "json"], { capture: true });
    return parseJsonOutput(output, "supabase status");
  } catch (error) {
    const detail = error?.stderr?.toString().trim() || error?.message;
    throw new Error(`無法讀取本機 Supabase 狀態。${detail ? `\n${detail}` : ""}`);
  }
};

const pick = (record, names) => names.map((name) => record[name]).find(Boolean);
const isLoopback = (value) => {
  try {
    const host = new URL(value).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
};

const getLocalConfig = () => {
  const status = readSupabaseStatus();
  const apiUrl = pick(status, ["API_URL", "api_url"]);
  const anonKey = pick(status, ["PUBLISHABLE_KEY", "ANON_KEY", "anon_key"]);
  const serviceKey = pick(status, ["SERVICE_ROLE_KEY", "SECRET_KEY", "service_role_key"]);
  if (!apiUrl || !anonKey || !serviceKey) {
    throw new Error("Supabase status 缺少 API_URL、publishable/anon key 或 service-role key。");
  }
  if (!isLoopback(apiUrl)) throw new Error(`拒絕操作非本機 Supabase：${apiUrl}`);
  return { apiUrl, anonKey, serviceKey };
};

const probe = async (url, init = {}) => {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(3_000) });
    return response.status;
  } catch {
    return null;
  }
};

const statusMode = async () => {
  let config;
  try {
    config = getLocalConfig();
  } catch (error) {
    console.log(JSON.stringify({ supabase: "unavailable", detail: error.message }, null, 2));
    return;
  }
  const [authStatus, appStatus, edgeStatus] = await Promise.all([
    probe(`${config.apiUrl}/auth/v1/health`),
    probe("http://127.0.0.1:5173/Travel-Companion/"),
    probe(`${config.apiUrl}/functions/v1/travel-route`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:5173",
        "Access-Control-Request-Method": "POST",
      },
    }),
  ]);
  console.log(JSON.stringify({
    supabase: "ready",
    apiUrl: config.apiUrl,
    authHttpStatus: authStatus,
    viteHttpStatus: appStatus,
    edgeHttpStatus: edgeStatus,
    fixtureEnv: existsSync(resolve(root, ".env.local")) && existsSync(resolve(root, "supabase/.env.local")),
  }, null, 2));
};

const writeLocalFile = (path, content, requiredMarker) => {
  if (existsSync(path)) {
    const current = readFileSync(path, "utf8");
    if (!current.includes(requiredMarker)) {
      throw new Error(`拒絕覆寫不屬於本機回歸的檔案：${path}`);
    }
    return false;
  }
  writeFileSync(path, content, { encoding: "utf8", flag: "wx" });
  return true;
};

const prepareMode = async () => {
  const { apiUrl, anonKey, serviceKey } = getLocalConfig();
  const envCreated = writeLocalFile(
    resolve(root, ".env.local"),
    `VITE_SUPABASE_URL=${apiUrl}\nVITE_SUPABASE_ANON_KEY=${anonKey}\n`,
    "VITE_SUPABASE_URL=http://127.0.0.1:",
  );
  const functionEnvPath = resolve(root, "supabase/.env.local");
  const tokenSecret = "v391-local-aes-gcm-token-key-32b";
  const functionEnvContent = `WIKIMEDIA_CONTACT_URL=https://github.com/GHub-Howard29/Travel-Companion/issues\nCOMMONS_PRECISION_TOKEN_SECRET=${tokenSecret}\n`;
  let functionEnvCreated = false;
  let functionEnvUpdated = false;
  if (!existsSync(functionEnvPath)) {
    writeFileSync(functionEnvPath, functionEnvContent, { encoding: "utf8", flag: "wx" });
    functionEnvCreated = true;
  } else {
    const current = readFileSync(functionEnvPath, "utf8");
    if (!current.includes("WIKIMEDIA_CONTACT_URL=https://github.com/GHub-Howard29/Travel-Companion/issues") ||
      !/^COMMONS_PRECISION_TOKEN_SECRET=.*$/m.test(current)) {
      throw new Error(`拒絕覆寫不屬於本機回歸的檔案：${functionEnvPath}`);
    }
    const updated = current.replace(/^COMMONS_PRECISION_TOKEN_SECRET=.*$/m, `COMMONS_PRECISION_TOKEN_SECRET=${tokenSecret}`);
    if (updated !== current) {
      writeFileSync(functionEnvPath, updated, "utf8");
      functionEnvUpdated = true;
    }
  }

  const admin = createClient(apiUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = "v391-admin@example.invalid";
  const password = "V391-local-test!";
  const { data: usersPage, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1_000 });
  if (listError) throw listError;
  let user = usersPage.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    user = data.user;
  }

  const fixture = JSON.parse(readFileSync(resolve(root, "public/trips/group-tour-2026-10.json"), "utf8"));
  const tripRow = {
    id: fixture.id,
    title: fixture.title,
    departure_date: fixture.departureDate,
    participants: fixture.participants ?? [],
    currency_config: fixture.currencyConfig ?? { code: "JPY", symbol: "￥" },
    sidebar_config: fixture.sidebarConfig ?? [],
    content: fixture.content ?? {},
  };
  const { data: existingRoles, error: roleLookupError } = await admin
    .from("admin_users")
    .select("id")
    .eq("email", email)
    .limit(1);
  if (roleLookupError) throw roleLookupError;
  const roleWrite = existingRoles.length > 0
    ? admin.from("admin_users").update({ role: "super_admin", trip_id: "" }).eq("id", existingRoles[0].id)
    : admin.from("admin_users").insert({ email, role: "super_admin", trip_id: "" });
  const { error: roleError } = await roleWrite;
  if (roleError) throw roleError;
  const fixtureUser = createClient(apiUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  let { error: signInError } = await fixtureUser.auth.signInWithPassword({ email, password });
  if (signInError) {
    const { error: passwordError } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (passwordError) throw passwordError;
    ({ error: signInError } = await fixtureUser.auth.signInWithPassword({ email, password }));
  }
  if (signInError) throw signInError;
  const { error: tripError } = await fixtureUser.from("trips").upsert(tripRow, { onConflict: "id" });
  if (tripError) throw tripError;

  console.log(JSON.stringify({
    prepared: true,
    user: email,
    tripId: fixture.id,
    envCreated,
    functionEnvCreated,
    functionEnvUpdated,
    scope: "loopback-only",
  }, null, 2));
};

const browserBootstrapMode = async () => {
  await prepareMode();
  const { apiUrl, anonKey } = getLocalConfig();
  const [appStatus, edgeStatus] = await Promise.all([
    probe("http://127.0.0.1:5173/Travel-Companion/"),
    probe(`${apiUrl}/functions/v1/travel-route`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:5173",
        "Access-Control-Request-Method": "POST",
      },
    }),
  ]);
  if (appStatus !== 200 || edgeStatus !== 200) {
    throw new Error(`瀏覽器回歸服務尚未就緒：Vite=${appStatus ?? "unavailable"}，Edge=${edgeStatus ?? "unavailable"}`);
  }
  console.log(JSON.stringify({
    browserReady: true,
    url: "http://127.0.0.1:5173/Travel-Companion/",
    login: {
      email: "v391-admin@example.invalid",
      password: "V391-local-test!",
    },
    localSupabase: {
      url: apiUrl,
      publishableKey: anonKey,
    },
    expectedTripId: "group-tour-2026-10",
    sessionPolicy: "若 App 沒有 email/password 登入介面，以瀏覽器內的 Supabase client 執行 signInWithPassword；不得直接寫入、輸出或複製 access token。",
    scope: "loopback-only synthetic fixture",
  }, null, 2));
};

const browserAmbiguousFixtureMode = async () => {
  await browserBootstrapMode();
  const { apiUrl, anonKey } = getLocalConfig();
  const user = createClient(apiUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await user.auth.signInWithPassword({
    email: "v391-admin@example.invalid",
    password: "V391-local-test!",
  });
  if (authError || !authData.session) throw new Error(`本機歧義 fixture 登入失敗：${authError?.message ?? "沒有 session"}`);
  const response = await fetch(`${apiUrl}/functions/v1/travel-route`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${authData.session.access_token}`,
      "Content-Type": "application/json",
      "x-travel-companion-regression-fixture": "commons-entity-ambiguous",
    },
    body: JSON.stringify({
      action: "commonsPrecisionSearch",
      tripId: "group-tour-2026-10",
      query: "中山站",
    }),
    signal: AbortSignal.timeout(3_000),
  });
  const body = await response.json();
  if (response.status !== 200 || body.state !== "entity-ambiguous" || body.entityChoices?.length !== 3) {
    throw new Error(`本機歧義 fixture 不符預期：${response.status} ${JSON.stringify(body)}`);
  }
  console.log(JSON.stringify({
    fixtureReady: true,
    url: "http://127.0.0.1:5173/Travel-Companion/?tcRegressionFixture=commons-entity-ambiguous",
    query: "中山站",
    expectedChoices: 3,
    scope: "loopback-only synthetic Edge response; no Wikimedia, cache, usage, Storage, or production access",
  }, null, 2));
};

const verifyMode = async () => {
  const { apiUrl, anonKey, serviceKey } = getLocalConfig();
  const admin = createClient(apiUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const guest = createClient(apiUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const user = createClient(apiUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { error: serviceTripError } = await admin.from("trips").select("id").eq("id", "group-tour-2026-10").single();
  if (serviceTripError) throw new Error(`service_role Trip grant 失敗：${serviceTripError.message}`);
  const { error: guestOtherInfoError } = await guest.from("other_info_items").select("id").limit(1);
  if (guestOtherInfoError) throw new Error(`anon Data API grant 失敗：${guestOtherInfoError.message}`);

  const { data: authData, error: authError } = await user.auth.signInWithPassword({
    email: "v391-admin@example.invalid",
    password: "V391-local-test!",
  });
  if (authError || !authData.session) throw new Error(`本機管理者登入失敗：${authError?.message ?? "沒有 session"}`);
  const { data: trips, error: tripError } = await user.from("trips").select("id").eq("id", "group-tour-2026-10");
  if (tripError || trips.length !== 1) throw new Error(`管理者 Trip 載入失敗：${tripError?.message ?? "找不到 fixture"}`);

  const edgeResponse = await fetch(`${apiUrl}/functions/v1/travel-route`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${authData.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "commonsPrecisionSearch",
      tripId: "group-tour-2026-10",
      query: "桃園國際機場",
      selectedEntityQid: "QINVALID",
    }),
    signal: AbortSignal.timeout(3_000),
  });
  const edgeBody = await edgeResponse.json();
  if (edgeResponse.status !== 400 || edgeBody.state !== "entity-ambiguous") {
    throw new Error(`Edge 輸入防線不符預期：${edgeResponse.status} ${JSON.stringify(edgeBody)}`);
  }

  run("npm", ["run", "verify:v391-precision-database"]);
  run("npm", ["run", "verify:v391-precision-integration"]);
  console.log("本機 Supabase grants、管理者登入、Trip 載入、Edge 輸入防線與 V3.9.1 整合契約均通過；未送出 Wikimedia 請求。");
};

const main = async () => {
  if (mode === "status") return statusMode();
  if (mode === "prepare") return prepareMode();
  if (mode === "browser-bootstrap") return browserBootstrapMode();
  if (mode === "browser-ambiguous-fixture") return browserAmbiguousFixtureMode();
  if (mode === "verify") return verifyMode();
  await verifyMode();
  run("npm", ["run", "lint", "--", "--ignore-pattern", "supabase/.temp/start-secrets"]);
  run("npm", ["run", "build"]);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
