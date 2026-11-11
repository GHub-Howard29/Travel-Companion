import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  Save,
  X,
} from "lucide-react";
import {
  parseTripExcelWorkbook,
  type ParsedTripExcel,
  type TripExcelValidationIssue,
} from "../services/tripExcelImport";
import type {
  AdminProfile,
  TripDetail,
  TripEditorInput,
  TripMeta,
  TripMode,
} from "../types";
import { releaseFocusedControl } from "../utils/viewportUtils";
import {
  getRemovedDayImpacts,
  type RemovedDayImpact,
} from "../utils/tripHelpers";
import { isProtectedSeedTripId } from "../constants/appConstants";

interface TripEditorModalProps {
  mode: "create" | "edit";
  defaultCurrencyCode: string;
  defaultCurrencySymbol: string;
  trip: TripMeta | null;
  tripDetail: TripDetail | null;
  editorEmails: string[];
  superAdminEmails: string[];
  defaultParticipantProfiles: AdminProfile[];
  canManageEditors: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: TripEditorInput) => Promise<void>;
  onCreateFromExcel: (
    workbook: ParsedTripExcel,
    requestId: string,
    currencyCode: string,
    currencySymbol: string,
  ) => Promise<void>;
  onDelete?: () => Promise<void>;
  historicalTripEndDate?: string;
}

const CURRENCY_OPTIONS = [
  { code: "TWD", symbol: "NT$", label: "TWD NT$" },
  { code: "JPY", symbol: "¥", label: "JPY ¥" },
  { code: "KRW", symbol: "₩", label: "KRW ₩" },
  { code: "USD", symbol: "$", label: "USD $" },
  { code: "EUR", symbol: "€", label: "EUR €" },
];

