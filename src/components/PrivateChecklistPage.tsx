import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowDown, ArrowUp, Check, Copy, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { usePrivateChecklistState } from "../hooks/usePrivateChecklistState";
import { listCloudPrivateChecklistCopies } from "../services/privateChecklistCloudService";
import { readStoredPrivateChecklist } from "../storage/privateChecklistStorage";
import { SortableCard } from "./SortableCard";
import type { PrivateChecklist, TripMeta } from "../types";

interface PrivateChecklistPageProps {
  tripId: string;
  userEmail: string | null;
  supabase: SupabaseClient;
  canViewPrivateChecklist: boolean;
  canEditPrivateChecklist: boolean;
  canTogglePrivateChecklist: boolean;
  canSyncPrivateChecklist: boolean;
  isOnline: boolean;
  isHistoricalOfflineReadOnly: boolean;
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
  isOnline,
  isHistoricalOfflineReadOnly,
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
    reorderItems,
    flushPendingReorder,
  } = usePrivateChecklistState(
    tripId,
    userEmail,
    supabase,
    canSyncPrivateChecklist,
    isOnline,
  );
  const [isManageMode, setIsManageMode] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [copySources, setCopySources] = useState<PrivateChecklist[]>([]);
  const [copySourceLoadStatus, setCopySourceLoadStatus] = useState<
    "idle" | "loaded" | "error"
  >("idle");
  const [copySourceRetryKey, setCopySourceRetryKey] = useState(0);
  const [isCopyOpen, setIsCopyOpen] = useState(false);
  const [copySourceTripId, setCopySourceTripId] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [isDeleteLocked, setIsDeleteLocked] = useState(false);
  const deleteUnlockTimerRef = useRef<number | null>(null);
  const editCancelledRef = useRef(false);
  const checkedCount = items.filter((item) => item.isChecked).length;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const displayItems = [...items].sort(
    (left, right) => Number(left.isChecked) - Number(right.isChecked),
  );
  const progressPercent =
    items.length > 0 ? (checkedCount / items.length) * 100 : 0;
  const normalizedUserEmail = userEmail?.trim().toLowerCase() ?? "";
  const storedCopySources = normalizedUserEmail
    ? tripOptions
        .map((trip) => readStoredPrivateChecklist(trip.id, normalizedUserEmail))
        .filter((checklist) => checklist.items.length > 0)
    : [];
  const effectiveCopySources = isOnline ? copySources : storedCopySources;
  const availableCopySources = effectiveCopySources.filter(
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
    if (!userEmail || !canSyncPrivateChecklist || !isOnline) {
      return;
    }

    let isActive = true;

    const loadSources = async () => {
      try {
        const sources = await listCloudPrivateChecklistCopies(supabase, userEmail);

        if (isActive) {
          setCopySources(sources);
          setCopySourceLoadStatus("loaded");
        }
      } catch (error) {
        console.warn(error);
        if (isActive) {
          setCopySourceLoadStatus("error");
        }
      }
    };

    void loadSources();

    return () => {
      isActive = false;
    };
  }, [canSyncPrivateChecklist, copySourceRetryKey, isOnline, supabase, userEmail]);

  useEffect(() => {
    if (copySourceLoadStatus !== "error") return;

    const retryWhenAvailable = () => {
      if (!navigator.onLine) return;
      setCopySourceLoadStatus("idle");
      setCopySourceRetryKey((retryKey) => retryKey + 1);
    };
    const retryWhenVisible = () => {
      if (document.visibilityState === "visible") {
        retryWhenAvailable();
      }
    };

    window.addEventListener("online", retryWhenAvailable);
    window.addEventListener("focus", retryWhenAvailable);
    document.addEventListener("visibilitychange", retryWhenVisible);
    return () => {
      window.removeEventListener("online", retryWhenAvailable);
      window.removeEventListener("focus", retryWhenAvailable);
      document.removeEventListener("visibilitychange", retryWhenVisible);
    };
  }, [copySourceLoadStatus]);

  useEffect(() => () => {
    if (deleteUnlockTimerRef.current !== null) {
      window.clearTimeout(deleteUnlockTimerRef.current);
    }
  }, []);

  const retryCopySourceLoad = () => {
    setCopySourceLoadStatus("idle");
    setCopySourceRetryKey((retryKey) => retryKey + 1);
  };

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
    setIsFormOpen(false);
  };

  const closeManageMode = () => {
    void flushPendingReorder();
    setIsManageMode(false);
    setIsFormOpen(false);
    setIsCopyOpen(false);
    setNewLabel("");
    cancelEdit();
  };

  const startEdit = (itemId: string, label: string) => {
    editCancelledRef.current = false;
    setEditingItemId(itemId);
    setEditingLabel(label);
  };

  const startCreateItem = () => {
    setNewLabel("");
    setIsCopyOpen(false);
    setIsFormOpen(true);
  };

  const cancelEdit = () => {
    editCancelledRef.current = true;
    setEditingItemId(null);
    setEditingLabel("");
  };

  const saveEdit = () => {
    if (editCancelledRef.current) {
      editCancelledRef.current = false;
      return;
    }
    const label = editingLabel.trim();

    if (!editingItemId || !label || !canEditPrivateChecklist) {
      return;
    }

    renameItem(editingItemId, label);
    cancelEdit();
  };

  const deleteItem = (itemId: string) => {
    if (isDeleteLocked) return;

    setIsDeleteLocked(true);
    removeItem(itemId);
    if (deleteUnlockTimerRef.current !== null) {
      window.clearTimeout(deleteUnlockTimerRef.current);
    }
    deleteUnlockTimerRef.current = window.setTimeout(() => {
      setIsDeleteLocked(false);
      deleteUnlockTimerRef.current = null;
    }, 1000);
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

  const moveItem = (itemId: string, direction: -1 | 1) => {
    const currentIndex = displayItems.findIndex((item) => item.id === itemId);
    const currentItem = displayItems[currentIndex];
    const targetItem = displayItems[currentIndex + direction];
    if (!currentItem || !targetItem || currentItem.isChecked !== targetItem.isChecked) {
      return;
    }

    const nextItems = [...displayItems];
    [nextItems[currentIndex], nextItems[currentIndex + direction]] = [
      nextItems[currentIndex + direction],
      nextItems[currentIndex],
    ];
    reorderItems(nextItems);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const currentIndex = displayItems.findIndex((item) => item.id === active.id);
    const targetIndex = displayItems.findIndex((item) => item.id === over.id);
    if (currentIndex < 0 || targetIndex < 0 || displayItems[currentIndex].isChecked !== displayItems[targetIndex].isChecked) return;
    reorderItems(arrayMove(displayItems, currentIndex, targetIndex));
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
          {isHistoricalOfflineReadOnly &&
            "目前屬於離線狀態，無法更新及管理清單，請在網路連線後嘗試同步更新索取最新狀態"}
          {!isHistoricalOfflineReadOnly &&
            !canSyncPrivateChecklist &&
            "目前資料僅保存於此裝置。"}
          {!isHistoricalOfflineReadOnly &&
            canSyncPrivateChecklist &&
            !isOnline &&
            "目前為離線狀態，資料先保存於本機；恢復連線後才會完整同步更新。"}
          {!isHistoricalOfflineReadOnly &&
            canSyncPrivateChecklist &&
            isOnline &&
            syncStatus === "syncing" &&
            "正在同步雲端..."}
          {!isHistoricalOfflineReadOnly &&
            canSyncPrivateChecklist &&
            isOnline &&
            syncStatus === "synced" &&
            "已同步到雲端。"}
          {!isHistoricalOfflineReadOnly &&
            canSyncPrivateChecklist &&
            isOnline &&
            syncStatus === "emptyCloud" &&
            "雲端私人清單已準備好，新增項目後會同步。"}
          {!isHistoricalOfflineReadOnly &&
            canSyncPrivateChecklist &&
            isOnline &&
            syncStatus === "error" &&
            syncError}
          {!isHistoricalOfflineReadOnly &&
            canSyncPrivateChecklist &&
            isOnline &&
            syncStatus === "local" &&
            "目前資料先保存於本機。"}
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
            {canSyncPrivateChecklist && (
              <p className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900">
                如需複製使用舊有清單，請勿提早建立任何清單
              </p>
            )}
            {canSyncPrivateChecklist && !isOnline && (
              <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700">
                目前為離線狀態，私人歷史清單須連線後才能複製；請恢復連線後再使用複製清單。
              </p>
            )}
            {canSyncPrivateChecklist && copySourceLoadStatus === "idle" && isOnline && availableCopySources.length === 0 && (
              <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700">
                正在載入私人歷史清單...
              </p>
            )}
            {canSyncPrivateChecklist && isOnline && copySourceLoadStatus === "error" && availableCopySources.length === 0 && (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 sm:flex-row sm:items-center sm:justify-between">
                <span>私人歷史清單載入失敗</span>
                <button
                  type="button"
                  onClick={retryCopySourceLoad}
                  className="w-full shrink-0 rounded-md border border-amber-400 bg-white px-2 py-1 text-amber-800 hover:bg-amber-100 sm:w-auto"
                >
                  重新載入
                </button>
              </div>
            )}
            {canSyncPrivateChecklist && isOnline && copySourceLoadStatus === "loaded" && availableCopySources.length === 0 && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                未有私人歷史紀錄，請重新建立
              </p>
            )}
            <div className={`grid gap-2 ${canSyncPrivateChecklist ? "grid-cols-2" : "grid-cols-1"}`}>
              <button
                type="button"
                onClick={startCreateItem}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                <Plus size={14} />
                新增項目
              </button>
              {canSyncPrivateChecklist && <button
                type="button"
                onClick={() => {
                  setCopySourceTripId(selectedCopySource?.tripId ?? "");
                  setIsFormOpen(false);
                  setIsCopyOpen(true);
                }}
                disabled={!isOnline || availableCopySources.length === 0}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy size={14} />
                複製清單
              </button>}
            </div>
          </div>
        </div>
      )}

      {canEditPrivateChecklist && isManageMode && isFormOpen && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">新增私人清單項目</h3>
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setNewLabel("");
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="取消"
              title="取消"
            >
              <X size={15} />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-2">
            <input
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-rose-500"
              placeholder="新增私人準備事項"
              autoFocus
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
        </div>
      )}

      {canEditPrivateChecklist && isManageMode && isCopyOpen && isOnline && (
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
              disabled={!isOnline || !selectedCopySource}
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
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={displayItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden divide-y divide-slate-100">
          {displayItems.map((item, itemIndex) => {
            const isEditing = editingItemId === item.id;
            const previousItem = displayItems[itemIndex - 1];
            const nextItem = displayItems[itemIndex + 1];

            return (
              <SortableCard id={item.id} disabled={!canEditPrivateChecklist || !isManageMode || isEditing}>
              {(dragHandle) => <div className="flex items-start gap-3 p-4">
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
                    onBlur={saveEdit}
                    autoFocus
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
                    {dragHandle}
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
                          onMouseDown={(event) => event.preventDefault()}
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
                          disabled={!previousItem || previousItem.isChecked !== item.isChecked}
                          onClick={() => moveItem(item.id, -1)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30"
                          aria-label="上移項目"
                          title="上移"
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          type="button"
                          disabled={!nextItem || nextItem.isChecked !== item.isChecked}
                          onClick={() => moveItem(item.id, 1)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30"
                          aria-label="下移項目"
                          title="下移"
                        >
                          <ArrowDown size={15} />
                        </button>
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
                          disabled={isDeleteLocked}
                          onClick={() => deleteItem(item.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label="刪除"
                          title="刪除"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>}
              </SortableCard>
            );
          })}
        </div>
        </SortableContext>
        </DndContext>
      )}
    </section>
  );
};
