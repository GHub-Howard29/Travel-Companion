export interface ExpenseRealtimePayload {
  new?: unknown;
  old?: unknown;
}

interface RealtimeChannel {
  on(
    type: "postgres_changes",
    filter: { event: "*"; schema: "public"; table: "expenses" },
    callback: (payload: ExpenseRealtimePayload) => void,
  ): RealtimeChannel;
  subscribe(callback: (status: string) => void): RealtimeChannel;
}

interface RealtimeClient {
  channel(name: string): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): Promise<unknown> | unknown;
}

interface EventTargetLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface DocumentLike extends EventTargetLike {
  visibilityState: string;
}

interface ExpenseRealtimeLifecycleOptions {
  tripId: string;
  supabase: RealtimeClient;
  loadExpenseBook: (tripId: string) => void | Promise<unknown>;
  windowTarget: EventTargetLike;
  documentTarget: DocumentLike;
  isOnline: () => boolean;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

export const startExpenseRealtimeLifecycle = ({
  tripId,
  supabase,
  loadExpenseBook,
  windowTarget,
  documentTarget,
  isOnline,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}: ExpenseRealtimeLifecycleOptions): (() => void) => {
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let hasSubscribed = false;
  let needsRefreshAfterConnection = false;
  let disposed = false;

  const refreshExpenseBook = () => {
    refreshTimer = null;
    if (disposed || !isOnline()) return;
    void loadExpenseBook(tripId);
  };

  const scheduleRefresh = () => {
    if (disposed) return;
    if (refreshTimer !== null) clearTimer(refreshTimer);
    refreshTimer = setTimer(refreshExpenseBook, 150);
  };

  const channel = supabase
    .channel(`travel-companion-expenses-${tripId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "expenses" },
      (payload) => {
        const nextTripId =
          payload.new && typeof payload.new === "object" && "trip_id" in payload.new
            ? String((payload.new as { trip_id?: unknown }).trip_id || "")
            : "";
        const previousTripId =
          payload.old && typeof payload.old === "object" && "trip_id" in payload.old
            ? String((payload.old as { trip_id?: unknown }).trip_id || "")
            : "";
        const changedTripId = nextTripId || previousTripId;

        // DELETE payloads can omit non-key columns. In that case refresh safely.
        if (changedTripId && changedTripId !== tripId) return;
        scheduleRefresh();
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (hasSubscribed || needsRefreshAfterConnection) scheduleRefresh();
        hasSubscribed = true;
        needsRefreshAfterConnection = false;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        needsRefreshAfterConnection = true;
      }
    });

  const handleRefresh = () => scheduleRefresh();
  const handleVisibilityChange = () => {
    if (documentTarget.visibilityState === "visible") scheduleRefresh();
  };

  windowTarget.addEventListener("focus", handleRefresh);
  windowTarget.addEventListener("online", handleRefresh);
  documentTarget.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    if (disposed) return;
    disposed = true;
    if (refreshTimer !== null) {
      clearTimer(refreshTimer);
      refreshTimer = null;
    }
    windowTarget.removeEventListener("focus", handleRefresh);
    windowTarget.removeEventListener("online", handleRefresh);
    documentTarget.removeEventListener("visibilitychange", handleVisibilityChange);
    void supabase.removeChannel(channel);
  };
};
