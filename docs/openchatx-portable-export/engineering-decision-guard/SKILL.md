---
name: engineering-decision-guard
description: Govern Travel-Companion accepted engineering decisions with a compact work index, decision masters, and on-demand stage details.
---

# Engineering Decision Guard

## Canonical records

- Work index: `docs/decisions/README.md`. Always read it first. It contains status, current stage, next step, blockers, and links only.
- Decision master: the relevant `docs/decisions/active/ADR-*.md`. Read the full relevant master to obtain the Accepted decision and immutable scope.
- Stage detail: `docs/decisions/active/ADR-*-S*.md`. Load only the file required by the current task; never preload every stage.
- Evidence: linked domain investigation, specification, or test record. Read only when evidence or execution status is needed.
- History: `docs/decisions/history/`. Preserve retired, superseded, or rejected decisions for traceability.

## Loading workflow

1. Read `docs/decisions/README.md` first. Locate the relevant decision ID, status, current stage, next step, blocker, loading conditions, and links.
2. Read the relevant ADR master to verify the Accepted decision and immutable scope.
3. Load only the stage attachment needed for the current task. Additional stages are justified only by cross-stage dependencies, comparisons, or required validation; never preload all stages.
4. Read linked investigation/specification/test evidence only when its details or verification are needed.
5. Update progress, next step, blocker, or evidence links in the relevant stage detail and the README index. The index remains compact and must not copy technical details or long test output.
6. If the index, master, or required stage file is unavailable or inconsistent, stop the affected work and repair/verify the canonical record rather than infer from chat or handoff.
7. After changes, read back all affected canonical records and index/instruction entries and verify links.

## Decision governance

- Explicit user approval such as “定案”, “確定”, “核准”, or “就照這個做” authorizes recording the decision in the same work session.
- Update the corresponding ADR master and `docs/decisions/README.md` together. When stage details or loading guidance are affected, update the relevant stage files and every affected index or instruction entry in the same change.
- Stage files contain execution detail only. They cannot independently create, alter, broaden, or retire an Accepted decision.
- If the decision wording, scope, or approving target is ambiguous, mark it Proposed and ask only the necessary clarification. Proposed is not implementation authorization.
- After writing, read back the master, affected stage documents, and all changed indexes to verify content and links. Report the decision ID and paths only after verification succeeds.

## History governance

- Never retire an Accepted decision merely because implementation is complete, a release occurred, a document is old, or an agent believes it is no longer needed.
- Move a decision to history only after explicit user approval to retire or supersede it, or when an objective retirement condition written in the original decision is demonstrably met.
- Preserve the original text and record date, reason, evidence, and replacement decision ID where applicable. Update the index and verify the moved file and links.

## Conflict handling

- If a task conflicts with an Accepted decision or exceeds its approved scope, stop the affected action and report the conflict. Obtain approval before changing the decision or implementation scope.
- Distinguish prototype PASS, stage exit PASS, integrated implementation PASS, migration application, and production acceptance. Never report one as another.
