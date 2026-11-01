import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  applyItineraryResolutionChoices,
  createPendingItinerarySyncState,
  createSyncedItineraryState,
  mergeItineraryDaysData,
  reconcilePendingItinerarySyncState,
  saveItineraryResolutionChoice,
} from "../src/services/itinerarySync.ts";
import {
  clearItinerarySyncState,
  readItinerarySyncState,
  writeItinerarySyncState,
} from "../src/storage/itinerarySyncStorage.ts";
import {
  summarizeItineraryNetChanges,
  readConfirmedItinerarySnapshot,
  writeConfirmedItinerarySnapshot,
} from "../src/services/tripChangePreviewService.ts";

const card = (id, title, extra = {}) => ({
  id,
  time: "09:00",
  title,
  type: "景點",
  typeColor: "",
  desc: "",
  location: "",
  ...extra,
});

const base = { "1": [card("a", "base A"), card("b", "base B")] };
const localDifferentCard = { "1": [card("a", "local A"), card("b", "base B")] };
const cloudDifferentCard = { "1": [card("a", "base A"), card("b", "cloud B")] };

// 摘要以最後確認快照計算淨差異，不累加已被後續操作抵銷的 journal 動作。
const afterAddThenDelete = {
  "1": [card("a", "base A"), card("b", "base B"), card("new-1", "新增 1")],
};
const netAddition = summarizeItineraryNetChanges(base, afterAddThenDelete);
assert.equal(netAddition.total, 1);
assert.equal(netAddition.actions.added, 1);
assert.equal(netAddition.actions.deleted, 0);
const netDelete = summarizeItineraryNetChanges(base, { "1": [card("b", "base B")] });
assert.equal(netDelete.total, 1);
assert.equal(netDelete.actions.added, 0);
assert.equal(netDelete.actions.deleted, 1);
const netMove = summarizeItineraryNetChanges(
  { "1": [card("move", "移動卡片")], "2": [] },
  { "1": [], "2": [card("move", "移動卡片")] },
);
assert.equal(netMove.total, 1);
assert.equal(netMove.actions.updated, 1);
const netRestored = summarizeItineraryNetChanges(
  base,
  { "1": [card("a", "base A"), card("b", "base B")] },
);
assert.equal(netRestored, null, "回復至已確認基準時必須視為零淨變更");
// A、B 各自新增一張卡片；每個 client 的摘要都只應看到另一端新增的一張。
const baseOneCard = { "1": [card("shared", "共同基準")] };
const clientACloud = { "1": [...baseOneCard["1"], card("only-a", "A 新增")] };
const clientBCloud = { "1": [...baseOneCard["1"], card("only-b", "B 新增")] };
assert.equal(summarizeItineraryNetChanges(baseOneCard, clientBCloud).total, 1);
assert.equal(summarizeItineraryNetChanges(baseOneCard, clientACloud).total, 1);
// 新增 3 張再刪除其中 2 張，與基準比較只留下 1 張新增。
const netAddThreeDeleteTwo = summarizeItineraryNetChanges(
  base,
  { "1": [...base["1"], card("new-1", "1")] },
);
assert.equal(netAddThreeDeleteTwo.actions.added, 1);
assert.equal(netAddThreeDeleteTwo.actions.deleted, 0);

const merged = mergeItineraryDaysData(base, localDifferentCard, cloudDifferentCard);
assert.equal(merged.status, "merged");
assert.equal(merged.daysData["1"].find((item) => item.id === "a")?.title, "local A");
assert.equal(merged.daysData["1"].find((item) => item.id === "b")?.title, "cloud B");

// 同一卡片的不同欄位修改可自動合併。
const sameCardDifferentFields = mergeItineraryDaysData(
  { "1": [card("shared", "base title", { desc: "base description" })] },
  { "1": [card("shared", "local title", { desc: "base description" })] },
  { "1": [card("shared", "base title", { desc: "cloud description" })] },
);
assert.equal(sameCardDifferentFields.status, "merged");
assert.equal(sameCardDifferentFields.daysData["1"][0].title, "local title");
assert.equal(sameCardDifferentFields.daysData["1"][0].desc, "cloud description");

