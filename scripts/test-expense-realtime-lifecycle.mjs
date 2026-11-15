import assert from "node:assert/strict";
import { startExpenseRealtimeLifecycle } from "../src/utils/expenseRealtimeLifecycle.ts";

class FakeTimers {
  now = 0;
  nextId = 1;
  timers = new Map();

  setTimeout = (callback, delay) => {
    const id = this.nextId++;
    this.timers.set(id, { callback, at: this.now + delay });
    return id;
  };

  clearTimeout = (id) => {
    this.timers.delete(id);
  };

  advance(milliseconds) {
    const target = this.now + milliseconds;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      this.timers.delete(id);
      this.now = timer.at;
      timer.callback();
    }
    this.now = target;
  }
}

class FakeEvents {
  listeners = new Map();

  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? new Set();
    list.add(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  listenerCount() {
    return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0);
  }
}

const timers = new FakeTimers();
const windowTarget = new FakeEvents();
const documentTarget = Object.assign(new FakeEvents(), { visibilityState: "visible" });
let online = true;
let refreshCount = 0;
let removedChannel = null;
let realtimeCallback = null;
let subscriptionCallback = null;

const channel = {
  on(type, filter, callback) {
    assert.equal(type, "postgres_changes");
    assert.deepEqual(filter, { event: "*", schema: "public", table: "expenses" });
    realtimeCallback = callback;
    return this;
  },
  subscribe(callback) {
    subscriptionCallback = callback;
    return this;
  },
};

const supabase = {
  channel(name) {
    assert.equal(name, "travel-companion-expenses-fixture-trip");
    return channel;
  },
  removeChannel(value) {
    removedChannel = value;
  },
};

const stop = startExpenseRealtimeLifecycle({
  tripId: "fixture-trip",
  supabase,
  loadExpenseBook(tripId) {
    assert.equal(tripId, "fixture-trip");
    refreshCount += 1;
  },
  windowTarget,
  documentTarget,
  isOnline: () => online,
  setTimer: timers.setTimeout,
  clearTimer: timers.clearTimeout,
});

assert.equal(refreshCount, 0, "initial subscription must not issue an extra read");
subscriptionCallback("SUBSCRIBED");
timers.advance(30_000);
assert.equal(refreshCount, 0, "no periodic refresh may occur after 30 seconds");
assert.equal(timers.timers.size, 0, "no background polling timer should exist");

// Existing Realtime changes still refresh, while unrelated trips are ignored.
realtimeCallback({ new: { trip_id: "other-trip" }, old: {} });
timers.advance(150);
assert.equal(refreshCount, 0, "events from another trip must be ignored");
realtimeCallback({ new: { trip_id: "fixture-trip" }, old: {} });
timers.advance(150);
assert.equal(refreshCount, 1, "matching Realtime event should refresh");

// Error/timeout followed by resubscription performs a recovery read.
subscriptionCallback("CHANNEL_ERROR");
subscriptionCallback("SUBSCRIBED");
timers.advance(150);
assert.equal(refreshCount, 2, "re-subscription after CHANNEL_ERROR should refresh");
subscriptionCallback("TIMED_OUT");
subscriptionCallback("SUBSCRIBED");
timers.advance(150);
assert.equal(refreshCount, 3, "re-subscription after TIMED_OUT should refresh");

// Focus, online, and visible-page restoration refresh; hidden state does not.
windowTarget.dispatch("focus");
timers.advance(150);
assert.equal(refreshCount, 4, "focus should refresh");
online = false;
windowTarget.dispatch("online");
timers.advance(150);
assert.equal(refreshCount, 4, "offline refresh must not load remote expenses");
online = true;
documentTarget.visibilityState = "hidden";
documentTarget.dispatch("visibilitychange");
timers.advance(150);
assert.equal(refreshCount, 4, "hidden document must not trigger visibility refresh");
documentTarget.visibilityState = "visible";
documentTarget.dispatch("visibilitychange");
timers.advance(150);
assert.equal(refreshCount, 5, "returning to visible should refresh");

// A pending refresh is cancelled on unmount, listeners and the channel are removed.
windowTarget.dispatch("focus");
assert.equal(timers.timers.size, 1, "focus schedules one debounced refresh");
stop();
assert.equal(timers.timers.size, 0, "unmount must clear the pending refresh timer");
assert.equal(windowTarget.listenerCount(), 0, "unmount must remove window listeners");
assert.equal(documentTarget.listenerCount(), 0, "unmount must remove document listeners");
assert.equal(removedChannel, channel, "unmount must remove the Realtime channel");
timers.advance(60_000);
assert.equal(refreshCount, 5, "unmounted lifecycle must never refresh again");

console.log("Expense Realtime lifecycle simulation passed: no 30s polling, event/reconnect/recovery/focus/online/visibility refresh, offline guard, and cleanup.");
