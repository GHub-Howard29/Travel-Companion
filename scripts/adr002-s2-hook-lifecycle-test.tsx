import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import useTripWorkspace from "../src/hooks/useTripWorkspace";

type Session = { user: { id: string; email: string } } | null;
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
type Workspace = ReturnType<typeof useTripWorkspace>;
type Counts = { A: number; B: number; guest: number; permissionB: number };
type HookState = {
  userId: Workspace["userId"];
  userEmail: Workspace["userEmail"];
  isSessionReady: Workspace["isSessionReady"];
  isSignedIn: Workspace["isSignedIn"];
  selectedTripId: Workspace["selectedTripId"];
  tripIds: string[];
  currentTripId: string | null;
  isLoading: Workspace["isLoading"];
  adminProfile: Workspace["adminProfile"];
  hasEditPermission: Workspace["hasEditPermission"];
  expenseBookTripId: Workspace["expenseBookTripId"];
  selectedTripMetaId: string | null;
};
type TestResult = {
  status: "PASS" | "FAIL";
  scope: string;
  checks: string[];
  counts: Counts;
  note?: string;
  error?: string;
  cleanupWarning?: string;
};

declare global {
  interface Window {
    __s2Hook?: Pick<Workspace, "reconcileTripWorkspace">;
    __s2State?: HookState;
    __S2_HOOK_TEST_RESULT?: TestResult;
  }
}

const USER_A = "mock-s2-user-a";
const USER_B = "mock-s2-user-b";
const EMAIL_A = "mock-s2-a@example.invalid";
const EMAIL_B = "mock-s2-b@example.invalid";

const makeDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

const row = (id: string, title: string) => ({
  id,
  title,
  departure_date: "2099-12-31",
  is_public: false,
  participants: [],
  currency_config: { code: "JPY", symbol: "¥" },
  sidebar_config: [],
  content: { days: ["2099-12-31"], daysData: { "2099-12-31": [] } },
  updated_at: new Date().toISOString(),
});

const ROW_A = row("s2-mock-trip-a", "S2 Mock Trip A");
const ROW_B = row("s2-mock-trip-b", "S2 Mock Trip B");

const deferredA = makeDeferred<{ data: unknown[]; error: null }>();
const deferredB1 = makeDeferred<{ data: unknown[]; error: null }>();
const deferredPermission = makeDeferred<{ data: unknown[]; error: null }>();
const counts: Counts = { A: 0, B: 0, guest: 0, permissionB: 0 };
let holdNextBPermission = false;
let permissionBRequested = false;
let currentSession: Session = null;
const listeners = new Set<(event: string, session: Session) => void>();

const mockSupabase = {
  auth: {
    getSession: async () => ({ data: { session: currentSession }, error: null }),
    onAuthStateChange: (callback: (event: string, session: Session) => void) => {
      listeners.add(callback);
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    },
  },
  rpc: async () => ({ data: null, error: null }),
  from: (table: string) => {
    let selected = "";
    const filters: Record<string, unknown> = {};
    const query: Record<string, unknown> = {
      select(columns = "*") { selected = String(columns); return query; },
      eq(column: string, value: unknown) { filters[column] = value; return query; },
      is() { return query; },
      limit() { return query; },
      insert() { return query; },
      upsert() { return query; },
      update() { return query; },
      delete() { return query; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      single() { return Promise.resolve({ data: null, error: null }); },
      order() {
        if (table === "trips") {
          const userId = currentSession?.user.id;
          if (userId === USER_A) {
            counts.A += 1;
            return counts.A === 1
              ? deferredA.promise
              : Promise.resolve({ data: [ROW_A], error: null });
          }
          if (userId === USER_B) {
            counts.B += 1;
            return counts.B === 1
              ? deferredB1.promise
              : Promise.resolve({ data: [ROW_B], error: null });
          }
          counts.guest += 1;
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: [], error: null });
      },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        if (table === "admin_users" && selected === "email, role, trip_id" && filters.email === EMAIL_B) {
          counts.permissionB += 1;
          if (holdNextBPermission) {
            holdNextBPermission = false;
            permissionBRequested = true;
            return deferredPermission.promise.then(resolve, reject);
          }
          return Promise.resolve({
            data: [{ email: EMAIL_B, role: "trip_editor", trip_id: ROW_B.id }],
            error: null,
          }).then(resolve, reject);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
    return query;
  },
} as unknown as SupabaseClient;

const originalStorage = Object.fromEntries(
  Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]),
) as Record<string, string | null>;
const results: string[] = [];
const assertTest = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  results.push("PASS — " + message);
};
const waitFor = async (predicate: () => boolean, label: string, timeoutMs = 4000) => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timeout waiting for " + label);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

