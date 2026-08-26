/**
 * Browser Security Utils（瀏覽器安全工具）
 *
 * 集中驗證瀏覽器即將開啟或導向的網址，並隔離新視窗的 opener。
 * 使用於 OAuth、附件、地圖與其他外部連結等瀏覽器邊界。
 */

// ================================
// Types
// ================================

interface TrustedHttpUrlOptions {
  allowedOrigins?: readonly string[];
  baseUrl?: string;
}

// ================================
// Public Functions
// ================================

/**
 * 驗證並正規化 HTTP／HTTPS 網址。
 */
export const getTrustedHttpUrl = (
  value: string,
  options: TrustedHttpUrlOptions = {},
): string | null => {
  try {
    const url = new URL(value, options.baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    if (
      options.allowedOrigins &&
      !options.allowedOrigins.includes(url.origin)
    ) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
};

/**
 * 以隔離 opener 與 Referrer 的方式開啟外部網址。
 */
export const openExternalUrl = (value: string): void => {
  const trustedUrl = getTrustedHttpUrl(value);
  if (!trustedUrl) return;

  const openedWindow = window.open(
    trustedUrl,
    "_blank",
    "noopener,noreferrer",
  );
  if (openedWindow) openedWindow.opener = null;
};

/**
 * 在使用者操作當下預先建立新視窗，供非同步流程完成後導向。
 */
export const openPendingWindow = (): Window | null => {
  const pendingWindow = window.open("about:blank", "_blank");
  if (pendingWindow) pendingWindow.opener = null;

  return pendingWindow;
};
