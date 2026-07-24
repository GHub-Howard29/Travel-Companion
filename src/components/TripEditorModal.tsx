import { FormEvent, useState } from "react";
import { Save, X } from "lucide-react";
import type { TripDetail, TripEditorInput, TripMeta, TripMode } from "../types";

interface TripEditorModalProps {
  mode: "create" | "edit";
  trip: TripMeta | null;
  tripDetail: TripDetail | null;
  editorEmails: string[];
  superAdminEmails: string[];
  canManageEditors: boolean;
  userEmail: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: TripEditorInput) => Promise<void>;
  onDelete?: () => Promise<void>;
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

const getDefaultParticipantName = (email: string): string => {
  const [name] = email.split("@");
  return name?.trim() || "我";
};

const toParticipantAssignmentText = (
  participants: string[],
  participantEmailMap?: Record<string, string>,
  fallbackEmail?: string | null,
): string => {
  if (participants.length === 0 && fallbackEmail) {
    const normalizedEmail = fallbackEmail.trim().toLowerCase();
    return `${getDefaultParticipantName(normalizedEmail)}=${normalizedEmail}`;
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
  canManageEditors,
  userEmail,
  isOpen,
  onClose,
  onSubmit,
  onDelete,
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
      userEmail,
    ),
  );
  const [editorEmailText, setEditorEmailText] = useState(
    toTextareaValue(
      mode === "create" && userEmail
        ? Array.from(new Set([userEmail.trim().toLowerCase(), ...editorEmails]))
        : editorEmails,
    ),
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
    const nextParticipants = participantRows.map((row) => row.participant);
    if (nextParticipants.length === 0) {
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

    if (invalidParticipantRows.length > 0) {
      const message = `請用「名稱=Email」格式填寫參與者，例如 Howard=howard@example.com。格式不完整：${invalidParticipantRows.map((row) => row.raw).join("、")}。`;
      setFormError(message);
      alert(message);
      return;
    }

    if (invalidParticipantEmails.length > 0) {
      const message = `以下參與者的 Email 格式不正確：${invalidParticipantEmails.map((row) => row.participant).join("、")}。`;
      setFormError(message);
      alert(message);
      return;
    }

    if (duplicatedParticipants.length > 0) {
      const message = `參與者名稱不可重複：${Array.from(new Set(duplicatedParticipants)).join("、")}。`;
      setFormError(message);
      alert(message);
      return;
    }

    const participantEmailMap = Object.fromEntries(
      participantRows.map((row) => [row.participant, row.email]),
    );

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

    setFormError("");
    setIsSaving(true);
    await onSubmit({
      title,
      departureDate,
      dayCount,
      mode: tripMode,
      participants: nextParticipants,
      participantEmailMap,
      editorEmails: nextEditorEmails,
      currencyCode,
      currencySymbol,
    });
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (mode !== "edit" || !trip || !onDelete) return;

    const firstConfirm = confirm(`確定要刪除「${trip.title}」整個旅程？`);
    if (!firstConfirm) return;

    const secondConfirm = confirm(
      "刪除後會移除此旅程資料、可編輯者權限、清單與共用記帳資料。請再次確認是否刪除？",
    );
    if (!secondConfirm) return;

    setIsDeleting(true);
    await onDelete();
    setIsDeleting(false);
  };

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
            onClick={onClose}
            className="p-2 rounded-full text-slate-500 hover:bg-slate-100"
            aria-label="關閉"
            title="關閉"
          >
            <X size={18} />
          </button>
        </div>

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
            每行填寫「名稱=Email」。左邊名稱會顯示在記帳本付款人，右邊 Email
            用於鎖定登入者可使用的付款人；新增旅程時會先帶入目前登入 Email。
          </p>
          <textarea
            value={participantAssignments}
            onChange={(event) => setParticipantAssignments(event.target.value)}
            rows={3}
            placeholder="Howard=howard@example.com&#10;Carol=carol@example.com"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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

        {mode === "edit" && onDelete && (
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
