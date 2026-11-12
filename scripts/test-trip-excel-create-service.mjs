import assert from "node:assert/strict";
import { createTripFromExcel, TripExcelCreateError } from "../src/services/tripExcelCreateService.ts";
import {
  createInitialTripExcelPendingRequest,
  decideTripExcelRetry,
  isTripExcelPendingRequest,
  TRIP_EXCEL_CREATE_COOLDOWN_MS,
} from "../src/services/tripExcelCreateRetry.ts";

const REQUEST_ID = "9573fdcf-64d6-49bc-8680-8a1253b5343a";
const USER_ID = "user-super-admin";
const USER_EMAIL = "admin@example.test";
const workbook = {
  templateVersion: "1",
  title: "Tokyo Test Trip",
  departureDate: "2026-12-01",
  dayCount: 2,
  days: [1, 2],
  cards: [
    {
      day: 1,
      item: {
        id: "client-card-id-is-not-sent",
        time: "09:30",
        departureTime: "10:00",
        title: "Tokyo Station",
        type: "景點",
        typeColor: "client-color-is-not-sent",
        desc: "",
        location: "client-location-is-not-sent",
      },
    },
  ],
  daysData: {},
  cardCount: 1,
};

const validResult = (overrides = {}) => ({
  trip_id: "trip-123",
  title: workbook.title,
  departure_date: workbook.departureDate,
  day_count: workbook.dayCount,
  card_count: workbook.cardCount,
  idempotent_replay: false,
  ...overrides,
});

const options = {
  requestId: REQUEST_ID,
  workbook,
  currencyCode: "JPY",
  currencySymbol: "¥",
  expectedUserId: USER_ID,
  expectedUserEmail: USER_EMAIL,
};

const onlineState = Object.getOwnPropertyDescriptor(globalThis.navigator, "onLine");
Object.defineProperty(globalThis.navigator, "onLine", {
  configurable: true,
  get: () => true,
});

const createMockClient = ({
  session = { user: { id: USER_ID, email: USER_EMAIL } },
  refreshedSession = { user: { id: USER_ID, email: USER_EMAIL } },
  user = { id: USER_ID, email: USER_EMAIL },
  adminRow = { email: USER_EMAIL },
  adminError = null,
  sessionError = null,
  refreshError = null,
  userError = null,
  createResponse = { data: validResult(), error: null },
  lookupResponse = null,
  networkState = () => true,
  onCall = null,
  onCreateRpc = null,
  beforeCreateResponse = null,
} = {}) => {
  const calls = [];
  Object.defineProperty(globalThis.navigator, "onLine", {
    configurable: true,
    get: () => networkState(),
  });
  const client = {
    auth: {
      getSession: async () => {
        calls.push(["getSession"]);
        return { data: { session }, error: sessionError };
      },
      refreshSession: async () => {
        calls.push(["refreshSession"]);
        return { data: { session: refreshedSession }, error: refreshError };
      },
      getUser: async () => {
        calls.push(["getUser"]);
        return { data: { user }, error: userError };
      },
    },
    from: (table) => ({
      select: (columns) => ({
        eq: (column, value) => ({
          eq: (secondColumn, secondValue) => ({
            maybeSingle: async () => {
              calls.push(["adminLookup", table, columns, column, value, secondColumn, secondValue]);
              return { data: adminRow, error: adminError };
            },
          }),
        }),
      }),
    }),
    rpc: async (name, args) => {
      calls.push(["rpc", name, args]);
      if (onCall) onCall(name, args, calls);
      if (name === "tc_create_trip_from_excel") {
        if (onCreateRpc) return onCreateRpc(name, args, calls);
        if (beforeCreateResponse) await beforeCreateResponse(name, args, calls);
        return createResponse;
      }
      if (name === "tc_get_trip_excel_create_request") return lookupResponse ?? { data: null, error: null };
      throw new Error("Unexpected RPC: " + name);
    },
  };
  return { client, calls };
};

const expectCode = async (promise, code) => {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof TripExcelCreateError);
    assert.equal(error.code, code);
    return true;
  });
};

