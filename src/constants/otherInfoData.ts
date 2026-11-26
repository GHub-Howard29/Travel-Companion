/**
 * Other Info Data（其他資訊靜態資料）
 *
 * 負責集中維護「其他資訊」的預設資料。
 *
 * 本檔案提供 seed data，作為每個 Trip 的預設 Other Info。
 * APP 內新增 / 編輯 / 刪除會寫入 localStorage 覆寫層。
 * 刪除 seed item 時會以 isDeleted 標記遮蔽預設資料。
 *
 * 新增旅程其他資訊時，主要維護此檔案內容，
 * 再重新 Build 並部署。
 */

// ================================
// Import
// ================================

import type { Folder, OtherInfoItem } from "../types";

// ================================
// Types
// ================================

interface OtherInfoTripData {
  folders: Folder[];
  items: OtherInfoItem[];
}

// ================================
// Constants
// ================================

const SEED_CREATED_AT = "2026-07-09T00:00:00.000Z";

const createOtherInfoItem = (
  tripId: string,
  folderId: string,
  id: string,
  title: string,
  content: string,
  order: number,
): OtherInfoItem => ({
  id,
  tripId,
  folderId,
  title,
  content,
  order,
  createdAt: SEED_CREATED_AT,
  updatedAt: SEED_CREATED_AT,
});

export const OTHER_INFO_DATA_BY_TRIP_ID: Record<string, OtherInfoTripData> = {
  "group-tour-2026-10": {
    folders: [],
    items: [
      createOtherInfoItem(
        "group-tour-2026-10",
        "other-info-flights",
        "gt-flight-starlux",
        "星宇航空航班",
        "去程：星宇航空 JX846｜桃園機場 07:30 → 熊本機場 10:45\n回程：星宇航空 JX841｜福岡機場 14:15 → 桃園機場 15:45\n提醒：請於出發當天 05:30 前抵達桃園機場指定櫃檯找領隊集合辦理登機。",
        1,
      ),
      createOtherInfoItem(
        "group-tour-2026-10",
        "other-info-transport",
        "gt-transport-tour-bus",
        "團體遊覽車",
        "全程以團體遊覽車移動為主。\n提醒：每日下車前確認集合時間、集合地點與車號，貴重物品隨身攜帶。",
        1,
      ),
      createOtherInfoItem(
        "group-tour-2026-10",
        "other-info-attractions",
        "gt-attraction-kumamoto",
        "熊本城周邊",
        "行程包含熊本城相關景點與周邊散策。\n提醒：團體行程停留時間固定，拍照與購物需留意集合時間。",
        1,
      ),
      createOtherInfoItem(
        "group-tour-2026-10",
        "other-info-food",
        "gt-food-local",
        "九州在地餐食",
        "以團體安排餐食為主，部分時段可自行補充小點。\n提醒：若有飲食禁忌或過敏，請提前告知領隊。",
        1,
      ),
      createOtherInfoItem(
        "group-tour-2026-10",
        "other-info-insurance",
        "gt-insurance-reminder",
        "旅遊保險提醒",
        "出發前確認旅遊平安險、不便險與緊急聯絡方式。\n建議：保單、護照影本與緊急聯絡人資訊存一份在手機內。",
        1,
      ),
      createOtherInfoItem(
        "group-tour-2026-10",
        "special-info-guided",
        "gt-other-leader-contact",
        "領隊聯絡資料",
        "領隊與導遊聯絡資料請以行前通知或群組公告為準。\n提醒：抵達集合地點後，先確認領隊電話、集合旗幟與群組訊息通知方式。",
        1,
      ),
    ],
  },
};
