# Codex in-app browser checklist

Use the running local URL `http://127.0.0.1:5173/Travel-Companion/`. Use only synthetic local accounts and Trips.

## Base authenticated flow

1. Run `npm run regression:local:browser-bootstrap`. Open the reported localhost URL. Reuse the session when the exact synthetic administrator and Trip are active; otherwise use the browser's loaded Supabase JS client and the reported loopback configuration to call `signInWithPassword`, then reload. The App intentionally exposes only Google login, so do not search for a hidden email form. Never directly write, print, copy, or persist an access token outside Supabase's browser session handling.
2. Confirm the header identifies the synthetic local administrator and the selected Trip is editable.
3. Open `Day 1` → `管理` → the first `設定照片`.
4. Confirm the dialog title, close control, source group, query field, Search, Cancel, and disabled confirmation action are accessible.
5. Confirm Commons is selected; Pexels and Pixabay remain visible, disabled, and explain why.
6. Confirm the query is prefilled from saved `location` and opening the dialog does not start a search.
7. Enter a one-character query and confirm Search becomes disabled without an external request; restore the original query afterward.

Repeat the visible layout checks at the normal desktop viewport and an explicit 390x844 viewport. Reset the viewport override afterward. Check for clipping, horizontal overflow, obscured controls, and reachable close/cancel actions.

## Candidate-dependent flow

Do not perform this section without External-mode authorization or a maintained local mock that is explicitly in scope.

Validate the applicable states: unique entity, ambiguous entity choice, facility-level safe stop, next batch, last page, candidate selection, zoom, confirmation, 1:1 crop, cancel/back state retention, save lock, and failure unlock. Include keyboard order, focus trap, focus return, accessible names, and 390x844 behavior.

Never reuse saved accessibility node IDs after a reload or state transition. Re-read the current accessibility tree and select by accessible name.
