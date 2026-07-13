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

const getRuntimeDisplayMode = () => {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };

  const isInstalledApp =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    navigatorWithStandalone.standalone === true ||
    document.referrer.startsWith("android-app://");
  const isIosDevice =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  return {
    isInstalledApp,
    canShowUpdatePrompt: isInstalledApp || isIosDevice,
  };
};

const getStoredAppVersion = () =>
  localStorage.getItem(RELEASE_NOTICE_STORAGE_KEY);

const setStoredAppVersion = (version: string) => {
  localStorage.setItem(RELEASE_NOTICE_STORAGE_KEY, version);
};

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

const clearAppCacheStorage = async () => {
  if (!("caches" in window)) return;

  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
};

const reloadPage = () => {
  window.location.reload();
};

export const useAppUpdate = () => {
  const [{ canShowUpdatePrompt }] = useState(getRuntimeDisplayMode);
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
    if (!canShowUpdatePrompt) {
      return false;
    }

    const storedVersion = getStoredAppVersion();

    if (!storedVersion) {
      setStoredAppVersion(APP_VERSION);
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

        if (canShowUpdatePrompt && !dismissedRef.current) {
          setUpdateAvailable(true);
        }
      },
      onNeedReload: reloadPage,
      onRegisterError(error: unknown) {
        console.warn("PWA Service Worker registration failed.", error);
      },
    });
  }, [canShowUpdatePrompt]);

  const update = useCallback(async () => {
    setStoredAppVersion(latestMetadata.version);
    setCurrentVersion(latestMetadata.version);
    setReleaseNoticeVisible(false);
    setUpdateAvailable(false);

    try {
      await clearAppCacheStorage();
    } catch (error) {
      console.warn("Failed to clear app cache storage before update.", error);
    }

    if (updateAvailable) {
      const fallbackReloadTimer = window.setTimeout(reloadPage, 1500);
      try {
        await updateServiceWorkerRef.current?.(true);
      } finally {
        window.clearTimeout(fallbackReloadTimer);
      }
      reloadPage();
      return;
    }

    reloadPage();
  }, [latestMetadata.version, updateAvailable]);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    setUpdateAvailable(false);
    setReleaseNoticeVisible(false);
  }, []);

  const isPromptVisible =
    canShowUpdatePrompt && (updateAvailable || releaseNoticeVisible);

  return {
    updateAvailable: isPromptVisible,
    currentVersion,
    latestVersion: latestMetadata.version,
    releaseDate: latestMetadata.releaseDate,
    releaseNotes: latestMetadata.releaseNotes,
    forceUpdate: latestMetadata.forceUpdate,
    update,
    dismiss,
  };
};
