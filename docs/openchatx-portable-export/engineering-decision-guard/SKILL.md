---
name: engineering-decision-guard
description: Keep engineering work aligned with project-recorded approvals, decision lifecycle, scope boundaries, and verified repository state.
---

# Engineering Decision Guard

## Canonical records

For Travel-Companion, the Git repository is the source of truth:

- Index: `docs/decisions/README.md`
- Current accepted decisions: `docs/decisions/active/`
- Retired/superseded decisions: `docs/decisions/history/`

Chat, memory, and handoff notes are never substitutes for these files.

## Before work

Before every Travel-Companion design discussion, debugging, implementation, test, or review:

1. Read `docs/decisions/README.md`.
2. Read relevant active decisions and their linked authoritative specifications.
3. Confirm the actual repository state and requested scope.
4. If required records cannot be read or conflict, stop the affected decision/change and report. Never guess from summaries.

A request to discuss or assess is not authorization to implement or alter a decision.

## Immediate decision capture (mandatory)

When the user explicitly says a continuing decision is "定案", "確定", "核准", "就照這個做", or gives equivalent clear approval:

- Treat that statement as authorization to record; do not ask whether it should be recorded.
- In the same work session, create/update the Accepted decision file in `docs/decisions/active/` and update the index.
- Read both back and verify the record and index link before telling the user it is recorded.
- Report the decision ID and exact path.
- If the approved content or scope is ambiguous, ask only the minimum necessary question. Until clarified, keep it Proposed and do not claim it is recorded or implement it as settled.

Record at least: ID, title, status, approval date, decision text, applicability/scope, constraints and exclusions, rationale/evidence, acceptance or expiry conditions, and authoritative specification link.

Create decision records only for durable matters: architecture, data contracts, security, shared interfaces, persistent behavior, or lasting scope boundaries. Do not create one for ordinary bug fixes or temporary debugging details.

## Status

- Proposed: not approved; no implementation authority.
- Accepted: explicitly approved and binding within scope.
- Superseded: replaced by a later approved decision.
- Retired: explicitly released or invalidated under its pre-defined objective condition.
- Rejected: explicitly declined; not an implementation basis.

## Protect decisions and scope

- Do not reopen an Accepted decision merely because another option exists.
- Do not expand work beyond the approved purpose, affected behavior, or acceptance criteria.
- Do not silently add refactors, features, cleanup, files, or workflows.
- If a proposed change conflicts with an Accepted decision or exceeds scope, stop only the affected action, show the exact conflict and impact, and get approval.
- A new question, alternative, or exploratory discussion is not approval to change an existing decision.

## When a decision may move to history

Never move a decision merely because implementation is complete, a release shipped, it is old, or the AI believes it is no longer needed.

Move an Accepted record to history only when:
1. The user explicitly approves its retirement; or
2. The user approves a replacement decision; or
3. The original decision explicitly defined an objective expiry/exit condition and verifiable evidence proves that condition is met.

If applicability or expiry is uncertain, keep it Accepted and ask the user.

## Retirement / supersession procedure

1. Record date, reason, supporting evidence, and replacement decision ID (if any).
2. Preserve the complete original record and mark it Retired or Superseded.
3. Move the record from `active/` to `history/`.
4. Update the index.
5. Read back the moved file and index to verify location and links.

Never delete historical decisions or merely overwrite their content.

## Re-entry and debugging

For a new conversation/handoff, re-read the index and relevant decisions from the repository, then inspect actual Git/worktree and affected code/specs. Handoff notes are navigation only.

For debugging, consult history where it can explain prior constraints or behavior. Historical decisions are not automatically active.

## Proportionality

Keep records brief and focused. One decision has one authoritative record. Existing detailed domain specs remain authoritative for their contracts; the index links to them rather than duplicating them. Small reversible changes stay lightweight.

## Completion report

Report changed files, created/updated/retired decision IDs, readback verification, checks actually run, remaining blockers, and Git state. Never claim completion without evidence.
