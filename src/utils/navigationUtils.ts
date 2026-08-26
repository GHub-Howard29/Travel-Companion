import { openExternalUrl } from "./browserSecurity";

/**
 * 開啟 Google Maps 導航。
 */
export const handleNavigate = (location: string) => {
  if (!location) return;

  openExternalUrl(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`,
  );
};
