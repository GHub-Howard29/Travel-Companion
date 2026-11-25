import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const workspace = read("../src/hooks/useTripWorkspace.ts");
const app = read("../src/App.tsx");
const itinerary = read("../src/components/ItineraryPage.tsx");
const expenseBook = read("../src/hooks/useExpenseBook.ts");

assert.match(workspace, /const userIdRef = useRef\(userId\)/);
assert.match(workspace, /let authEventReceived = false/);
assert.match(workspace, /if \(!authEventReceived\) applySession\(session\)/);
assert.match(workspace, /if \(userIdRef\.current !== nextUserId\)/);
assert.match(workspace, /userId, reconcileTripWorkspaceWithResult/);
assert.match(workspace, /userId: string \| null;\s*epoch: number;\s*promise:/);
assert.match(workspace, /existingReconciliation\.userId === expectedUserId/);
assert.match(workspace, /existingReconciliation\.epoch === expectedEpoch/);
assert.match(workspace, /reconciliationPromiseRef\.current\?\.promise === reconciliation/);
assert.match(workspace, /if \(!isActive \|\| !isCurrentIdentity\(\)\) return/);
assert.match(workspace, /const waitForPendingItinerarySaves = useCallback/);
assert.match(workspace, /Promise\.allSettled\(Array\.from\(itinerarySavePromisesRef\.current\.values\(\)\)\)/);

const logoutStart = app.indexOf("const handleLogout = async () =>");
const logoutEnd = app.indexOf("const handlePersonalExpenseAliasSave", logoutStart);
assert.notEqual(logoutStart, -1);
assert.notEqual(logoutEnd, -1);
const logout = app.slice(logoutStart, logoutEnd);
const logoutOrder = [
  "waitForPendingItinerarySaves()",
  "tripEditorSubmitPromiseRef.current",
  "itineraryIdentityLeaveRef.current?.()",
  "closeTripEditor()",
  "supabase.auth.signOut()",
  "setExpenseBookTripId(\"\")",
  "setIsLoading(false)",
];
let lastIndex = -1;
for (const token of logoutOrder) {
  const index = logout.indexOf(token);
  assert.ok(index > lastIndex, `Logout order missing or incorrect: ${token}`);
  lastIndex = index;
}
assert.match(logout, /finally \{[\s\S]*setIsLoading\(false\)/);
assert.match(app, /tripEditorSubmitPromiseRef\.current = submit/);
assert.match(app, /if \(logoutInProgressRef\.current \|\| !canEditTripMaster\) return/);
assert.match(app, /previousWorkspaceUserIdRef\.current === userId/);

assert.match(itinerary, /const cleanupManagementSession = async \(requireLeaseRelease: boolean\)/);
assert.match(itinerary, /await cleanupManagementSession\(true\)/);
assert.match(itinerary, /await cleanupManagementSession\(false\)/);
assert.match(itinerary, /onRegisterIdentityLeave\?\.\(handler\)/);
assert.match(itinerary, /await releaseManagedTripLease\(\)/);
assert.match(expenseBook, /!expenseBookTripId/);

console.log("PASS ADR-002 S2 auth/workspace lifecycle static regression checks");
