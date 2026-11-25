/* eslint-disable react-refresh/only-export-components -- standalone browser test entry mounts its local probe component. */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import useExpenseBook from "../src/hooks/useExpenseBook";

const OLD_BOOK_ID = "s2-shared-expense-book-fixture";
const OLD_USER_ID = "s2-user-a";
const OLD_EMAIL = "s2-a@example.invalid";

type QueryRecord = { table: string; filters: Record<string, unknown>; selected: string };
type ChannelRecord = { name: string; removed: boolean; onCount: number; subscribeCount: number };
type Result = {
  status: "PASS" | "FAIL";
  checks: string[];
  queries: QueryRecord[];
  channels: ChannelRecord[];
  errors?: string[];
};

declare global {
  interface Window {
    __S2_EXPENSE_HOOK_RESULT?: Result;
  }
}

const checks: string[] = [];
const queries: QueryRecord[] = [];
const channels: ChannelRecord[] = [];
const channelRecords = new WeakMap<object, ChannelRecord>();
const errors: string[] = [];
let appProbe: { setInputs: (signedIn: boolean) => void; state: () => Record<string, unknown> } | null = null;

const assertTest = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  checks.push("PASS — " + message);
};

const queryBuilder = (table: string) => {
  const record: QueryRecord = { table, filters: {}, selected: "*" };
  queries.push(record);
  const builder: Record<string, unknown> = {
    select(columns = "*") { record.selected = String(columns); return builder; },
    eq(column: string, value: unknown) { record.filters[column] = value; return builder; },
    is(column: string, value: unknown) { record.filters[column] = value; return builder; },
    order() { return builder; },
    limit() { return builder; },
    insert() { return builder; },
    upsert() { return builder; },
    update() { return builder; },
    delete() { return builder; },
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    },
  };
  return builder;
};

const mockSupabase = {
  from: (table: string) => queryBuilder(table),
  channel: (name: string) => {
    const record: ChannelRecord = { name, removed: false, onCount: 0, subscribeCount: 0 };
    channels.push(record);
    const channel = {
      on() { record.onCount += 1; return channel; },
      subscribe(callback: (status: string) => void) {
        record.subscribeCount += 1;
        queueMicrotask(() => callback("SUBSCRIBED"));
        return channel;
      },
    };
    channelRecords.set(channel, record);
    return channel;
  },
  removeChannel: async (channel: unknown) => {
    if (typeof channel === "object" && channel !== null) {
      const record = channelRecords.get(channel);
      if (record) record.removed = true;
    }
    return "ok";
  },
} as unknown as SupabaseClient;

function Probe() {
  const [signedIn, setSignedIn] = useState(true);
  const [expenseBookTripId, setExpenseBookTripId] = useState(OLD_BOOK_ID);
  const expense = useExpenseBook({
    supabase: mockSupabase,
    userEmail: signedIn ? OLD_EMAIL : null,
    userId: signedIn ? OLD_USER_ID : null,
    selectedTripId: signedIn ? "s2-selected-trip" : "",
    expenseBookTripId,
    isUsingSharedExpenseBook: true,
    isExpenseBookPageActive: true,
    canWriteSharedExpense: false,
    canExportAllSharedExpenses: false,
    currentCurrencyCode: "JPY",
    currentCurrencySymbol: "¥",
    expenseMembers: [],
    participantEmailMap: {},
    defaultPayerName: null,
    tripTitle: "S2 isolated expense fixture",
  });

  useEffect(() => {
    appProbe = {
      setInputs: (nextSignedIn) => {
        setSignedIn(nextSignedIn);
        setExpenseBookTripId(nextSignedIn ? OLD_BOOK_ID : "");
      },
      state: () => ({
        signedIn,
        expenseBookTripId,
        expensesCount: expense.expenses.length,
      }),
    };
    return () => { appProbe = null; };
  }, [signedIn, expenseBookTripId, expense.expenses]);

  return null;
}

const root = createRoot(document.getElementById("root")!);

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 4000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timeout waiting for " + label);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function run() {
  try {
    root.render(React.createElement(Probe));
    await waitFor(() => appProbe !== null, "expense hook mount");
    await waitFor(
      () => queries.some((item) => item.table === "expenses" && item.filters.trip_id === OLD_BOOK_ID),
      "initial old-book Load query",
    );
    await waitFor(
      () => channels.some((item) => item.name === "travel-companion-expenses-" + OLD_BOOK_ID),
      "shared expense Realtime channel",
    );

    const firstOldQueryCount = queries.filter(
      (item) => item.table === "expenses" && item.filters.trip_id === OLD_BOOK_ID,
    ).length;
    assertTest(firstOldQueryCount >= 1, "shared expense Load uses the active expenseBookTripId");
    assertTest(channels.some((item) => item.name === "travel-companion-expenses-" + OLD_BOOK_ID && item.onCount === 1), "shared Realtime channel is created for the active expenseBookTripId");

    appProbe!.setInputs(false);
    await waitFor(
      () => appProbe?.state().signedIn === false && appProbe.state().expenseBookTripId === "",
      "signed-out state and empty expenseBookTripId",
    );
    await waitFor(() => channels.every((item) => item.removed), "Realtime channel cleanup");

    const countAfterLogout = queries.filter(
      (item) => item.table === "expenses" && item.filters.trip_id === OLD_BOOK_ID,
    ).length;
    await new Promise((resolve) => setTimeout(resolve, 250));
    const countAfterSettle = queries.filter(
      (item) => item.table === "expenses" && item.filters.trip_id === OLD_BOOK_ID,
    ).length;

    assertTest(countAfterLogout === firstOldQueryCount, "logout does not synchronously reissue the old shared-book query");
    assertTest(countAfterSettle === countAfterLogout, "no delayed Load query reuses the old expenseBookTripId after logout");
    assertTest(channels.length === 1 && channels[0].removed, "logout removes the old shared expense Realtime channel");
    assertTest(appProbe!.state().expenseBookTripId === "", "hook remains mounted with no old expenseBookTripId after sign-out");
    assertTest(appProbe!.state().signedIn === false, "hook completed in signed-out state");

    window.__S2_EXPENSE_HOOK_RESULT = { status: "PASS", checks, queries, channels };
  } catch (error) {
    errors.push(String((error as Error)?.stack ?? error));
    window.__S2_EXPENSE_HOOK_RESULT = { status: "FAIL", checks, queries, channels, errors };
  } finally {
    const output = document.getElementById("results");
    if (output && window.__S2_EXPENSE_HOOK_RESULT) output.textContent = JSON.stringify(window.__S2_EXPENSE_HOOK_RESULT, null, 2);
    root.unmount();
  }
}

void run();
