import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, Copy, Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { usePrivateChecklistState } from "../hooks/usePrivateChecklistState";
import { listCloudPrivateChecklistCopies } from "../services/privateChecklistCloudService";
import type { PrivateChecklist, TripMeta } from "../types";

interface PrivateChecklistPageProps {
  tripId: string;
  userEmail: string | null;
  supabase: SupabaseClient;
  canViewPrivateChecklist: boolean;
  canEditPrivateChecklist: boolean;
  canTogglePrivateChecklist: boolean;
  canSyncPrivateChecklist: boolean;
  tripOptions: TripMeta[];
}

export const PrivateChecklistPage = ({
  tripId,
  userEmail,
  supabase,
  canViewPrivateChecklist,
  canEditPrivateChecklist,
  canTogglePrivateChecklist,
  canSyncPrivateChecklist,
  tripOptions,
}: PrivateChecklistPageProps) => {
  const {
    items,
    syncStatus,
    syncError,
    addItem,
    toggleItem,
    renameItem,
    removeItem,
    replaceItems,
  } = usePrivateChecklistState(
    tripId,
    userEmail,
    supabase,
    canSyncPrivateChecklist,
  );
  const [isManageMode, setIsManageMode] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [copySources, setCopySources] = useState<PrivateChecklist[]>([]);
  const [isCopyOpen, setIsCopyOpen] = useState(false);
  const [copySourceTripId, setCopySourceTripId] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const checkedCount = items.filter((item) => item.isChecked).length;
  const progressPercent =
    items.length > 0 ? (checkedCount / items.length) * 100 : 0;
  const availableCopySources = copySources.filter(
    (source) => source.tripId !== tripId && source.items.length > 0,
  );
  const selectedCopySource =
    availableCopySources.find((source) => source.tripId === copySourceTripId) ??
    availableCopySources[0];
  const getTripTitle = (sourceTripId: string): string => {
    const trip = tripOptions.find((option) => option.id === sourceTripId);
    return trip ? `${trip.title} (${trip.departureDate})` : sourceTripId;
  };

  useEffect(() => {
    if (!userEmail || !canSyncPrivateChecklist) {
      return;
    }

    let isActive = true;

    const loadSources = async () => {
      try {
        const sources = await listCloudPrivateChecklistCopies(supabase, userEmail);

        if (isActive) {
          setCopySources(sources);
        }
      } catch (error) {
        console.warn(error);
      }
    };

    void loadSources();

    return () => {
      isActive = false;
    };
  }, [canSyncPrivateChecklist, supabase, userEmail]);

  if (!canViewPrivateChecklist || !userEmail) {
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

  const closeManageMode = () => {
    setIsManageMode(false);
    setIsCopyOpen(false);
    setNewLabel("");
    cancelEdit();
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

  const copyPrivateChecklist = () => {
    if (!selectedCopySource) return;

    replaceItems(selectedCopySource.items.map((item) => item.label));
    setIsCopyOpen(false);
  };

  const handleEditKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveEdit();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
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
          {!canSyncPrivateChecklist && "目前資料僅保存於此裝置。"}
          {canSyncPrivateChecklist && syncStatus === "syncing" && "正在同步雲端..."}
          {canSyncPrivateChecklist && syncStatus === "synced" && "已同步到雲端。"}
          {canSyncPrivateChecklist &&
            syncStatus === "emptyCloud" &&
            "雲端私人清單已準備好，新增項目後會同步。"}
          {canSyncPrivateChecklist && syncStatus === "error" && syncError}
          {canSyncPrivateChecklist && syncStatus === "local" && "目前資料先保存於本機。"}
        </p>
        {canEditPrivateChecklist && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={isManageMode ? closeManageMode : () => setIsManageMode(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              {isManageMode ? <X size={14} /> : <Pencil size={14} />}
              {isManageMode ? "退出" : "管理"}
            </button>
          </div>
        )}
      </div>

      {canEditPrivateChecklist && isManageMode && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">私人清單管理</h3>
            <button
              type="button"
              onClick={closeManageMode}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="退出"
              title="退出"
            >
              <X size={15} />
            </button>
          </div>
          <div className="space-y-3">
            <p className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900">
              如需複製使用舊有清單，請勿提早建立任何清單
            </p>
            {availableCopySources.length === 0 && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                未有私人歷史紀錄，請重新建立
              </p>
            )}
            <form onSubmit={handleCreate} className="space-y-2">
              <input
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-rose-500"
                placeholder="新增私人準備事項"
              />
              <button
                type="submit"
                disabled={!newLabel.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Plus size={16} />
                新增項目
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                setCopySourceTripId(selectedCopySource?.tripId ?? "");
                setIsCopyOpen(true);
              }}
              disabled={availableCopySources.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Copy size={14} />
              複製清單
            </button>
          </div>
        </div>
      )}

      {canEditPrivateChecklist && isManageMode && isCopyOpen && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">複製私人清單</h3>
            <button
              type="button"
              onClick={() => setIsCopyOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="關閉"
              title="關閉"
            >
              <X size={15} />
            </button>
          </div>
          <div className="space-y-3">
            <select
              value={selectedCopySource?.tripId ?? ""}
              onChange={(event) => setCopySourceTripId(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-rose-500"
            >
              {availableCopySources.map((source) => (
                <option key={source.tripId} value={source.tripId}>
                  {getTripTitle(source.tripId)}
                </option>
              ))}
            </select>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-3">
              {selectedCopySource?.items.map((item) => (
                <div key={item.id} className="text-sm text-slate-700">
                  {item.label}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={copyPrivateChecklist}
              disabled={!selectedCopySource}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Copy size={16} />
              複製到目前旅程
            </button>
          </div>
        </div>
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
              <div key={item.id} className="flex items-start gap-3 p-4">
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
                    onKeyDown={handleEditKeyDown}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-rose-500"
                  />
                ) : (
                  <span
                    className={`min-w-0 flex-1 break-words text-sm font-medium leading-relaxed transition-all ${
                      item.isChecked
                        ? "text-slate-400 line-through"
                        : "text-slate-700"
                    }`}
                  >
                    {item.label}
                  </span>
                )}

                {canEditPrivateChecklist && isManageMode && (
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
