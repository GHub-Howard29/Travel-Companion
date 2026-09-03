import { FormEvent, useState } from "react";
import { AlertTriangle, Save, X } from "lucide-react";
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

interface TripEditorModalProps {
  mode: "create" | "edit";
  trip: TripMeta | null;
  tripDetail: TripDetail | null;
  editorEmails: string[];
  superAdminEmails: string[];
  defaultParticipantProfiles: AdminProfile[];
  canManageEditors: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: TripEditorInput) => Promise<void>;
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
  trip,
  tripDetail,
  editorEmails,
  superAdminEmails,
  defaultParticipantProfiles,
  canManageEditors,
  isOpen,
  onClose,
  onSubmit,
  onDelete,
  historicalTripEndDate,
}: TripEditorModalProps) => {
  const [title, setTitle] = useState(trip?.title ?? "");
  const [departureDate, setDepartureDate] = useState(
    trip?.departureDate ?? new Date().toISOString().slice(0, 10),
  );
  const [dayCount, setDayCount] = useState(tripDetail?.content.days.length ?? 1);
  const [tripMode, setTripMode] = useState<TripMode>(() =>
    getInitialTripMode(trip, tripDetail),
  );
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
    trip?.currencyConfig.code ?? "TWD",
  );
  const [currencySymbol, setCurrencySymbol] = useState(
    trip?.currencyConfig.symbol ?? "NT$",
  );
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingShrink, setPendingShrink] = useState<{
    input: TripEditorInput;
    impacts: RemovedDayImpact[];
  } | null>(null);
  const [shrinkConfirmationStep, setShrinkConfirmationStep] = useState<1 | 2>(1);

  if (!isOpen) return null;

  const handleCurrencyChange = (code: string) => {
    const selectedCurrency = CURRENCY_OPTIONS.find((item) => item.code === code);
    setCurrencyCode(code);
    setCurrencySymbol(selectedCurrency?.symbol ?? "");
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
      mode: tripMode,
      participants: nextParticipants,
      participantEmailMap,
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
    if (mode !== "edit" || !trip || !onDelete || !canManageEditors) return;

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
              className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
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
          <button
            type="button"
            onClick={() => {
              releaseFocusedControl();
              onClose();
            }}
            className="p-2 rounded-full text-slate-500 hover:bg-slate-100"
            aria-label="關閉"
            title="關閉"
          >
            <X size={18} />
          </button>
        </div>

        {historicalTripEndDate && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-bold">正在編輯歷史行程</p>
            <p className="mt-1 leading-6 text-amber-800">
              本行程已於 {historicalTripEndDate} 結束。你以管理者身分編輯；儲存後會直接更新歷史資料，請確認內容正確。
            </p>
          </section>
        )}

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
            參與者與登入 Email
          </span>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            每行填寫「名稱=Email」。左側名稱會顯示在記帳本付款人；右側 Email
            用於辨識預設登入者，記帳時仍可代其他同行者記帳。本欄會先帶入目前已設定的帳號，請勿刪除既有內容。若要新增同行者，請依上述格式逐行新增；若要授權同行者編輯本行程，再將其 Email 填入下方「可編輯者 Email」。
            {!canManageEditors && " 參與者與登入 Email 僅限系統管理者編輯。"}
          </p>
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
          <span className="text-xs font-bold text-slate-500">可編輯者 Email</span>
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
              disabled={isSaving || isDeleting}
              className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
            >
              {isDeleting ? "刪除中..." : "刪除整個旅程"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
