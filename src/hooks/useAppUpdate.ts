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

const RELEASE_NOTICE_STORAGE_KEY = "travel_companion_seen_app_version";

export const useAppUpdate = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [releaseNoticeVisible, setReleaseNoticeVisible] = useState(
    () => localStorage.getItem(RELEASE_NOTICE_STORAGE_KEY) !== APP_VERSION,
  );
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

  const markReleaseNoticeSeen = useCallback(() => {
    localStorage.setItem(RELEASE_NOTICE_STORAGE_KEY, APP_VERSION);
    setReleaseNoticeVisible(false);
  }, []);

  const update = useCallback(() => {
    if (updateAvailable) {
      void updateServiceWorkerRef.current?.(true);
      return;
    }

    markReleaseNoticeSeen();
  }, [markReleaseNoticeSeen, updateAvailable]);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    markReleaseNoticeSeen();
    setUpdateAvailable(false);
  }, [markReleaseNoticeSeen]);

  const isPromptVisible = updateAvailable || releaseNoticeVisible;

  return {
    updateAvailable: isPromptVisible,
    hasServiceWorkerUpdate: updateAvailable,
    currentVersion: APP_VERSION,
    latestVersion: APP_VERSION,
    releaseDate: RELEASE_DATE,
    releaseNotes: RELEASE_NOTES,
    forceUpdate: FORCE_UPDATE,
    update,
    dismiss,
  };
};
