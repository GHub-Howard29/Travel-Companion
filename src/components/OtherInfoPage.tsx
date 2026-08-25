import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  FileText,
  FolderOpen,
  LockKeyhole,
  Pencil,
  Plus,
  Save,
  Settings2,
  Trash2,
  X,
} from "lucide-react";

import type { Folder, OtherInfoItem } from "../types";
import {
  createOtherInfoItem,
  deleteOtherInfoItem,
  getFolders,
  getItems,
  updateOtherInfoItem,
} from "../services/otherInfoService";
import {
  getStandaloneHttpUrl,
  getOtherInfoItemsByFolderId,
  isOtherInfoItemVisibleToRole,
  parseOtherInfoContentLinks,
  sortOtherInfoItemsByOrder,
} from "../utils/otherInfoUtils";
import { useOtherInfoForm } from "../hooks/useOtherInfoForm";
import { SortableCard } from "./SortableCard";
import {
  isRestrictedOtherInfoRoles,
  MANAGER_ONLY_ROLES,
  normalizeOtherInfoAllowedRoles,
  type Role,
} from "../permissions/roles";
import type { OtherInfoSyncStatus } from "../storage/otherInfoSyncStorage";
import { releaseFocusedControl } from "../utils/viewportUtils";

interface OtherInfoPageProps {
  tripId: string;
  canEdit: boolean;
  currentRole: Role;
  items?: OtherInfoItem[];
  onSaveItems?: (items: OtherInfoItem[]) => Promise<void>;
  pageTitle?: string;
  isSpecialInfoPage?: boolean;
  specialFolderId?: string;
  syncStatus?: OtherInfoSyncStatus | "syncing" | null;
}

const renderContentWithLinks = (content: string) => {
  const lines = parseOtherInfoContentLinks(content);

  return lines.map((line, lineIndex) => {
    return (
      <span key={`${lineIndex}-${line.map((part) => part.text).join("")}`}>
        {line.map((part, partIndex) => {
          if (part.type === "text") {
            return part.text;
          }

          return (
            <a
              key={`${part.text}-${partIndex}`}
              href={part.text}
              target="_blank"
              rel="noreferrer"
              className="break-all font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
            >
              {part.text}
            </a>
          );
        })}
        {lineIndex < lines.length - 1 && <br />}
      </span>
    );
  });
};

const isSensitiveItem = (item: OtherInfoItem): boolean =>
  isRestrictedOtherInfoRoles(item.allowedRoles);

