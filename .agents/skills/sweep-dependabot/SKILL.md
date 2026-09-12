---
name: sweep-dependabot
description: 'Triage all open Dependabot PRs in one pass: close stale duplicates, dispatch chips to rebase + ready clean PRs, fix lint-toolchain breakages, re-run flaky CI, and skip human-review PRs. Closes the loop on Dependabot PRs that stall because Dependabot never applies `bot:ready-for-review`. Use when the user asks to sweep, triage, clean up, or unstick Dependabot PRs.'
metadata:
  scope: '**'
---

<!-- Role: orchestrator (per .agents/ROLES.md). The `role` field is documented in ROLES.md but rejected by scripts/lint-skills.js, so it is kept as a comment here rather than frontmatter. -->

# Skill: Sweep Dependabot

## Overview

Dependabot opens PRs but **never applies `bot:ready-for-review`**, so Reviewer (W1) never runs and the PRs sit indefinitely. This skill is the dedicated triage pass for the Dependabot-authored slice of the PR queue — separate from `/sweep-prs`, which excludes Dependabot PRs from all code-changing passes.

The core principle is **decisive triage**: every open Dependabot PR exits the sweep in one of four states — closed (stale), labeled `bot:ready-for-review` and dispatched to a chip if work is needed, re-armed (flake re-run / `@dependabot rebase` comment posted), or skipped (human review required).

Examples of stuck PRs this skill clears (2026-05-26 baseline):

- **#3396** — 5+ months old, `merge-when-ready` but never reviewed (no `bot:ready-for-review` ever applied)
- **#4285** — `CI: E2E Failure` on a devDep bump (likely flake)
- **#4149** — `needs-human-review` — skip
- **#3957** — Terraform Plan failure on action bump
- **#3938** — `CI: Lint Failure` on a typescript-eslint bump (new rules surfaced)

## When to Use

- "Sweep Dependabot PRs"
- "Clean up stale Dependabot PRs"
- "Why are Dependabot PRs sitting?"
- Periodic maintenance (weekly) before a release cut
- After a typescript-eslint, prettier, or other lint-toolchain bump opens and stalls

## Prerequisites

```
github_auth_status()
jira_auth_status()
```

If either returns `configured: false`, stop and prompt the user. Sweep results depend on accurate PR state and ticket access.

## CRITICAL RULES

- **Precondition for any code change on a Dependabot PR: a dispatched chip with its own worktree.** Code work (lint fixes, conflict fixes) happens inside the chip, not inline in the orchestrator's context — the orchestrator only scans, classifies, and labels.
- **Precondition for resolving a Dependabot branch conflict: post `@dependabot rebase` as a PR comment.** Dependabot owns its branches; a local `git rebase` from a sibling worktree races against Dependabot and produces force-push conflicts. The new SHA from Dependabot's async rebase appears in the next sweep.
- **`bot:ready-for-review` is the linchpin.** Without it, Reviewer (W1) does not fire on Dependabot PRs. Applying it after every fresh push (or initial scan) is the central job of this skill.
- **Auto-approveable bumps only get `bot:ready-for-review`:**
  - GitHub Actions version bumps (any semver)
  - **Dev-dep** patch bumps (devDependencies in `package.json`)
  - Other **dev-dep** minor bumps when no breaking changes are noted by Dependabot
- **Major runtime-dep bumps**: leave alone. Label `requires-human-review` and skip. These need explicit owner decisions (deprecations, API breakage, transitive risk).
- **Stale rule**: a PR is stale and should be closed when **both** are true:
  1. Opened >30 days ago
  2. The bumped package has shipped a newer version since the PR opened
     Closing triggers Dependabot to recreate against the current version.
- **`merge-when-ready` is never applied manually — including on Dependabot PRs.** The Reviewer Bot applies it itself on APPROVED verdict; the agent's job is to apply `bot:ready-for-review` so the Bot runs. See the [Label Ownership table and boxed Dependabot ruling (2026-07-02)](../pr-lifecycle/references/label-ownership.md#label-ownership) — that table is the single home for this rule.
- **`needs-human-review` / `needs-human-security-review` PRs**: skip entirely. Operator decision.
- **No code changes inline.** Lint-toolchain fixes happen in a dispatched chip (one chip per PR), not in the orchestrator's context.

## Workflow

Five steps, each with its exact tool calls, classification rules, and decision tables: **[references/workflow.md](references/workflow.md)**.

1. **Scan** — list the open Dependabot PRs and their CI/mergeability state.
2. **Per-PR classification** — safe auto-approve bump vs. needs code work vs. conflicted.
3. **Stale-version check** — a superseded bump is closed, not merged.
4. **Dispatch a lint-toolchain chip** (with the cloud-mode fallback when chip dispatch is unavailable) for anything needing real code changes.
5. **Audit log** — record what was merged, closed, and dispatched.

Guardrails and troubleshooting (what the sweep must never do on its own, and what to do when a bump will not go green): **[references/troubleshooting.md](references/troubleshooting.md)**.
