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
import { hasStableActivatedReplacement } from "../utils/serviceWorkerUpdatePolicy";

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;
export type AppUpdatePromptMode = "update" | "releaseNotice";
export type AppUpdatePhase =
  | "idle"
  | "syncing-data"
  | "checking-metadata"
  | "downloading"
  | "waiting-control";
const RELEASE_NOTICE_STORAGE_KEY = "travel_companion_seen_app_version";
const VERSION_POLICY_STORAGE_KEY = "travel_companion_app_version_policy";
const PENDING_UPDATE_VERSION_KEY = "travel_companion_pending_update_version";
const UPDATE_RELOAD_ATTEMPT_KEY = "travel_companion_update_reload_attempt";
const HANDOFF_TIMEOUT_MS = 15000;
const UPDATE_DIAGNOSTICS_KEY = "travel_companion_update_diagnostics";
const MANUAL_RECOVERY_ATTEMPT_KEY = "travel_companion_manual_recovery_attempt";
const MAX_UPDATE_DIAGNOSTICS = 20;

type UpdateDiagnosticEvent = { at: string; event: string; details?: Record<string, unknown> };

const readUpdateDiagnostics = (): UpdateDiagnosticEvent[] => {
  try {
    const value = JSON.parse(localStorage.getItem(UPDATE_DIAGNOSTICS_KEY) ?? "[]");
    return Array.isArray(value) ? value.slice(-MAX_UPDATE_DIAGNOSTICS) : [];
  } catch {
    return [];
  }
};

const recordUpdateDiagnostic = (event: string, details?: Record<string, unknown>) => {
  try {
    const entries = readUpdateDiagnostics();
    entries.push({ at: new Date().toISOString(), event, details });
    localStorage.setItem(UPDATE_DIAGNOSTICS_KEY, JSON.stringify(entries.slice(-MAX_UPDATE_DIAGNOSTICS)));
  } catch (error) {
    console.warn("Unable to persist PWA update diagnostics.", error);
  }
};

const getWorkerSnapshot = (worker: ServiceWorker | null) => worker
  ? { state: worker.state, scriptURL: worker.scriptURL }
  : null;

const recordWorkerSnapshot = (
  stage: string,
  targetVersion: string,
  registration: ServiceWorkerRegistration | null,
  expectedWorker: ServiceWorker | null = null,
) => {
  const controller = navigator.serviceWorker?.controller ?? null;
  recordUpdateDiagnostic(stage, {
    currentVersion: APP_VERSION,
    targetVersion,
    online: navigator.onLine,
    phase: stage,
    installing: getWorkerSnapshot(registration?.installing ?? null),
    waiting: getWorkerSnapshot(registration?.waiting ?? null),
    active: getWorkerSnapshot(registration?.active ?? null),
    controller: getWorkerSnapshot(controller),
    expectedWorker: getWorkerSnapshot(expectedWorker),
    controllerIsExpected: Boolean(controller && expectedWorker && controller === expectedWorker),
    activeIsExpected: Boolean(registration?.active && expectedWorker && registration.active === expectedWorker),
  });
};

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
const setPendingUpdateVersion = (version: string) => {
  localStorage.setItem(PENDING_UPDATE_VERSION_KEY, version);
};
const getPendingUpdateVersion = () => localStorage.getItem(PENDING_UPDATE_VERSION_KEY);
const clearPendingUpdateVersion = () => {
  localStorage.removeItem(PENDING_UPDATE_VERSION_KEY);
};
const getReloadAttemptVersion = () => localStorage.getItem(UPDATE_RELOAD_ATTEMPT_KEY);
const setReloadAttemptVersion = (version: string) => {
  localStorage.setItem(UPDATE_RELOAD_ATTEMPT_KEY, version);
};
const clearReloadAttemptVersion = () => {
  localStorage.removeItem(UPDATE_RELOAD_ATTEMPT_KEY);
};

