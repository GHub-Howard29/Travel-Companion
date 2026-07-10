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
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: TripEditorInput) => Promise<void>;
}

const CURRENCY_OPTIONS = [
  { code: "JPY", symbol: "￥", label: "JPY ￥" },
  { code: "TWD", symbol: "$", label: "TWD $" },
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
  isOpen,
  onClose,
  onSubmit,
}: TripEditorModalProps) => {
  const [title, setTitle] = useState(trip?.title ?? "");
  const [departureDate, setDepartureDate] = useState(
    trip?.departureDate ?? new Date().toISOString().slice(0, 10),
  );
  const [dayCount, setDayCount] = useState(tripDetail?.content.days.length ?? 1);
  const [tripMode, setTripMode] = useState<TripMode>(() =>
    getInitialTripMode(trip, tripDetail),
  );
  const [participants, setParticipants] = useState(
    toTextareaValue(trip?.participants ?? []),
  );
  const [editorEmailText, setEditorEmailText] = useState(
    toTextareaValue(editorEmails),
  );
  const [currencyCode, setCurrencyCode] = useState(
    trip?.currencyConfig.code ?? "JPY",
  );
  const [currencySymbol, setCurrencySymbol] = useState(
    trip?.currencyConfig.symbol ?? "￥",
  );
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleCurrencyChange = (code: string) => {
    const selectedCurrency = CURRENCY_OPTIONS.find((item) => item.code === code);
    setCurrencyCode(code);
    setCurrencySymbol(selectedCurrency?.symbol ?? "");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !departureDate || dayCount < 1) return;

    const nextParticipants = splitLines(participants);
    if (nextParticipants.length === 0) {
      const message = "請至少輸入一位參與者後再儲存。";
      setFormError(message);
      alert(message);
      return;
    }

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
      editorEmails: nextEditorEmails,
      currencyCode,
      currencySymbol,
    });
    setIsSaving(false);
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
          <span className="text-xs font-bold text-slate-500">參與者</span>
          <textarea
            value={participants}
            onChange={(event) => setParticipants(event.target.value)}
            rows={3}
            placeholder="Howard&#10;Carol"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            required
          />
        </label>

        <label className="block">
          <span className="text-xs font-bold text-slate-500">可編輯者 Email</span>
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
          disabled={isSaving}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <Save size={16} />
          {isSaving ? "儲存中..." : "儲存旅程"}
        </button>
      </form>
    </div>
  );
};
