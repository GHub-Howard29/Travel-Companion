const PERSONAL_EXPENSE_ALIAS_PREFIX = "personal_expense_alias_v1:";

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const toStorageKey = (email: string): string =>
  `${PERSONAL_EXPENSE_ALIAS_PREFIX}${encodeURIComponent(normalizeEmail(email))}`;

export const readPersonalExpenseAlias = (email: string | null): string | null => {
  if (!email) return null;
  const value = localStorage.getItem(toStorageKey(email))?.trim() ?? "";
  return value || null;
};

export const writePersonalExpenseAlias = (email: string, alias: string): string => {
  const normalizedAlias = alias.trim();
  if (!normalizedAlias) {
    throw new Error("帳本代號不可空白");
  }

  localStorage.setItem(toStorageKey(email), normalizedAlias);
  return normalizedAlias;
};
