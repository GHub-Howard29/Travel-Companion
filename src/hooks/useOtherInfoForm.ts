import { useCallback, useState } from "react";

import type { OtherInfoItem } from "../types";
import { isRestrictedOtherInfoRoles } from "../permissions/roles";

export interface OtherInfoFormState {
  folderId: string;
  title: string;
  content: string;
  isSensitive: boolean;
}

export const createEmptyOtherInfoForm = (
  folderId: string,
): OtherInfoFormState => ({
  folderId,
  title: "",
  content: "",
  isSensitive: false,
});

const isSensitiveItem = (item: OtherInfoItem): boolean =>
  isRestrictedOtherInfoRoles(item.allowedRoles);

export const useOtherInfoForm = (initialFolderId: string) => {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<OtherInfoFormState>(() =>
    createEmptyOtherInfoForm(initialFolderId),
  );

  const resetForm = useCallback((folderId: string) => {
    setEditingItemId(null);
    setIsFormOpen(false);
    setForm(createEmptyOtherInfoForm(folderId));
  }, []);

  const openCreateForm = useCallback((folderId: string) => {
    setEditingItemId(null);
    setForm(createEmptyOtherInfoForm(folderId));
    setIsFormOpen(true);
  }, []);

  const openEditForm = useCallback((item: OtherInfoItem) => {
    setEditingItemId(item.id);
    setForm({
      folderId: item.folderId,
      title: item.title,
      content: item.content,
      isSensitive: isSensitiveItem(item),
    });
    setIsFormOpen(true);
  }, []);

  const closeForm = useCallback((folderId: string) => {
    resetForm(folderId);
  }, [resetForm]);

  const updateForm = useCallback((patch: Partial<OtherInfoFormState>) => {
    setForm((currentForm) => ({
      ...currentForm,
      ...patch,
    }));
  }, []);

  const syncFolderWhenNotEditing = useCallback((folderId: string) => {
    if (editingItemId) {
      return;
    }

    updateForm({ folderId });
  }, [editingItemId, updateForm]);

  return {
    editingItemId,
    form,
    isFormOpen,
    isSaveDisabled: !form.title.trim() || !form.content.trim(),
    closeForm,
    openCreateForm,
    openEditForm,
    resetForm,
    syncFolderWhenNotEditing,
    updateForm,
  };
};
