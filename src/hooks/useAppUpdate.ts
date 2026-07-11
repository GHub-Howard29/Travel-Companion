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
type AppVersionMetadata = {
  version: string;
  releaseDate: string;
  releaseNotes: string[];
  forceUpdate: boolean;
};

const RELEASE_NOTICE_STORAGE_KEY = "travel_companion_seen_app_version";

const getStoredAppVersion = () =>
  localStorage.getItem(RELEASE_NOTICE_STORAGE_KEY);

const getBasePath = () => {
  const path = window.location.pathname;
  return path.includes("/Travel-Companion") ? "/Travel-Companion/" : "/";
};

const fetchLatestVersionMetadata = async (): Promise<AppVersionMetadata | null> => {
  try {
    const response = await fetch(
      `${getBasePath()}app-version.json?ts=${Date.now()}`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) return null;

    const data = (await response.json()) as Partial<AppVersionMetadata>;

    if (
      typeof data.version !== "string" ||
      typeof data.releaseDate !== "string" ||
      !Array.isArray(data.releaseNotes) ||
      typeof data.forceUpdate !== "boolean" ||
      !data.releaseNotes.every((note) => typeof note === "string")
    ) {
      return null;
    }

    return {
      version: data.version,
      releaseDate: data.releaseDate,
      releaseNotes: data.releaseNotes,
      forceUpdate: data.forceUpdate,
    };
  } catch (error) {
    console.warn("Failed to fetch app version metadata.", error);
    return null;
  }
};

export const useAppUpdate = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestMetadata, setLatestMetadata] = useState<AppVersionMetadata>({
    version: APP_VERSION,
    releaseDate: RELEASE_DATE,
    releaseNotes: RELEASE_NOTES,
    forceUpdate: FORCE_UPDATE,
  });
  const [currentVersion, setCurrentVersion] = useState(() => {
    const storedVersion = getStoredAppVersion();
    return storedVersion ?? APP_VERSION;
  });
  const [releaseNoticeVisible, setReleaseNoticeVisible] = useState(() => {
    const storedVersion = getStoredAppVersion();

    if (!storedVersion) {
      localStorage.setItem(RELEASE_NOTICE_STORAGE_KEY, APP_VERSION);
      return false;
    }

    return storedVersion !== APP_VERSION;
  });
  const dismissedRef = useRef(false);
  const updateServiceWorkerRef = useRef<UpdateServiceWorker | null>(null);

  useEffect(() => {
    updateServiceWorkerRef.current = registerSW({
      immediate: true,
      async onNeedRefresh() {
        const latestVersion = await fetchLatestVersionMetadata();

        if (!latestVersion || latestVersion.version === APP_VERSION) {
          return;
        }

        setLatestMetadata(latestVersion);

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
    setCurrentVersion(APP_VERSION);
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
    currentVersion,
    latestVersion: latestMetadata.version,
    releaseDate: latestMetadata.releaseDate,
    releaseNotes: latestMetadata.releaseNotes,
    forceUpdate: latestMetadata.forceUpdate,
    update,
    dismiss,
  };
};
