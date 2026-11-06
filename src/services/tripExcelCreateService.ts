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

const buildCreateCards = (workbook: ParsedTripExcel) =>
  workbook.cards.map(({ day, item }) => ({
    day,
    time: item.time,
    departureTime: item.departureTime,
    title: item.title,
    type: item.type,
    desc: item.desc ?? "",
  }));

const isCreateResult = (
  value: unknown,
  workbook: ParsedTripExcel,
): value is Record<string, unknown> =>
  isRecord(value) &&
  typeof value.trip_id === "string" &&
  value.trip_id.startsWith("trip-") &&
  value.title === workbook.title.trim() &&
  String(value.departure_date).slice(0, 10) === workbook.departureDate &&
  Number(value.day_count) === workbook.dayCount &&
  Number(value.card_count) === workbook.cardCount;

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

  // Refresh only the existing session. This does not start OAuth; reject any
  // refresh that loses or changes the account before calling the privileged RPC.
  const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
  const refreshedSession = refreshedData.session;
  if (
    refreshError ||
    !refreshedSession?.user?.id ||
    refreshedSession.user.id !== expectedUserId ||
    normalizeEmail(refreshedSession.user.email) !== normalizeEmail(expectedUserEmail)
  ) {
    throw new TripExcelCreateError(
      "USER_UNVERIFIED",
      "無法安全更新目前登入 Session，或登入帳號已變更；Excel 建立已停止，請重新登入後再試。",
      refreshError,
    );
  }

  // Validate the refreshed access token with the Auth server as a second check.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (
    userError ||
    !userData.user ||
    userData.user.id !== expectedUserId ||
    normalizeEmail(userData.user.email) !== normalizeEmail(expectedUserEmail)
  ) {
    throw new TripExcelCreateError("USER_UNVERIFIED", "無法確認更新後的登入帳號，Excel 建立已停止。", userError);
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
  const cards = buildCreateCards(workbook);

  const { data, error } = await supabase.rpc("tc_create_trip_from_excel", {
    p_request_id: requestId,
    p_title: workbook.title,
    p_departure_date: workbook.departureDate,
    p_cards: cards,
    p_currency_code: currencyCode,
    p_currency_symbol: currencySymbol,
  });

  let payload = Array.isArray(data) ? data[0] : data;
  const resultUnconfirmed = Boolean(error) || !isCreateResult(payload, workbook) ||
    typeof (payload as Record<string, unknown> | null)?.idempotent_replay !== "boolean";

  if (resultUnconfirmed) {
    if (!navigator.onLine) {
      throw new TripExcelCreateError(
        "RESULT_UNCONFIRMED",
        "連線中斷，無法確認雲端是否已建立。請保留目前檔案；恢復網路後使用相同內容與原建立請求確認。",
        error ?? data,
      );
    }

    const { data: lookupData, error: lookupError } = await supabase.rpc(
      "tc_get_trip_excel_create_request",
      { p_request_id: requestId },
    );
    const lookupPayload = Array.isArray(lookupData) ? lookupData[0] : lookupData;

    if (lookupError || !isRecord(lookupPayload)) {
      throw new TripExcelCreateError(
        "RESULT_UNCONFIRMED",
        "無法查詢雲端建立結果。請保留目前檔案，稍後使用同一份 Excel 確認；系統會沿用原建立請求。",
        lookupError ?? lookupData,
      );
    }

    if (lookupPayload.status === "NOT_FOUND") {
      if (lookupPayload.request_id !== requestId) {
        throw new TripExcelCreateError(
          "RESULT_UNCONFIRMED",
          "雲端查詢回傳的 request 識別不一致；請保留目前檔案，不要另建新請求。",
          lookupData,
        );
      }
      if (error && typeof error.code === "string" && ["42501", "22023", "23505", "23514"].includes(error.code)) {
        throw new TripExcelCreateError(
          "RPC_FAILED",
          "雲端已明確拒絕本次建立，尚未找到此 request 的完成紀錄。請檢查登入權限及 Excel 資料後再確認重試。",
          error,
        );
      }
      throw new TripExcelCreateError(
        "RESULT_UNCONFIRMED",
        "目前查不到此建立請求的完成紀錄，但無法證明原交易一定未提交。請保留目前檔案，稍後使用相同內容與原建立請求再次確認。",
        error ?? lookupData,
      );
    }

    if (lookupPayload.status === "TRIP_DELETED") {
      throw new TripExcelCreateError(
        "RESULT_UNCONFIRMED",
        "此建立請求曾完成，但對應 TRIP 已不存在。為避免重複建立，系統不會自動重建；請聯絡管理員核對。",
        lookupData,
      );
    }

    if (lookupPayload.status !== "CREATED" || !isCreateResult(lookupPayload, workbook)) {
      throw new TripExcelCreateError(
        "RESULT_UNCONFIRMED",
        "雲端建立紀錄仍待確認或與目前 Excel 內容不一致。請勿更換檔案或建立新請求。",
        lookupData,
      );
    }

    payload = lookupPayload;
  }

  if (!isCreateResult(payload, workbook) ||
      typeof (payload as Record<string, unknown>).idempotent_replay !== "boolean") {
    throw new TripExcelCreateError(
      "RESULT_UNCONFIRMED",
      "雲端已回應，但回傳資料無法完整核對；請保留目前檔案並以相同內容重試確認。",
      payload,
    );
  }

  const verifiedPayload = payload as Record<string, unknown>;
  return {
    tripId: String(verifiedPayload.trip_id),
    title: String(verifiedPayload.title),
    departureDate: String(verifiedPayload.departure_date).slice(0, 10),
    dayCount: Number(verifiedPayload.day_count),
    cardCount: Number(verifiedPayload.card_count),
    idempotentReplay: verifiedPayload.idempotent_replay === true,
  };
};
