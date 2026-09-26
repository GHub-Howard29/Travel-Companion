# Codex in-app browser checklist

Use the running local URL `http://127.0.0.1:5173/Travel-Companion/`. Use only synthetic local accounts and Trips.

## Base authenticated flow

1. Run `npm run regression:local:browser-bootstrap`. Open the reported localhost URL. Reuse the session when the exact synthetic administrator and Trip are active; otherwise use the browser's loaded Supabase JS client and the reported loopback configuration to call `signInWithPassword`, then reload. The App intentionally exposes only Google login, so do not search for a hidden email form. Never directly write, print, copy, or persist an access token outside Supabase's browser session handling.
2. Confirm the header identifies the synthetic local administrator and the selected Trip is editable.
3. Open `Day 1` → `管理` → the first `設定照片`.
4. Confirm the dialog title, close control, source group, query field, Search, Cancel, and disabled confirmation action are accessible.
5. Confirm Wikimedia Commons is selected and the user-upload source remains available; no removed legacy provider controls should reappear.
6. Confirm the query is prefilled from saved `location` and opening the dialog does not start a search.
7. Enter a one-character query and confirm Search becomes disabled without an external request; restore the original query afterward.

Repeat the visible layout checks at the normal desktop viewport and an explicit 390x844 viewport. Reset the viewport override afterward. Check for clipping, horizontal overflow, obscured controls, and reachable close/cancel actions.

## V3.9.13 loopback boundary and candidate-dependent flow

The maintained `browser-broad-fixture` / `browser-insufficient-fixture` commands now verify the authenticated V3.9.13 batch-v2 Edge boundary only. They intentionally do not fabricate candidate cards and do not send Wikimedia or Google requests.

For RC Browser mode:

1. Run either loopback boundary command and confirm `commonsPhotoSearch` / `commonsCategoryPhotos` reject a bogus batch token as `session-expired`, `commonsPhotoCategories` rejects an invalid File title, and the legacy `commonsPrecisionSearch` route returns 410.
2. In the actual browser UI, do not select Search without fresh External-mode authorization.
3. Validate the initial photo dialog at desktop and explicit 390x844 viewports: title, close/cancel, source controls, prefilled query, disabled confirmation, Commons selected, Pexels/Pixabay disabled, and no overflow/clipping.
4. Validate keyboard order, focus trap, focus return, and accessible names for the initial dialog.
5. After External-mode authorization or a future maintained v2 candidate mock exists, separately validate category original-name + zh-TW second line, next-batch visibility only on the last page with a valid token, last-page/end state, candidate selection, zoom, confirmation, 1:1 crop, cancel/back state retention, save lock, and failure unlock.

Loopback boundary results are not evidence about Wikidata content, Translation output, query precision, or real upstream candidate behavior. Report them separately from External mode.

Never reuse saved accessibility node IDs after a reload or state transition. Re-read the current accessibility tree and select by accessible name.
