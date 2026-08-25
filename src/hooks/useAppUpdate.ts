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
export type AppUpdatePromptMode = "update" | "releaseNotice";
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

const reloadPage = () => {
  window.location.reload();
};

const waitForServiceWorkerControl = (
  previousController: ServiceWorker | null,
  timeoutMs = 8000,
) => {
  if (!("serviceWorker" in navigator)) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timeoutId: number | null = null;

    const finish = (controlled: boolean) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
      resolve(controlled);
    };

    const handleControllerChange = () => {
      const nextController = navigator.serviceWorker.controller;
      finish(Boolean(nextController && nextController !== previousController));
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );

    const currentController = navigator.serviceWorker.controller;
    if (currentController && currentController !== previousController) {
      finish(true);
      return;
    }

    timeoutId = window.setTimeout(() => {
      const current = navigator.serviceWorker.controller;
      finish(Boolean(current && current !== previousController));
    }, timeoutMs);
  });
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
  const [currentVersion, setCurrentVersion] = useState(APP_VERSION);
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
  const updateInProgressRef = useRef(false);
  const reloadStartedRef = useRef(false);

  const reloadOnce = useCallback(() => {
    if (reloadStartedRef.current) return;

    reloadStartedRef.current = true;
    reloadPage();
  }, []);

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
      // The update handler below waits for controllerchange before reloading.
      // Keep this callback as a safety net for Workbox events that arrive
      // outside the button flow, without racing an update already in progress.
      onNeedReload: () => {
        if (!updateInProgressRef.current) {
          reloadOnce();
        }
      },
      onRegisterError(error: unknown) {
        console.warn("PWA Service Worker registration failed.", error);
      },
    });
  }, [canShowUpdatePrompt, reloadOnce]);

  const update = useCallback(async () => {
    if (updateInProgressRef.current) return;
    updateInProgressRef.current = true;

    if (updateAvailable) {
      try {
        const updateServiceWorker = updateServiceWorkerRef.current;
        if (!updateServiceWorker) {
          throw new Error("Service Worker update handler is not ready.");
        }

        // Register the browser-level listener before sending SKIP_WAITING.
        // The Workbox promise resolves when the message is sent, not when the
        // new worker controls the page. Reloading earlier can reopen the old
        // shell, show the prompt twice, or leave the PWA on a blank page.
        const previousController = navigator.serviceWorker?.controller ?? null;
        const controlPromise = waitForServiceWorkerControl(previousController);
        await updateServiceWorker(true);

        let controlled = await controlPromise;

        // A few Chromium/PWA builds occasionally miss the first controller
        // transition. Re-send the same idempotent message once so one button
        // click still completes the update instead of requiring a second click.
        if (!controlled) {
          const retryControlPromise =
            waitForServiceWorkerControl(navigator.serviceWorker?.controller ?? null);
          await updateServiceWorker(true);
          controlled = await retryControlPromise;
        }

        if (!controlled) {
          throw new Error("新版 Service Worker 尚未接管目前頁面。");
        }

        setStoredAppVersion(latestMetadata.version);
        setCurrentVersion(latestMetadata.version);
        setReleaseNoticeVisible(false);
        setUpdateAvailable(false);
        updateInProgressRef.current = false;
        reloadOnce();
      } catch (error) {
        console.warn("PWA Service Worker update failed.", error);
        // Keep the forced-update prompt visible so a transient registration
        // failure does not hide the only recovery action or mark the version
        // as already updated before the new bundle is running.
        updateInProgressRef.current = false;
      }
      return;
    }

    setStoredAppVersion(latestMetadata.version);
    setCurrentVersion(latestMetadata.version);
    setReleaseNoticeVisible(false);
    setUpdateAvailable(false);
    updateInProgressRef.current = false;
    reloadOnce();
  }, [latestMetadata.version, reloadOnce, updateAvailable]);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    setUpdateAvailable(false);
    if (releaseNoticeVisible) {
      setStoredAppVersion(APP_VERSION);
    }
    setReleaseNoticeVisible(false);
  }, [releaseNoticeVisible]);

  const isPromptVisible =
    canShowUpdatePrompt && (updateAvailable || releaseNoticeVisible);
  const promptMode: AppUpdatePromptMode = updateAvailable
    ? "update"
    : "releaseNotice";

  return {
    updateAvailable: isPromptVisible,
    promptMode,
    currentVersion,
    latestVersion: latestMetadata.version,
    releaseDate: latestMetadata.releaseDate,
    releaseNotes: latestMetadata.releaseNotes,
    forceUpdate: latestMetadata.forceUpdate,
    update,
    dismiss,
  };
};
