import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FolderOpen,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";

import type { Folder, OtherInfoItem } from "../types";
import { createDefaultFoldersForTrip } from "../utils/folderDefaults";
import { createFolder } from "../utils/folderUtils";
import { SortableCard } from "./SortableCard";

interface OtherInfoCategoryManagerProps {
  tripId: string;
  folders: Folder[];
  items: OtherInfoItem[];
  isSaving?: boolean;
  onSave: (folders: Folder[]) => Promise<void>;
  onCancel: () => void;
  onDone: () => void;
}

const MAX_CATEGORY_COUNT = 20;
const MAX_CATEGORY_NAME_LENGTH = 20;

const titleLength = (title: string): number => Array.from(title.trim()).length;

const normalizeOrders = (folders: Folder[]): Folder[] =>
  folders.map((folder, index) => ({
    ...folder,
    order: index + 1,
    isVisible: folder.isVisible !== false,
  }));

const autoArrangeFolders = (folders: Folder[]): Folder[] =>
  normalizeOrders(
    [...folders].sort((a, b) => {
      const lengthDiff = titleLength(a.title) - titleLength(b.title);
      if (lengthDiff !== 0) return lengthDiff;
      return a.order - b.order;
    }),
  );

const buildPreviewRows = (folders: Folder[]): Folder[][] => {
  const visible = folders.filter((folder) => folder.isVisible !== false);
  const rows: Folder[][] = [];
  for (let index = 0; index < visible.length; index += 3) {
    rows.push(visible.slice(index, index + 3));
  }
  return rows;
};

