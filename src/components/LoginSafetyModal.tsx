import { useState, type FormEvent } from "react";
import { LogIn, ShieldCheck, X } from "lucide-react";

interface LoginSafetyModalProps {
  isOpen: boolean;
  isIosStandalonePwa?: boolean;
  isLocalTestLoginEnabled?: boolean;
  onLocalTestLogin?: (email: string, password: string) => Promise<void>;
  onLocalTestSignUp?: (email: string, password: string) => Promise<void>;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function LoginSafetyModal({
  isOpen,
  isIosStandalonePwa = false,
  isLocalTestLoginEnabled = false,
  onLocalTestLogin,
  onLocalTestSignUp,
  onClose,
  onConfirm,
}: LoginSafetyModalProps) {
  const [showIosHelp, setShowIosHelp] = useState(isIosStandalonePwa);
  const [localTestEmail, setLocalTestEmail] = useState("");
  const [localTestPassword, setLocalTestPassword] = useState("");
  const [localTestError, setLocalTestError] = useState("");
  const [isLocalTestSubmitting, setIsLocalTestSubmitting] = useState(false);
  const closeModal = () => {
    setShowIosHelp(isIosStandalonePwa);
    setLocalTestPassword("");
    setLocalTestError("");
    onClose();
  };

  const submitLocalTestLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isLocalTestLoginEnabled || !onLocalTestLogin || isLocalTestSubmitting) return;
    setLocalTestError("");
    setIsLocalTestSubmitting(true);
    void onLocalTestLogin(localTestEmail.trim(), localTestPassword)
      .catch((error: unknown) => {
        setLocalTestError(error instanceof Error ? error.message : "本機測試登入失敗。");
      })
      .finally(() => setIsLocalTestSubmitting(false));
  };

  const submitLocalTestSignUp = () => {
    if (!isLocalTestLoginEnabled || !onLocalTestSignUp || isLocalTestSubmitting) return;
    setLocalTestError("");
    setIsLocalTestSubmitting(true);
    void onLocalTestSignUp(localTestEmail.trim(), localTestPassword)
      .catch((error: unknown) => {
        setLocalTestError(error instanceof Error ? error.message : "建立本機測試帳號失敗。");
      })
      .finally(() => setIsLocalTestSubmitting(false));
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

        {isLocalTestLoginEnabled && onLocalTestLogin && (
          <form onSubmit={submitLocalTestLogin} className="space-y-3 border-t border-dashed border-slate-200 bg-slate-50 px-4 py-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">本機測試登入</h3>
              <p className="mt-1 text-xs text-slate-500">僅連線 localhost Supabase，不使用正式 Google OAuth。</p>
            </div>
            <label className="block text-xs font-semibold text-slate-600">
              測試帳號 Email
              <input
                type="email"
                autoComplete="username"
                required
                value={localTestEmail}
                onChange={(event) => setLocalTestEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              測試密碼
              <input
                type="password"
                autoComplete="current-password"
                required
                value={localTestPassword}
                onChange={(event) => setLocalTestPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            {localTestError && <p role="alert" className="text-xs text-red-700">{localTestError}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="submit"
                disabled={isLocalTestSubmitting}
                className="rounded-lg bg-emerald-700 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
              >
                {isLocalTestSubmitting ? "處理中…" : "登入測試帳號"}
              </button>
              <button
                type="button"
                disabled={isLocalTestSubmitting}
                onClick={submitLocalTestSignUp}
                className="rounded-lg border border-emerald-700 bg-white px-3 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
              >
                建立測試帳號
              </button>
            </div>
          </form>
        )}

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
