import { LogIn, ShieldCheck, X } from "lucide-react";

interface LoginSafetyModalProps {
  isOpen: boolean;
  isIosStandalonePwa?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function LoginSafetyModal({
  isOpen,
  isIosStandalonePwa = false,
  onClose,
  onConfirm,
}: LoginSafetyModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/40 px-4 py-4 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <ShieldCheck size={19} />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">登入安全提示</h2>
              <p className="text-xs text-slate-500">Travel Companion 會使用的登入資訊</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="關閉登入提示"
            title="關閉"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4 text-sm leading-relaxed text-slate-600">
          <p>
            登入後，系統只會使用你的 Google 帳號 Email 來辨識使用者與行程權限。
          </p>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            不會讀取 Gmail 信件、Google Drive 檔案、通訊錄、相簿或其他 Google 帳號內容。
          </div>
          {isIosStandalonePwa && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              若 Google 要求到 YouTube 或 Google App 確認身分，iOS 安裝版 App 可能無法接回登入流程。請在 Google 驗證頁選擇「其他驗證方式」，改用簡訊、驗證碼或 Authenticator 代碼；若必須用 YouTube / Google App 確認，請改用 Safari 網頁模式登入。
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-white p-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
          >
            <LogIn size={15} />
            {isIosStandalonePwa ? "開啟 Google 登入" : "繼續登入"}
          </button>
        </div>
      </div>
    </div>
  );
}
