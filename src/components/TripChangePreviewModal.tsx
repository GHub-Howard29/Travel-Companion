import {
  CalendarDays,
  CheckSquare2,
  Image,
  ReceiptText,
  RefreshCw,
  Settings,
  X,
} from "lucide-react";
import type {
  TripChangeActionCounts,
  TripChangeCategory,
  TripChangeCategorySummary,
  TripChangePreviewSummary,
} from "../services/tripChangePreviewService";

interface TripChangePreviewModalProps {
  isOpen: boolean;
  summary: TripChangePreviewSummary | null;
  isLoading: boolean;
  error: string | null;
  willApplyPreparedUpdate?: boolean;
  onClose: () => void;
  onReload: () => void;
}

const categoryMeta: Record<
  TripChangeCategory,
  {
    label: string;
    unit: string;
    icon: typeof CalendarDays;
  }
> = {
  itinerary: { label: "每日行程", unit: "項", icon: CalendarDays },
  photo: { label: "照片附件", unit: "張", icon: Image },
  expense: { label: "旅費帳本", unit: "筆", icon: ReceiptText },
  checklist: { label: "核對清單", unit: "項", icon: CheckSquare2 },
  settings: { label: "其他設定", unit: "項", icon: Settings },
};

const formatActionSummary = (
  category: TripChangeCategory,
  actions: TripChangeActionCounts,
): string => {
  const unit = categoryMeta[category].unit;
  const parts: string[] = [];

  if (actions.added > 0) parts.push(`新增 ${actions.added} ${unit}`);
  if (actions.updated > 0) {
    parts.push(
      `${category === "photo" ? "更換" : "修改"} ${actions.updated} ${unit}`,
    );
  }
  if (actions.deleted > 0) parts.push(`刪除 ${actions.deleted} ${unit}`);
  if (actions.changed > 0) parts.push(`${actions.changed} ${unit}變更`);

  return parts.join("・");
};

const formatChangedAt = (value: string | null): string => {
  if (!value) return "尚無可顯示時間";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚無可顯示時間";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

const SummaryRow = ({ item }: { item: TripChangeCategorySummary }) => {
  const meta = categoryMeta[item.category];
  const Icon = meta.icon;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <span className="rounded-lg bg-slate-100 p-2 text-slate-700">
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="font-bold text-slate-900">{meta.label}</p>
          <span className="shrink-0 text-xs font-semibold text-slate-500">
            {item.total} {meta.unit}
          </span>
        </div>
        <p className="mt-0.5 text-xs leading-5 text-slate-600">
          {formatActionSummary(item.category, item.actions) ||
            `${item.total} ${meta.unit}變更`}
        </p>
      </div>
    </div>
  );
};

export const TripChangePreviewModal = ({
  isOpen,
  summary,
  isLoading,
  error,
  willApplyPreparedUpdate = false,
  onClose,
  onReload,
}: TripChangePreviewModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-change-preview-title"
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-slate-50 shadow-2xl sm:rounded-2xl"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4">
          <div>
            <h2
              id="trip-change-preview-title"
              className="text-lg font-bold text-slate-900"
            >
              變更摘要
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              顯示自上次載入後的主要變更類別與數量
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉變更摘要"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </header>

        <div className="space-y-4 p-4">
          {isLoading && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500">
              正在整理變更摘要...
            </div>
          )}

          {!isLoading && error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-bold text-amber-950">暫時無法取得變更摘要</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                {error} 你仍可重新載入取得最新資料。
              </p>
            </div>
          )}

          {!isLoading && !error && summary && (
            <>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-sm font-bold text-blue-950">
                  自上次載入後共有 {summary.totalChanges} 項變更
                </p>
                <div className="mt-2 space-y-1 text-xs leading-5 text-blue-800">
                  <p>最近更新：{formatChangedAt(summary.lastChangedAt)}</p>
                  <p>變更來源：{summary.sourceLabel}</p>
                </div>
              </div>

              {summary.categories.length > 0 ? (
                <div className="space-y-2">
                  {summary.categories.map((item) => (
                    <SummaryRow key={item.category} item={item} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-bold text-slate-800">
                    已偵測到遠端更新
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    這次更新沒有可顯示的分類摘要。重新載入後仍會取得最新資料。
                  </p>
                </div>
              )}
            </>
          )}

          <p className="text-xs leading-5 text-slate-500">
            此頁只顯示變更類別與數量，不顯示照片、帳目、核對項目或其他內容的詳細差異。
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700"
            >
              稍後再說
            </button>
            <button
              type="button"
              onClick={onReload}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 text-sm font-bold text-white hover:bg-orange-700"
            >
              <RefreshCw size={16} />
              {willApplyPreparedUpdate ? "重新載入並套用新版" : "確認並重新載入"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