const splitLines = (value: string): string[] => {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const toTextareaValue = (items: string[]): string => items.join("\n");

const EXCEL_PENDING_REQUEST_KEY = "tc_v311_excel_pending_request";

const getExcelRequestFingerprint = async (
  workbook: ParsedTripExcel,
  currencyCode: string,
  currencySymbol: string,
): Promise<string> => {
  const payload = JSON.stringify({
    title: workbook.title.trim(),
    departureDate: workbook.departureDate,
    cards: workbook.cards.map(({ day, item }) => ({
      day,
      time: item.time,
      departureTime: item.departureTime,
      title: item.title,
      type: item.type,
      desc: item.desc ?? "",
    })),
    currencyCode,
    currencySymbol,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const readPendingExcelRequest = (): { fingerprint: string; requestId: string } | null => {
  try {
    const raw = sessionStorage.getItem(EXCEL_PENDING_REQUEST_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "fingerprint" in parsed &&
      "requestId" in parsed &&
      typeof parsed.fingerprint === "string" &&
      typeof parsed.requestId === "string"
    ) {
      return { fingerprint: parsed.fingerprint, requestId: parsed.requestId };
    }
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
  return null;
};

const writePendingExcelRequest = (fingerprint: string, requestId: string): void => {
  try {
    sessionStorage.setItem(
      EXCEL_PENDING_REQUEST_KEY,
      JSON.stringify({ fingerprint, requestId }),
    );
  } catch {
    // Keep the in-memory request ID even when session storage is unavailable.
  }
};

const clearPendingExcelRequest = (requestId: string): void => {
  const pending = readPendingExcelRequest();
  if (pending?.requestId !== requestId) return;
  try {
    sessionStorage.removeItem(EXCEL_PENDING_REQUEST_KEY);
  } catch {
    // The request remains protected by the in-memory state for this modal.
  }
};

const getPendingExcelRequestId = (fingerprint: string): string => {
  const pending = readPendingExcelRequest();
  return pending?.fingerprint === fingerprint
    ? pending.requestId
    : crypto.randomUUID();
};

const toParticipantAssignmentText = (
  participants: string[],
  participantEmailMap?: Record<string, string>,
  defaultProfiles: AdminProfile[] = [],
): string => {
  if (participants.length === 0 && defaultProfiles.length > 0) {
    return defaultProfiles
      .filter((profile) => profile.include_in_new_trip)
      .sort(
        (left, right) =>
          left.sort_order - right.sort_order ||
          left.email.localeCompare(right.email),
      )
      .map((profile) => `${profile.display_name}=${profile.email}`)
      .join("\n");
  }

  return participants
    .map((participant) => {
      const email = participantEmailMap?.[participant] ?? "";
      return email ? `${participant}=${email}` : `${participant}=`;
    })
    .join("\n");
};

const parseParticipantAssignments = (
  value: string,
): Array<{ participant: string; email: string; raw: string }> => {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [participant, ...emailParts] = line.split("=");

      return {
        participant: participant.trim(),
        email: emailParts.join("=").trim().toLowerCase(),
        raw: line,
      };
    });
};

const getInitialTripMode = (
  trip: TripMeta | null,
  tripDetail: TripDetail | null,
): TripMode => {
  if (trip?.mode === "guided" || trip?.mode === "selfGuided") {
    return trip.mode;
  }

  if (
    tripDetail?.content.mode === "guided" ||
    tripDetail?.content.mode === "selfGuided"
  ) {
    return tripDetail.content.mode;
  }

  const specialTitle = tripDetail?.sidebarConfig.find(
    (item) => item.id === "trip_special_info" || item.type === "otherInfo",
  )?.title;

  return specialTitle?.includes("自駕") || specialTitle?.includes("租車")
    ? "selfGuided"
    : "guided";
};

export const TripEditorModal = ({
  mode,
  defaultCurrencyCode,
  defaultCurrencySymbol,
  trip,
  tripDetail,
  editorEmails,
  superAdminEmails,
  defaultParticipantProfiles,
  canManageEditors,
  isOpen,
  onClose,
  onSubmit,
  onCreateFromExcel,
  onDelete,
  historicalTripEndDate,
}: TripEditorModalProps) => {
  const isDeleteProtected = Boolean(trip && isProtectedSeedTripId(trip.id));
  const [title, setTitle] = useState(trip?.title ?? "");
  const [departureDate, setDepartureDate] = useState(
    trip?.departureDate ?? new Date().toISOString().slice(0, 10),
  );
  const [dayCount, setDayCount] = useState(tripDetail?.content.days.length ?? 1);
  const [showLunarDate, setShowLunarDate] = useState(
    tripDetail?.content.showLunarDate !== false,
  );
  const [tripMode, setTripMode] = useState<TripMode>(() =>
    getInitialTripMode(trip, tripDetail),
  );
  const [isPublic, setIsPublic] = useState(mode === "create" ? false : (trip?.isPublic ?? tripDetail?.isPublic ?? true));
  const [participantAssignments, setParticipantAssignments] = useState(
    toParticipantAssignmentText(
      trip?.participants ?? [],
      trip?.participantEmailMap ?? tripDetail?.content.participantEmailMap,
      mode === "create" ? defaultParticipantProfiles : [],
    ),
  );
  const [editorEmailText, setEditorEmailText] = useState(
    toTextareaValue(editorEmails),
  );
  const [currencyCode, setCurrencyCode] = useState(
    trip?.currencyConfig.code ?? defaultCurrencyCode,
  );
  const [currencySymbol, setCurrencySymbol] = useState(
    trip?.currencyConfig.symbol ?? defaultCurrencySymbol,
  );
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingShrink, setPendingShrink] = useState<{
    input: TripEditorInput;
    impacts: RemovedDayImpact[];
  } | null>(null);
  const [shrinkConfirmationStep, setShrinkConfirmationStep] = useState<1 | 2>(1);
  const [creationMethod, setCreationMethod] = useState<"manual" | "excel">("manual");
  const [isExcelCancelHovered, setIsExcelCancelHovered] = useState(false);
  const [isExcelCancelFocused, setIsExcelCancelFocused] = useState(false);
  const isExcelCancelActive = isExcelCancelHovered || isExcelCancelFocused;
  const [excelPreview, setExcelPreview] = useState<ParsedTripExcel | null>(null);
  const [excelIssues, setExcelIssues] = useState<TripExcelValidationIssue[]>([]);
  const [excelFileName, setExcelFileName] = useState("");
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [excelRequestId, setExcelRequestId] = useState<string | null>(null);
  const [isExcelResultUnconfirmed, setIsExcelResultUnconfirmed] = useState(false);
  const excelRequestFingerprintRef = useRef<string | null>(null);
  const excelInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleExcelFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setExcelPreview(null);
    setExcelIssues([]);
    setExcelFileName(file?.name ?? "");
    setExcelRequestId(null);
    setIsExcelResultUnconfirmed(false);
    excelRequestFingerprintRef.current = null;
    if (!file) return;
    if (!canManageEditors) {
      setExcelIssues([{
        worksheet: "新增 TRIP",
        row: 1,
        field: "權限",
        message: "只有 Super Admin 可以使用 Excel 建立 TRIP。",
      }]);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setExcelIssues([{
        worksheet: "新增 TRIP",
        row: 1,
        field: "檔案",
        message: "請選擇 .xlsx 格式的 Excel 檔案。",
      }]);
      return;
    }

    setIsParsingExcel(true);
    try {
      const result = await parseTripExcelWorkbook(await file.arrayBuffer());
      if (result.success) {
        setExcelPreview(result.data);
        const fingerprint = await getExcelRequestFingerprint(
          result.data,
          currencyCode,
          currencySymbol,
        );
        const pendingRequest = readPendingExcelRequest();
        const requestId = getPendingExcelRequestId(fingerprint);
        excelRequestFingerprintRef.current = fingerprint;
        setExcelRequestId(requestId);
        setIsExcelResultUnconfirmed(pendingRequest?.fingerprint === fingerprint);
      } else {
        setExcelIssues(result.issues);
      }
    } catch {
      setExcelIssues([{
        worksheet: "新增 TRIP",
        row: 1,
        field: "工作簿",
        message: "讀取檔案時發生錯誤，請確認檔案完整後再試。",
      }]);
    } finally {
      setIsParsingExcel(false);
      event.target.value = "";
    }
  };

  const handleCurrencyChange = (code: string) => {
    const selectedCurrency = CURRENCY_OPTIONS.find((item) => item.code === code);
    setCurrencyCode(code);
    setCurrencySymbol(selectedCurrency?.symbol ?? "");
    if (excelPreview) {
      void getExcelRequestFingerprint(excelPreview, code, selectedCurrency?.symbol ?? "")
        .then((fingerprint) => {
          const pendingRequest = readPendingExcelRequest();
          const requestId = getPendingExcelRequestId(fingerprint);
          excelRequestFingerprintRef.current = fingerprint;
          setExcelRequestId(requestId);
          setIsExcelResultUnconfirmed(pendingRequest?.fingerprint === fingerprint);
        })
        .catch(() => {
          setExcelRequestId(null);
          setFormError("無法建立安全的重試識別碼，請重新載入 Excel 檔案。");
        });
    }
  };

  const handleExcelCreate = async () => {
    if (!excelPreview || !excelRequestId || !canManageEditors) {
      return;
    }
    if (!currencyCode.trim() || !currencySymbol.trim()) {
      setFormError("目前新增 TRIP 的幣別設定不完整，請重新選擇幣別。");
      return;
    }

    // Re-read the current form defaults at the final confirmation boundary.
    // If they changed since preview, require a fresh explicit confirmation.
    const currentDefaultCurrencyCode = defaultCurrencyCode.trim();
    const currentDefaultCurrencySymbol = defaultCurrencySymbol.trim();
    if (
      currentDefaultCurrencyCode !== currencyCode ||
      currentDefaultCurrencySymbol !== currencySymbol
    ) {
      setCurrencyCode(currentDefaultCurrencyCode);
      setCurrencySymbol(currentDefaultCurrencySymbol);
      setFormError("新增 TRIP 的預設幣別已更新，請再次按下建立。");
      const fingerprint = await getExcelRequestFingerprint(
        excelPreview,
        currentDefaultCurrencyCode,
        currentDefaultCurrencySymbol,
      );
      const requestId = getPendingExcelRequestId(fingerprint);
      excelRequestFingerprintRef.current = fingerprint;
      setExcelRequestId(requestId);
      setIsExcelResultUnconfirmed(readPendingExcelRequest()?.fingerprint === fingerprint);
      return;
    }

    setFormError("");
    setIsSaving(true);
    releaseFocusedControl();
    try {
      const fingerprint = excelRequestFingerprintRef.current ??
        await getExcelRequestFingerprint(excelPreview, currencyCode, currencySymbol);
      excelRequestFingerprintRef.current = fingerprint;
      writePendingExcelRequest(fingerprint, excelRequestId);
      await onCreateFromExcel(
        excelPreview,
        excelRequestId,
        currencyCode,
        currencySymbol,
      );
      clearPendingExcelRequest(excelRequestId);
      setExcelRequestId(null);
      setExcelPreview(null);
      setIsExcelResultUnconfirmed(false);
      excelRequestFingerprintRef.current = null;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        ["RPC_FAILED", "RESULT_UNCONFIRMED", "REFRESH_UNCONFIRMED"].includes(
          String(error.code),
        )
      ) {
        setIsExcelResultUnconfirmed(true);
      }
      const message = error instanceof Error
        ? error.message
        : "無法確認 Excel 建立結果。請保留目前檔案並以相同內容重試。";
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !departureDate || dayCount < 1) return;

    const participantRows = parseParticipantAssignments(participantAssignments);
    const nextParticipants = canManageEditors
      ? participantRows.map((row) => row.participant)
      : trip?.participants ?? [];
    if (canManageEditors && nextParticipants.length === 0) {
      const message = "請至少輸入一位參與者後再儲存。";
      setFormError(message);
      alert(message);
      return;
    }

    const invalidParticipantRows = participantRows.filter(
      (row) => !row.participant || !row.email,
    );
    const invalidParticipantEmails = participantRows.filter(
      (row) => row.email && !row.email.includes("@"),
    );
    const duplicatedParticipants = nextParticipants.filter(
      (participant, index) => nextParticipants.indexOf(participant) !== index,
    );

    if (canManageEditors && invalidParticipantRows.length > 0) {
      const message = `請用「名稱=Email」格式填寫參與者，例如 Howard=howard@example.com。格式不完整：${invalidParticipantRows.map((row) => row.raw).join("、")}。`;
      setFormError(message);
      alert(message);
      return;
    }

    if (canManageEditors && invalidParticipantEmails.length > 0) {
      const message = `以下參與者的 Email 格式不正確：${invalidParticipantEmails.map((row) => row.participant).join("、")}。`;
      setFormError(message);
      alert(message);
      return;
    }

    if (canManageEditors && duplicatedParticipants.length > 0) {
      const message = `參與者名稱不可重複：${Array.from(new Set(duplicatedParticipants)).join("、")}。`;
      setFormError(message);
      alert(message);
      return;
    }

    const participantEmailMap = canManageEditors
      ? Object.fromEntries(
          participantRows.map((row) => [row.participant, row.email]),
        )
      : trip?.participantEmailMap ?? tripDetail?.content.participantEmailMap ?? {};

    const nextEditorEmails = splitLines(editorEmailText).map((email) =>
      email.toLowerCase(),
    );
    const superAdminEmailSet = new Set(
      superAdminEmails.map((email) => email.toLowerCase()),
    );
    const duplicatedSuperAdminEmails = nextEditorEmails.filter((email) =>
      superAdminEmailSet.has(email),
    );

    if (canManageEditors && duplicatedSuperAdminEmails.length > 0) {
      const message = `以下 Email 已是 super_admin 管理員帳號，不需要加入可編輯者：${duplicatedSuperAdminEmails.join("、")}。請清除後再儲存。`;
      setFormError(message);
      alert(message);
      return;
    }

    const input: TripEditorInput = {
      title,
      departureDate,
      dayCount,
      showLunarDate,
      mode: tripMode,
      participants: nextParticipants,
      participantEmailMap,
      ...(canManageEditors ? { isPublic } : {}),
      editorEmails: nextEditorEmails,
      currencyCode,
      currencySymbol,
    };
    const impacts =
      mode === "edit" && tripDetail
        ? getRemovedDayImpacts(tripDetail, dayCount)
        : [];

    setFormError("");
    releaseFocusedControl();
    if (impacts.length > 0) {
      setShrinkConfirmationStep(1);
      setPendingShrink({ input, impacts });
      return;
    }

    setIsSaving(true);
    await onSubmit(input);
    setIsSaving(false);
  };

  const confirmShrink = async () => {
    if (!pendingShrink) return;

    setIsSaving(true);
    await onSubmit(pendingShrink.input);
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (
      mode !== "edit" ||
      !trip ||
      !onDelete ||
      !canManageEditors ||
      isDeleteProtected
    ) return;

    const firstConfirm = confirm(`確定要刪除「${trip.title}」整個旅程？`);
    if (!firstConfirm) return;

    const secondConfirm = confirm(
      "刪除後會移除此旅程資料、可編輯者權限、清單與共用記帳資料。請再次確認是否刪除？",
    );
    if (!secondConfirm) return;

    setIsDeleting(true);
    releaseFocusedControl();
    await onDelete();
    setIsDeleting(false);
  };

  if (pendingShrink) {
    const originalDayCount = tripDetail?.content.days.length ?? dayCount;
    const firstDay = pendingShrink.impacts[0].day;
    const lastDay = pendingShrink.impacts[pendingShrink.impacts.length - 1].day;
    const dayRange = firstDay === lastDay
      ? `第 ${firstDay} 天`
      : `第 ${firstDay} 天至第 ${lastDay} 天`;
    const dangerLabel = firstDay === lastDay
      ? `刪除第 ${firstDay} 天並儲存`
      : `刪除第 ${firstDay} 天至第 ${lastDay} 天並儲存`;

    return (
      <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center">
        <section
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="shrink-trip-title"
          className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 flex max-h-[92vh] flex-col gap-4"
        >
          <div className="flex items-start gap-3">
            <span className="rounded-full bg-rose-100 p-2 text-rose-700">
              <AlertTriangle size={20} />
            </span>
            <div>
              <h2 id="shrink-trip-title" className="text-lg font-bold text-slate-900">
                {shrinkConfirmationStep === 1
                  ? "確認縮短行程影響"
                  : "最後確認永久刪除"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {shrinkConfirmationStep === 1 ? (
                  <>
                    你正將行程從 {originalDayCount} 天改為 {pendingShrink.input.dayCount} 天。
                    請先確認下列受影響的每日行程資料。
                  </>
                ) : (
                  <>
                    儲存後，{dayRange}的行程卡片與路線資訊會永久刪除，且無法復原。
                  </>
                )}
              </p>
            </div>
          </div>

          {shrinkConfirmationStep === 1 && (
            <div className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
              <ul className="space-y-2 text-sm text-slate-700">
                {pendingShrink.impacts.map((impact) => (
                  <li key={impact.day} className="rounded-lg bg-white px-3 py-2 shadow-sm">
                    <span className="font-bold">第 {impact.day} 天：</span>
                    {impact.cardCount === 0 && impact.routeCount === 0
                      ? "沒有行程卡片或路線資訊"
                      : `${impact.cardCount > 0 ? `${impact.cardCount} 張行程卡片` : "沒有行程卡片"}、${impact.routeCount > 0 ? `${impact.routeCount} 段路線資訊` : "沒有路線資訊"}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold leading-6 text-rose-800">
            {shrinkConfirmationStep === 1
              ? "共同準備清單、共同帳本及其他資訊不受影響。"
              : `這是最後確認。${dayRange}的每日行程資料刪除後無法復原。`}
          </p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setPendingShrink(null);
                setShrinkConfirmationStep(1);
              }}
              disabled={isSaving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {shrinkConfirmationStep === 1 ? "返回修改" : "取消"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (shrinkConfirmationStep === 1) {
                  setShrinkConfirmationStep(2);
                  return;
                }
                void confirmShrink();
              }}
              disabled={isSaving}
              className="rounded-lg bg-rose-700 px-4 py-3 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-60"
            >
              {isSaving
                ? "儲存中..."
                : shrinkConfirmationStep === 1
                  ? "繼續確認"
                  : dangerLabel}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 space-y-4 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            {mode === "create" ? "新增旅程" : "編輯旅程"}
          </h2>
          {!(mode === "create" && creationMethod === "excel") && (
            <button
              type="button"
              onClick={() => {
                releaseFocusedControl();
                onClose();
              }}
              disabled={isSaving}
              className="p-2 rounded-full text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="關閉"
              title="關閉"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {mode === "create" && creationMethod !== "excel" && (
          <section className="rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-bold text-slate-700">建立方式</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setCreationMethod("manual");
                  setExcelPreview(null);
                  setExcelIssues([]);
                  setExcelRequestId(null);
                  setIsExcelResultUnconfirmed(false);
                  excelRequestFingerprintRef.current = null;
                }}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-md active:translate-y-0 active:scale-[0.97] active:shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 has-[+button:hover]:border-slate-200 has-[+button:hover]:bg-white has-[+button:hover]:text-slate-700 has-[+button:focus-visible]:border-slate-200 has-[+button:focus-visible]:bg-white has-[+button:focus-visible]:text-slate-700"
              >
                手動新增
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreationMethod("excel");
                  setExcelPreview(null);
                  setExcelIssues([]);
                  setExcelRequestId(null);
                  setIsExcelResultUnconfirmed(false);
                  excelRequestFingerprintRef.current = null;
                }}
                disabled={!canManageEditors}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-150 hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 hover:shadow-md active:translate-y-0 active:scale-[0.97] active:shadow-inner focus-visible:border-emerald-200 focus-visible:bg-emerald-50 focus-visible:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <FileSpreadsheet size={16} /> Excel 建立
                </span>
              </button>
            </div>
            {!canManageEditors && (
              <p className="mt-2 text-xs text-slate-500">Excel 建立僅限 Super Admin 使用。</p>
            )}
          </section>
        )}

        {mode === "create" && creationMethod === "excel" ? (
          <section className="space-y-3">
            <div>
              <p className="text-sm font-bold text-slate-800">匯入標準 Excel 範本</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                請使用 V1 標準範本。系統先完整驗證，再顯示預覽；建立時會以單一雲端交易建立全新 TRIP。
              </p>
            </div>
            <button
              type="button"
              onClick={() => excelInputRef.current?.click()}
              disabled={isSaving || isParsingExcel}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-bold shadow-sm transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${isExcelCancelActive ? "border-slate-200 bg-white text-slate-700" : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100"}`}
            >
              <FileSpreadsheet size={17} />
              {excelFileName ? "重新選擇 Excel 檔案" : "選擇 Excel 檔案"}
            </button>
            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleExcelFileChange}
              disabled={isSaving || isParsingExcel}
              className="hidden"
              aria-label="選擇新增 TRIP Excel 檔案"
            />
            {excelFileName && (
              <div
                aria-live="polite"
                className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
              >
                {isParsingExcel ? (
                  <LoaderCircle size={15} className="shrink-0 animate-spin" />
                ) : excelPreview ? (
                  <CheckCircle2 size={15} className="shrink-0" />
                ) : (
                  <FileSpreadsheet size={15} className="shrink-0" />
                )}
                <span className="min-w-0 break-all">
                  {isParsingExcel
                    ? `正在驗證：${excelFileName}`
                    : excelPreview
                      ? `已選取並完成驗證：${excelFileName}`
                      : `已選取：${excelFileName}`}
                </span>
              </div>
            )}
            {excelIssues.length > 0 && (
              <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                <p className="text-sm font-bold text-rose-800">Excel 驗證失敗，尚未建立任何 TRIP。</p>
                <ul className="mt-2 space-y-1 text-xs text-rose-700">
                  {excelIssues.map((issue, index) => (
                    <li key={`${issue.worksheet}-${issue.row}-${issue.field}-${index}`}>
                      {issue.worksheet} 第 {issue.row} 列／{issue.field}：{issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {excelPreview && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                <p className="text-sm font-bold text-slate-900">預覽資料</p>
                <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">TRIP 名稱</dt>
                    <dd className="font-semibold text-slate-800">{excelPreview.title}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">出發日期</dt>
                    <dd className="font-semibold text-slate-800">{excelPreview.departureDate}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">旅程天數</dt>
                    <dd className="font-semibold text-slate-800">{excelPreview.dayCount} 天</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">行程卡片</dt>
                    <dd className="font-semibold text-slate-800">{excelPreview.cardCount} 張</dd>
                  </div>
                </dl>
                <div className="mt-3 space-y-2">
                  {excelPreview.days.map((day) => {
                    const items = excelPreview.daysData[String(day)] ?? [];
                    return (
                      <div key={day} className="rounded-lg border border-slate-200 bg-white p-2.5">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-slate-800">第 {day} 天</p>
                          <span className="text-xs text-slate-500">{items.length} 張卡片</span>
                        </div>
                        {items.length > 0 ? (
                          <ul className="mt-1 space-y-1">
                            {items.map((item) => (
                              <li key={item.id} className="text-xs leading-5 text-slate-700">
                                <span className="font-semibold">{item.time}–{item.departureTime}</span>
                                {" · "}{item.title}
                                <span className="ml-1 text-slate-500">（{item.type}）</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-xs text-slate-400">此日沒有卡片，將保留為空白日。</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs leading-5 text-amber-900">
                  本次新 TRIP 將使用新增表單目前的預設幣別：<strong>{currencyCode}（{currencySymbol}）</strong>。
                  此設定不會從 Excel 讀取，請留意旅程目的地所使用的幣別。
                  {isExcelResultUnconfirmed && " 上次建立結果尚未確認，請檢視資料後使用同一份 Excel 重試；系統會沿用原建立請求。"}
                </div>
                {formError && (
                  <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                    {formError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void handleExcelCreate()}
                  disabled={!excelRequestId || isSaving || !canManageEditors}
                  className="mt-3 w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                >
                  {isSaving ? "正在建立並確認雲端資料…" : "建立 TRIP"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExcelPreview(null);
                    setExcelIssues([]);
                    setExcelFileName("");
                    setExcelRequestId(null);
                    setIsExcelResultUnconfirmed(false);
                    setFormError("");
                    excelRequestFingerprintRef.current = null;
                    setCreationMethod("manual");
                  }}
                  disabled={isSaving}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  取消匯入，返回建立方式
                </button>
              </div>
            )}
          </section>
        ) : historicalTripEndDate && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-bold">正在編輯歷史行程</p>
            <p className="mt-1 leading-6 text-amber-800">
              本行程已於 {historicalTripEndDate} 結束。你以管理者身分編輯；儲存後會直接更新歷史資料，請確認內容正確。
            </p>
          </section>
        )}

        {mode === "create" && creationMethod === "excel" ? (
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            onMouseEnter={() => setIsExcelCancelHovered(true)}
            onMouseLeave={() => setIsExcelCancelHovered(false)}
            onFocus={() => setIsExcelCancelFocused(true)}
            onBlur={() => setIsExcelCancelFocused(false)}
            className={`w-full rounded-lg border px-4 py-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${isExcelCancelActive ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100" : "border-slate-300 bg-white text-slate-700"}`}
          >
            取消
          </button>
        ) : (
          <>
        {formError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {formError}
          </div>
        )}

        <label className="block">
          <span className="text-xs font-bold text-slate-500">旅程名稱</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            required
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold text-slate-500">出發日期</span>
            <input
              type="date"
              value={departureDate}
              onChange={(event) => setDepartureDate(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-500">天數</span>
            <input
              type="number"
              min={1}
              max={30}
              value={dayCount}
              onChange={(event) => setDayCount(Number(event.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </label>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
          <span>
            <span className="block text-sm font-bold text-slate-700">顯示農曆日期</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              開啟後會在西洋月日後顯示農曆月日。
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={showLunarDate}
            onChange={(event) => setShowLunarDate(event.target.checked)}
            className="h-5 w-9 shrink-0 accent-emerald-700"
            aria-label="顯示農曆日期"
          />
        </label>

        {canManageEditors && (
          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
            <span>
              <span className="block text-sm font-bold text-slate-700">公開行程</span>
              <span className="mt-0.5 block text-xs text-slate-500">公開後所有使用者及訪客可閱覽；不公開時僅管理員和本行程受邀編輯者可閱覽。</span>
            </span>
            <input type="checkbox" role="switch" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} className="h-5 w-9 shrink-0 accent-emerald-700" aria-label="公開行程" />
          </label>
        )}

        <label className="block">
          <span className="text-xs font-bold text-slate-500">旅程型態</span>
          <select
            value={tripMode}
            onChange={(event) => setTripMode(event.target.value as TripMode)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="guided">跟團</option>
            <option value="selfGuided">自助 / 自駕</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-bold text-slate-500">
            記帳代號設定（不授予本行程編輯權）
          </span>
          <div className="mt-1 text-xs leading-relaxed text-slate-400">
            <p>每行一人，例如 Howard=howard@example.com。此處只設定記帳名稱，不授予編輯權。</p>
            <details className="mt-1">
              <summary className="cursor-pointer font-semibold text-slate-500">完整說明</summary>
              <p className="mt-1">
                左側名稱顯示為記帳付款人；右側 Email 用於辨識預設登入者，記帳時仍可代其他同行者記帳。既有內容會自動帶入；若要授權編輯旅程，請將 Email 填入下方「可編輯者 Google Email」。
                {!canManageEditors && " 記帳代號設定僅限系統管理者編輯。"}
              </p>
            </details>
          </div>
          <textarea
            value={participantAssignments}
            onChange={(event) => setParticipantAssignments(event.target.value)}
            disabled={!canManageEditors}
            rows={3}
            placeholder="Howard=howard@example.com&#10;Carol=carol@example.com"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
            required
          />
        </label>

        <label className="block">
          <span className="text-xs font-bold text-slate-500">可編輯者 Google Email</span>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            填入這裡的 Email，會賦予編輯旅程相關資訊以及共用帳本紀錄的權利。
          </p>
          <textarea
            value={editorEmailText}
            onChange={(event) => setEditorEmailText(event.target.value)}
            disabled={!canManageEditors}
            rows={3}
            placeholder="howard@example.com&#10;carol@example.com"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
          />
        </label>

        <div className="grid grid-cols-[1fr_84px] gap-3">
          <label className="block">
            <span className="text-xs font-bold text-slate-500">預設幣別</span>
            <select
              value={currencyCode}
              onChange={(event) => handleCurrencyChange(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {CURRENCY_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-500">符號</span>
            <input
              value={currencySymbol}
              onChange={(event) => setCurrencySymbol(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={isSaving || isDeleting}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <Save size={16} />
          {isSaving ? "儲存中..." : "儲存旅程"}
        </button>

        {mode === "edit" && onDelete && canManageEditors && (
          <div className="border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={isSaving || isDeleting || isDeleteProtected}
              className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
            >
              {isDeleting ? "刪除中..." : "刪除整個旅程"}
            </button>
            {isDeleteProtected && (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                此為系統保留旅程，無法刪除；仍可編輯旅程內容。
              </p>
            )}
          </div>
        )}
          </>
        )}
      </form>
    </div>
  );
};
