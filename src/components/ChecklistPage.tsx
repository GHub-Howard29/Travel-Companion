import { FormEvent, useState } from "react";
import { Check, Copy, Pencil, Plus, Trash2, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChecklistItem } from "../types";
import { useChecklistState } from "../hooks/useChecklistState";

interface ChecklistPageProps {
  tripId: string;
  checklistData: ChecklistItem[];
  supabase: SupabaseClient;
  canViewSharedChecklist: boolean;
  canToggleSharedChecklist: boolean;
  canManageSharedChecklist: boolean;
  copySources: Array<{
    tripId: string;
    title: string;
    items: ChecklistItem[];
  }>;
  onSaveChecklistData: (items: ChecklistItem[]) => Promise<void>;
}

export const ChecklistPage = ({
  tripId,
  checklistData,
  supabase,
  canViewSharedChecklist,
  canToggleSharedChecklist,
  canManageSharedChecklist,
  copySources,
  onSaveChecklistData,
}: ChecklistPageProps) => {
  const [isManageMode, setIsManageMode] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCopyOpen, setIsCopyOpen] = useState(false);
  const [copySourceTripId, setCopySourceTripId] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [draftCategory, setDraftCategory] = useState("其他");
  const [draftLabel, setDraftLabel] = useState("");
  const [isSavingList, setIsSavingList] = useState(false);
  const { items, syncStatus, syncError, toggleChecklistItem } =
    useChecklistState(
      tripId,
      checklistData,
      supabase,
      canToggleSharedChecklist,
    );
  const checkedItemIds = items
    .filter((item) => item.isChecked)
    .map((item) => item.id);
  const visibleCheckedItemIds = checkedItemIds.filter((checkedItemId) =>
    items.some((item) => item.id === checkedItemId),
  );
  const categories = Array.from(
    new Set(items.map((item) => item.category)),
  );
  const progressPercent =
    items.length > 0
      ? (visibleCheckedItemIds.length / items.length) * 100
      : 0;
  const availableCopySources = copySources.filter(
    (source) => source.tripId !== tripId && source.items.length > 0,
  );
  const selectedCopySource =
    availableCopySources.find((source) => source.tripId === copySourceTripId) ??
    availableCopySources[0];

  if (!canViewSharedChecklist) {
    return (
      <div className="text-center py-12 text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl shadow-sm">
        目前角色無法查看共同檢查清單。
      </div>
    );
  }

  const resetForm = () => {
    setIsFormOpen(false);
    setEditingItemId(null);
    setDraftCategory("其他");
    setDraftLabel("");
  };

  const closeManageMode = () => {
    setIsManageMode(false);
    setIsCopyOpen(false);
    resetForm();
  };

  const startCreateItem = () => {
    setEditingItemId(null);
    setDraftCategory(categories[0] ?? "其他");
    setDraftLabel("");
    setIsCopyOpen(false);
    setIsFormOpen(true);
  };

  const startEditItem = (item: ChecklistItem) => {
    setEditingItemId(item.id);
    setDraftCategory(item.category);
    setDraftLabel(item.label);
    setIsCopyOpen(false);
    setIsFormOpen(true);
  };

  const saveChecklistItem = async (event: FormEvent) => {
    event.preventDefault();
    const category = draftCategory.trim() || "其他";
    const label = draftLabel.trim();
    if (!label) return;

    setIsSavingList(true);
    const nextItems = editingItemId
      ? checklistData.map((item) =>
          item.id === editingItemId
            ? {
                ...item,
                category,
                label,
              }
            : item,
        )
      : [
          ...checklistData,
          {
            id: `shared_${Date.now().toString(36)}`,
            category,
            label,
          },
        ];

    await onSaveChecklistData(nextItems);
    setIsSavingList(false);
    resetForm();
  };

  const deleteChecklistItem = async (itemId: string) => {
    const targetItem = checklistData.find((item) => item.id === itemId);
    if (!targetItem) return;
    if (!confirm(`確定刪除「${targetItem.label}」？`)) return;

    setIsSavingList(true);
    await onSaveChecklistData(checklistData.filter((item) => item.id !== itemId));
    setIsSavingList(false);
    resetForm();
  };

  const copyChecklistItems = async () => {
    if (!selectedCopySource) return;

    setIsSavingList(true);
    await onSaveChecklistData(
      selectedCopySource.items.map((item, index) => ({
        id: `shared_copy_${Date.now().toString(36)}_${index}`,
        category: item.category,
        label: item.label,
      })),
    );
    setIsSavingList(false);
    setIsCopyOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
        <div className="flex justify-between items-center mb-2 text-sm font-bold text-slate-700">
          <span>準備進度</span>
          <span className="text-rose-700">
            {Math.round(progressPercent)}% ({visibleCheckedItemIds.length}/
            {items.length})
          </span>
        </div>
        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-rose-600 h-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {!canToggleSharedChecklist && (
          <p className="mt-3 text-xs font-medium text-slate-500">
            目前角色可查看共同檢查清單，但不可勾選。
          </p>
        )}
        {canToggleSharedChecklist && (
          <p className="mt-3 text-xs font-medium text-slate-500">
            {syncStatus === "syncing" && "正在同步共同檢查清單..."}
            {syncStatus === "synced" && "共同檢查清單已同步到雲端。"}
            {syncStatus === "error" && syncError}
            {syncStatus === "local" && "目前資料先保存於本機。"}
          </p>
        )}
        {canManageSharedChecklist && (
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

      {canManageSharedChecklist && isManageMode && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">共同清單管理</h3>
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
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={startCreateItem}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                <Plus size={14} />
                新增項目
              </button>
              <button
                type="button"
                onClick={() => {
                  setCopySourceTripId(selectedCopySource?.tripId ?? "");
                  setIsFormOpen(false);
                  setIsCopyOpen(true);
                }}
                disabled={availableCopySources.length === 0}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy size={14} />
                複製清單
              </button>
            </div>
          </div>
        </div>
      )}

      {canManageSharedChecklist && isManageMode && isCopyOpen && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">複製共同清單</h3>
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
                  {source.title}
                </option>
              ))}
            </select>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-3">
              {selectedCopySource?.items.map((item) => (
                <div key={item.id} className="text-sm text-slate-700">
                  <span className="font-bold text-slate-500">{item.category}</span>
                  <span className="mx-1 text-slate-300">/</span>
                  {item.label}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void copyChecklistItems()}
              disabled={!selectedCopySource || isSavingList}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Copy size={16} />
              複製到目前旅程
            </button>
          </div>
        </div>
      )}

      {canManageSharedChecklist && isManageMode && isFormOpen && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              {editingItemId ? "編輯共同檢查事項" : "新增共同檢查事項"}
            </h3>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="取消"
              title="取消"
            >
              <X size={15} />
            </button>
          </div>
          <form onSubmit={saveChecklistItem} className="space-y-2">
              <input
                value={draftCategory}
                onChange={(event) => setDraftCategory(event.target.value)}
                placeholder="分類"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <input
                value={draftLabel}
                onChange={(event) => setDraftLabel(event.target.value)}
                placeholder="項目名稱"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              />
              <button
                type="submit"
                disabled={isSavingList}
                className="w-full rounded-lg bg-rose-700 px-3 py-2 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-60"
              >
                {isSavingList ? "儲存中..." : editingItemId ? "儲存修改" : "新增項目"}
              </button>
            </form>
        </div>
      )}

      {items.length === 0 && (
        <div className="text-center py-12 text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl shadow-sm">
          此行程尚未配置檢查清單。
        </div>
      )}

      {categories.map((category) => (
        <div key={category} className="space-y-2">
          <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-wider pl-1">
            {category}
          </h3>
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden divide-y divide-slate-100">
            {items
              .filter((item) => item.category === category)
              .map((item) => {
                const isChecked = item.isChecked;

                return (
                  <div
                    key={item.id}
                    className={`flex w-full items-start gap-3 p-4 text-left transition-colors select-none ${
                      canToggleSharedChecklist
                        ? "hover:bg-slate-50/80 cursor-pointer"
                        : "cursor-not-allowed bg-slate-50/40"
                    }`}
                  >
                    <button
                      type="button"
                      disabled={!canToggleSharedChecklist}
                      onClick={() => {
                        if (!canToggleSharedChecklist) return;
                        toggleChecklistItem(item.id);
                      }}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <span
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                          isChecked
                            ? "bg-rose-600 border-rose-600 text-white shadow-sm scale-105"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {isChecked && <Check size={14} strokeWidth={3} />}
                      </span>
                      <span
                        className={`min-w-0 flex-1 break-words text-sm font-medium leading-relaxed transition-all ${
                          isChecked ? "text-slate-400 line-through" : "text-slate-700"
                        }`}
                      >
                        {item.label}
                      </span>
                    </button>
                    {canManageSharedChecklist && isManageMode && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEditItem(item)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label="編輯共同清單項目"
                          title="編輯共同清單項目"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteChecklistItem(item.id)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                          aria-label="刪除共同清單項目"
                          title="刪除共同清單項目"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
};
