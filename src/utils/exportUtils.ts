/**
 * ==========================================================
 * Travel Companion
 * 檔案：exportUtils.ts
 * 功能：Excel 匯出相關工具
 *
 * 職責：
 * 1. 提供 Excel 匯出共用工具
 * 2. 集中管理匯出檔名規則
 * 3. 不處理 UI、不操作 React State
 * ==========================================================
 */

/**
 * 清除檔名中的非法字元。
 *
 * Windows 不允許：
 * \ / : * ? " < > |
 *
 * 同時移除前後空白。
 */
export const sanitizeFilePart = (value: string): string => {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_');
};

/**
 * 產生 Excel 建議檔名。
 *
 * 格式：
 * 行程名稱-shared-expenses.xlsx
 *
 * 或
 *
 * 行程名稱-personal-expenses.xlsx
 */
export const getExportFileNameXlsx = (
  tripName: string,
  isUsingSharedExpenseBook: boolean
): string => {
  const scope = isUsingSharedExpenseBook
    ? 'shared'
    : 'personal';

  return `${sanitizeFilePart(tripName)}-${scope}-expenses.xlsx`;
};