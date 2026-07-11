/**
 * PWA 更新偵測 Hook
 *
 * 負責註冊既有 Service Worker，並在瀏覽器偵測到新版時通知 UI。
 * 不自動 reload，需等待使用者在更新提示中確認。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";

import {
  APP_VERSION,
  FORCE_UPDATE,
  RELEASE_DATE,
  RELEASE_NOTES,
} from "../config/appVersion";

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

export const useAppUpdate = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const dismissedRef = useRef(false);
  const updateServiceWorkerRef = useRef<UpdateServiceWorker | null>(null);

  useEffect(() => {
    updateServiceWorkerRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        if (!dismissedRef.current) {
          setUpdateAvailable(true);
        }
      },
      onNeedReload() {
        window.location.reload();
      },
      onRegisterError(error: unknown) {
        console.warn("PWA Service Worker registration failed.", error);
      },
    });
  }, []);

  const update = useCallback(() => {
    void updateServiceWorkerRef.current?.(true);
  }, []);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    setUpdateAvailable(false);
  }, []);

  return {
    updateAvailable,
    currentVersion: APP_VERSION,
    latestVersion: APP_VERSION,
    releaseDate: RELEASE_DATE,
    releaseNotes: RELEASE_NOTES,
    forceUpdate: FORCE_UPDATE,
    update,
    dismiss,
  };
};
