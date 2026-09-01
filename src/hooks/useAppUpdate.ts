/** PWA 更新偵測、最低支援版本政策與 Service Worker 接管流程。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";

import {
  APP_VERSION,
  FORCE_UPDATE,
  MINIMUM_SUPPORTED_VERSION,
  RELEASE_DATE,
  RELEASE_NOTES,
} from "../config/appVersion";
import {
  compareSemanticVersions,
  evaluateAppUpdatePolicy,
  parseAppVersionMetadata,
  type AppUpdatePolicy,
  type AppVersionMetadata,
} from "../utils/appVersionPolicy";

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;
export type AppUpdatePromptMode = "update" | "releaseNotice";
const RELEASE_NOTICE_STORAGE_KEY = "travel_companion_seen_app_version";
const VERSION_POLICY_STORAGE_KEY = "travel_companion_app_version_policy";

const getRuntimeDisplayMode = () => {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  const isInstalledApp =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    standaloneNavigator.standalone === true ||
    document.referrer.startsWith("android-app://");
  const isIosDevice =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return { canShowGeneralPrompt: isInstalledApp || isIosDevice };
};

const getStoredAppVersion = () => localStorage.getItem(RELEASE_NOTICE_STORAGE_KEY);
const setStoredAppVersion = (version: string) => {
  localStorage.setItem(RELEASE_NOTICE_STORAGE_KEY, version);
};
const getStoredVersionPolicy = (): AppVersionMetadata | null => {
  try {
    const storedValue = localStorage.getItem(VERSION_POLICY_STORAGE_KEY);
    return storedValue ? parseAppVersionMetadata(JSON.parse(storedValue)) : null;
  } catch (error) {
    console.warn("已儲存的版本政策無法解析。", error);
    return null;
  }
};
const setStoredVersionPolicy = (metadata: AppVersionMetadata) => {
  localStorage.setItem(VERSION_POLICY_STORAGE_KEY, JSON.stringify(metadata));
};
const getBasePath = () =>
  window.location.pathname.includes("/Travel-Companion") ? "/Travel-Companion/" : "/";

const fetchLatestVersionMetadata = async (): Promise<AppVersionMetadata | null> => {
  try {
    const response = await fetch(`${getBasePath()}app-version.json?ts=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      console.warn(`版本政策讀取失敗：HTTP ${response.status}。`);
      return null;
    }
    const metadata = parseAppVersionMetadata(await response.json());
    if (!metadata) console.warn("版本政策格式錯誤，保留目前的更新狀態。");
    return metadata;
  } catch (error) {
    console.warn("版本政策讀取失敗，保留目前的更新狀態。", error);
    return null;
  }
};

const waitForServiceWorkerControl = (
  previousController: ServiceWorker | null,
  timeoutMs = 8000,
) => {
  if (!("serviceWorker" in navigator)) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timeoutId: number | null = null;
    const finish = (controlled: boolean) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      resolve(controlled);
    };
    const handleControllerChange = () => {
      const nextController = navigator.serviceWorker.controller;
      finish(Boolean(nextController && nextController !== previousController));
    };
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
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

const waitForUpdateWorkerReady = (
  registration: ServiceWorkerRegistration,
  isWorkerReady: () => boolean,
  timeoutMs = 30000,
) => {
  if (isWorkerReady() || registration.waiting) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timeoutId: number | null = null;
    let readinessCheckId: number | null = null;
    let installingWorker: ServiceWorker | null = null;

    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (readinessCheckId !== null) window.clearInterval(readinessCheckId);
      registration.removeEventListener("updatefound", handleUpdateFound);
      installingWorker?.removeEventListener("statechange", handleStateChange);
      resolve(ready);
    };
    const checkReady = () => {
      if (isWorkerReady() || registration.waiting) finish(true);
    };
    const handleStateChange = () => {
      checkReady();
      if (installingWorker?.state === "redundant") finish(false);
    };
    const watchInstallingWorker = () => {
      const nextWorker = registration.installing;
      if (!nextWorker || nextWorker === installingWorker) return;
      installingWorker?.removeEventListener("statechange", handleStateChange);
      installingWorker = nextWorker;
      installingWorker.addEventListener("statechange", handleStateChange);
      checkReady();
    };
    const handleUpdateFound = () => watchInstallingWorker();

    registration.addEventListener("updatefound", handleUpdateFound);
    watchInstallingWorker();
    readinessCheckId = window.setInterval(checkReady, 100);
    timeoutId = window.setTimeout(() => {
      checkReady();
      if (!settled) finish(false);
    }, timeoutMs);
  });
};

const INITIAL_METADATA: AppVersionMetadata = {
  version: APP_VERSION,
  releaseDate: RELEASE_DATE,
  releaseNotes: RELEASE_NOTES,
  forceUpdate: FORCE_UPDATE,
  minimumSupportedVersion: MINIMUM_SUPPORTED_VERSION,
};
const NO_UPDATE_POLICY: AppUpdatePolicy = {
  hasUpdate: false,
  isMandatoryForCurrentClient: false,
};

const getInitialUpdateState = () => {
  const storedMetadata = getStoredVersionPolicy();
  const storedPolicy = storedMetadata
    ? evaluateAppUpdatePolicy(APP_VERSION, storedMetadata)
    : null;
  const latestComparison = storedMetadata
    ? compareSemanticVersions(APP_VERSION, storedMetadata.version)
    : null;
  if (storedMetadata && storedPolicy && latestComparison !== null && latestComparison <= 0) {
    return { metadata: storedMetadata, policy: storedPolicy };
  }
  return { metadata: INITIAL_METADATA, policy: NO_UPDATE_POLICY };
};

export const useAppUpdate = () => {
  const [{ canShowGeneralPrompt }] = useState(getRuntimeDisplayMode);
  const [initialUpdateState] = useState(getInitialUpdateState);
  const [latestMetadata, setLatestMetadata] = useState(initialUpdateState.metadata);
  const [policy, setPolicy] = useState(initialUpdateState.policy);
  const [isGeneralDismissed, setIsGeneralDismissed] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(() =>
    initialUpdateState.policy.isMandatoryForCurrentClient && !navigator.onLine
      ? "需要網路才能完成更新，請連線後重試。"
      : null,
  );
  const [isChecking, setIsChecking] = useState(false);
  const [releaseNoticeVisible, setReleaseNoticeVisible] = useState(() => {
    if (!canShowGeneralPrompt) return false;
    const storedVersion = getStoredAppVersion();
    if (!storedVersion) {
      setStoredAppVersion(APP_VERSION);
      return false;
    }
    return storedVersion !== APP_VERSION;
  });
  const updateServiceWorkerRef = useRef<UpdateServiceWorker | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const workerReadyRef = useRef(false);
  const updateInProgressRef = useRef(false);
  const reloadStartedRef = useRef(false);

  const reloadOnce = useCallback(() => {
    if (reloadStartedRef.current) return;
    reloadStartedRef.current = true;
    window.location.reload();
  }, []);

  const checkVersionPolicy = useCallback(async () => {
    const metadata = await fetchLatestVersionMetadata();
    if (!metadata) return null;
    const nextPolicy = evaluateAppUpdatePolicy(APP_VERSION, metadata);
    const latestComparison = compareSemanticVersions(APP_VERSION, metadata.version);
    if (!nextPolicy || latestComparison === null || latestComparison > 0) {
      console.warn("版本政策含有無效或倒退的版本，保留目前的更新狀態。", metadata);
      return null;
    }
    setLatestMetadata(metadata);
    setPolicy(nextPolicy);
    setStoredVersionPolicy(metadata);
    if (nextPolicy.isMandatoryForCurrentClient) {
      setUpdateError(navigator.onLine ? null : "需要網路才能完成更新，請連線後重試。");
    }
    return nextPolicy;
  }, []);

  useEffect(() => {
    const initialCheckId = window.setTimeout(() => void checkVersionPolicy(), 0);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkVersionPolicy();
    };
    const handleOnline = () => {
      setUpdateError(null);
      void checkVersionPolicy();
      void registrationRef.current?.update();
    };
    const handleOffline = () => {
      setPolicy((current) => {
        if (current.isMandatoryForCurrentClient) {
          setUpdateError("需要網路才能完成更新，請連線後重試。");
        }
        return current;
      });
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.clearTimeout(initialCheckId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [checkVersionPolicy]);

  useEffect(() => {
    updateServiceWorkerRef.current = registerSW({
      immediate: true,
      onRegisteredSW(_serviceWorkerUrl, registration) {
        registrationRef.current = registration ?? null;
      },
      async onNeedRefresh() {
        workerReadyRef.current = true;
        setUpdateError(null);
        await checkVersionPolicy();
      },
      onNeedReload: () => {
        if (!updateInProgressRef.current) reloadOnce();
      },
      onRegisterError(error: unknown) {
        console.warn("PWA Service Worker registration failed.", error);
      },
    });
  }, [checkVersionPolicy, reloadOnce]);

  const update = useCallback(async () => {
    if (updateInProgressRef.current) return;
    if (!policy.hasUpdate) {
      setStoredAppVersion(APP_VERSION);
      setReleaseNoticeVisible(false);
      return;
    }
    updateInProgressRef.current = true;
    setUpdateError(null);
    setIsChecking(true);
    if (!navigator.onLine) {
      setUpdateError("需要網路才能完成更新，請連線後重試。");
      updateInProgressRef.current = false;
      setIsChecking(false);
      return;
    }
    try {
      const refreshedPolicy = await checkVersionPolicy();
      if (refreshedPolicy && !refreshedPolicy.hasUpdate) return;
      const registration =
        registrationRef.current ?? (await navigator.serviceWorker.ready);
      registrationRef.current = registration;
      await registration.update();
      const workerReady = await waitForUpdateWorkerReady(
        registration,
        () => workerReadyRef.current,
      );
      if (!workerReady) {
        setUpdateError("新版尚未下載完成，請確認網路連線後再重試。");
        return;
      }
      const updateServiceWorker = updateServiceWorkerRef.current;
      if (!updateServiceWorker) throw new Error("Service Worker update handler is not ready.");
      const previousController = navigator.serviceWorker?.controller ?? null;
      let controlPromise = waitForServiceWorkerControl(previousController);
      await updateServiceWorker(true);
      let controlled = await controlPromise;
      if (!controlled) {
        controlPromise = waitForServiceWorkerControl(navigator.serviceWorker?.controller ?? null);
        await updateServiceWorker(true);
        controlled = await controlPromise;
      }
      if (!controlled) throw new Error("新版 Service Worker 尚未接管目前頁面。");
      setStoredAppVersion(latestMetadata.version);
      reloadOnce();
    } catch (error) {
      console.warn("PWA Service Worker update failed.", error);
      setUpdateError("更新尚未完成，請確認網路連線後重試。");
    } finally {
      updateInProgressRef.current = false;
      setIsChecking(false);
    }
  }, [checkVersionPolicy, latestMetadata.version, policy.hasUpdate, reloadOnce]);

  const dismiss = useCallback(() => {
    if (policy.isMandatoryForCurrentClient) return;
    setIsGeneralDismissed(true);
    if (releaseNoticeVisible) setStoredAppVersion(APP_VERSION);
    setReleaseNoticeVisible(false);
  }, [policy.isMandatoryForCurrentClient, releaseNoticeVisible]);

  const shouldShowUpdate =
    policy.hasUpdate &&
    (policy.isMandatoryForCurrentClient || (canShowGeneralPrompt && !isGeneralDismissed));
  const isPromptVisible = shouldShowUpdate || (canShowGeneralPrompt && releaseNoticeVisible);
  return {
    updateAvailable: isPromptVisible,
    promptMode: (shouldShowUpdate ? "update" : "releaseNotice") as AppUpdatePromptMode,
    currentVersion: APP_VERSION,
    latestVersion: latestMetadata.version,
    releaseDate: latestMetadata.releaseDate,
    releaseNotes: latestMetadata.releaseNotes,
    currentReleaseDate: RELEASE_DATE,
    currentReleaseNotes: RELEASE_NOTES,
    isMandatoryForCurrentClient: policy.isMandatoryForCurrentClient,
    updateError,
    isChecking,
    update,
    dismiss,
  };
};