// 同一欄位修改不同會產生可供 UI 使用的三方衝突。
const fieldConflict = mergeItineraryDaysData(
  { "1": [card("fields", "base", { desc: "base desc", location: "base place" })] },
  { "1": [card("fields", "local", { desc: "base desc", location: "local place" })] },
  { "1": [card("fields", "cloud", { desc: "cloud desc", location: "base place" })] },
);
assert.equal(fieldConflict.status, "conflict");
assert.equal(fieldConflict.conflicts[0].kind, "field");
assert.deepEqual(fieldConflict.conflicts[0].fields, ["title"]);
assert.equal(fieldConflict.daysData["1"][0].desc, "cloud desc");
assert.equal(fieldConflict.daysData["1"][0].location, "local place");

// 實際雙瀏覽器操作：A 開始編輯後，B 先提交同一欄位，A 最後才提交草稿。
const delayedEditorConflict = mergeItineraryDaysData(
  { "1": [card("delayed", "共同基準", { desc: "原始說明" })] },
  { "1": [card("delayed", "A 最後修改", { desc: "原始說明" })] },
  { "1": [card("delayed", "B 先儲存", { desc: "原始說明" })] },
);
assert.equal(delayedEditorConflict.status, "conflict");
assert.equal(delayedEditorConflict.conflicts[0].kind, "field");
assert.deepEqual(delayedEditorConflict.conflicts[0].fields, ["title"]);
assert.equal(delayedEditorConflict.conflicts[0].localCard?.title, "A 最後修改");
assert.equal(delayedEditorConflict.conflicts[0].cloudCard?.title, "B 先儲存");

// 同卡地點變更必須清除過期路線估算。
const estimate = {
  mode: "drive", durationSeconds: 600, distanceMeters: 5000,
  originKey: "A", destinationKey: "B",
  queriedAt: "2026-10-30T00:00:00.000Z", expiresAt: "2026-11-01T00:00:00.000Z",
};
const invalidatedEstimate = mergeItineraryDaysData(
  { "1": [card("route", "route", { location: "A", travelToNext: estimate })] },
  { "1": [card("route", "route", { location: "B", travelToNext: estimate })] },
  { "1": [card("route", "route", { location: "A", travelToNext: estimate })] },
);
assert.equal(invalidatedEstimate.status, "merged");
assert.equal(invalidatedEstimate.daysData["1"][0].travelToNext, undefined);

const legacyCard = card(undefined, "legacy without stable ID");
const legacyConflict = mergeItineraryDaysData(
  { "1": [legacyCard] },
  { "1": [legacyCard, card("new", "local new")] },
  { "1": [legacyCard] },
);
assert.equal(legacyConflict.status, "conflict");
assert.deepEqual(legacyConflict.daysData["1"].map((item) => item.title), [
  "legacy without stable ID",
  "local new",
]);

const sameCardConflict = mergeItineraryDaysData(
  base,
  localDifferentCard,
  { "1": [card("a", "cloud A"), card("b", "base B")] },
);
assert.equal(sameCardConflict.status, "conflict");
assert.equal(sameCardConflict.conflicts[0].id, "card:a");
assert.equal(sameCardConflict.conflicts[0].kind, "field");
assert.deepEqual(sameCardConflict.conflicts[0].fields, ["title"]);
assert.equal(sameCardConflict.daysData["1"].find((item) => item.id === "a")?.title, "local A");

const localAddition = mergeItineraryDaysData(
  base,
  { "1": [...base["1"], card("local-new", "local addition")] },
  { "1": [...base["1"], card("cloud-new", "cloud addition")] },
);
assert.equal(localAddition.status, "merged");
assert.deepEqual(
  localAddition.daysData["1"].map((item) => item.id).sort(),
  ["a", "b", "cloud-new", "local-new"].sort(),
);

const localDelete = mergeItineraryDaysData(
  base,
  { "1": [base["1"][1]] },
  { "1": [base["1"][0], card("c", "cloud addition"), base["1"][1]] },
);
assert.equal(localDelete.status, "merged");
assert.deepEqual(localDelete.daysData["1"].map((item) => item.id), ["b", "c"]);

const concurrentDeleteEdit = mergeItineraryDaysData(
  base,
  { "1": [base["1"][1]] },
  { "1": [card("a", "cloud edit"), base["1"][1]] },
);
assert.equal(concurrentDeleteEdit.status, "conflict");
assert.ok(concurrentDeleteEdit.conflicts.some((item) => item.kind === "delete-edit" && item.cardId === "a"));

const movedDifferently = mergeItineraryDaysData(
  { "1": [card("move", "base")], "2": [], "3": [] },
  { "1": [], "2": [card("move", "local moved")], "3": [] },
  { "1": [], "2": [], "3": [card("move", "cloud moved differently")] },
);
assert.equal(movedDifferently.status, "conflict");
assert.ok(movedDifferently.conflicts.some((item) => item.kind === "move" && item.cardId === "move"));

