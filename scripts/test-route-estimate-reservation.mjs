import assert from "node:assert/strict";

const createStore = () => new Map();

const createReservationApi = (store, now = () => Date.now()) => ({
  claim(key, owner, ttlMs) {
    const current = store.get(key);
    if (current && current.expiresAt > now()) return false;
    store.set(key, { owner, expiresAt: now() + ttlMs });
    return true;
  },
  release(key, owner) {
    const current = store.get(key);
    if (!current || current.owner !== owner) return false;
    store.delete(key);
    return true;
  },
});

const store = createStore();
let nowMs = 1_000;
const api = createReservationApi(store, () => nowMs);

assert.equal(api.claim("route-key-A", "owner-A", 90_000), true);
assert.equal(api.claim("route-key-A", "owner-B", 90_000), false,
  "Only one concurrent owner may claim the same route key");
assert.equal(api.claim("route-key-B", "owner-C", 90_000), true,
  "Different route keys must remain independent");
assert.equal(api.release("route-key-A", "owner-B"), false,
  "A non-owner cannot release an active reservation");
assert.equal(api.release("route-key-A", "owner-A"), true,
  "The owner can release its own reservation after success or failure");
assert.equal(api.claim("route-key-A", "owner-B", 90_000), true,
  "A waiting request can claim after the previous owner releases");

nowMs += 90_001;
assert.equal(api.claim("route-key-A", "owner-C", 90_000), true,
  "An expired reservation can be taken over");
assert.equal(api.release("route-key-A", "owner-B"), false,
  "A late release from an expired owner cannot delete the new owner's reservation");
assert.equal(store.get("route-key-A").owner, "owner-C");
assert.equal(api.release("route-key-A", "owner-C"), true);

const cache = new Map();
const providerCalls = new Map();
const quotaClaims = new Map();

const requestWithReservation = async (key, owner, { delayMs = 0, fail = false } = {}) => {
  if (cache.has(key)) return { cached: true, value: cache.get(key) };
  if (!api.claim(key, owner, 90_000)) return { inProgress: true };
  try {
    quotaClaims.set(key, (quotaClaims.get(key) ?? 0) + 1);
    providerCalls.set(key, (providerCalls.get(key) ?? 0) + 1);
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (fail) throw new Error("synthetic provider failure");
    const value = { durationSeconds: 600 };
    cache.set(key, value);
    return { cached: false, value };
  } finally {
    api.release(key, owner);
  }
};

const firstPromise = requestWithReservation("same-target", "first-owner", { delayMs: 30 });
const secondPromise = requestWithReservation("same-target", "follower-owner");
const [first, follower] = await Promise.all([firstPromise, secondPromise]);
assert.equal(first.cached, false);
assert.equal(follower.inProgress, true,
  "A parallel same-target request must not reach the provider while the owner is active");
assert.equal(providerCalls.get("same-target"), 1);
assert.equal(quotaClaims.get("same-target"), 1);
const followerRetry = await requestWithReservation("same-target", "follower-retry");
assert.equal(followerRetry.cached, true,
  "A retry after owner completion must reuse the saved result");
assert.equal(providerCalls.get("same-target"), 1);
assert.equal(quotaClaims.get("same-target"), 1);

await assert.rejects(
  () => requestWithReservation("failed-target", "failed-owner", { fail: true }),
  /synthetic provider failure/,
);
assert.equal(store.has("failed-target"), false,
  "A failed provider call must not leave a reservation behind");
const afterFailure = await requestWithReservation("failed-target", "retry-after-failure");
assert.equal(afterFailure.cached, false,
  "A request after provider failure can claim and retry");

console.log("Route keyed reservation ownership, isolation, wait/reuse, release, failure recovery and expiry regression passed.");
