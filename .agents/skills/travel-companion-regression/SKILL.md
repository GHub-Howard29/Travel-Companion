---
name: travel-companion-regression
description: Run or plan Travel-Companion local Supabase, Edge Function, and Codex-browser regression when changes affect migrations, RLS, Auth, Trip loading, travel-route, or itinerary photo UI. Do not use for documentation-only work or production deployment.
---

# Travel-Companion Regression

Use this skill only from the Travel-Companion repository. Select the smallest regression mode that covers the changed risk; do not reload historical commands from conversation context when the maintained script or references answer the question.

## Invocation and authorization

- Invoke this skill automatically when the current task includes implementation or regression in the covered areas.
- A user request such as「測試」「執行本機回歸」「完成驗證」authorizes the non-production local startup, idempotent fixture preparation, and matching local verification for that turn. The user does not need to name a script.
- Without a testing request, `npm run regression:local:status` is the only mode that may run automatically. If the changed risk warrants live regression, state the local scope and request one authorization before starting services or writing fixtures; do not require the user to identify commands.
- Always obtain a fresh, single-use authorization immediately before any Wikimedia request, even if an earlier turn authorized one.
- Require separate explicit authorization for database reset, destructive cleanup, production Supabase, deployment, commit, push, or tag. Never infer these from local-test authorization.

Read [references/modes.md](references/modes.md) to choose a mode. Read [references/browser-checklist.md](references/browser-checklist.md) only when interactive UI verification is required.

## Maintained commands

Run from the repository root:

```text
npm run regression:local:status
npm run regression:local:prepare
npm run regression:local:browser-bootstrap
npm run regression:local:browser-ambiguous-fixture
npm run regression:local:verify
npm run regression:local:full
```

`prepare`, `verify`, and `full` refuse non-loopback Supabase URLs. They do not reset the database, contact Wikimedia, deploy, or use production data.

Before interactive browser verification, run `browser-bootstrap` after local-test authorization. It refreshes only the fixed synthetic fixture, verifies Vite and the local Edge Function, and prints the localhost URL, local publishable configuration, and synthetic sign-in fields. If the exact synthetic administrator and Trip are already active, reuse that session. Otherwise use the browser's loaded Supabase JS client to call `signInWithPassword` against the reported loopback URL, then reload the App. Do not directly write, print, copy, or persist an access token outside Supabase's browser session handling.

For ambiguous-entity layout and selection regression, use `browser-ambiguous-fixture`. It verifies a loopback-only synthetic Edge response and prints a development URL that enables three same-label choices: one short description, one wrapping description, and one missing description. The fixture returns before cache, quota, lock, usage, or Wikimedia code and is unavailable when `SUPABASE_URL` is not loopback. It is a UI/contract regression only and must never be reported as a real Wikimedia integration pass.

If the local stack is absent and local testing is authorized, start only the missing services using tool-managed sessions:

```text
npx supabase start
npm run dev -- --host 127.0.0.1
npx supabase functions serve travel-route --env-file supabase/.env.local --no-verify-jwt
```

Run `prepare` after Supabase is healthy and before starting Vite or the Edge Function so ignored local env files exist. If the Supabase CLI fails only because its user-level telemetry file is sandboxed, request the narrow permission needed for that same CLI command; do not change project files to bypass it.

Use the Codex in-app browser for interactive checks. Locate controls by accessible name and current UI state, never by saved accessibility node numbers.

## Maintaining this automation

When a future task reveals a repeatable regression step that belongs to this workflow but is still being performed manually, proactively tell the user what is missing, why adding it is useful, and which files or side effects the proposed automation would introduce. Obtain one scoped authorization before changing this skill, its references, its scripts, or the related npm commands. After approval, add the reusable step, validate it, and continue the already-authorized workflow without requiring the user to restate the implementation details.

Do not silently expand the scripts, store credentials, encode production access, or turn one-off debugging into a permanent step. Preserve all existing reset, external-request, production, deployment, and Git authorization gates.

## Reporting

Separate these outcomes: static contracts, clean local database, local API/Edge integration, Codex-browser desktop, Codex-browser 390x844, Wikimedia external request, and production. State skipped gates and their authorization requirement. Do not describe a mocked or input-rejected request as an upstream integration pass.