function Probe() {
  const workspace = useTripWorkspace({ supabase: mockSupabase });
  useEffect(() => {
    window.__s2Hook = { reconcileTripWorkspace: workspace.reconcileTripWorkspace };
    window.__s2State = {
      userId: workspace.userId,
      userEmail: workspace.userEmail,
      isSessionReady: workspace.isSessionReady,
      isSignedIn: workspace.isSignedIn,
      selectedTripId: workspace.selectedTripId,
      tripIds: workspace.tripOptions.map((trip) => trip.id),
      currentTripId: workspace.currentTrip?.id ?? null,
      isLoading: workspace.isLoading,
      adminProfile: workspace.adminProfile,
      hasEditPermission: workspace.hasEditPermission,
      expenseBookTripId: workspace.expenseBookTripId,
      selectedTripMetaId: workspace.selectedTripMeta?.id ?? null,
    };
  }, [
    workspace.userId,
    workspace.userEmail,
    workspace.isSessionReady,
    workspace.isSignedIn,
    workspace.selectedTripId,
    workspace.tripOptions,
    workspace.currentTrip,
    workspace.isLoading,
    workspace.adminProfile,
    workspace.hasEditPermission,
    workspace.expenseBookTripId,
    workspace.selectedTripMeta?.id,
    workspace.reconcileTripWorkspace,
  ]);
  return null;
}

export { Probe };

const root = createRoot(document.getElementById("root")!);

const getState = (): HookState => {
  if (!window.__s2State) throw new Error("Hook state is unavailable.");
  return window.__s2State;
};

const getHook = (): Pick<Workspace, "reconcileTripWorkspace"> => {
  if (!window.__s2Hook) throw new Error("Hook instance is unavailable.");
  return window.__s2Hook;
};

const emit = (event: string, user: "A" | "B" | null) => {
  currentSession = user
    ? { user: { id: user === "A" ? USER_A : USER_B, email: user === "A" ? EMAIL_A : EMAIL_B } }
    : null;
  listeners.forEach((callback) => callback(event, currentSession));
};

async function run() {
  try {
    window.__s2State = undefined;
    await waitFor(() => window.__s2State !== undefined, "initial hook render");
    await waitFor(() => window.__s2State?.isSessionReady === true, "initial guest session");
    assertTest(getState().userId === null, "initial state is guest");

    emit("SIGNED_IN", "A");
    await waitFor(() => counts.A === 1, "A reconciliation request");
    emit("SIGNED_IN", "B");
    await waitFor(() => counts.B === 1, "B reconciliation request");

    deferredA.resolve({ data: [ROW_A], error: null });
    await new Promise((resolve) => setTimeout(resolve, 60));
    assertTest(!getState().tripIds.includes(ROW_A.id), "A's late reconciliation does not write into B's workspace");

    const secondB = getHook().reconcileTripWorkspace();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assertTest(counts.B === 1, "A's stale finally does not clear B's in-flight Promise ownership");

    deferredB1.resolve({ data: [ROW_B], error: null });
    await secondB;
    await waitFor(() => getState().tripIds.includes(ROW_B.id), "B Trip list update");
    const stateB = getState();
    assertTest(stateB.userId === USER_B, "identity state is B after A-to-B switch");
    assertTest(stateB.tripIds.includes(ROW_B.id) && !stateB.tripIds.includes(ROW_A.id), "B receives its own Trip list without A's Trip");
    await waitFor(() => Boolean(getState().selectedTripMetaId), "B selected Trip metadata");
    await waitFor(() => counts.permissionB === 1 && getState().adminProfile?.role === "trip_editor", "B Trip Editor permission");
    assertTest(getState().adminProfile?.trip_id === ROW_B.id, "B receives its own Trip Editor permission");

    holdNextBPermission = true;
    await getHook().reconcileTripWorkspace();
    await waitFor(() => permissionBRequested, "second B Trip permission query");
    emit("SIGNED_OUT", null);
    await waitFor(() => getState().userId === null, "signed-out identity state");
    deferredPermission.resolve({
      data: [{ email: EMAIL_B, role: "trip_editor", trip_id: ROW_B.id }],
      error: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
    const signedOut = getState();
    assertTest(signedOut.currentTripId === null, "late B detail cannot restore the old current Trip after sign-out");
    assertTest(signedOut.adminProfile === null && signedOut.hasEditPermission === false, "late B permission result cannot restore old permissions after sign-out");
    assertTest(signedOut.expenseBookTripId === "", "signed-out state has no stale expense-book Trip ID");
    assertTest(signedOut.isLoading === false, "workspace loading is settled after sign-out reconciliation");

    window.__S2_HOOK_TEST_RESULT = {
      status: "PASS",
      scope: "actual useTripWorkspace hook with deferred mock Supabase requests",
      checks: results,
      counts,
      note: "App-level handleLogout Lease/save orchestration and browser UI are separate S2 checks.",
    };
  } catch (error) {
    window.__S2_HOOK_TEST_RESULT = {
      status: "FAIL",
      scope: "actual useTripWorkspace hook with deferred mock Supabase requests",
      checks: results,
      counts,
      error: String((error as Error)?.stack ?? error),
    };
  } finally {
    const output = document.getElementById("results");
    if (output && window.__S2_HOOK_TEST_RESULT) output.textContent = JSON.stringify(window.__S2_HOOK_TEST_RESULT, null, 2);
    try {
      root.unmount();
    } catch {
      // The probe is already detached if React completed an earlier cleanup.
    }
    try {
      localStorage.clear();
      Object.entries(originalStorage).forEach(([key, value]) => {
        if (value !== null) localStorage.setItem(key, value);
      });
    } catch (error) {
      if (window.__S2_HOOK_TEST_RESULT) window.__S2_HOOK_TEST_RESULT.cleanupWarning = String(error);
    }
  }
}

root.render(React.createElement(Probe));
void run();
