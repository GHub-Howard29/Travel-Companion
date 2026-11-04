import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedTripExcel } from "./tripExcelImport";

export interface CreateTripFromExcelOptions {
  requestId: string;
  workbook: ParsedTripExcel;
  currencyCode: string;
  currencySymbol: string;
  expectedUserId: string | null;
  expectedUserEmail: string | null;
}

export interface CreateTripFromExcelResult {
  tripId: string;
  title: string;
  departureDate: string;
  dayCount: number;
  cardCount: number;
  idempotentReplay: boolean;
}

export class TripExcelCreateError extends Error {
  readonly code:
    | "OFFLINE"
    | "SESSION_REQUIRED"
    | "SESSION_CHANGED"
    | "USER_UNVERIFIED"
    | "SUPER_ADMIN_REQUIRED"
    | "RPC_FAILED"
    | "RESULT_UNCONFIRMED"
    | "REFRESH_UNCONFIRMED";

  constructor(
    code: TripExcelCreateError["code"],
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "TripExcelCreateError";
    this.code = code;
  }
}

const normalizeEmail = (value: string | null | undefined): string =>
  value?.trim().toLowerCase() ?? "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

/**
 * Strictly creates a new Trip via the dedicated, server-authorized RPC.
 * A caller must retain requestId and resend the identical payload after an
 * unknown network result so the database can return the idempotent result.
 */
export const createTripFromExcel = async (
  supabase: SupabaseClient,
  options: CreateTripFromExcelOptions,
): Promise<CreateTripFromExcelResult> => {
  if (!navigator.onLine) {
    throw new TripExcelCreateError("OFFLINE", "目前沒有網路連線，Excel 建立已停止。");
  }

  const {
    requestId,
    workbook,
    currencyCode,
    currencySymbol,
    expectedUserId,
    expectedUserEmail,
  } = options;

  if (!requestId || !expectedUserId || !normalizeEmail(expectedUserEmail)) {
    throw new TripExcelCreateError("SESSION_REQUIRED", "登入資訊不完整，請重新登入後再試。");
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (sessionError || !session?.user?.id) {
    throw new TripExcelCreateError("SESSION_REQUIRED", "目前登入 Session 已失效，請重新登入後再試。", sessionError);
  }
  if (
    session.user.id !== expectedUserId ||
    normalizeEmail(session.user.email) !== normalizeEmail(expectedUserEmail)
  ) {
    throw new TripExcelCreateError("SESSION_CHANGED", "登入帳號已變更，請關閉視窗並重新開啟 Excel 建立。");
  }

  // getUser() validates the current access token with the Auth server; it does
  // not start OAuth or change the current account.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (
    userError ||
    !userData.user ||
    userData.user.id !== expectedUserId ||
    normalizeEmail(userData.user.email) !== normalizeEmail(expectedUserEmail)
  ) {
    throw new TripExcelCreateError("USER_UNVERIFIED", "無法確認目前登入帳號，請重新登入後再試。", userError);
  }

  if (!navigator.onLine) {
    throw new TripExcelCreateError("OFFLINE", "網路連線已中斷，Excel 建立已停止。");
  }

  const { data: adminRow, error: adminError } = await supabase
    .from("admin_users")
    .select("email")
    .eq("email", normalizeEmail(userData.user.email))
    .eq("role", "super_admin")
    .maybeSingle();

  if (adminError) {
    throw new TripExcelCreateError("USER_UNVERIFIED", "無法即時確認 Super Admin 權限，Excel 建立已停止。", adminError);
  }
  if (!adminRow) {
    throw new TripExcelCreateError("SUPER_ADMIN_REQUIRED", "目前帳號沒有 Super Admin 權限，無法使用 Excel 建立。");
  }

  if (!navigator.onLine) {
    throw new TripExcelCreateError("OFFLINE", "網路連線已中斷，Excel 建立已停止。");
  }

  // Send only the six V1 fields accepted by the RPC; server-generated IDs,
  // typeColor and location must never be client-controlled.
  const cards = workbook.cards.map(({ day, item }) => ({
    day,
    time: item.time,
    departureTime: item.departureTime,
    title: item.title,
    type: item.type,
    desc: item.desc ?? "",
  }));

  const { data, error } = await supabase.rpc("tc_create_trip_from_excel", {
    p_request_id: requestId,
    p_title: workbook.title,
    p_departure_date: workbook.departureDate,
    p_cards: cards,
    p_currency_code: currencyCode,
    p_currency_symbol: currencySymbol,
  });

  if (error) {
    throw new TripExcelCreateError("RPC_FAILED", "雲端尚未回報建立成功；請保留目前檔案並使用相同內容重試，系統會核對同一筆建立請求。", error);
  }

  const payload = Array.isArray(data) ? data[0] : data;
  if (
    !isRecord(payload) ||
    typeof payload.trip_id !== "string" ||
    !payload.trip_id.startsWith("trip-") ||
    payload.title !== workbook.title.trim() ||
    String(payload.departure_date).slice(0, 10) !== workbook.departureDate ||
    Number(payload.day_count) !== workbook.dayCount ||
    Number(payload.card_count) !== workbook.cardCount ||
    typeof payload.idempotent_replay !== "boolean"
  ) {
    throw new TripExcelCreateError("RESULT_UNCONFIRMED", "雲端已回應，但回傳資料無法完整核對；請保留目前檔案並以相同內容重試確認，勿改用手動新增。", data);
  }

  return {
    tripId: payload.trip_id,
    title: payload.title,
    departureDate: String(payload.departure_date).slice(0, 10),
    dayCount: Number(payload.day_count),
    cardCount: Number(payload.card_count),
    idempotentReplay: payload.idempotent_replay,
  };
};
