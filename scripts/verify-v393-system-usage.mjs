import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSystemUsageSummary } from "../src/types/systemUsage.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read(
  "supabase/migrations/20260917121757_v393_system_developer_and_usage.sql",
).toLowerCase();
const hook = read("src/hooks/useSystemUsage.ts");
const modal = read("src/components/UsageSummaryModal.tsx");
const app = read("src/App.tsx");
const sidebar = read("src/components/layout/AppSidebar.tsx");
const main = read("src/main.tsx");

for (const required of [
  "create table private.system_developers",
  "create table private.user_usage_summaries",
  "system_developers_one_active_idx",
  "where is_active",
  "enable row level security",
  "interval '30 minutes'",
  "security definer",
  "set search_path = ''",
  "create or replace function public.tc_is_system_developer",
  "create or replace function public.tc_record_usage_session",
  "create or replace function public.tc_get_usage_summary",
  "security invoker",
  "revoke all on table private.system_developers from public, anon, authenticated",
  "revoke all on table private.user_usage_summaries from public, anon, authenticated",
  "grant execute on function public.tc_get_usage_summary()",
  "to authenticated",
]) {
  assert.ok(migration.includes(required), `migration 缺少必要契約：${required}`);
}

assert.equal(
  /create or replace function public\.[\s\S]*?security definer/.test(migration),
  false,
  "public RPC 不得使用 SECURITY DEFINER",
);
assert.equal(
  /grant execute on function public\.[\s\S]*?to anon/.test(migration),
  false,
  "public RPC 不得授權 anon",
);

for (const rpc of [
  "tc_is_system_developer",
  "tc_record_usage_session",
  "tc_get_usage_summary",
]) {
  assert.ok(hook.includes(`supabase.rpc(\"${rpc}\")`), `hook 缺少 ${rpc}`);
}

assert.equal(
  [hook, modal, app, sidebar].some((source) => source.includes("haw1971@gmail.com")),
  false,
  "前端不得硬編碼系統開發者 Email",
);
assert.ok(app.includes("useSystemUsage"), "App 尚未接上 useSystemUsage");
assert.ok(sidebar.includes("使用紀錄"), "側邊欄缺少使用紀錄入口");
assert.ok(modal.includes('role="dialog"'), "彙總視窗缺少 dialog role");
assert.ok(modal.includes('aria-modal="true"'), "彙總視窗缺少 aria-modal");
assert.ok(modal.includes('event.key === "Escape"'), "彙總視窗缺少 Escape 關閉");
assert.ok(modal.includes('event.key !== "Tab"'), "彙總視窗缺少焦點循環");
assert.ok(
  modal.includes('[data-system-usage-trigger]') &&
    sidebar.includes("data-system-usage-trigger"),
  "彙總視窗缺少明確的入口焦點返回",
);
assert.ok(main.includes("tc_app_bootstrap_start"), "缺少啟動起點標記");
assert.ok(app.includes("tc_app_bootstrap_duration"), "缺少啟動完成量測");

const validSummary = parseSystemUsageSummary({
  total_users: 2,
  tracked_users: 1,
  system_developer_email: "developer@example.com",
  checked_at: "2026-09-17T12:00:00.000Z",
  users: [
    {
      email: "user@example.com",
      first_used_at: "2026-09-17T10:00:00.000Z",
      last_used_at: "2026-09-17T11:00:00.000Z",
      valid_session_count: 2,
    },
  ],
});
assert.equal(validSummary?.users[0]?.validSessionCount, 2);
assert.equal(parseSystemUsageSummary({ users: [] }), null);
assert.equal(
  parseSystemUsageSummary({
    total_users: 1,
    tracked_users: 1,
    system_developer_email: "developer@example.com",
    checked_at: "2026-09-17T12:00:00.000Z",
    users: [{ valid_session_count: -1 }],
  }),
  null,
);

console.log("V3.9.3 system developer and usage verification passed.");
