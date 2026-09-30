import { useState, type FormEvent } from "react";

interface PersonalExpenseAliasModalProps {
  email: string;
  currentAlias: string | null;
  isRequired: boolean;
  onClose: () => void;
  onSave: (alias: string) => void;
}

export function PersonalExpenseAliasModal({
  email,
  currentAlias,
  isRequired,
  onClose,
  onSave,
}: PersonalExpenseAliasModalProps) {
  const [alias, setAlias] = useState(currentAlias ?? "");
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextAlias = alias.trim();
    if (!nextAlias) {
      setError("請輸入帳本代號。");
      return;
    }
    if (nextAlias.length > 40) {
      setError("帳本代號請控制在 40 個字元以內。");
      return;
    }

    onSave(nextAlias);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"
      role="presentation"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="personal-expense-alias-title"
      >
        <h2 id="personal-expense-alias-title" className="text-lg font-bold text-slate-900">
          {isRequired ? "設定個人帳本代號" : "修改個人帳本代號"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          代號只存在此裝置，用於個人帳本的付款人名稱。
        </p>

        <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
          登入帳號：<span className="font-medium text-slate-700">{email}</span>
        </div>

        <label className="mt-4 block text-sm font-bold text-slate-700">
          帳本代號
          <input
            autoFocus
            type="text"
            value={alias}
            maxLength={40}
            onChange={(event) => {
              setAlias(event.target.value);
              setError("");
            }}
            placeholder="例如：test1、Howard"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </label>

        {error && (
          <p className="mt-2 text-xs font-semibold text-rose-600" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          {!isRequired && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
          )}
          <button
            type="submit"
            className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
          >
            儲存代號
          </button>
        </div>
      </form>
    </div>
  );
}
