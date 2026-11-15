import assert from "node:assert/strict";
import { startTripWorkspaceRecoveryLifecycle } from "../src/utils/tripWorkspaceRecoveryLifecycle.ts";

class FakeEvents {
  listeners = new Map();

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  count() {
    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }
}

const flushPromises = async () => {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
};

const windowTarget = new FakeEvents();
const documentTarget = Object.assign(new FakeEvents(), { visibilityState: "visible" });
let sessionReady = false;
let online = true;
let attempts = 0;
let allowRetry;
let pendingChanges = [];
let onlineChanges = [];
const errors = [];

const recovery = startTripWorkspaceRecoveryLifecycle({
  windowTarget,
  documentTarget,
  isSessionReady: () => sessionReady,
  isOnline: () => online,
  initiallyPending: true,
  onPendingChange: (pending) => pendingChanges.push(pending),
  setOnline: (value) => onlineChanges.push(value),
  onError: (error) => errors.push(error),
  reconcile: () => {
    attempts += 1;
    return new Promise((resolve) => {
      allowRetry = resolve;
    });
  },
});

// Session Ready is a hard gate.
assert.equal(attempts, 0);
assert.equal(recovery.isPending(), true);
sessionReady = true;
recovery.retryPendingRecovery();
await flushPromises();
assert.equal(attempts, 1, "Session Ready should permit pending recovery");

// Concurrent focus/visibility events must share the in-flight reconciliation.
windowTarget.dispatch("focus");
documentTarget.dispatch("visibilitychange");
assert.equal(attempts, 1, "in-flight recovery must be deduplicated");

// Incomplete reconciliation must keep pending for a later event.
allowRetry({ completed: false, selectedTripWasRemoved: false });
await flushPromises();
assert.equal(recovery.isPending(), true);
assert.deepEqual(pendingChanges, []);

// Rejection must also keep pending and allow a later retry.
recovery.retryPendingRecovery();
await flushPromises();
assert.equal(attempts, 2);
const rejected = allowRetry;
rejected(Promise.reject(new Error("temporary-read-failure")));
await flushPromises();
assert.equal(recovery.isPending(), true);
assert.equal(errors.length, 1);

// A synchronous throw before a Promise is returned is also handled safely.
let synchronousThrow = true;
const syncThrowRecovery = startTripWorkspaceRecoveryLifecycle({
  windowTarget: new FakeEvents(),
  documentTarget: Object.assign(new FakeEvents(), { visibilityState: "visible" }),
  isSessionReady: () => true,
  isOnline: () => true,
  initiallyPending: true,
  reconcile: () => {
    if (synchronousThrow) throw new Error("sync-reconcile-failure");
    return Promise.resolve({ completed: true, selectedTripWasRemoved: false });
  },
  setOnline: () => undefined,
  onError: (error) => errors.push(error),
});
await flushPromises();
assert.equal(syncThrowRecovery.isPending(), true);
assert.equal(errors.length, 2);
synchronousThrow = false;
syncThrowRecovery.retryPendingRecovery();
await flushPromises();
assert.equal(syncThrowRecovery.isPending(), false);
syncThrowRecovery.stop();

// If connectivity drops during the request, success cannot clear pending.
recovery.retryPendingRecovery();
await flushPromises();
assert.equal(attempts, 3);
const completeOffline = allowRetry;
online = false;
completeOffline({ completed: true, selectedTripWasRemoved: false });
await flushPromises();
assert.equal(recovery.isPending(), true);
online = true;

// Visible page / focus can retry. Only a completed, still-online reconciliation clears.
documentTarget.visibilityState = "hidden";
documentTarget.dispatch("visibilitychange");
assert.equal(attempts, 3, "hidden page must not trigger recovery");
documentTarget.visibilityState = "visible";
documentTarget.dispatch("visibilitychange");
await flushPromises();
assert.equal(attempts, 4);
allowRetry({ completed: true, selectedTripWasRemoved: true });
await flushPromises();
assert.equal(recovery.isPending(), false);
assert.deepEqual(pendingChanges, [false]);
assert.deepEqual(onlineChanges, [true]);

// A future offline transition starts a new recovery cycle.
windowTarget.dispatch("offline");
online = false;
assert.equal(recovery.isPending(), true);
assert.equal(onlineChanges.at(-1), false);
online = true;
windowTarget.dispatch("online");
await flushPromises();
assert.equal(onlineChanges.at(-1), true);
assert.equal(attempts, 5);

allowRetry({ completed: true, selectedTripWasRemoved: false });
await flushPromises();
assert.equal(recovery.isPending(), false);
assert.deepEqual(pendingChanges, [false, true, true, false]);

recovery.stop();
recovery.stop();
assert.equal(windowTarget.count(), 0, "stop must remove all window listeners");
assert.equal(documentTarget.count(), 0, "stop must remove document listeners");

const attemptsAfterStop = attempts;
windowTarget.dispatch("focus");
documentTarget.dispatch("visibilitychange");
assert.equal(attempts, attemptsAfterStop, "stopped lifecycle must ignore future events");

console.log("Trip workspace recovery lifecycle passed: Session Ready gate, offline guard, event triggers, in-flight deduplication, failure retention, success clearing, and cleanup.");
