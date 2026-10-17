import { strict as assert } from "node:assert";
import { getCoordinates, safeErrorCode } from "./index.ts";

const placeId = "TEST_PLACE_ID_DO_NOT_LOG";
const fakeGoogleKey = "FAKE_GOOGLE_KEY_DO_NOT_LOG";
const rawProviderBody = "RAW_PROVIDER_ERROR_DO_NOT_LOG";

function fakeAdmin(options: {
  coordinateRpcError?: { code: string } | null;
  failureWriteError?: { code: string } | null;
}) {
  return {
    from() {
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() { return { data: null, error: null }; },
        update() {
          return { async eq() { return { error: options.failureWriteError ?? null }; } };
        },
        async insert() { return { error: options.failureWriteError ?? null }; },
      };
      return query;
    },
    async rpc(name: string) {
      if (name === "tc_weather_store_coordinates" && options.coordinateRpcError) {
        return { data: null, error: options.coordinateRpcError };
      }
      return { data: true, error: null };
    },
  };
}

async function expectRejected(operation: Promise<unknown>, expectedMessage: string) {
  try {
    await operation;
    assert(false, `Expected rejection: ${expectedMessage}`);
  } catch (error) {
    assert.equal(error instanceof Error ? error.message : String(error), expectedMessage);
  }
}

Deno.test("weather diagnostics: controlled Google and coordinate-write failures never log sensitive values", async () => {
  const oldFetch = globalThis.fetch;
  const oldConsoleError = console.error;
  const oldGoogleKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  const logs: string[] = [];
  const allCapturedLogs: string[] = [];
  Deno.env.set("GOOGLE_MAPS_API_KEY", fakeGoogleKey);
  console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));

  try {
    // Case 1: Google Places returns an HTTP error; provider response body must not be logged.
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("https://places.googleapis.com/")) {
        return new Response(rawProviderBody, { status: 403 });
      }
      return oldFetch(input, init);
    };
    await expectRejected(getCoordinates(fakeAdmin({}) as never, placeId, "trace-google-http"), "PLACE_DETAILS_HTTP_403");
    assert.ok(logs.some((line) => line.includes("google_places_http_error") && line.includes('"http_status":403')));
    assert.ok(logs.some((line) => line.includes("coordinate_lookup_failed")));
    allCapturedLogs.push(...logs);

    // Case 2: Google succeeds but the coordinate cache RPC fails.
    logs.length = 0;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("https://places.googleapis.com/")) {
        return Response.json({ id: "provider-id", location: { latitude: 25.03, longitude: 121.56 } });
      }
      return oldFetch(input, init);
    };
    await expectRejected(
      getCoordinates(fakeAdmin({ coordinateRpcError: { code: "XX001" } }) as never, placeId, "trace-coordinate-rpc"),
      "COORDINATE_CACHE_WRITE_FAILED",
    );
    assert.ok(logs.some((line) => line.includes("coordinate_cache_write_failed") && line.includes('"database_code":"XX001"')));
    assert.ok(logs.some((line) => line.includes("coordinate_lookup_failed")));
    allCapturedLogs.push(...logs);

    // Case 3: Google fails and writing the failure-state row also fails.
    logs.length = 0;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("https://places.googleapis.com/")) {
        return new Response(rawProviderBody, { status: 403 });
      }
      return oldFetch(input, init);
    };
    await expectRejected(
      getCoordinates(fakeAdmin({ failureWriteError: { code: "XX002" } }) as never, placeId, "trace-failure-row"),
      "PLACE_DETAILS_HTTP_403",
    );
    assert.ok(logs.some((line) => line.includes("coordinate_lookup_failed") && line.includes('"failure_record_write_succeeded":false')));
    assert.ok(logs.some((line) => line.includes('"database_code":"XX002"')));
    allCapturedLogs.push(...logs);

    // Unknown/raw exception text must collapse to a fixed safe code.
    assert.equal(safeErrorCode(new Error("SECRET_VALUE_SHOULD_NEVER_BE_LOGGED")), "UNCLASSIFIED_ERROR");
    const allLogs = allCapturedLogs.join("\n");
    assert.ok(!allLogs.includes(placeId));
    assert.ok(!allLogs.includes(fakeGoogleKey));
    assert.ok(!allLogs.includes(rawProviderBody));
    assert.ok(!allLogs.includes("SECRET_VALUE_SHOULD_NEVER_BE_LOGGED"));
    assert.ok(allLogs.includes("coordinate_lookup_failed"));
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldConsoleError;
    if (oldGoogleKey === undefined) Deno.env.delete("GOOGLE_MAPS_API_KEY");
    else Deno.env.set("GOOGLE_MAPS_API_KEY", oldGoogleKey);
  }
});