// 同一 ID 在兩端同時建立但內容不同，必須人工選一端。
const duplicateCreate = mergeItineraryDaysData(
  { "1": [] },
  { "1": [card("collision", "local create")] },
  { "1": [card("collision", "cloud create")] },
);
assert.equal(duplicateCreate.status, "conflict");
assert.ok(duplicateCreate.conflicts.some((item) => item.fields.includes("duplicate-create")));

// 同一份資料出現重複 ID，不得讓 Map 靜默覆蓋其中一張卡。
const duplicateId = mergeItineraryDaysData(
  { "1": [card("dup", "base")] },
  { "1": [card("dup", "first"), card("dup", "second")] },
  { "1": [card("dup", "base")] },
);
assert.equal(duplicateId.status, "conflict");
assert.equal(duplicateId.conflicts[0].kind, "duplicate-id");

// 兩端以不同方式重排相同卡片時，必須出現日期層級排序衝突。
const orderConflict = mergeItineraryDaysData(
  { "1": [card("o1", "1"), card("o2", "2"), card("o3", "3")] },
  { "1": [card("o2", "2"), card("o1", "1"), card("o3", "3")] },
  { "1": [card("o1", "1"), card("o3", "3"), card("o2", "2")] },
);
assert.equal(orderConflict.status, "conflict");
assert.ok(orderConflict.conflicts.some((item) => item.kind === "order" && item.dayKey === "1"));

const pending = createPendingItinerarySyncState(
  "trip-a",
  "cloud-v1",
  base,
  localDifferentCard,
);
const repeatedPending = createPendingItinerarySyncState(
  "trip-a",
  "cloud-v2",
  cloudDifferentCard,
  { "1": [card("a", "latest local A"), card("b", "base B")] },
  pending,
);
assert.equal(repeatedPending.baseCloudUpdatedAt, "cloud-v1");
assert.deepEqual(repeatedPending.baseDaysData, base);
assert.equal(repeatedPending.status, "pending");

const synced = createSyncedItineraryState("trip-a", "cloud-v3", cloudDifferentCard);
assert.equal(synced.status, "synced");
assert.equal(synced.baseCloudUpdatedAt, "cloud-v3");

// 雲端已包含本機待同步內容：三方合併結果等於雲端時必須可辨識為已同步。
const alreadySynced = reconcilePendingItinerarySyncState(
  pending,
  localDifferentCard,
  "cloud-v2",
);
assert.equal(alreadySynced.status, "already-synced");
assert.equal(alreadySynced.state.status, "synced");
assert.equal(alreadySynced.state.baseCloudUpdatedAt, "cloud-v2");
assert.deepEqual(alreadySynced.state.baseDaysData, localDifferentCard);

// 雲端仍保留基準內容，且本機修改與雲端另一修改不一致時，必須產生衝突。
const conflictResult = reconcilePendingItinerarySyncState(
  pending,
  { "1": [card("a", "cloud A"), card("b", "base B")] },
  "cloud-v2",
);
assert.equal(conflictResult.status, "conflict");
const conflictState = conflictResult.state;
assert.equal(conflictState.status, "conflict");
assert.equal(conflictState.baseCloudUpdatedAt, "cloud-v1");
assert.equal(conflictState.conflictCloudUpdatedAt, "cloud-v2");
assert.deepEqual(conflictState.conflictCloudDaysData?.["1"].map((item) => item.title), ["cloud A", "base B"]);
assert.equal(conflictState.conflicts?.[0].baseCard?.title, "base A");
assert.equal(conflictState.conflicts?.[0].localCard?.title, "local A");
assert.equal(conflictState.conflicts?.[0].cloudCard?.title, "cloud A");

// 無衝突但合併結果仍有本機尚未上雲內容，狀態必須繼續 pending。
const stillPending = reconcilePendingItinerarySyncState(
  pending,
  cloudDifferentCard,
  "cloud-v2",
);
assert.equal(stillPending.status, "pending");
assert.equal(stillPending.state.status, "pending");

const chosenConflict = saveItineraryResolutionChoice(conflictState, {
  conflictId: conflictState.conflicts[0].id,
  kind: "cloud",
});
assert.equal(chosenConflict.resolutionChoices.length, 1);
const appliedChoice = applyItineraryResolutionChoices(chosenConflict);
assert.deepEqual(appliedChoice.unresolved, []);
assert.equal(appliedChoice.daysData["1"].find((item) => item.id === "a").title, "cloud A");