export const OtherInfoPage = ({
  tripId,
  canEdit,
  currentRole,
  items: syncedItems,
  onSaveItems,
  pageTitle = "旅行資訊",
  isSpecialInfoPage = false,
  specialFolderId,
  syncStatus,
}: OtherInfoPageProps) => {
  const folders = useMemo<Folder[]>(() => getFolders(tripId), [tripId]);
  const initialFolderId =
    isSpecialInfoPage && specialFolderId ? specialFolderId : folders[0]?.id || "";
  const [localItems, setLocalItems] = useState<OtherInfoItem[]>(() => getItems(tripId));
  const [optimisticItems, setOptimisticItems] = useState<OtherInfoItem[] | null>(null);
  const pendingOrderItemsRef = useRef<OtherInfoItem[] | null>(null);
  const orderTimerRef = useRef<number | null>(null);
  const items = optimisticItems ?? syncedItems ?? localItems;
  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          !item.isDeleted &&
          isOtherInfoItemVisibleToRole(item, currentRole),
      ),
    [currentRole, items],
  );
  const [activeFolderId, setActiveFolderId] = useState(initialFolderId);
  const [isManageMode, setIsManageMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSensitiveSaveConfirmationOpen, setIsSensitiveSaveConfirmationOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const {
    editingItemId,
    form,
    isFormOpen,
    isSaveDisabled,
    closeForm,
    openCreateForm,
    openEditForm,
    syncFolderWhenNotEditing,
    updateForm,
  } = useOtherInfoForm(initialFolderId);

  const activeFolder = folders.find((folder) => folder.id === activeFolderId);

  const flushPendingOrder = useCallback(async () => {
    if (orderTimerRef.current !== null) {
      window.clearTimeout(orderTimerRef.current);
      orderTimerRef.current = null;
    }

    const pendingItems = pendingOrderItemsRef.current;
    if (!pendingItems) return;

    try {
      if (onSaveItems) {
        await onSaveItems(pendingItems);
      } else {
        setLocalItems(pendingItems);
      }
      pendingOrderItemsRef.current = null;
      setOptimisticItems(null);
    } catch (error) {
      console.warn(error);
    }
  }, [onSaveItems]);

  const deferOrderSync = useCallback((nextItems: OtherInfoItem[]) => {
    setOptimisticItems(nextItems);
    pendingOrderItemsRef.current = nextItems;

    if (!onSaveItems) {
      void flushPendingOrder();
      return;
    }

    if (orderTimerRef.current !== null) {
      window.clearTimeout(orderTimerRef.current);
    }
    orderTimerRef.current = window.setTimeout(() => {
      void flushPendingOrder();
    }, 800);
  }, [flushPendingOrder, onSaveItems]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        void flushPendingOrder();
      }
    };

    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", flushWhenHidden);
      void flushPendingOrder();
    };
  }, [flushPendingOrder]);
  const activeItems = useMemo(
    () =>
      sortOtherInfoItemsByOrder(
        isSpecialInfoPage
          ? getOtherInfoItemsByFolderId(visibleItems, initialFolderId)
          : getOtherInfoItemsByFolderId(visibleItems, activeFolderId),
      ),
    [activeFolderId, initialFolderId, isSpecialInfoPage, visibleItems],
  );

  const closeManageMode = () => {
    releaseFocusedControl();
    void flushPendingOrder();
    setIsSensitiveSaveConfirmationOpen(false);
    setIsManageMode(false);
    closeForm(activeFolderId);
  };

  const toggleManageMode = () => {
    if (isManageMode) {
      closeManageMode();
      return;
    }

    setIsManageMode(true);
  };

  const persistItems = async (nextItems: OtherInfoItem[]) => {
    setOptimisticItems(nextItems);
    if (onSaveItems) {
      await onSaveItems(nextItems);
      setOptimisticItems(null);
      return;
    }

    setLocalItems(nextItems);
    setOptimisticItems(null);
  };

  const createSyncedOtherInfoItem = (
    folderId: string,
    title: string,
    content: string,
    isSensitive: boolean,
  ): OtherInfoItem => {
    const now = new Date().toISOString();
    const nextOrder =
      items.filter((item) => item.folderId === folderId && !item.isDeleted).length + 1;

    return {
      id: crypto.randomUUID(),
      tripId,
      folderId,
      title,
      content,
      allowedRoles: isSensitive
        ? normalizeOtherInfoAllowedRoles(MANAGER_ONLY_ROLES)
        : undefined,
      order: nextOrder,
      createdAt: now,
      updatedAt: now,
    };
  };

  const saveForm = async () => {
    if (isSaving) {
      return;
    }

    const title = form.title.trim();
    const content = form.content.trim();

    if (!title || !content || !form.folderId) {
      return;
    }

    const targetFolderId = isSpecialInfoPage ? initialFolderId : form.folderId;
    const allowedRoles = form.isSensitive
      ? normalizeOtherInfoAllowedRoles(MANAGER_ONLY_ROLES)
      : undefined;
    const nextItems = onSaveItems
      ? editingItemId
        ? items.map((item) =>
            item.id === editingItemId
              ? {
                  ...item,
                  folderId: targetFolderId,
                  title,
                  content,
                  allowedRoles,
                  updatedAt: new Date().toISOString(),
                }
              : item,
          )
        : [...items, createSyncedOtherInfoItem(targetFolderId, title, content, form.isSensitive)]
      : editingItemId
        ? updateOtherInfoItem(tripId, editingItemId, {
            folderId: targetFolderId,
            title,
            content,
            allowedRoles,
          })
        : createOtherInfoItem(tripId, targetFolderId, title, content, allowedRoles);

    setIsSaving(true);
    try {
      await persistItems(nextItems);
      setActiveFolderId(targetFolderId);
      closeForm(targetFolderId);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (isSaveDisabled) return;

    if (form.isSensitive) {
      setIsSensitiveSaveConfirmationOpen(true);
      return;
    }

    await saveForm();
  };

  const confirmSensitiveSave = async () => {
    setIsSensitiveSaveConfirmationOpen(false);
    await saveForm();
  };

  const handleDelete = async (item: OtherInfoItem) => {
    const nextItems = onSaveItems
      ? items.map((currentItem) =>
          currentItem.id === item.id
            ? {
                ...currentItem,
                isDeleted: true,
                updatedAt: new Date().toISOString(),
              }
            : currentItem,
        )
      : deleteOtherInfoItem(tripId, item.id);

    await persistItems(nextItems);

    if (editingItemId === item.id) {
      closeForm(activeFolderId);
    }
  };

  const moveActiveItem = (itemId: string, direction: -1 | 1) => {
    const currentIndex = activeItems.findIndex((item) => item.id === itemId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= activeItems.length) {
      return;
    }

    const reorderedItems = [...activeItems];
    [reorderedItems[currentIndex], reorderedItems[targetIndex]] = [
      reorderedItems[targetIndex],
      reorderedItems[currentIndex],
    ];
    const orderById = new Map(
      reorderedItems.map((item, index) => [item.id, index + 1]),
    );
    deferOrderSync(
      items.map((item) =>
        orderById.has(item.id)
          ? { ...item, order: orderById.get(item.id) ?? item.order, updatedAt: new Date().toISOString() }
          : item,
      ),
    );
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = activeItems.findIndex((item) => item.id === active.id);
    const newIndex = activeItems.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reorderedItems = arrayMove(activeItems, oldIndex, newIndex);
    const orderById = new Map(reorderedItems.map((item, index) => [item.id, index + 1]));
    deferOrderSync(items.map((item) =>
      orderById.has(item.id)
        ? { ...item, order: orderById.get(item.id) ?? item.order, updatedAt: new Date().toISOString() }
        : item,
    ));
  };

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-stone-500">
            Reference
          </p>
          <h2 className="text-2xl font-extrabold text-slate-900">{pageTitle}</h2>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={toggleManageMode}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              isManageMode
                ? "bg-stone-900 text-white hover:bg-stone-700"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            aria-label={isManageMode ? "退出管理" : "管理資訊"}
            title={isManageMode ? "退出管理" : "管理資訊"}
          >
            {isManageMode ? <X size={14} /> : <Settings2 size={14} />}
            {isManageMode ? "退出" : "管理"}
          </button>
        )}
      </div>

      {syncStatus && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
            syncStatus === "failed"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {syncStatus === "syncing"
            ? "同步中…"
            : syncStatus === "failed"
              ? "同步失敗，資料已保存在本機，連線恢復後會自動重試。"
              : "已儲存於本機，待連線同步。"}
        </div>
      )}

      {!isSpecialInfoPage && (
      <div className="flex flex-wrap gap-2">
        {folders.map((folder) => {
          const isActive = folder.id === activeFolderId;
          const count = getOtherInfoItemsByFolderId(visibleItems, folder.id).length;

          return (
            <button
              key={folder.id}
              type="button"
              onClick={() => {
                setActiveFolderId(folder.id);
                syncFolderWhenNotEditing(folder.id);
              }}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${
                isActive
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-stone-300 hover:bg-stone-50"
              }`}
            >
              <FolderOpen size={16} />
              <span>{folder.title}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  isActive ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
      )}

      {canEdit && isManageMode && (
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                {isSpecialInfoPage ? `${pageTitle}管理` : "其他資訊管理"}
              </h3>
            </div>
            {!isFormOpen && (
              <button
                type="button"
                onClick={() => openCreateForm(activeFolderId)}
                disabled={isSaving}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-xs font-bold text-white hover:bg-stone-700"
              >
                <Plus size={14} />
                新增
              </button>
            )}
          </div>
        </div>
      )}

      {canEdit && isManageMode && isFormOpen && (
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <h3 className="text-base font-bold text-slate-800">
              {editingItemId ? "編輯資訊" : "新增資訊"}
            </h3>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1" role="group" aria-label="資訊類型">
              <button
                type="button"
                onClick={() => updateForm({ isSensitive: false })}
                aria-pressed={!form.isSensitive}
                className={`rounded-md border px-3 py-2 text-xs font-bold transition-colors ${
                  form.isSensitive
                    ? "border-transparent bg-transparent text-slate-500"
                    : "border-slate-300 bg-white text-slate-700 shadow-sm"
                }`}
              >
                一般資訊
              </button>
              <button
                type="button"
                onClick={() => updateForm({ isSensitive: true })}
                aria-pressed={form.isSensitive}
                className={`inline-flex items-center justify-center gap-1 rounded-md border px-3 py-2 text-xs font-bold transition-colors ${
                  form.isSensitive
                    ? "border-sky-400 bg-white text-sky-800 shadow-sm"
                    : "border-transparent bg-transparent text-slate-500"
                }`}
              >
                <LockKeyhole size={14} />
                新增敏感資料
              </button>
            </div>

            <p className="text-xs leading-relaxed text-slate-400">
              {form.isSensitive
                ? "快捷入口不建立新資料夾；資料仍歸在目前選擇的分類，並自動套用管理者限定。"
                : "進入管理時預設為一般資訊；需要保護資料時，再按「新增敏感資料」。"}
            </p>

            {!isSpecialInfoPage && (
            <select
              value={form.folderId}
              onChange={(event) =>
                updateForm({
                  folderId: event.target.value,
                })
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-stone-500"
            >
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.title}
                </option>
              ))}
            </select>
            )}

            <input
              value={form.title}
              onChange={(event) =>
                updateForm({
                  title: event.target.value,
                })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-stone-500"
              placeholder="標題"
            />

            <textarea
              value={form.content}
              onChange={(event) =>
                updateForm({
                  content: event.target.value,
                })
              }
              className="min-h-32 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed text-slate-700 outline-none focus:border-stone-500"
              placeholder="內容"
            />
            <p className="text-xs leading-relaxed text-slate-400">
              提示：內容只填單一網址時，卡片標題會顯示為可點擊連結（支援
              https:// 與 https:\\ 格式）。
            </p>

            {form.isSensitive && (
              <div className="flex items-start gap-3 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2.5 text-sky-900" role="status">
                <LockKeyhole className="mt-0.5 shrink-0 text-sky-700" size={18} />
                <div className="space-y-1 text-xs leading-relaxed">
                  <p className="font-bold">僅行程管理者可查看（已自動套用）</p>
                  <p className="text-sky-800">本行程參與者與系統管理者可查看；訪客與一般使用者不會看到此卡片。</p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaveDisabled || isSaving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Save size={16} />
              {isSaving ? "儲存中..." : "儲存"}
            </button>
          </div>
        </div>
      )}

      {isSensitiveSaveConfirmationOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsSensitiveSaveConfirmationOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-amber-200 bg-white p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sensitive-save-confirmation-title"
          >
            <div className="mb-3 flex items-start gap-3">
              <LockKeyhole className="mt-0.5 shrink-0 text-amber-600" size={20} />
              <div>
                <h3 id="sensitive-save-confirmation-title" className="text-base font-bold text-slate-900">
                  確認儲存敏感資料
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  訂房編號、訂位代碼、租車確認碼、私人電話、個資或受限文件連結，請設為「僅行程管理者可查看」。一般公開網路連結可視為非敏感；固定帳號保護的雲端文件仍屬敏感內容。
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsSensitiveSaveConfirmationOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                返回修改
              </button>
              <button
                type="button"
                onClick={() => void confirmSensitiveSave()}
                className="flex-1 rounded-lg bg-stone-900 px-3 py-2 text-sm font-bold text-white hover:bg-stone-700"
              >
                確認儲存
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <h3 className="text-sm font-extrabold text-slate-700">
            {isSpecialInfoPage ? pageTitle : activeFolder?.title ?? "旅行資訊"}
          </h3>
          <span className="text-xs font-semibold text-slate-400">
            {activeItems.length} 筆
          </span>
        </div>

        {activeItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
            {isSpecialInfoPage ? "目前尚無資訊" : "這個資料夾目前沒有資訊"}
          </div>
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={activeItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          {activeItems.map((item, itemIndex) => (
            <SortableCard key={item.id} id={item.id} disabled={!canEdit || !isManageMode}>
            {(dragHandle) => <article
              key={item.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              {(() => {
                const standaloneUrl = getStandaloneHttpUrl(item.content);

                return <>
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 text-stone-500" size={18} />
                  <h4 className="text-base font-bold leading-snug text-slate-800">
                    {standaloneUrl ? (
                      <a
                        href={standaloneUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
                      >
                        {item.title}
                        <ExternalLink size={14} aria-label="開啟連結" />
                      </a>
                    ) : (
                      item.title
                    )}
                  </h4>
                  {isSensitiveItem(item) && (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700" title="僅行程管理者可查看">
                      <LockKeyhole size={12} aria-hidden="true" />
                      僅行程管理者可查看
                    </span>
                  )}
                </div>

                {canEdit && isManageMode && (
                  <div className="flex shrink-0 gap-1">
                    {dragHandle}
                    <button
                      type="button"
                      disabled={itemIndex === 0}
                      onClick={() => void moveActiveItem(item.id, -1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30"
                      aria-label="上移卡片"
                      title="上移"
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      disabled={itemIndex === activeItems.length - 1}
                      onClick={() => void moveActiveItem(item.id, 1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30"
                      aria-label="下移卡片"
                      title="下移"
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditForm(item)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      aria-label="編輯"
                      title="編輯"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(item)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                      aria-label="刪除"
                      title="刪除"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
              {!standaloneUrl && (
                <div className="text-sm leading-relaxed text-slate-600">
                  {renderContentWithLinks(item.content)}
                </div>
              )}
                </>;
              })()}
            </article>}
            </SortableCard>
          ))}
          </SortableContext>
          </DndContext>
        )}
      </div>
    </section>
  );
};