try {
  // Retry policy is deterministic and persists a single manual retry + one-minute cooldown.
  {
    const initial = createInitialTripExcelPendingRequest("fingerprint-a", REQUEST_ID);
    assert.equal(isTripExcelPendingRequest(initial), true);
    assert.deepEqual(decideTripExcelRetry(initial, 10_000), {
      action: "CREATE", manualRetryCount: 1, cooldownStartedAt: 10_000,
    });
    const retried = { ...initial, manualRetryCount: 1, cooldownStartedAt: 10_000 };
    assert.deepEqual(decideTripExcelRetry(retried, 10_000 + TRIP_EXCEL_CREATE_COOLDOWN_MS - 1), {
      action: "LOOKUP", reason: "COOLDOWN_ACTIVE", retryAt: 10_000 + TRIP_EXCEL_CREATE_COOLDOWN_MS,
    });
    assert.deepEqual(decideTripExcelRetry(retried, 10_000 + TRIP_EXCEL_CREATE_COOLDOWN_MS), {
      action: "LOOKUP", reason: "COOLDOWN_ELAPSED", retryAt: null,
    });
    assert.equal(isTripExcelPendingRequest({ ...retried, manualRetryCount: 1.5 }), false);
  }

  // Lookup-only recovery never calls the create RPC.
  {
    const { client, calls } = createMockClient({
      lookupResponse: { data: { status: "CREATED", ...validResult({ idempotent_replay: true }) }, error: null },
    });
    const result = await createTripFromExcel(client, { ...options, lookupOnly: true });
    assert.equal(result.tripId, "trip-123");
    assert.equal(calls.some((call) => call[0] === "rpc" && call[1] === "tc_create_trip_from_excel"), false);
    assert.deepEqual(calls.filter((call) => call[0] === "rpc").map((call) => call[1]), [
      "tc_get_trip_excel_create_request",
    ]);
  }

  // Successful create: verifies the final RPC payload is restricted to V1 fields.
  {
    const { client, calls } = createMockClient();
    const result = await createTripFromExcel(client, options);
    assert.deepEqual(result, {
      tripId: "trip-123",
      title: workbook.title,
      departureDate: workbook.departureDate,
      dayCount: 2,
      cardCount: 1,
      idempotentReplay: false,
    });
    const createCall = calls.find((call) => call[0] === "rpc");
    assert.equal(createCall[1], "tc_create_trip_from_excel");
    assert.deepEqual(createCall[2], {
      p_request_id: REQUEST_ID,
      p_title: workbook.title,
      p_departure_date: workbook.departureDate,
      p_cards: [{
        day: 1,
        time: "09:30",
        departureTime: "10:00",
        title: "Tokyo Station",
        type: "景點",
        desc: "",
      }],
      p_currency_code: "JPY",
      p_currency_symbol: "¥",
    });
    assert.equal(calls.filter((call) => call[0] === "rpc").length, 1);
  }

  // Session/account and role failures must stop before the privileged RPC.
  {
    const { client, calls } = createMockClient({ session: null });
    await expectCode(createTripFromExcel(client, options), "SESSION_REQUIRED");
    assert.equal(calls.some((call) => call[0] === "rpc"), false);
  }
  {
    const { client, calls } = createMockClient({
      session: { user: { id: "another-user", email: USER_EMAIL } },
    });
    await expectCode(createTripFromExcel(client, options), "SESSION_CHANGED");
    assert.equal(calls.some((call) => call[0] === "rpc"), false);
  }
  {
    const { client, calls } = createMockClient({
      refreshedSession: { user: { id: "another-user", email: USER_EMAIL } },
    });
    await expectCode(createTripFromExcel(client, options), "USER_UNVERIFIED");
    assert.equal(calls.some((call) => call[0] === "rpc"), false);
  }
  {
    const { client, calls } = createMockClient({
      refreshError: { message: "refresh failed" },
    });
    await expectCode(createTripFromExcel(client, options), "USER_UNVERIFIED");
    assert.equal(calls.some((call) => call[0] === "rpc"), false);
  }
  {
    const { client, calls } = createMockClient({
      userError: { message: "user verification failed" },
    });
    await expectCode(createTripFromExcel(client, options), "USER_UNVERIFIED");
    assert.equal(calls.some((call) => call[0] === "rpc"), false);
  }
  {
    const { client, calls } = createMockClient({ user: { id: USER_ID, email: "other@example.test" } });
    await expectCode(createTripFromExcel(client, options), "USER_UNVERIFIED");
    assert.equal(calls.some((call) => call[0] === "rpc"), false);
  }
  {
    const { client, calls } = createMockClient({ adminRow: null });
    await expectCode(createTripFromExcel(client, options), "SUPER_ADMIN_REQUIRED");
    assert.equal(calls.some((call) => call[0] === "rpc"), false);
  }
  {
    const { client, calls } = createMockClient({
      adminError: { message: "role lookup unavailable" },
    });
    await expectCode(createTripFromExcel(client, options), "USER_UNVERIFIED");
    assert.equal(calls.some((call) => call[0] === "rpc"), false);
  }

  // RPC timeout + owner-bound lookup CREATED is accepted as the original result.
  {
    const { client, calls } = createMockClient({
      createResponse: { data: null, error: { message: "timeout" } },
      lookupResponse: { data: { status: "CREATED", ...validResult({ idempotent_replay: true }) }, error: null },
    });
    const result = await createTripFromExcel(client, options);
    assert.equal(result.tripId, "trip-123");
    assert.equal(result.idempotentReplay, true);
    assert.equal(calls.filter((call) => call[0] === "rpc").length, 2);
    assert.deepEqual(calls.at(-1), [
      "rpc",
      "tc_get_trip_excel_create_request",
      { p_request_id: REQUEST_ID },
    ]);
  }

  // Concurrent calls using the same request UUID both return the same result.
  // This validates client call behavior only; PostgreSQL transaction locking
  // remains a separate company-local database integration test.
  {
    let arrivals = 0;
    let releaseCreate;
    let signalBothArrived;
    const createGate = new Promise((resolve) => {
      releaseCreate = resolve;
    });
    const bothArrived = new Promise((resolve) => {
      signalBothArrived = resolve;
    });
    const sharedResult = validResult();
    let createCount = 0;
    const makeConcurrentClient = () => createMockClient({
      onCreateRpc: async (_name, args) => {
        createCount += 1;
        assert.equal(args.p_request_id, REQUEST_ID);
        arrivals += 1;
        if (arrivals === 2) signalBothArrived();
        await createGate;
        return { data: sharedResult, error: null };
      },
    });
    const first = makeConcurrentClient();
    const second = makeConcurrentClient();
    const firstPromise = createTripFromExcel(first.client, options);
    const secondPromise = createTripFromExcel(second.client, options);
    await bothArrived;
    assert.equal(createCount, 2);
    releaseCreate();
    const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise]);
    assert.deepEqual(firstResult, secondResult);
    assert.equal(firstResult.tripId, "trip-123");
    assert.ok(first.calls.some((call) =>
      call[0] === "rpc" && call[1] === "tc_create_trip_from_excel" &&
      call[2].p_request_id === REQUEST_ID));
    assert.ok(second.calls.some((call) =>
      call[0] === "rpc" && call[1] === "tc_create_trip_from_excel" &&
      call[2].p_request_id === REQUEST_ID));
  }

  // NOT_FOUND is not proof that a transaction was never committed: never auto-recreate.
  {
    const { client, calls } = createMockClient({
      createResponse: { data: null, error: { message: "timeout" } },
      lookupResponse: { data: { status: "NOT_FOUND", request_id: REQUEST_ID }, error: null },
    });
    await expectCode(createTripFromExcel(client, options), "RESULT_UNCONFIRMED");
    assert.equal(calls.filter((call) => call[0] === "rpc" && call[1] === "tc_create_trip_from_excel").length, 1);
  }
  {
    let online = true;
    const { client, calls } = createMockClient({
      createResponse: { data: null, error: { message: "connection dropped" } },
      networkState: () => online,
      onCall: (name) => {
        if (name === "tc_create_trip_from_excel") online = false;
      },
    });
    await expectCode(createTripFromExcel(client, options), "RESULT_UNCONFIRMED");
    assert.equal(calls.some((call) => call[0] === "rpc" && call[1] === "tc_get_trip_excel_create_request"), false);
  }

  // Explicit server rejection + NOT_FOUND can be surfaced as RPC_FAILED.
  {
    const { client } = createMockClient({
      createResponse: { data: null, error: { code: "42501", message: "denied" } },
      lookupResponse: { data: { status: "NOT_FOUND", request_id: REQUEST_ID }, error: null },
    });
    await expectCode(createTripFromExcel(client, options), "RPC_FAILED");
  }

  // A deleted Trip, unknown request state, malformed lookup or mismatched payload is never success.
  for (const lookupResponse of [
    { data: { status: "TRIP_DELETED" }, error: null },
    { data: { status: "PENDING" }, error: null },
    { data: { status: "CREATED", ...validResult({ title: "Different Trip" }) }, error: null },
    { data: null, error: { message: "lookup failed" } },
    { data: { status: "NOT_FOUND", request_id: "different-request" }, error: null },
  ]) {
    const { client, calls } = createMockClient({
      createResponse: { data: null, error: { message: "timeout" } },
      lookupResponse,
    });
    await expectCode(createTripFromExcel(client, options), "RESULT_UNCONFIRMED");
    assert.equal(calls.filter((call) => call[0] === "rpc" && call[1] === "tc_create_trip_from_excel").length, 1);
  }

  console.log("Trip Excel create service tests passed: payload allowlist, session refresh identity, Super Admin gate, idempotent recovery, NOT_FOUND safety, deleted Trip and unconfirmed lookup outcomes.");
} finally {
  if (onlineState) {
    Object.defineProperty(globalThis.navigator, "onLine", onlineState);
  }
}
