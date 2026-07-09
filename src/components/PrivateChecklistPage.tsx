import { useState, type FormEvent } from "react";
import { Check, Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { usePrivateChecklistState } from "../hooks/usePrivateChecklistState";

interface PrivateChecklistPageProps {
  tripId: string;
  userId: string | null;
  canViewPrivateChecklist: boolean;
  canEditPrivateChecklist: boolean;
  canTogglePrivateChecklist: boolean;
  canSyncPrivateChecklist: boolean;
}

export const PrivateChecklistPage = ({
  tripId,
  userId,
  canViewPrivateChecklist,
  canEditPrivateChecklist,
  canTogglePrivateChecklist,
  canSyncPrivateChecklist,
}: PrivateChecklistPageProps) => {
  const safeUserId = userId ?? "";
  const { items, addItem, toggleItem, renameItem, removeItem } =
    usePrivateChecklistState(tripId, safeUserId);
  const [newLabel, setNewLabel] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const checkedCount = items.filter((item) => item.isChecked).length;
  const progressPercent =
    items.length > 0 ? (checkedCount / items.length) * 100 : 0;

  if (!canViewPrivateChecklist || !userId) {
    return (
      <div className="text-center py-12 text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl shadow-sm">
        私人確認清單需先登入後才能使用。
      </div>
    );
  }

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();

    const label = newLabel.trim();
    if (!label || !canEditPrivateChecklist) {
      return;
    }

    addItem(label);
    setNewLabel("");
  };

  const startEdit = (itemId: string, label: string) => {
    setEditingItemId(itemId);
    setEditingLabel(label);
  };

  const cancelEdit = () => {
    setEditingItemId(null);
    setEditingLabel("");
  };

  const saveEdit = () => {
    const label = editingLabel.trim();

    if (!editingItemId || !label || !canEditPrivateChecklist) {
      return;
    }

    renameItem(editingItemId, label);
    cancelEdit();
  };

  return (
    <section className="space-y-5">
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
        <div className="flex justify-between items-center mb-2 text-sm font-bold text-slate-700">
          <span>私人準備進度</span>
          <span className="text-rose-700">
            {Math.round(progressPercent)}% ({checkedCount}/{items.length})
          </span>
        </div>
        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-rose-600 h-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">
          {canSyncPrivateChecklist
            ? "雲端同步權限已開啟；目前資料先保存於本機，待雲端同步資料表接上。"
            : "目前資料僅保存於此裝置。"}
        </p>
      </div>

      {canEditPrivateChecklist && (
        <form
          onSubmit={handleCreate}
          className="flex gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <input
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-rose-500"
            placeholder="新增私人準備事項"
          />
          <button
            type="submit"
            disabled={!newLabel.trim()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            aria-label="新增"
            title="新增"
          >
            <Plus size={18} />
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl shadow-sm">
          尚未建立私人確認清單。
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden divide-y divide-slate-100">
          {items.map((item) => {
            const isEditing = editingItemId === item.id;

            return (
              <div key={item.id} className="flex items-center gap-3 p-4">
                <button
                  type="button"
                  disabled={!canTogglePrivateChecklist || isEditing}
                  onClick={() => toggleItem(item.id)}
                  className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center transition-all ${
                    item.isChecked
                      ? "bg-rose-600 border-rose-600 text-white shadow-sm"
                      : "border-slate-300 bg-white"
                  } ${
                    canTogglePrivateChecklist && !isEditing
                      ? "cursor-pointer"
                      : "cursor-not-allowed"
                  }`}
                  aria-label={item.isChecked ? "取消勾選" : "勾選"}
                  title={item.isChecked ? "取消勾選" : "勾選"}
                >
                  {item.isChecked && <Check size={14} strokeWidth={3} />}
                </button>

                {isEditing ? (
                  <input
                    value={editingLabel}
                    onChange={(event) => setEditingLabel(event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-rose-500"
                  />
                ) : (
                  <span
                    className={`min-w-0 flex-1 text-sm font-medium transition-all ${
                      item.isChecked
                        ? "text-slate-400 line-through"
                        : "text-slate-700"
                    }`}
                  >
                    {item.label}
                  </span>
                )}

                {canEditPrivateChecklist && (
                  <div className="flex shrink-0 gap-1">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={!editingLabel.trim()}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:text-slate-300"
                          aria-label="儲存"
                          title="儲存"
                        >
                          <Save size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          aria-label="取消"
                          title="取消"
                        >
                          <X size={15} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(item.id, item.label)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          aria-label="編輯"
                          title="編輯"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                          aria-label="刪除"
                          title="刪除"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
