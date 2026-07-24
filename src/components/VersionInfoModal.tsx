/**
 * 版本資訊彈窗
 *
 * 顯示目前 App 版本、發布日期、更新內容與版本歷史。
 * 只負責呈現資訊，不處理 Service Worker 更新流程。
 */
import { History, X } from "lucide-react";

import { VERSION_HISTORY } from "../config/versionHistory";

type VersionInfoModalProps = {
  isOpen: boolean;
  currentVersion: string;
  releaseDate: string;
  releaseNotes: string[];
  forceUpdate: boolean;
  onClose: () => void;
};

export function VersionInfoModal({
  isOpen,
  currentVersion,
  releaseDate,
  releaseNotes,
  forceUpdate,
  onClose,
}: VersionInfoModalProps) {
  if (!isOpen) return null;

  const historyItems = VERSION_HISTORY.filter(
    (item) => item.version !== currentVersion,
  );

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 px-4 sm:items-center">
      <div className="max-h-[86vh] w-full max-w-md overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-2xl sm:rounded-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <History size={17} />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">版本資訊</h2>
              <p className="text-xs text-slate-500">Travel Companion v{currentVersion}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉版本資訊"
            title="關閉"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[calc(86vh-60px)] overflow-y-auto px-4 py-4">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
            <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 text-sm">
              <span className="font-semibold text-emerald-700">目前版本：</span>
              <span className="font-bold text-slate-900">{currentVersion}</span>
              <span className="font-semibold text-emerald-700">發布日期：</span>
              <span className="font-bold text-slate-900">{releaseDate}</span>
              <span className="font-semibold text-emerald-700">更新方式：</span>
              <span className="font-bold text-slate-900">
                {forceUpdate ? "重大更新" : "一般更新"}
              </span>
            </div>
          </div>

          <section className="mt-4">
            <h3 className="mb-2 text-sm font-bold text-slate-800">本次更新內容</h3>
            <ul className="space-y-1 text-sm leading-relaxed text-slate-600">
              {releaseNotes.map((note) => (
                <li key={note} className="flex gap-2">
                  <span className="text-emerald-600">•</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-5">
            <h3 className="mb-2 text-sm font-bold text-slate-800">版本歷史</h3>
            <div className="space-y-3">
              {historyItems.map((item) => (
                <article
                  key={item.version}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">v{item.version}</h4>
                      <p className="text-xs text-slate-400">{item.date}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {item.forceUpdate ? "重大更新" : "一般更新"}
                    </span>
                  </div>
                  <ul className="space-y-1 text-xs leading-relaxed text-slate-600">
                    {item.notes.map((note) => (
                      <li key={note} className="flex gap-2">
                        <span className="text-slate-400">•</span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