const storage = new Map();
const originalLocalStorage = globalThis.localStorage;
const originalSessionStorage = globalThis.sessionStorage;
const originalCrypto = globalThis.crypto;
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
});
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
});
Object.defineProperty(globalThis, "crypto", {
  configurable: true,
  value: { randomUUID: () => "revision-test" },
});

const { listItineraryCardEditLeases } = await import("../src/services/itineraryCardEditLeaseService.ts");

try {
  writeItinerarySyncState(pending);
  assert.deepEqual(readItinerarySyncState("trip-a"), pending);
  assert.equal(readItinerarySyncState("trip-b"), null);
  assert.equal(clearItinerarySyncState("trip-a", "stale-revision"), false);
  assert.ok(readItinerarySyncState("trip-a"));
  assert.equal(clearItinerarySyncState("trip-a", pending.revision), true);
  assert.equal(readItinerarySyncState("trip-a"), null);
  storage.set("travel_companion_itinerary_sync_bad", "{");
  assert.equal(readItinerarySyncState("bad"), null);
  writeConfirmedItinerarySnapshot("trip-a", {
    revision: 10,
    updatedAt: "2026-11-01T00:00:00.000Z",
    daysData: base,
  });
  assert.deepEqual(readConfirmedItinerarySnapshot("trip-a")?.daysData, base);
  assert.equal(readConfirmedItinerarySnapshot("trip-b"), null);
} finally {
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage });
  if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
  else Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: originalSessionStorage });
  if (originalCrypto === undefined) delete globalThis.crypto;
  else Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
}

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/hooks/useTripWorkspace.ts", import.meta.url), "utf8");
const itinerary = readFileSync(new URL("../src/components/ItineraryPage.tsx", import.meta.url), "utf8");
const revisionHook = readFileSync(new URL("../src/hooks/useTripDataRevision.ts", import.meta.url), "utf8");
const revisionNotice = readFileSync(new URL("../src/components/TripDataRevisionNotice.tsx", import.meta.url), "utf8");
const existingOtherInfoStorage = readFileSync(new URL("../src/storage/otherInfoSyncStorage.ts", import.meta.url), "utf8");

