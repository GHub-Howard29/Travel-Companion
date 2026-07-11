import {
  Camera,
  Download,
  Edit3,
  Paperclip,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { type Dispatch, type FormEvent, type SetStateAction } from "react";
import { SUPPORTED_CURRENCIES } from "../../constants/appConstants";
import { formatFileSize } from "../../utils/attachmentUtils";
import type { EditExpenseDraft, ExpenseItem } from "../../types";

interface ExpenseScreenProps {
  canUseExpense: boolean;
  isUsingSharedExpenseBook: boolean;
  userEmail: string | null;
  safeExpenses: ExpenseItem[];
  filteredExpenses: ExpenseItem[];
  availableCurrencies: Array<{ code: string; name: string; symbol: string }>;
  effectiveActiveCurrency: string;
  setActiveCurrency: (currency: string) => void;
  currentCurrencyCode: string;
  currentCurrencySymbol: string;
  expenseMembers: string[];
  totalExpense: number;
  averageExpense: number;
  paitAmounts: Record<string, number>;
  activeCurrencySymbol: string;
  attachmentSyncLabel: string;
  pendingAttachmentCount: number;
  hasUnsyncedLocalExpenseAttachments: boolean;
  isSyncingAttachments: boolean;
  newTitle: string;
  newAmount: string;
  newPayer: string;
  formCurrency: string;
  setNewTitle: Dispatch<SetStateAction<string>>;
  setNewAmount: Dispatch<SetStateAction<string>>;
  setNewPayer: Dispatch<SetStateAction<string>>;
  setFormCurrency: Dispatch<SetStateAction<string>>;
  newAttachmentFile: File | null;
  setNewAttachmentFile: Dispatch<SetStateAction<File | null>>;
  editAttachmentFile: File | null;
  setEditAttachmentFile: Dispatch<SetStateAction<File | null>>;
  removedAttachmentExpenseIds: string[];
  editingExpenseId: string | null;
  editDraft: EditExpenseDraft;
  setEditDraft: Dispatch<SetStateAction<EditExpenseDraft>>;
  pendingDeleteId: string | null;
  handleAddExpense: (event: FormEvent) => Promise<void>;
  handleSaveEditExpense: (id: string) => Promise<void>;
  handleDeleteExpense: (id: string) => void;
  handleOpenAttachment: (item: ExpenseItem) => Promise<void>;
  handleSyncAttachments: () => Promise<void>;
  handleExportXlsx: () => Promise<void>;
  handleAttachmentSelection: (
    file: File | undefined,
    setter: (file: File | null) => void,
  ) => Promise<void>;
  onStartEditExpense: (item: ExpenseItem) => void;
  onCancelEditExpense: () => void;
  onCancelPendingDelete: () => void;
  onRemoveEditAttachment: (id: string) => void;
  onRestoreEditAttachment: (id: string) => void;
}

export default function ExpenseScreen({
  canUseExpense,
  isUsingSharedExpenseBook,
  userEmail,
  safeExpenses,
  filteredExpenses,
  availableCurrencies,
  effectiveActiveCurrency,
  setActiveCurrency,
  currentCurrencyCode,
  currentCurrencySymbol,
  expenseMembers,
  totalExpense,
  averageExpense,
  paitAmounts,
  activeCurrencySymbol,
  attachmentSyncLabel,
  pendingAttachmentCount,
  hasUnsyncedLocalExpenseAttachments,
  isSyncingAttachments,
  newTitle,
  newAmount,
  newPayer,
  formCurrency,
  setNewTitle,
  setNewAmount,
  setNewPayer,
  setFormCurrency,
  newAttachmentFile,
  setNewAttachmentFile,
  editAttachmentFile,
  setEditAttachmentFile,
  removedAttachmentExpenseIds,
  editingExpenseId,
  editDraft,
  setEditDraft,
  pendingDeleteId,
  handleAddExpense,
  handleSaveEditExpense,
  handleDeleteExpense,
  handleOpenAttachment,
  handleSyncAttachments,
  handleExportXlsx,
  handleAttachmentSelection,
  onStartEditExpense,
  onCancelEditExpense,
  onCancelPendingDelete,
  onRemoveEditAttachment,
  onRestoreEditAttachment,
}: ExpenseScreenProps) {
  return (
    <div className="space-y-5">
      <div className="flex bg-slate-200/70 p-1 rounded-xl gap-1 shadow-inner">
        <button
          type="button"
          onClick={() => setActiveCurrency("ALL")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
            effectiveActiveCurrency === "ALL"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
          }`}
        >
          全部顯示
        </button>
        {availableCurrencies.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => setActiveCurrency(c.code)}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              effectiveActiveCurrency === c.code
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
            }`}
          >
            {c.name} ({c.code})
          </button>
        ))}
      </div>

      <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-5 rounded-2xl text-white shadow-md">
        <span className="text-xs text-amber-100 font-bold tracking-wider uppercase">
          {effectiveActiveCurrency === "ALL"
            ? "總明細預覽看板"
            : `雲端分流統計 (${effectiveActiveCurrency} 頁籤)`}
        </span>

        {effectiveActiveCurrency === "ALL" ? (
          <div>
            <h2 className="text-2xl font-black mt-1">
              {safeExpenses.length > 0
                ? "混合多幣別清單"
                : "目前尚無記帳資料"}
            </h2>
            <p className="text-xs text-amber-100/90 mt-1">
              {safeExpenses.length > 0
                ? "目前為混合檢視，下方可查閱各幣別的歷史明細項目。"
                : "新增第一筆旅費後，這裡會自動顯示可篩選的幣別。"}
            </p>
          </div>
        ) : (
          <>
            <h2 className="mt-1 min-w-0 break-words text-2xl font-black leading-tight [overflow-wrap:anywhere]">
              {activeCurrencySymbol} {totalExpense.toLocaleString()}
            </h2>
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/20 text-sm">
              <div className="min-w-0">
                <span className="text-amber-100/80 text-xs block">
                  {expenseMembers.length} 人平攤 (每人)
                </span>
                <span className="block min-w-0 break-words text-base font-bold leading-snug [overflow-wrap:anywhere]">
                  {activeCurrencySymbol} {averageExpense.toLocaleString()}
                </span>
              </div>
              <div className="min-w-0">
                <span className="text-amber-100/80 text-xs block">記帳筆數</span>
                <span className="block text-lg font-bold">
                  {filteredExpenses.length} 筆
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {effectiveActiveCurrency !== "ALL" ? (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider">
            {effectiveActiveCurrency} 分攤結算狀態
          </h3>
          <div className="space-y-3">
            {expenseMembers.map((member: string) => {
              const paid = paitAmounts[member] || 0;
              const status = paid - averageExpense;
              return (
                <div
                  key={member}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-3 p-2.5 rounded-lg bg-slate-50"
                >
                  <div className="min-w-0">
                    <span className="block break-words font-bold text-slate-700 [overflow-wrap:anywhere]">
                      {member}
                    </span>
                    <span className="block min-w-0 break-words text-xs text-slate-400 [overflow-wrap:anywhere]">
                      已墊：{activeCurrencySymbol}
                      {paid.toLocaleString()}
                    </span>
                  </div>
                  <div className="min-w-0 text-right">
                    {status > 0 ? (
                      <span className="inline-block max-w-full break-words rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold leading-snug text-emerald-600 [overflow-wrap:anywhere]">
                        應收回 {activeCurrencySymbol}
                        {status.toLocaleString()}
                      </span>
                    ) : status < 0 ? (
                      <span className="inline-block max-w-full break-words rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold leading-snug text-rose-600 [overflow-wrap:anywhere]">
                        應補繳 {activeCurrencySymbol}
                        {Math.abs(status).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-slate-500 bg-slate-200 px-2.5 py-1 rounded-full">
                        已平帳
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-center text-xs font-medium text-slate-500">
          💡 切換至單一幣別頁籤（如日圓、新台幣）即可查看該幣別的精確分攤結算。
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800">帳本匯出</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isUsingSharedExpenseBook
                ? "依目前清單與幣別篩選匯出 XLSX，附件欄位會顯示可點擊的下載連結"
                : "已儲存在此裝置的個人帳本，照片也只保存在本機。Excel 內會標註附件名稱，但不會產生雲端下載網址。"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleExportXlsx}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"
            >
              <Download size={14} /> XLSX
            </button>
          </div>
        </div>
        {canUseExpense && (
          <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-700">照片附件同步</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                  最後上傳：{attachmentSyncLabel}。照片會自動壓縮至 1MB 以內，建議在 Wi-Fi 環境下再上傳以節省流量。
                </p>
                {isUsingSharedExpenseBook && hasUnsyncedLocalExpenseAttachments && (
                  <p className="mt-1 text-[11px] font-semibold text-orange-700">
                    有離線新增的照片，請先連線讓帳目自動同步後，再按同步照片。
                  </p>
                )}
              </div>
              {isUsingSharedExpenseBook ? (
                <button
                  type="button"
                  onClick={handleSyncAttachments}
                  disabled={isSyncingAttachments || pendingAttachmentCount === 0}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white transition-colors ${
                    pendingAttachmentCount > 0
                      ? "bg-orange-600 hover:bg-orange-700"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  } disabled:cursor-not-allowed disabled:opacity-70`}
                >
                  <UploadCloud size={14} />
                  {isSyncingAttachments
                    ? "同步中..."
                    : pendingAttachmentCount > 0
                      ? `同步照片 ${pendingAttachmentCount}`
                      : "照片已同步"}
                </button>
              ) : (
                <span className="rounded-lg bg-sky-100 px-3 py-2 text-xs font-bold text-sky-800">
                  個人帳本照片僅存本機
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {canUseExpense ? (
        <form
          onSubmit={handleAddExpense}
          className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3"
        >
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-800">新增一筆旅費</h3>
            <span className="text-[11px] bg-slate-100 text-slate-600 font-extrabold px-2 py-0.5 rounded-full">
              獨立選擇新增幣別
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <input
              type="text"
              placeholder="消費項目"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50"
              required
            />

            <div className="flex gap-2">
              <select
                value={formCurrency}
                onChange={(e) => setFormCurrency(e.target.value)}
                className="px-2 py-2 border border-slate-200 rounded-lg text-sm bg-amber-50 font-bold text-amber-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="金額"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50"
                required
              />
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600 hover:border-amber-300 hover:bg-amber-50">
              <span className="inline-flex min-w-0 items-center gap-2">
                <Camera size={16} className="text-amber-600" />
                <span className="truncate">
                  {newAttachmentFile ? newAttachmentFile.name : "拍照 / 選擇照片附件"}
                </span>
              </span>
              <span className="shrink-0 text-[11px] font-bold text-slate-400">
                {newAttachmentFile
                  ? formatFileSize(newAttachmentFile.size)
                  : "自動壓縮 <= 1MB"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  void handleAttachmentSelection(file, setNewAttachmentFile);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {newAttachmentFile && (
              <button
                type="button"
                onClick={() => setNewAttachmentFile(null)}
                className="w-fit text-xs font-bold text-rose-500 hover:text-rose-700"
              >
                移除照片附件
              </button>
            )}
          </div>

          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-xs text-slate-500 font-medium">付款人：</span>
            <div className="flex gap-1.5 flex-wrap">
              {expenseMembers.map((m: string) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setNewPayer(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${newPayer === m || (!isUsingSharedExpenseBook && m === userEmail) ? "bg-amber-600 border-amber-600 text-white" : "bg-white border-slate-200 text-slate-600"}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              type="submit"
              className="ml-auto flex items-center gap-1 bg-slate-800 text-white font-bold text-xs px-3 py-2 rounded-lg"
            >
              <Plus size={14} /> 記帳
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-900 text-xs">
          <ShieldAlert size={18} className="text-amber-600 shrink-0" />
          <div>
            <p className="font-bold mb-0.5">此功能須先登入</p>
            <p className="text-amber-700/90 leading-relaxed">
              請先點選左側選單完成 Google 登入。登入後若不在核准名單內，系統會自動建立你的個人帳本。
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm divide-y divide-slate-100">
          {filteredExpenses.length > 0 ? (
            filteredExpenses.map((item) => {
              if (!item || !item.title) return null;

              const targetConfig = SUPPORTED_CURRENCIES.find(
                (c) => c.code === item.currency,
              );
              const itemSymbol = targetConfig
                ? targetConfig.symbol
                : currentCurrencySymbol;
              const itemCurrencyCode = item.currency || currentCurrencyCode;
              const isEditing = editingExpenseId === String(item.id);
              const isPendingDelete = pendingDeleteId === String(item.id);
              const hasAttachment = Boolean(
                item.local_attachment_id ||
                  item.attachment_path ||
                  item.attachment_name,
              );
              const isAttachmentMarkedForRemoval =
                removedAttachmentExpenseIds.includes(String(item.id));

              return (
                <div key={item.id} className="relative p-4">
                  {isEditing ? (
                    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                      <input
                        type="text"
                        value={editDraft.title}
                        onChange={(e) =>
                          setEditDraft((draft) => ({
                            ...draft,
                            title: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="消費項目"
                      />
                      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
                        <select
                          value={editDraft.currency}
                          onChange={(e) =>
                            setEditDraft((draft) => ({
                              ...draft,
                              currency: e.target.value,
                            }))
                          }
                          className="rounded-lg border border-amber-200 bg-white px-2 py-2 text-sm font-bold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        >
                          {SUPPORTED_CURRENCIES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code} ({c.symbol})
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={editDraft.amount}
                          onChange={(e) =>
                            setEditDraft((draft) => ({
                              ...draft,
                              amount: e.target.value,
                            }))
                          }
                          className="min-w-0 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          placeholder="金額"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-slate-500">
                          付款人：
                        </span>
                        {expenseMembers.map((m: string) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() =>
                              setEditDraft((draft) => ({
                                ...draft,
                                payer: m,
                              }))
                            }
                            className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${editDraft.payer === m || (!isUsingSharedExpenseBook && m === userEmail) ? "border-amber-600 bg-amber-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-amber-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-amber-50">
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <Camera size={16} className="text-amber-600" />
                          <span className="truncate">
                            {editAttachmentFile
                              ? editAttachmentFile.name
                              : isAttachmentMarkedForRemoval
                                ? "附件將於儲存後移除"
                              : item.attachment_name || "補拍 / 更換照片附件"}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] font-bold text-slate-400">
                          {editAttachmentFile
                            ? formatFileSize(editAttachmentFile.size)
                            : "自動壓縮 <= 1MB"}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              onRestoreEditAttachment(String(item.id));
                            }
                            void handleAttachmentSelection(
                              file,
                              setEditAttachmentFile,
                            );
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                      {hasAttachment &&
                        !editAttachmentFile &&
                        !isAttachmentMarkedForRemoval && (
                          <button
                            type="button"
                            onClick={() =>
                              onRemoveEditAttachment(String(item.id))
                            }
                            className="inline-flex w-fit items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 size={14} /> 移除既有附件
                          </button>
                        )}
                      {isAttachmentMarkedForRemoval && !editAttachmentFile && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          <span>已標記移除，按「儲存」後才會生效。</span>
                          <button
                            type="button"
                            onClick={() =>
                              onRestoreEditAttachment(String(item.id))
                            }
                            className="font-bold text-amber-900 underline-offset-2 hover:underline"
                          >
                            取消移除
                          </button>
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={onCancelEditExpense}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                        >
                          <X size={14} /> 取消
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSaveEditExpense(String(item.id))}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"
                        >
                          <Save size={14} /> 儲存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {hasAttachment ? (
                        <button
                          type="button"
                          onClick={() => void handleOpenAttachment(item)}
                          className="min-w-0 whitespace-pre-wrap break-words text-left text-sm font-bold leading-6 text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900 [overflow-wrap:anywhere]"
                        >
                          {item.title}
                        </button>
                      ) : (
                        <h4 className="min-w-0 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-950 [overflow-wrap:anywhere]">
                          {item.title}
                        </h4>
                      )}
                      {hasAttachment && (
                        <div className="flex min-w-0">
                          <span
                            className={`inline-flex max-w-full items-center gap-1 break-words rounded px-2 py-1 text-[11px] font-semibold leading-snug [overflow-wrap:anywhere] ${
                              item.attachment_status === "synced"
                                ? "bg-emerald-50 text-emerald-700"
                                : item.attachment_status === "upload_failed"
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-orange-50 text-orange-700"
                            }`}
                          >
                            <Paperclip size={12} />
                            {item.attachment_status === "synced"
                              ? "照片已同步"
                              : item.attachment_status === "upload_failed"
                                ? "照片同步失敗"
                                : isUsingSharedExpenseBook
                                  ? `照片待同步${item.attachment_name ? `：${item.attachment_name}` : ""}`
                                  : "照片僅存本機"}
                          </span>
                        </div>
                      )}
                      <div className="flex min-w-0">
                        <span className="max-w-full break-words rounded bg-sky-50 px-2 py-1 text-[11px] font-semibold leading-snug text-sky-800 [overflow-wrap:anywhere]">
                          支出人：{item.payer || "未知"}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-100 px-2 py-1 font-mono text-[10px] font-bold text-slate-500">
                          {itemCurrencyCode}
                        </span>
                        <span className="rounded bg-amber-50 px-2 py-1 font-mono text-[10px] font-bold text-amber-800">
                          {itemSymbol}
                        </span>
                        <span className="min-w-0 max-w-full break-words font-mono text-sm font-black leading-6 text-slate-950 [overflow-wrap:anywhere]">
                          {(item.amount || 0).toLocaleString()}
                        </span>
                      </div>
                      {canUseExpense && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            title="編輯這筆帳目"
                            onClick={() => onStartEditExpense(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                          >
                            <Edit3 size={14} /> 編輯
                          </button>
                          <button
                            type="button"
                            title="刪除這筆帳目"
                            onClick={() => handleDeleteExpense(String(item.id))}
                            className={`inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-bold transition-colors ${
                              isPendingDelete
                                ? "border-rose-300 bg-rose-50 text-rose-600"
                                : "border-rose-100 text-rose-300 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                            }`}
                          >
                            <Trash2 size={14} /> 刪除
                          </button>
                        </div>
                      )}
                      {isPendingDelete && (
                        <div className="w-full max-w-[18rem] rounded-xl border border-rose-200 bg-white p-3 text-left shadow-lg">
                          <p className="text-xs font-semibold leading-relaxed text-rose-700">
                            確定要刪除這筆帳目嗎？3 秒內未選擇將自動取消。
                          </p>
                          <div className="mt-3 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={onCancelPendingDelete}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                            >
                              復原
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteExpense(String(item.id))}
                              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700"
                            >
                              <Trash2 size={14} /> 確認刪除
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-slate-400 text-xs">
              {safeExpenses.length === 0
                ? "目前尚無記帳資料"
                : "目前尚無此分類下的記帳資料。"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
