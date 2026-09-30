import { useState } from "react";
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
  const [showIosHelp, setShowIosHelp] = useState(isIosStandalonePwa);
  const closeModal = () => {
    setShowIosHelp(isIosStandalonePwa);
    onClose();
  };

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
              <h2 className="text-base font-bold text-slate-900">使用 Google 登入</h2>
              <p className="text-xs text-slate-500">登入資訊與權限</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="關閉登入提示"
            title="關閉"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4 text-sm leading-relaxed text-slate-600">
          <p>只使用 Google Email 辨識帳號與行程權限。</p>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            不會讀取 Gmail、Drive、通訊錄或相簿。
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50">
            <button
              type="button"
              onClick={() => setShowIosHelp((visible) => !visible)}
              aria-expanded={showIosHelp}
              aria-controls="ios-login-help"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-bold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <span>iOS 登入遇到問題？</span>
              <span aria-hidden="true">{showIosHelp ? "−" : "＋"}</span>
            </button>
            {showIosHelp && (
              <div id="ios-login-help" className="border-t border-amber-200 px-3 py-2 text-xs leading-relaxed text-amber-800">
                驗證後若無法返回 App，請選「其他驗證方式」。需要 YouTube／Google App 確認時，改用 Safari 網頁版登入。
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-white p-3">
          <button
            type="button"
            onClick={closeModal}
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
