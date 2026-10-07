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
export type AppUpdatePhase =
  | "idle"
  | "syncing-data"
  | "checking-metadata"
  | "downloading"
  | "waiting-control"
  | "ready-to-reload";
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

type ServiceWorkerHandoffState = "controlled" | "active" | "timeout";

const waitForServiceWorkerHandoff = (
  registration: ServiceWorkerRegistration,
  previousController: ServiceWorker | null,
  expectedWorker: ServiceWorker | null,
  timeoutMs = 12000,
): Promise<ServiceWorkerHandoffState> => {
  if (!("serviceWorker" in navigator)) return Promise.resolve("timeout");

  return new Promise<ServiceWorkerHandoffState>((resolve) => {
    let settled = false;
    let timeoutId: number | null = null;
    let readinessCheckId: number | null = null;

    const getState = (): ServiceWorkerHandoffState | null => {
      const controller = navigator.serviceWorker.controller;
      const activeWorker = registration.active;
      const controllerAligned =
        Boolean(controller) &&
        controller !== previousController &&
        controller?.state === "activated" &&
        activeWorker === controller;

      if (controllerAligned) return "controlled";

      const expectedWorkerActivated =
        expectedWorker !== null &&
        expectedWorker.state === "activated" &&
        activeWorker === expectedWorker;
      const replacementActive =
        expectedWorker === null &&
        Boolean(activeWorker) &&
        activeWorker !== previousController &&
        activeWorker?.state === "activated";

      if (expectedWorkerActivated || replacementActive) return "active";
      return null;
    };

    const finish = (state: ServiceWorkerHandoffState) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (readinessCheckId !== null) window.clearInterval(readinessCheckId);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      expectedWorker?.removeEventListener("statechange", handleWorkerStateChange);
      resolve(state);
    };

    const checkForHandoff = () => {
      const state = getState();
      if (state) finish(state);
    };
    const handleControllerChange = () => checkForHandoff();
    const handleWorkerStateChange = () => checkForHandoff();

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    expectedWorker?.addEventListener("statechange", handleWorkerStateChange);
    readinessCheckId = window.setInterval(checkForHandoff, 100);
    checkForHandoff();

    timeoutId = window.setTimeout(() => {
      finish(getState() ?? "timeout");
    }, timeoutMs);
  });
};

