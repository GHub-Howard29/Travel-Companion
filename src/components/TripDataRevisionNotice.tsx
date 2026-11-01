import { AlertTriangle, Check, Eye, RefreshCw } from "lucide-react";
import type { TripDataNoticeKind } from "../hooks/useTripDataRevision";

interface TripDataRevisionNoticeProps {
  kind: TripDataNoticeKind | null;
  isOnline: boolean;
  onPreviewChanges: () => void;
  onConfirm: () => void;
  onReload: () => void;
}

const criticalCopy: Record<"revoked" | "conflict", {
  title: string;
  body: string;
}> = {
  revoked: {
    title: "本行程編輯權限已變更",
    body: "你的本行程編輯權限已被其他裝置移除。App 已清除本行程尚未同步的共用資料；私人資料會保留。請重新載入以套用最新權限。",
  },
  conflict: {
    title: "行程資料已在其他裝置更新",
    body: "目前畫面不是最新版本，本次尚未儲存的修改不會保留。若多人同時編輯，請先協調由一人完成修改，再重新載入最新資料後操作。",
  },
};

export const TripDataRevisionNotice = ({
  kind,
  isOnline,
  onPreviewChanges,
  onConfirm,
  onReload,
}: TripDataRevisionNoticeProps) => {
  if (!kind) return null;

  if (kind === "revoked" || kind === "conflict") {
    const copy = criticalCopy[kind];
    return (
      <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 sm:items-center">
        <section
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="trip-data-revision-critical-title"
          className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
        >
          <div className="flex items-start gap-3">
            <span className="rounded-full bg-rose-100 p-2 text-rose-700">
              <AlertTriangle size={20} />
            </span>
            <div>
              <h2 id="trip-data-revision-critical-title" className="text-lg font-bold text-slate-900">
                {copy.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{copy.body}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onReload}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800"
          >
            <RefreshCw size={16} />
            {kind === "conflict" ? "確認衝突並重新載入" : "重新載入以套用最新權限"}
          </button>
        </section>
      </div>
    );
  }

  return (
    <section className="mx-auto mt-3 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-bold">行程資料已有更新</p>
      <p className="mt-1 leading-6 text-amber-800">
        {isOnline
          ? "其他裝置已更新雲端行程資料。"
          : "目前沒有網路連線；恢復連線後會自動檢查並同步資料。"}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPreviewChanges}
          disabled={!isOnline}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Eye size={14} />
          預覽變更
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!isOnline}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-900 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check size={14} />
          確認
        </button>
      </div>
    </section>
  );
};
