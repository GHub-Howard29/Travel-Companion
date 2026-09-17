import { useEffect, useRef } from "react";
import { BarChart3, Clock, RefreshCw, ShieldCheck, Users, X } from "lucide-react";
import type { SystemUsageSummary } from "../types/systemUsage";

type UsageSummaryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void;
  isLoading: boolean;
  summary: SystemUsageSummary | null;
  error: string | null;
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "時間資料無效" : date.toLocaleString();
};

export function UsageSummaryModal({
  isOpen,
  onClose,
  onRetry,
  isLoading,
  summary,
  error,
}: UsageSummaryModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const usageTrigger = document.querySelector<HTMLElement>(
        "[data-system-usage-trigger]",
      );
      (usageTrigger ?? previouslyFocused)?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-usage-title"
        aria-describedby="system-usage-description"
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
              <BarChart3 size={20} aria-hidden="true" />
            </div>
            <div>
              <h2 id="system-usage-title" className="text-lg font-bold text-slate-800">
                系統使用紀錄彙總
              </h2>
              <p id="system-usage-description" className="text-xs text-slate-500">
                系統開發者專屬維運檢視
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="關閉系統使用紀錄彙總"
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500" role="status">
              <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
              <p className="text-sm font-medium">正在驗證權限並載入彙總資料...</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">
              <p>{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-2 font-bold text-white hover:bg-rose-800"
              >
                <RefreshCw size={14} aria-hidden="true" />
                重新驗證
              </button>
            </div>
          ) : summary ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center">
                  <Users className="mx-auto mb-1 text-emerald-600" size={22} aria-hidden="true" />
                  <span className="block text-xs font-bold text-slate-500">Auth 使用者</span>
                  <span className="mt-1 block text-2xl font-black text-slate-800">{summary.totalUsers}</span>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center">
                  <ShieldCheck className="mx-auto mb-1 text-amber-600" size={22} aria-hidden="true" />
                  <span className="block text-xs font-bold text-slate-500">已彙總使用者</span>
                  <span className="mt-1 block text-2xl font-black text-slate-800">{summary.trackedUsers}</span>
                </div>
              </div>

              <section className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-xs text-amber-950">
                <p className="font-bold">維運授權帳戶</p>
                <p className="mt-1 break-all text-slate-700">{summary.systemDeveloperEmail}</p>
                <p className="mt-3 flex items-center gap-1.5 border-t border-amber-200 pt-3 text-slate-600">
                  <Clock size={14} aria-hidden="true" />
                  查詢時間：{formatTimestamp(summary.checkedAt)}
                </p>
              </section>

              <section aria-labelledby="usage-user-list-title">
                <h3 id="usage-user-list-title" className="mb-2 text-sm font-bold text-slate-800">
                  使用者彙總
                </h3>
                {summary.users.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                    尚無已登入使用紀錄。
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {summary.users.map((user) => (
                      <li key={user.email} className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
                        <p className="break-all font-bold text-slate-800">{user.email}</p>
                        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
                          <dt>首次使用</dt>
                          <dd className="text-right">{formatTimestamp(user.firstUsedAt)}</dd>
                          <dt>最近使用</dt>
                          <dd className="text-right">{formatTimestamp(user.lastUsedAt)}</dd>
                          <dt>有效工作階段</dt>
                          <dd className="text-right font-bold text-slate-800">{user.validSessionCount}</dd>
                        </dl>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <p className="text-xs leading-5 text-slate-500">
                僅保存 Email、首次／最近使用時間與 30 分鐘窗口的有效工作階段數；不保存 IP、裝置、位置、頁面或行程內容。
              </p>
            </>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-800"
          >
            關閉畫面
          </button>
        </div>
      </div>
    </div>
  );
}