const waitForUpdateWorkerReady = (
  registration: ServiceWorkerRegistration,
  previousController: ServiceWorker | null,
  isWorkerReady: () => boolean,
  timeoutMs = 30000,
) => {
  const hasActivatedReplacement = () =>
    Boolean(
      registration.active &&
      registration.active !== previousController &&
      registration.active.state === "activated",
    );

  if (isWorkerReady() || registration.waiting || hasActivatedReplacement()) {
    return Promise.resolve(true);
  }

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
      if (isWorkerReady() || registration.waiting || hasActivatedReplacement()) {
        finish(true);
      }
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
  const [updatePhase, setUpdatePhase] = useState<AppUpdatePhase>("idle");
  const [hasPreparedUpdate, setHasPreparedUpdate] = useState(false);
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
  const safeReloadWorkerRef = useRef<ServiceWorker | null>(null);
  const reloadStartedRef = useRef(false);
  const lastWorkerUpdateCheckAtRef = useRef(0);

  const reloadOnce = useCallback(() => {
    if (reloadStartedRef.current) return;
    reloadStartedRef.current = true;
    window.location.reload();
  }, []);

  const requestServiceWorkerUpdate = useCallback(
    (registration?: ServiceWorkerRegistration | null, force = false) => {
      const targetRegistration = registration ?? registrationRef.current;
      if (!targetRegistration || !navigator.onLine) return;

      const now = Date.now();
      if (!force && now - lastWorkerUpdateCheckAtRef.current < 30000) return;
      lastWorkerUpdateCheckAtRef.current = now;

      void targetRegistration.update().catch((error) => {
        console.warn("PWA Service Worker update check failed.", error);
      });
    },
    [],
  );

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
      if (document.visibilityState !== "visible") return;
      void checkVersionPolicy();
      requestServiceWorkerUpdate();
    };
    const handleOnline = () => {
      setUpdateError(null);
      void checkVersionPolicy();
      requestServiceWorkerUpdate(undefined, true);
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
  }, [checkVersionPolicy, requestServiceWorkerUpdate]);

  useEffect(() => {
    updateServiceWorkerRef.current = registerSW({
      immediate: true,
      onRegisteredSW(_serviceWorkerUrl, registration) {
        registrationRef.current = registration ?? null;
        requestServiceWorkerUpdate(registration ?? null, true);
      },
      async onNeedRefresh() {
        workerReadyRef.current = true;
        setHasPreparedUpdate(true);
        setUpdateError(null);
        await checkVersionPolicy();
      },
      onNeedReload: () => {
        // Workbox 的 controlling 事件只代表接管訊號；實際 reload 一律由 update()
        // 在資料 preflight 與 Service Worker handoff 驗證完成後統一執行。
      },
      onRegisterError(error: unknown) {
        console.warn("PWA Service Worker registration failed.", error);
      },
    });
  }, [checkVersionPolicy, requestServiceWorkerUpdate]);

  const update = useCallback(async (beforeUpdate?: () => Promise<void>) => {
    if (updateInProgressRef.current) return;
    if (!policy.hasUpdate) {
      setStoredAppVersion(APP_VERSION);
      setReleaseNoticeVisible(false);
      return;
    }

    updateInProgressRef.current = true;
    setUpdateError(null);
    setIsChecking(true);
    try {
      if (!navigator.onLine) {
        setUpdateError("目前離線，需要網路才能完成更新。");
        setUpdatePhase("idle");
        return;
      }

      if (hasPreparedUpdate && updatePhase === "ready-to-reload") {
        const registration = registrationRef.current;
        const safeReloadWorker = safeReloadWorkerRef.current;
        if (
          registration?.active &&
          safeReloadWorker &&
          registration.active === safeReloadWorker &&
          safeReloadWorker.state === "activated"
        ) {
          setStoredAppVersion(latestMetadata.version);
          reloadOnce();
          return;
        }

        safeReloadWorkerRef.current = null;
        setUpdateError("新版接管狀態已改變，請重新執行更新確認。");
        setUpdatePhase("idle");
        return;
      }

      if (beforeUpdate) {
        setUpdatePhase("syncing-data");
        try {
          await beforeUpdate();
        } catch (error) {
          console.warn("App update data preflight failed.", error);
          setUpdateError("行程資料同步尚未完成，請稍後重試更新；目前資料不會被覆蓋。");
          setUpdatePhase("idle");
          return;
        }
      }

      setUpdatePhase("checking-metadata");
      const refreshedPolicy = await checkVersionPolicy();
      if (refreshedPolicy && !refreshedPolicy.hasUpdate) {
        setUpdatePhase("idle");
        return;
      }
      const registration =
        registrationRef.current ?? (await navigator.serviceWorker.ready);
      registrationRef.current = registration;
      const previousController = navigator.serviceWorker?.controller ?? null;
      safeReloadWorkerRef.current = null;
      setUpdatePhase("downloading");
      await registration.update();
      const workerReady = await waitForUpdateWorkerReady(
        registration,
        previousController,
        () => workerReadyRef.current,
      );
      if (!workerReady) {
        setUpdateError("新版尚未下載完成，請稍後再試；這不代表目前網路一定異常。");
        setUpdatePhase("idle");
        return;
      }
      setHasPreparedUpdate(true);

      const activatedReplacement =
        registration.active &&
        registration.active !== previousController &&
        registration.active.state === "activated" &&
        !registration.waiting &&
        !registration.installing;
      if (activatedReplacement) {
        safeReloadWorkerRef.current = registration.active;
        setUpdateError(null);
        setUpdatePhase("ready-to-reload");
        return;
      }

      const updateServiceWorker = updateServiceWorkerRef.current;
      if (!updateServiceWorker) {
        setUpdateError("新版已偵測到，但更新處理器尚未就緒，請稍後再試。");
        setUpdatePhase("idle");
        return;
      }

      const expectedWorker = registration.waiting ?? registration.installing;
      setUpdatePhase("waiting-control");
      const handoffPromise = waitForServiceWorkerHandoff(
        registration,
        previousController,
        expectedWorker,
      );

      // vite-plugin-pwa 的 prompt 模式在此只需要送出一次 SKIP_WAITING。
      // reload 由本 hook 在確認新 worker 已 active／接管後統一控制，避免重複觸發競態。
      await updateServiceWorker(false);
      const handoffState = await handoffPromise;

      if (handoffState === "controlled") {
        setStoredAppVersion(latestMetadata.version);
        reloadOnce();
        return;
      }

      if (handoffState === "active" && registration.active) {
        safeReloadWorkerRef.current = registration.active;
        setUpdateError(null);
        setUpdatePhase("ready-to-reload");
        return;
      }

      setUpdateError("新版尚未完成接管，請稍後重試更新；目前版本仍可正常使用。");
      setUpdatePhase("idle");
    } catch (error) {
      console.warn("PWA Service Worker update failed.", error);
      setUpdateError(
        navigator.onLine
          ? "更新處理發生錯誤，請稍後重新嘗試。"
          : "更新期間網路已中斷，請恢復連線後重試。",
      );
      setUpdatePhase("idle");
    } finally {
      updateInProgressRef.current = false;
      setIsChecking(false);
    }
  }, [
    checkVersionPolicy,
    hasPreparedUpdate,
    latestMetadata.version,
    policy.hasUpdate,
    reloadOnce,
    updatePhase,
  ]);

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
    updatePhase,
    hasPreparedUpdate,
    isUpdateInProgress: isChecking,
    update,
    dismiss,
  };
};
