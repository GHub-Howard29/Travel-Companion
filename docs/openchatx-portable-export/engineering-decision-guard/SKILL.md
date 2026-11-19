---
name: engineering-decision-guard
description: Prevent engineering decision drift across long AI development sessions, context compression, and agent handoffs. Use for implementation, architecture changes, technical planning, reviews, and cross-session handoffs.
---

# Engineering Decision Guard

## Purpose
Keep AI engineering work aligned with verifiable project state rather than conversational memory alone. Prevent silent changes to accepted decisions, approved scope, architecture boundaries, and data contracts.

## Before changing a project
1. Identify the task, scope, and acceptance criteria.
2. Read relevant project instructions and specification documents.
3. Identify applicable accepted ADRs and their status.
4. Verify the current branch, HEAD, working tree, and relevant remote state under project rules.
5. Check for overlapping agents or concurrent work when that information is available.
6. Distinguish facts, hypotheses, proposals, and approved decisions.

Do not treat chat history or a handoff summary as proof of the current repository state.

## ADR policy
Create or update an ADR only for decisions with continuing impact, such as architecture, persistent data contracts, security boundaries, shared interfaces, major technology choices, or constraints affecting future work. Do not create ADRs for routine bug fixes, temporary debugging, or implementation details that do not establish a continuing decision.

An ADR should record:
- Title and status (Proposed, Accepted, Superseded, or Rejected)
- Context and problem
- Decision
- Alternatives considered
- Rationale
- Consequences and constraints
- Conditions that justify reconsideration

An Accepted ADR is authoritative within its stated scope until superseded by an explicitly approved change.

## Protecting confirmed decisions
Before calling any tool that would change a confirmed decision or its governing configuration, compare the proposed change with the current confirmed decision. A new preference, alternative idea, or repeated reconsideration is not new evidence. If no new evidence, changed requirement, or verified error justifies the change, do not call the modifying tool; keep the existing decision. If a genuine conflict or reason to reconsider exists, stop and present the evidence and proposed change for user approval first.

## Decision conflict / Hard Break
Stop the affected modification immediately when:
- A proposed change conflicts with an approved specification or Accepted ADR.
- The agent is about to alter an approved architecture, interface, or data contract without authorization.
- The actual project state conflicts materially with the handoff or assumptions.
- The working tree, branch, ownership, or modification scope cannot be established safely.
- Concurrent agent changes may be overwritten or invalidated.

After stopping:
1. Preserve the current state; do not discard or overwrite work.
2. State the exact conflicting requirement or evidence.
3. Describe impact and viable alternatives.
4. Request the minimum decision or authorization required.
5. Resume only after the conflict is resolved and any affected ADR/specification is updated.

A Hard Break applies to the affected action; safe read-only investigation and unrelated work may continue.

## Proposing a decision change
Never silently rewrite or bypass an Accepted ADR. Provide evidence, explain why the current decision is insufficient, compare alternatives, identify migration/compatibility and rollback risks, and seek approval before implementation. Record the approved change and mark the old ADR as superseded where applicable.

## Context reset and handoff
A reset is appropriate when context reliability has materially declined, the task crosses conversations or agents, the scope changes, or a significant milestone needs a clean handoff. Do not use a fixed conversation-turn count as the sole trigger.

Before reset, record:
- Objective and scope
- Applicable specification and Accepted ADRs
- Completed work
- Pending work
- Files changed and their ownership
- Branch, HEAD, and working-tree state
- Tests run and exact outcomes
- Blockers, unresolved decisions, and risks
- Next safe action

## New-session re-entry
Before modifying anything in a new session:
1. Re-read the relevant specifications and ADRs.
2. Inspect the actual Git/worktree state.
3. Compare reality with the handoff.
4. Reconfirm task scope, ownership, pending work, and acceptance criteria.
5. Resolve discrepancies before writing.

Never resume from a summary alone when repository state can be inspected.

## Context reliability signals
Consider a reset or revalidation when the agent:
- Repeatedly loses or contradicts a previously confirmed decision.
- Cannot distinguish accepted decisions from proposed alternatives.
- Confuses tasks, branches, environments, data sets, or agent ownership.
- Cannot reliably state what has changed and what remains.
- Relies on inferred state where direct verification is available.

## Exceptions and proportionality
Do not over-process small, reversible changes. Keep the mechanism proportional to risk and scope. This Skill does not prohibit sound engineering improvements; it requires explicit review and approval for changes to durable decisions and approved boundaries.

## Completion report
Report what was verified, what changed, tests and evidence, remaining uncertainty, and the next safe step. Never describe an untested or simulated behavior as implemented or proven.