const confirmPendingUpdateForCurrentBundle = () => {
  const pendingVersion = getPendingUpdateVersion();
  if (!pendingVersion) return false;
  if (pendingVersion !== APP_VERSION) {
    console.warn(
      `PWA update reload did not reach the target bundle. Expected ${pendingVersion}, received ${APP_VERSION}.`,
    );
    return false;
  }

  setStoredAppVersion(APP_VERSION);
  clearPendingUpdateVersion();
  clearReloadAttemptVersion();
  sessionStorage.removeItem(MANUAL_RECOVERY_ATTEMPT_KEY);
  return true;
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

type ServiceWorkerHandoffState = "controlled" | "timeout";

const waitForServiceWorkerHandoff = (
  registration: ServiceWorkerRegistration,
  expectedWorker: ServiceWorker,
  timeoutMs = HANDOFF_TIMEOUT_MS,
): Promise<ServiceWorkerHandoffState> => {
  if (!("serviceWorker" in navigator)) return Promise.resolve("timeout");

  return new Promise<ServiceWorkerHandoffState>((resolve) => {
    let settled = false;
    let timeoutId: number | null = null;
    let readinessCheckId: number | null = null;

    const getState = (): ServiceWorkerHandoffState | null => {
      const controller = navigator.serviceWorker.controller;
      const activeWorker = registration.active;
      const expectedWorkerControlsPage =
        expectedWorker !== null &&
        controller === expectedWorker &&
        controller.state === "activated" &&
        activeWorker === expectedWorker;

      if (expectedWorkerControlsPage) return "controlled";

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
    const handleControllerChange = () => {
      const controller = navigator.serviceWorker.controller;
      recordUpdateDiagnostic("controllerchange", { controllerState: controller?.state ?? null, controllerScriptURL: controller?.scriptURL ?? null, isExpected: controller === expectedWorker });
      checkForHandoff();
    };
    const handleWorkerStateChange = () => {
      recordUpdateDiagnostic("expected-worker-statechange", { state: expectedWorker.state, scriptURL: expectedWorker.scriptURL });
      checkForHandoff();
    };

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
    hasStableActivatedReplacement(registration, previousController);

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
      recordUpdateDiagnostic("installing-worker-statechange", { state: installingWorker?.state ?? null, scriptURL: installingWorker?.scriptURL ?? null });
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
    const handleUpdateFound = () => {
      recordUpdateDiagnostic("updatefound", { installingState: registration.installing?.state ?? null });
      watchInstallingWorker();
    };

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
  useEffect(() => {
    confirmPendingUpdateForCurrentBundle();
  }, []);
  const updateServiceWorkerRef = useRef<UpdateServiceWorker | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const updateInProgressRef = useRef(false);
  const reloadStartedRef = useRef(false);
  const lastWorkerUpdateCheckAtRef = useRef(0);

  const reloadOnce = useCallback((targetVersion: string) => {
    if (reloadStartedRef.current) return;
    const attemptedVersion = getReloadAttemptVersion();
    if (attemptedVersion === targetVersion) {
      setUpdateError(
        `新版 ${targetVersion} 尚未完成載入確認，已停止自動刷新以避免循環。請重新開啟 App 後再確認版本。`,
      );
      setUpdatePhase("idle");
      return;
    }

    reloadStartedRef.current = true;
    setReloadAttemptVersion(targetVersion);
    setPendingUpdateVersion(targetVersion);
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

  const update = useCallback(async (beforeUpdate?: () => Promise<void>, recovery = false) => {
    if (updateInProgressRef.current) return;
    if (recovery) {
      const recoveryCount = Number(sessionStorage.getItem(MANUAL_RECOVERY_ATTEMPT_KEY) ?? "0");
      if (recoveryCount >= 1) {
        setUpdateError("本次已完成一次手動恢復嘗試。為避免反覆重新載入，請從 Android 最近使用的 App 關閉 Travel-Companion，再重新開啟。");
        return;
      }
      sessionStorage.setItem(MANUAL_RECOVERY_ATTEMPT_KEY, String(recoveryCount + 1));
      clearReloadAttemptVersion();
      recordUpdateDiagnostic("manual-recovery-start", { currentVersion: APP_VERSION, targetVersion: latestMetadata.version });
    } else {
      // A deliberate user retry starts a new bounded attempt after a prior reload failed to confirm.
      clearReloadAttemptVersion();
    }
    if (!policy.hasUpdate && !recovery) {
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
      if (refreshedPolicy && !refreshedPolicy.hasUpdate && !recovery) {
        setUpdatePhase("idle");
        return;
      }
      const registration =
        registrationRef.current ?? (await navigator.serviceWorker.ready);
      registrationRef.current = registration;
      const previousController = navigator.serviceWorker?.controller ?? null;
      recordWorkerSnapshot("update-start", latestMetadata.version, registration);
      const startedAt = Date.now();
      setUpdatePhase("downloading");
      await registration.update();
      recordUpdateDiagnostic("worker-update-check-complete", { elapsedMs: Date.now() - startedAt });
      const workerReadyStartedAt = Date.now();
      const workerReady = await waitForUpdateWorkerReady(
        registration,
        previousController,
        () => Boolean(registration.waiting),
      );
      recordUpdateDiagnostic("worker-ready-result", { ready: workerReady, elapsedMs: Date.now() - workerReadyStartedAt });
      if (!workerReady) {
        recordWorkerSnapshot("worker-ready-timeout", latestMetadata.version, registration);
        setUpdateError("新版尚未下載完成，請確認網路連線後再試；目前版本仍可繼續使用。");
        setUpdatePhase("idle");
        return;
      }
      setHasPreparedUpdate(true);
      const activatedReplacement = hasStableActivatedReplacement(
        registration,
        previousController,
      );
      if (activatedReplacement && navigator.serviceWorker.controller === registration.active) {
        reloadOnce(latestMetadata.version);
        return;
      }

      const waitingWorker = registration.waiting;
      const expectedWorker = waitingWorker ?? (activatedReplacement ? registration.active : null);
      recordWorkerSnapshot("worker-ready", latestMetadata.version, registration, expectedWorker);
      if (!expectedWorker) {
        setUpdateError("新版尚未進入可接管狀態，請稍後再試；目前版本仍可正常使用。");
        setUpdatePhase("idle");
        return;
      }

      const updateServiceWorker = updateServiceWorkerRef.current;
      if (waitingWorker && !updateServiceWorker) {
        setUpdateError("新版已偵測到，但更新處理器尚未就緒，請稍後再試。");
        setUpdatePhase("idle");
        return;
      }

      setUpdatePhase("waiting-control");
      const handoffStartedAt = Date.now();
      recordWorkerSnapshot("handoff-wait-start", latestMetadata.version, registration, expectedWorker);
      const handoffPromise = waitForServiceWorkerHandoff(
        registration,
        expectedWorker,
      );

      // 先記錄目標版本；只有新 document 的 bundle 版本吻合時才會確認完成。
      setPendingUpdateVersion(latestMetadata.version);

      // waiting worker 才送一次 SKIP_WAITING；已 active 的 replacement 只等待 clientsClaim 接管。
      let handoffState: ServiceWorkerHandoffState;
      if (waitingWorker) {
        recordUpdateDiagnostic("skip-waiting-requested", { targetVersion: latestMetadata.version, workerState: waitingWorker.state });
        const skipWaitingPromise = updateServiceWorker!(false).then(() => {
          recordUpdateDiagnostic("skip-waiting-call-resolved", { elapsedMs: Date.now() - handoffStartedAt });
        });
        // A stuck Workbox callback must not prevent the handoff timeout from being handled.
        handoffState = await Promise.race([
          handoffPromise,
          skipWaitingPromise.then(() => handoffPromise),
        ]);
      } else {
        handoffState = await handoffPromise;
      }
      recordWorkerSnapshot(handoffState === "controlled" ? "handoff-controlled" : "handoff-timeout", latestMetadata.version, registration, expectedWorker);
      recordUpdateDiagnostic("handoff-result", { result: handoffState, elapsedMs: Date.now() - handoffStartedAt });

      if (handoffState === "controlled") {
        reloadOnce(latestMetadata.version);
        return;
      }

      setUpdateError(
        `新版已要求接管，但 ${HANDOFF_TIMEOUT_MS / 1000} 秒內未確認由新版 Service Worker 控制。請稍後重試，或重新開啟 App；不會自動重複刷新。`,
      );
      setUpdatePhase("idle");
    } catch (error) {
      console.warn("PWA Service Worker update failed.", error);
      recordWorkerSnapshot("update-exception", latestMetadata.version, registrationRef.current);
      recordUpdateDiagnostic("update-error", { message: error instanceof Error ? error.message.slice(0, 240) : "unknown" });
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
    latestMetadata.version,
    policy.hasUpdate,
    reloadOnce,
  ]);

  const copyUpdateDiagnostics = useCallback(async () => {
    const payload = {
      currentVersion: APP_VERSION,
      targetVersion: latestMetadata.version,
      diagnostics: readUpdateDiagnostics(),
    };
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    } catch (error) {
      console.warn("Unable to copy PWA update diagnostics.", error);
      setUpdateError("無法複製診斷資訊，請確認瀏覽器允許剪貼簿存取後再試。");
    }
  }, [latestMetadata.version]);

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
    copyUpdateDiagnostics,
    dismiss,
  };
};
