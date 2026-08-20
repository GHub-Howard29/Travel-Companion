import { CheckCircle2, RefreshCw, Wifi, X } from "lucide-react";

interface ReconnectPromptProps {
  mode: "syncing" | "ready" | "reminder" | null;
  onLater: () => void;
  onDismissReminder: () => void;
  onReload: () => void;
}

export function ReconnectPrompt({
  mode,
  onLater,
  onDismissReminder,
  onReload,
}: ReconnectPromptProps) {
  if (!mode) return null;

  if (mode === "reminder") {
    return (
      <button
        type="button"
        onClick={onReload}
        className="fixed bottom-4 left-4 right-4 z-[75] mx-auto flex max-w-md items-start gap-3 rounded-xl border border-sky-200 bg-white p-3 text-left shadow-2xl shadow-slate-900/20"
      >
        <Wifi className="mt-0.5 shrink-0 text-sky-600" size={20} />
        <span className="min-w-0 flex-1 text-sm leading-6 text-slate-700">
          已恢復連線，但尚未確認遠端是否有更新內容，建議手動重新載入一次。
        </span>
        <span
          role="button"
          tabIndex={0}
          aria-label="關閉提醒"
          onClick={(event) => {
            event.stopPropagation();
            onDismissReminder();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onDismissReminder();
            }
          }}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={18} />
        </span>
      </button>
    );
  }

  const isSyncing = mode === "syncing";

  return (
    <section
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 z-[75] mx-auto max-w-md rounded-2xl border border-sky-100 bg-white p-4 shadow-2xl shadow-slate-900/20"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-sky-50 p-2 text-sky-600">
          {isSyncing ? <Wifi size={22} /> : <CheckCircle2 size={22} />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-slate-900">
            {isSyncing ? "網路已恢復" : "可以重新載入"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {isSyncing
              ? "正在同步離線期間的變更，完成後可重新載入最新資料。"
              : "建議重新載入一次，以取得其他裝置的最新資料。"}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onLater}
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          稍後處理
        </button>
        <button
          type="button"
          disabled={isSyncing}
          onClick={onReload}
          className="flex items-center justify-center gap-2 rounded-xl bg-rose-700 px-3 py-2.5 text-sm font-bold text-white hover:bg-rose-800 disabled:bg-slate-200 disabled:text-slate-400"
        >
          <RefreshCw className={isSyncing ? "animate-spin" : ""} size={16} />
          {isSyncing ? "同步中…" : "重新載入最新資料"}
        </button>
      </div>
    </section>
  );
}