assert.match(app, /onSaveTripDetail=/);
assert.match(workspace, /saveCurrentTripDetail/);
assert.match(itinerary, /onSaveTripDetail/);
// 三方合併／pending 契約由上方純函式測試覆蓋；卡片 UI 不引用舊版 itinerarySyncState 名稱。
assert.doesNotMatch(itinerary, /itinerarySyncState/);
// 跨裝置 revision 通知必須保留；正常通知是資訊提示而非編輯鎖或自動 reload。
assert.match(revisionHook, /current === "revoked" \|\| current === "conflict" \? current : "available"/);
assert.match(revisionHook, /isTripMasterLocked: noticeKind === "revoked"/);
// 卡片編輯權由獨立租約控制，不可用全旅程版本衝突狀態冒充編輯鎖。
assert.match(itinerary, /claimItineraryCardEditLease\(supabase, trip\.id, cardId\)/);
assert.match(itinerary, /renewItineraryCardEditLease\(supabase, trip\.id, cardId\)/);
assert.match(itinerary, /releaseItineraryCardEditLease\(supabase, trip\.id, cardId\)/);
assert.match(itinerary, /ITINERARY_EDIT_LEASE_HEARTBEAT_MS/);
assert.match(itinerary, /其他裝置編輯中/);
assert.match(itinerary, /鎖定狀態未知/);
// 所有會改變卡片資料的入口都受同一張卡片 lease 保護；純檢視／導航不受影響。
assert.match(itinerary, /const canModifyCard = \(cardId\?: string\)/);
assert.match(itinerary, /if \(!canModifyCard\(event\.id\)\)/);
assert.match(itinerary, /if \(!canModifyCard\(copySource\.id\)\)/);
assert.match(itinerary, /if \(!canModifyCard\(target\.id\)\)/);
assert.match(itinerary, /if \(!canModifyCard\(targetEvent\.id\)\)/);
// 整體管理模式不受單張卡片 lease 阻擋；多卡排序／時間調整只要求租約狀態可確認。
assert.match(itinerary, /const toggleManageMode = \(\) => \{[\s\S]*?setIsManageMode\(true\)/);
const manageToggle = itinerary.match(/const toggleManageMode = \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
assert.match(manageToggle, /setIsManageMode\(true\)/);
assert.doesNotMatch(manageToggle, /currentEditLeases|editLeaseStatus/);
assert.doesNotMatch(itinerary, /disabled=\{!isOrderMode \|\| \(canUseEditLeases && \(editLeaseStatus !== "ready" \|\| Object\.keys\(currentEditLeases\)\.length > 0\)\)\}/);
assert.match(itinerary, /Object\.keys\(currentEditLeases\)\.length > 0/);
// 等待中的卡片 lease 釋放後只提示一次，不會自動開啟編輯表單或自動取得 lease。
assert.match(itinerary, /waitingCardIdRef\.current = event\.id/);
assert.match(itinerary, /previous\[waitingCardId\] && !next\[waitingCardId\]/);
assert.match(itinerary, /卡片已釋放編輯鎖定/);
assert.match(itinerary, /退出管理並重新確認/);
// Trip revision 摘要只從使用者進入該 Trip 的最新資料開始計算，不沿用舊確認快照。
assert.match(revisionHook, /tripMonitoringBaselineRef/);
assert.match(revisionHook, /isTripBaselineReadyRef/);
assert.match(revisionHook, /daysData: cloudRecord\.detail\.content\.daysData/);
assert.match(revisionHook, /fromRevision: baseline\.revision/);
assert.match(revisionHook, /tripMonitoringBaselineRef\.current \?\? undefined/);
assert.match(readFileSync(new URL("../src/services/tripChangePreviewService.ts", import.meta.url), "utf8"), /monitoringBaseline\?\: ItineraryChangeSnapshot/);
// 未登入、無一般編輯權、歷史唯讀或離線時，租約查詢／Realtime／RPC 均不可啟用。
assert.match(app, /isSignedIn=\{isSignedIn\}/);
assert.match(app, /isHistoricalTripReadOnly=\{isSharedTripReadOnly\}/);
assert.match(itinerary, /const canUseEditLeases = isSignedIn && hasEditPermission && !isHistoricalTripReadOnly && isOnline/);
assert.match(itinerary, /if \(!isSignedIn \|\| !hasEditPermission\)/);
assert.match(itinerary, /if \(isHistoricalTripReadOnly\)/);
assert.match(itinerary, /if \(!isOnline\)/);
// 租約服務必須延後載入，避免 guest mount 時建立 sessionStorage client id。
assert.match(itinerary, /import\("\.\.\/services\/itineraryCardEditLeaseService"\)/);
assert.doesNotMatch(itinerary, /^import .*itineraryCardEditLeaseService/m);
// 清單只採初始 RPC + Realtime event、重新訂閱及回前景補查；不可設固定清單輪詢。
assert.match(itinerary, /\.on\("postgres_changes"/);
assert.match(itinerary, /\.subscribe\(\(status\) =>/);
assert.match(itinerary, /status === "SUBSCRIBED"/);
assert.match(itinerary, /visibilitychange/);
assert.match(itinerary, /window\.addEventListener\("focus"/);
assert.match(itinerary, /if \(refreshInFlight\) return refreshInFlight/);
assert.match(itinerary, /editLeaseRefreshRef\.current = refresh/);
assert.match(itinerary, /claimingCardId === event\.id/);
assert.match(itinerary, /取得編輯權…/);
assert.match(itinerary, /重新確認/);
assert.match(itinerary, /resetForm = \(\) => \{\s*void releaseEditingLease\(\)/);
assert.match(itinerary, /useEffect\(\(\) => \(\) => \{\s*void releaseEditingLease\(\)/);
assert.doesNotMatch(itinerary, /setInterval\([^\n]*listItineraryCardEditLeases/);
const previewModal = readFileSync(new URL("../src/components/TripChangePreviewModal.tsx", import.meta.url), "utf8");
assert.match(revisionNotice, /行程資料已有更新/);
assert.match(revisionNotice, /其他裝置已更新雲端行程資料。/);
assert.doesNotMatch(revisionNotice, /安全可合併的卡片會自動同步/);
assert.match(revisionNotice, /onConfirm/);
const normalNoticeMarkup = revisionNotice.split('if (kind === "revoked" || kind === "conflict")')[1]?.split("\n  return (")[1] ?? revisionNotice;
assert.doesNotMatch(normalNoticeMarkup, /稍後|重新載入|onReload/);
assert.match(revisionNotice, /kind === "conflict"/);
assert.match(revisionNotice, /onReload/); // 僅撤權／衝突阻擋對話框可重新載入。
assert.match(previewModal, /onConfirm/);
assert.match(previewModal, /自上次確認後共有/);
assert.match(previewModal, /\n\s*\{isConfirming \? "正在確認\.\.\." : hasNewChanges \? "確認最新摘要" : "確認"\}\n/);
assert.doesNotMatch(previewModal, /稍後再說|確認並重新載入|onReload|window\.location\.reload|此處顯示行程/);
assert.match(revisionHook, /confirmNotice/);
assert.match(revisionHook, /const shouldNotify = await acceptRevision\(revision\)/);
assert.match(revisionHook, /if \(revision\) void acceptRevision\(revision\)/);
assert.match(revisionHook, /if \(summary\.totalChanges === 0\)[\s\S]*?changePreviewWindowRef\.current = null[\s\S]*?setIsChangePreviewOpen\(false\)[\s\S]*?current === "available" \? null : current/);
assert.match(revisionHook, /writeConfirmedItinerarySnapshot/);
assert.match(revisionHook, /getCloudTripRecord\(supabase, tripId\)/);
assert.match(revisionHook, /suppressNoticeRef\.current = true[\s\S]*?setIsChangePreviewOpen\(false\)/);
assert.match(revisionHook, /Calculate the net result immediately[\s\S]*?void refreshOpenChangePreview\(\)/);
assert.match(revisionHook, /if \(suppressNoticeRef\.current\) return/);
assert.match(revisionHook, /previewRequestRef\.current/);
assert.match(revisionHook, /previewedRevisionRef\.current = latestRevision\.revision/);
assert.match(revisionHook, /revisionBeforeRead\.revision !== revisionAfterRead\.revision/);
assert.match(revisionHook, /setHasNewChangesDuringPreview\(true\)/);
assert.match(revisionHook, /isConfirmingPreview/);
assert.match(revisionHook, /setNoticeKind\(\(current\) => current === "available" \? null : current\)/);
assert.match(previewModal, /收到新的變更，摘要已更新。/);
assert.match(previewModal, /正在更新最新統計/);
assert.match(previewModal, /確認最新摘要/);
assert.match(previewModal, /disabled=\{isConfirming \|\| isLoading \|\| Boolean\(error\)\}/);
assert.doesNotMatch(revisionHook, /const snooze =/);
assert.match(app, /onPreviewChanges=\{openChangePreview\}/);
assert.match(app, /onClose=\{closeChangePreview\}/);

assert.match(existingOtherInfoStorage, /travel_companion_other_info_sync/);
assert.doesNotMatch(
  readFileSync(new URL("../src/storage/itinerarySyncStorage.ts", import.meta.url), "utf8"),
  /travel_companion_other_info_sync/,
);

// Lease list RPC 必須嚴格驗證回應型態：正常空陣列可用，非陣列不可靜默當成空清單。
const createLeaseRpcClient = (data, error = null) => ({
  rpc: async (name, args) => {
    assert.equal(name, "tc_list_itinerary_card_edit_leases");
    assert.deepEqual(args, { p_trip_id: "trip-a" });
    return { data, error };
  },
});
assert.deepEqual(await listItineraryCardEditLeases(createLeaseRpcClient([]), "trip-a"), []);
assert.deepEqual(await listItineraryCardEditLeases(createLeaseRpcClient(null), "trip-a"), []);
assert.deepEqual(
  await listItineraryCardEditLeases(createLeaseRpcClient([{
    card_id: "card-a",
    owner_user_id: "user-a",
    owner_client_id: "client-a",
    expires_at: "2026-11-01T00:00:00.000Z",
  }]), "trip-a"),
  [{
    cardId: "card-a",
    ownerUserId: "user-a",
    ownerClientId: "client-a",
    expiresAt: "2026-11-01T00:00:00.000Z",
  }],
);
await assert.rejects(
  listItineraryCardEditLeases(createLeaseRpcClient({ rows: [] }), "trip-a"),
  /卡片編輯租約清單回應格式錯誤/,
);
await assert.rejects(
  listItineraryCardEditLeases(createLeaseRpcClient(null, new Error("rpc permission denied")), "trip-a"),
  /rpc permission denied/,
);

console.log("V3.10.12 每日卡片三方合併、pending 基準、衝突及 Lease RPC 回應契約通過。");