export const OtherInfoCategoryManager = ({
  tripId,
  folders,
  items,
  isSaving = false,
  onSave,
  onCancel,
  onDone,
}: OtherInfoCategoryManagerProps) => {
  const [draftFolders, setDraftFolders] = useState<Folder[]>(() => normalizeOrders(folders));
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [restoredFolderIds, setRestoredFolderIds] = useState<Set<string>>(() => new Set());
  const toastTimerRef = useRef<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 1000);
  };

  const applyDraft = (nextFolders: Folder[], successMessage?: string) => {
    const normalized = normalizeOrders(nextFolders);
    setDraftFolders(normalized);
    setError(null);
    if (successMessage) showToast(successMessage);
  };

  const handleDone = async () => {
    if (isCommitting || isSaving) return;
    setIsCommitting(true);
    setError(null);
    try {
      await onSave(normalizeOrders(draftFolders));
      onDone();
    } catch (saveError) {
      console.warn(saveError);
      setError("分類設定尚未同步完成，請稍後再試。");
    } finally {
      setIsCommitting(false);
    }
  };

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
      if (item.isDeleted) return;
      counts.set(item.folderId, (counts.get(item.folderId) ?? 0) + 1);
    });
    return counts;
  }, [items]);

  const previewRows = useMemo(() => buildPreviewRows(draftFolders), [draftFolders]);

  const validateTitle = (title: string, currentId?: string): string | null => {
    const trimmed = title.trim();
    if (!trimmed) return "請輸入子類別名稱。";
    if (titleLength(trimmed) > MAX_CATEGORY_NAME_LENGTH) {
      return `子類別名稱最多 ${MAX_CATEGORY_NAME_LENGTH} 個字元。`;
    }
    const duplicate = draftFolders.some(
      (folder) => folder.id !== currentId && folder.title.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
    );
    if (duplicate) return "已有相同名稱的子類別。";
    return null;
  };

  const handleAdd = () => {
    if (draftFolders.length >= MAX_CATEGORY_COUNT) {
      setError(`每個行程最多 ${MAX_CATEGORY_COUNT} 個子類別。`);
      return;
    }
    const validationError = validateTitle(newTitle);
    if (validationError) {
      setError(validationError);
      return;
    }
    const folder = createFolder(
      tripId,
      null,
      newTitle.trim(),
      draftFolders.length + 1,
      false,
    );
    setNewTitle("");
    applyDraft([...draftFolders, folder], "已新增");
  };

  const startRename = (folder: Folder) => {
    setEditingFolderId(folder.id);
    setEditingTitle(folder.title);
    setError(null);
  };

  const saveRename = () => {
    if (!editingFolderId) return;
    const validationError = validateTitle(editingTitle, editingFolderId);
    if (validationError) {
      setError(validationError);
      return;
    }
    const now = new Date().toISOString();
    const nextFolders = draftFolders.map((folder) =>
      folder.id === editingFolderId
        ? { ...folder, title: editingTitle.trim(), updatedAt: now }
        : folder,
    );
    setEditingFolderId(null);
    setEditingTitle("");
    applyDraft(nextFolders, "已更新");
  };

  const toggleVisibility = (folder: Folder) => {
    const isCurrentlyVisible = folder.isVisible !== false;
    const visibleCount = draftFolders.filter((item) => item.isVisible !== false).length;
    if (isCurrentlyVisible && visibleCount <= 1) {
      setError("至少需要保留一個顯示中的子類別。");
      return;
    }
    const now = new Date().toISOString();
    const nextFolders = draftFolders.map((item) =>
      item.id === folder.id
        ? { ...item, isVisible: !isCurrentlyVisible, updatedAt: now }
        : item,
    );
    applyDraft(nextFolders, isCurrentlyVisible ? "已隱藏" : "已顯示");
  };

  const moveFolder = (folderId: string, direction: -1 | 1) => {
    const currentIndex = draftFolders.findIndex((folder) => folder.id === folderId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= draftFolders.length) return;
    applyDraft(arrayMove(draftFolders, currentIndex, targetIndex));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = draftFolders.findIndex((folder) => folder.id === active.id);
    const newIndex = draftFolders.findIndex((folder) => folder.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    applyDraft(arrayMove(draftFolders, oldIndex, newIndex));
  };

  const handleAutoArrange = () => {
    applyDraft(autoArrangeFolders(draftFolders), "已自動排列");
  };

  const handleResetDefaults = () => {
    const defaults = createDefaultFoldersForTrip(tripId);
    const customFolders = draftFolders.filter((folder) => !folder.isSystem);
    const resetDefaults = defaults.map((folder, index) => ({
      ...folder,
      order: index + 1,
      isVisible: true,
    }));
    const preservedCustom = customFolders.map((folder, index) => ({
      ...folder,
      order: resetDefaults.length + index + 1,
    }));
    const nextFolders = normalizeOrders([...resetDefaults, ...preservedCustom]);
    const beforeById = new Map(draftFolders.map((folder) => [folder.id, folder]));
    const changedIds = nextFolders
      .filter((folder) => {
        const before = beforeById.get(folder.id);
        if (!before) return true;
        return (
          before.title !== folder.title ||
          before.order !== folder.order ||
          before.isVisible !== folder.isVisible
        );
      })
      .map((folder) => folder.id);

    setRestoredFolderIds(new Set(changedIds));
    setIsResetConfirmOpen(false);
    applyDraft(nextFolders, changedIds.length > 0 ? "已恢復預設" : "目前已是預設");
  };

  return (
    <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold text-slate-900">其他資訊管理</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            新增、改名、排序或隱藏子類別。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isCommitting || isSaving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <X size={14} />
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleDone()}
            disabled={isCommitting || isSaving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-xs font-bold text-white hover:bg-stone-700 disabled:opacity-50"
          >
            <Check size={14} />
            {isCommitting ? "儲存中..." : "完成"}
          </button>
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-slate-700">排列預覽</h4>
          <button
            type="button"
            onClick={() => void handleAutoArrange()}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Sparkles size={13} />
            自動排列
          </button>
        </div>
        <div className="space-y-2">
          {previewRows.map((row, rowIndex) => (
            <div key={`preview-row-${rowIndex}`} className="flex flex-wrap gap-2">
              {row.map((folder) => (
                <span
                  key={folder.id}
                  className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold ${
                    restoredFolderIds.has(folder.id) ? "text-rose-600" : "text-slate-600"
                  }`}
                >
                  <FolderOpen size={13} />
                  <span className="break-words">{folder.title}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200">
        <button
          type="button"
          onClick={() => setIsRulesOpen((value) => !value)}
          aria-expanded={isRulesOpen}
          aria-controls="other-info-auto-arrange-rules"
          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-bold text-slate-700"
        >
          <span>ⓘ 自動排列規則</span>
          {isRulesOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {isRulesOpen && (
          <ul
            id="other-info-auto-arrange-rules"
            className="space-y-1 border-t border-slate-200 px-5 py-3 text-xs leading-relaxed text-slate-500"
          >
            <li>每列最多 3 個子類別。</li>
            <li>自動排列時由少字元到多字元優先。</li>
            <li>長名稱放不下時直接換行。</li>
            <li>不壓縮字寬，優先維持可讀性。</li>
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-bold text-slate-800">子類別列表</h4>
          <span className="text-xs text-slate-400">{draftFolders.length}/{MAX_CATEGORY_COUNT}</span>
        </div>

        <DndContext sensors={sensors} onDragEnd={(event) => void handleDragEnd(event)}>
          <SortableContext items={draftFolders.map((folder) => folder.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {draftFolders.map((folder, index) => (
                <SortableCard
                  key={folder.id}
                  id={folder.id}
                  disabled={isSaving}
                  onKeyboardMove={(direction) => void moveFolder(folder.id, direction)}
                >
                  {(dragHandle) => (
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                      {dragHandle}
                      <FolderOpen className="shrink-0 text-slate-400" size={16} />
                      <div className="min-w-0 flex-1">
                        {editingFolderId === folder.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              value={editingTitle}
                              onChange={(event) => setEditingTitle(event.target.value)}
                              maxLength={MAX_CATEGORY_NAME_LENGTH}
                              autoFocus
                              className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-stone-500"
                              aria-label="子類別名稱"
                              onKeyDown={(event) => {
                                if (event.key === "Enter") void saveRename();
                                if (event.key === "Escape") {
                                  setEditingFolderId(null);
                                  setEditingTitle("");
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => void saveRename()}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-emerald-700 hover:bg-emerald-50"
                              aria-label="儲存子類別名稱"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFolderId(null);
                                setEditingTitle("");
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-slate-500 hover:bg-slate-100"
                              aria-label="取消改名"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span
                              className={`truncate text-sm font-semibold ${
                                restoredFolderIds.has(folder.id) ? "text-rose-600" : "text-slate-700"
                              }`}
                            >
                              {folder.title}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                              {categoryCounts.get(folder.id) ?? 0}
                            </span>
                          </div>
                        )}
                      </div>

                      {editingFolderId !== folder.id && (
                        <>
                          <button
                            type="button"
                            onClick={() => startRename(folder)}
                            disabled={isSaving}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                            aria-label={`重新命名「${folder.title}」`}
                            title="改名"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleVisibility(folder)}
                            disabled={isSaving}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                            aria-label={folder.isVisible === false ? `顯示「${folder.title}」` : `隱藏「${folder.title}」`}
                            title={folder.isVisible === false ? "顯示" : "隱藏"}
                          >
                            {folder.isVisible === false ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </>
                      )}

                      <span className="sr-only">第 {index + 1} 個</span>
                    </div>
                  )}
                </SortableCard>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </section>

      <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <label htmlFor="new-other-info-category" className="text-xs font-bold text-slate-700">
          新增子類別
        </label>
        <div className="flex gap-2">
          <input
            id="new-other-info-category"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            maxLength={MAX_CATEGORY_NAME_LENGTH}
            placeholder="例如：御朱印"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-stone-500"
            onKeyDown={(event) => {
              if (event.key === "Enter") handleAdd();
            }}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={isSaving || isCommitting || !newTitle.trim()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-xs font-bold text-white hover:bg-stone-700 disabled:bg-slate-300"
          >
            <Plus size={14} />
            新增
          </button>
        </div>
      </section>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-slate-500">
          恢復系統預設名稱、順序與顯示狀態；自訂分類與既有資料會保留。
        </p>
        <button
          type="button"
          onClick={() => setIsResetConfirmOpen(true)}
          disabled={isSaving || isCommitting}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw size={14} />
          恢復預設
        </button>
      </div>

      {isResetConfirmOpen && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-bold">確認恢復系統預設分類？</p>
          <p className="mt-1 leading-relaxed">
            系統分類會恢復名稱、順序與顯示狀態；自訂分類與既有資料都會保留。
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsResetConfirmOpen(false)}
              className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 font-bold text-amber-800"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleResetDefaults()}
              className="rounded-lg bg-amber-700 px-3 py-1.5 font-bold text-white hover:bg-amber-800"
            >
              確認恢復
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      )}
    </div>
  );
};
