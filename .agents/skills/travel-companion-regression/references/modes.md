# Regression modes

Choose by changed risk, not by habit.

| Mode | Use when | Authorization | Command |
| --- | --- | --- | --- |
| Status | Planning, diagnosis, or deciding whether services are already available | May run automatically; read-only | `npm run regression:local:status` |
| Prepare | A local regression was requested and the local fixture or ignored env files may be absent | Covered by the current local-test request | `npm run regression:local:prepare` |
| Verify | Migration grants, Auth, Trip loading, `travel-route`, or V3.9.1 photo integration changed | Covered by the current local-test request | `npm run regression:local:verify` |
| Full | Release-candidate work or a broad cross-cutting change | Covered only when the user requested complete/full regression | `npm run regression:local:full` |
| Browser | UI behavior, responsive layout, focus, keyboard, or copy changed | Covered when the user requested UI/browser regression; use the Codex in-app browser | See `browser-checklist.md` |
| Browser ambiguous fixture | Same-label entity descriptions, QIDs, selection, or responsive choice layout changed | Covered by local browser-test authorization; loopback synthetic response only | `npm run regression:local:browser-ambiguous-fixture` |
| External | A real Commons/Wikimedia response is necessary | Fresh single-use authorization every run; state query set, request cap, timeout, retry, and write policy first | No generic command; use the separately approved bounded spike |

## Automatic decision rules

- Documentation-only change: do not start the stack. Use ordinary document checks.
- Pure helper or contract change: run the narrow existing `verify:*` script; use `verify` only if a live boundary changed.
- Migration, grants, RLS, Auth, or Edge action change: use `prepare` when fixtures are absent, then `verify`.
- Photo-dialog UI change: use the narrow contracts and Browser mode. Do not click Search unless External mode was separately authorized.
- Release-candidate request: use Full plus Browser; production remains a separate gate.

## Explicit gates

These are never implied by selecting a mode:

- `npx supabase db reset --local` or removal of Docker volumes.
- Any Wikimedia, Pexels, Pixabay, Gemini, Google, or other third-party request.
- Production secrets, migrations, Edge deployment, storage writes, or production smoke.
- Git commit, push, merge, tag, or release.

When one gate is required, pause immediately before it and ask only for that gate. After approval, continue the already-authorized local workflow without asking again for each safe subcommand.
