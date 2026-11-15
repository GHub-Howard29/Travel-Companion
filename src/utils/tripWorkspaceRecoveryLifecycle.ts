interface EventTargetLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface DocumentTargetLike extends EventTargetLike {
  visibilityState: string;
}

export interface TripWorkspaceRecoveryResult {
  completed: boolean;
  selectedTripWasRemoved: boolean;
}

interface TripWorkspaceRecoveryOptions {
  windowTarget: EventTargetLike;
  documentTarget: DocumentTargetLike;
  isSessionReady: () => boolean;
  isOnline: () => boolean;
  reconcile: () => Promise<TripWorkspaceRecoveryResult>;
  setOnline: (online: boolean) => void;
  onError?: (error: unknown) => void;
  initiallyPending?: boolean;
  onPendingChange?: (pending: boolean) => void;
}

export interface TripWorkspaceRecoveryController {
  retryPendingRecovery: () => void;
  isPending: () => boolean;
  stop: () => void;
}

export const startTripWorkspaceRecoveryLifecycle = ({
  windowTarget,
  documentTarget,
  isSessionReady,
  isOnline,
  reconcile,
  setOnline,
  onError = (error) => console.warn(
    "Trip reconciliation after connectivity recovery failed; will retry",
    error,
  ),
  initiallyPending = false,
  onPendingChange = () => undefined,
}: TripWorkspaceRecoveryOptions): TripWorkspaceRecoveryController => {
  let recoveryPending = initiallyPending;
  let inFlight: Promise<void> | null = null;
  let disposed = false;

  const retryPendingRecovery = () => {
    if (
      disposed ||
      !recoveryPending ||
      !isSessionReady() ||
      !isOnline() ||
      inFlight
    ) {
      return;
    }

    const attempt = Promise.resolve()
      .then(reconcile)
      .then((result) => {
        if (disposed || !result.completed || !isOnline()) return;
        recoveryPending = false;
        onPendingChange(false);
        setOnline(true);
      })
      .catch(onError)
      .finally(() => {
        if (inFlight === attempt) inFlight = null;
      });

    inFlight = attempt;
  };

  const handleOnline = () => {
    recoveryPending = true;
    onPendingChange(true);
    setOnline(true);
    retryPendingRecovery();
  };

  const handleOffline = () => {
    recoveryPending = true;
    onPendingChange(true);
    setOnline(false);
  };

  const handleFocus = () => retryPendingRecovery();
  const handleVisibility = () => {
    if (documentTarget.visibilityState === "visible") retryPendingRecovery();
  };

  windowTarget.addEventListener("online", handleOnline);
  windowTarget.addEventListener("offline", handleOffline);
  windowTarget.addEventListener("focus", handleFocus);
  documentTarget.addEventListener("visibilitychange", handleVisibility);

  retryPendingRecovery();

  return {
    retryPendingRecovery,
    isPending: () => recoveryPending,
    stop: () => {
      if (disposed) return;
      disposed = true;
      windowTarget.removeEventListener("online", handleOnline);
      windowTarget.removeEventListener("offline", handleOffline);
      windowTarget.removeEventListener("focus", handleFocus);
      documentTarget.removeEventListener("visibilitychange", handleVisibility);
    },
  };
};
