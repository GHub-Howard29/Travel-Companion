import { useMemo, useState } from "react";
import {
  FileText,
  FolderOpen,
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
  getOtherInfoItemsByFolderId,
  parseOtherInfoContentLinks,
} from "../utils/otherInfoUtils";
import { useOtherInfoForm } from "../hooks/useOtherInfoForm";
import type { Role } from "../permissions/roles";

interface OtherInfoPageProps {
  tripId: string;
  canEdit: boolean;
  currentRole: Role;
  items?: OtherInfoItem[];
  onSaveItems?: (items: OtherInfoItem[]) => Promise<void>;
  pageTitle?: string;
  isSpecialInfoPage?: boolean;
  specialFolderId?: string;
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

export const OtherInfoPage = ({
  tripId,
  canEdit,
  currentRole,
  items: syncedItems,
  onSaveItems,
  pageTitle = "旅行資訊",
  isSpecialInfoPage = false,
  specialFolderId,
}: OtherInfoPageProps) => {
  const folders = useMemo<Folder[]>(() => getFolders(tripId), [tripId]);
  const initialFolderId =
    isSpecialInfoPage && specialFolderId ? specialFolderId : folders[0]?.id || "";
  const [localItems, setLocalItems] = useState<OtherInfoItem[]>(() => getItems(tripId));
  const items = syncedItems ?? localItems;
  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          !item.allowedRoles ||
          item.allowedRoles.length === 0 ||
          item.allowedRoles.includes(currentRole),
      ),
    [currentRole, items],
  );
  const [activeFolderId, setActiveFolderId] = useState(initialFolderId);
  const [isManageMode, setIsManageMode] = useState(false);
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
  const activeItems = useMemo(
    () =>
      isSpecialInfoPage
        ? getOtherInfoItemsByFolderId(visibleItems, initialFolderId)
        : getOtherInfoItemsByFolderId(visibleItems, activeFolderId),
    [activeFolderId, initialFolderId, isSpecialInfoPage, visibleItems],
  );

  const closeManageMode = () => {
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
    if (onSaveItems) {
      await onSaveItems(nextItems);
      return;
    }

    setLocalItems(nextItems);
  };

  const createSyncedOtherInfoItem = (
    folderId: string,
    title: string,
    content: string,
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
      order: nextOrder,
      createdAt: now,
      updatedAt: now,
    };
  };

  const handleSave = async () => {
    const title = form.title.trim();
    const content = form.content.trim();

    if (!title || !content || !form.folderId) {
      return;
    }

    const targetFolderId = isSpecialInfoPage ? initialFolderId : form.folderId;
    const nextItems = onSaveItems
      ? editingItemId
        ? items.map((item) =>
            item.id === editingItemId
              ? {
                  ...item,
                  folderId: targetFolderId,
                  title,
                  content,
                  updatedAt: new Date().toISOString(),
                }
              : item,
          )
        : [...items, createSyncedOtherInfoItem(targetFolderId, title, content)]
      : editingItemId
        ? updateOtherInfoItem(tripId, editingItemId, {
            folderId: targetFolderId,
            title,
            content,
          })
        : createOtherInfoItem(tripId, targetFolderId, title, content);

    await persistItems(nextItems);
    setActiveFolderId(targetFolderId);
    closeForm(targetFolderId);
  };

  const handleDelete = async (item: OtherInfoItem) => {
    const nextItems = onSaveItems
      ? items.filter((currentItem) => currentItem.id !== item.id)
      : deleteOtherInfoItem(tripId, item.id);

    await persistItems(nextItems);

    if (editingItemId === item.id) {
      closeForm(activeFolderId);
    }
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
              <p className="mt-0.5 text-xs text-slate-400">
                進入管理後才可新增、編輯或刪除資訊。
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isFormOpen) {
                  closeForm(activeFolderId);
                  return;
                }

                openCreateForm(activeFolderId);
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-xs font-bold text-white hover:bg-stone-700"
            >
              {isFormOpen ? <X size={14} /> : <Plus size={14} />}
              {isFormOpen ? "取消" : "新增"}
            </button>
          </div>
        </div>
      )}

      {canEdit && isManageMode && isFormOpen && (
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800">
              {editingItemId ? "編輯資訊" : "新增資訊"}
            </h3>
            <button
              type="button"
              onClick={() => closeForm(activeFolderId)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="關閉"
              title="關閉"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3">
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

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaveDisabled}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Save size={16} />
              儲存
            </button>
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
          activeItems.map((item) => (
            <article
              key={item.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 text-stone-500" size={18} />
                  <h4 className="text-base font-bold leading-snug text-slate-800">
                    {item.title}
                  </h4>
                </div>

                {canEdit && isManageMode && (
                  <div className="flex shrink-0 gap-1">
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
              <div className="text-sm leading-relaxed text-slate-600">
                {renderContentWithLinks(item.content)}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
};
