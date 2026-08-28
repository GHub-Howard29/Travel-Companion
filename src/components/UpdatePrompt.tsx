/**
 * PWA 更新提示元件
 *
 * 只負責顯示版本資訊與更新按鈕。
 * Service Worker 更新流程由 useAppUpdate 控制。
 */
import { RefreshCw, X } from "lucide-react";
import type { AppUpdatePromptMode } from "../hooks/useAppUpdate";

type UpdatePromptProps = {
  isOpen: boolean;
  mode: AppUpdatePromptMode;
  currentVersion: string;
  latestVersion: string;
  releaseDate: string;
  releaseNotes: string[];
  isMandatoryUpdate: boolean;
  updateError: string | null;
  isChecking: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
};

export function UpdatePrompt({
  isOpen,
  mode,
  currentVersion,
  latestVersion,
  releaseDate,
  releaseNotes,
  isMandatoryUpdate,
  updateError,
  isChecking,
  onUpdate,
  onDismiss,
}: UpdatePromptProps) {
  if (!isOpen) return null;

  const isUpdateAvailable = mode === "update";
  const updateMessage = !isUpdateAvailable
    ? "目前已經是最新版本，以下是本次更新內容"
    : isMandatoryUpdate
      ? "本次更新必須安裝才能繼續使用"
      : "可以馬上更新，也可以稍後再更新";
  const primaryActionLabel = isChecking
    ? "正在檢查更新…"
    : updateError
      ? "重試更新"
      : isMandatoryUpdate
        ? "立即更新"
        : "馬上更新";
  const secondaryActionLabel = "稍後更新";

  return (
    <div className="fixed inset-0 z-[80] flex h-[100svh] items-center justify-center overflow-y-auto bg-black/30 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6">
      <div className="flex max-h-[calc(100svh-2rem-env(safe-area-inset-bottom))] w-full max-w-md flex-col overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-2xl shadow-slate-900/20">
        <div className="shrink-0 flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <RefreshCw size={17} />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isUpdateAvailable ? "發現新版本" : `已更新至 V${latestVersion}`}
              </h2>
              <p className="text-xs text-slate-500">
                {updateMessage}
              </p>
            </div>
          </div>
          {isUpdateAvailable && !isMandatoryUpdate && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="稍後更新"
              title="稍後更新"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 text-sm">
            {isUpdateAvailable ? (
              <>
                <span className="font-semibold text-slate-500">目前版本：</span>
                <span className="font-bold text-slate-800">{currentVersion}</span>
                <span className="font-semibold text-slate-500">可更新至：</span>
                <span className="font-bold text-emerald-700">{latestVersion}</span>
              </>
            ) : (
              <>
                <span className="font-semibold text-slate-500">目前版本：</span>
                <span className="font-bold text-emerald-700">{latestVersion}（最新版）</span>
              </>
            )}
            <span className="font-semibold text-slate-500">發布日期：</span>
            <span className="font-bold text-slate-800">{releaseDate}</span>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold text-slate-800">本次更新內容：</h3>
            <ul className="space-y-1 text-sm leading-relaxed text-slate-600">
              {releaseNotes.map((note) => (
                <li key={note} className="flex gap-2">
                  <span className="text-emerald-600">•</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>

          {isUpdateAvailable && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              更新會清除 App 暫存並重新載入頁面。已儲存的旅程、清單、記帳與附件資料不會被清除；如果現在有尚未儲存的資料，請先儲存後再更新，避免重新載入後遺失。
            </div>
          )}

          {isUpdateAvailable && updateError && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold leading-relaxed text-rose-800"
            >
              {updateError}
            </div>
          )}
        </div>

        <div
          className={`grid min-h-[68px] shrink-0 gap-2 border-t border-slate-100 bg-white px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] ${
            !isUpdateAvailable || isMandatoryUpdate ? "grid-cols-1" : "grid-cols-2"
          }`}
        >
          {isUpdateAvailable && !isMandatoryUpdate && (
            <button
              type="button"
              onClick={onDismiss}
              className="flex min-h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold leading-none text-slate-600 hover:bg-slate-50"
            >
              {secondaryActionLabel}
            </button>
          )}
          <button
            type="button"
            onClick={isUpdateAvailable ? onUpdate : onDismiss}
            disabled={isChecking}
            className="flex min-h-11 items-center justify-center rounded-lg bg-emerald-700 px-3 text-sm font-bold leading-none text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-70"
          >
            {isUpdateAvailable ? primaryActionLabel : "我知道了"}
          </button>
        </div>
      </div>
    </div>
  );
}
