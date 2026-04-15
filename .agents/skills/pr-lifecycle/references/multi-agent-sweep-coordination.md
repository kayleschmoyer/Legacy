---
name: multi-agent-sweep-coordination
description: 'Claim/release protocol used by every sweep-prs run to coordinate across agents. Covers label setup (gh CLI), claim/release steps, race mitigation, stale detection, and sub-agent prompt templates. Always active — degrades gracefully when running solo.'
---

# Sweep Coordination: Claim Protocol

Every `sweep-prs` run uses `sweep-claimed` GitHub labels to coordinate across agents. When running solo the labels simply never contend. When multiple agents run simultaneously, each claims PRs before working on them and releases when done, so agents naturally work on disjoint sets.

The outer loop is in `open-prs/SKILL.md`. This document covers the low-level claim mechanics referenced there.

## Coordination Labels

Create once per repo using the `gh` CLI:

```bash
gh label list --search "sweep-" --json name | grep -q "sweep-claimed" \
  || gh label create "sweep-claimed" --color "e4e669" --description "Sweep agent actively working on this PR"

gh label list --search "sweep-" --json name | grep -q "sweep-stale-claim" \
  || gh label create "sweep-stale-claim" --color "d93f0b" --description "sweep-claimed was not cleaned up — claiming agent may have crashed"
```

To inspect or update existing labels:

```bash
gh label list --search "sweep-" --json name,color,description
gh label edit "sweep-claimed" --color "e4e669" --description "Sweep agent actively working on this PR"
gh label edit "sweep-stale-claim" --color "d93f0b" --description "sweep-claimed was not cleaned up — claiming agent may have crashed"
```

> **Always use `gh label create` / `gh label edit` for label setup — never `github_manage_labels`.** The MCP tool manages labels on PRs; label definition creation requires the `gh` CLI.

## Claim Protocol

For each PR before starting work: check → claim → verify → work → release.

### Check

```bash
gh pr view <number> --json labels --jq '[.labels[].name] | contains(["sweep-claimed"])'
```

`true` → skip. `false` → proceed to claim.

In practice the scan already filters out `sweep-claimed` PRs from the workable list, so this step is a secondary guard for sub-agents that receive a pre-assigned PR.

### Claim

**MCP (preferred):**

```
github_manage_labels(prs: [<number>], add: ["sweep-claimed"])
```

**Shell fallback:**

```bash
gh pr edit <number> --add-label "sweep-claimed"
```

### Verify (race mitigation)

Wait 2 seconds, then confirm the label is still present:

```bash
sleep 2
gh pr view <number> --json labels --jq '[.labels[].name] | contains(["sweep-claimed"])'
```

If another agent removed it in this window (extremely rare), skip the PR.

> **On simultaneous claims**: if two agents add `sweep-claimed` within the same ~2s window, both will see the label present and both will proceed. This is acceptable — sweep operations are **idempotent**. A rebase on an already-current branch is a no-op; resolving an already-resolved thread is a no-op.

### Release

After finishing — success, blocker, or abandoned:

**MCP (preferred):**

```
github_manage_labels(prs: [<number>], remove: ["sweep-claimed"])
```

**Shell fallback:**

```bash
gh pr edit <number> --remove-label "sweep-claimed"
```

Never leave a PR claimed. A stale `sweep-claimed` hides the PR from all other agents until cleared.

## Stale Claim Detection

A claim is stale if `sweep-claimed` has been on the PR for >30 minutes with no new commits or comments. This happens when an agent crashes without cleanup.

Run at startup for long sweeps (>20 PRs) using the `github_sweep_stale_claims` MCP tool:

```
github_sweep_stale_claims(olderThanMinutes: 30)
```

Returns `{ staleClaims: [{ number, title, claimedAt, minutesAgo }], totalClaimed, checkedAt }`. Uses **label event timestamps** for accuracy — more reliable than `updatedAt`, which reflects any PR activity rather than when the label was applied.

For each PR in `staleClaims`:

**MCP (preferred):**

```
# Mark as stale, then reclaim
github_manage_labels(prs: [<number>], remove: ["sweep-claimed"], add: ["sweep-stale-claim"])
# (add a comment via gh pr comment — no MCP equivalent for PR comments)
github_manage_labels(prs: [<number>], remove: ["sweep-stale-claim"], add: ["sweep-claimed"])
```

**Shell fallback:**

```bash
# Mark as stale, then reclaim
gh pr edit <number> --remove-label "sweep-claimed" --add-label "sweep-stale-claim"
gh pr comment <number> --body "Sweep agent reclaiming — previous sweep-claimed label was stale (>30 min, no activity)."
gh pr edit <number> --remove-label "sweep-stale-claim" --add-label "sweep-claimed"
```

## Sub-Agent Prompt Templates

The orchestrating agent claims each PR before spawning a sub-agent. Sub-agents receive a pre-claimed PR and must release on exit regardless of outcome.

**Review fix sub-agent:**

> Fix review comments on PR #\<number\> in worktree \<path\>.
> **This PR is already claimed** — `sweep-claimed` was added by the orchestrator before spawning you.
> Read unresolved threads, apply fixes, run `make pc`, commit, push.
> Resolve all fixed threads in one call: `github_resolve_threads(threadIds: [...])`.
> If unfixable, comment the blocker on the PR and move on.
> **Before exiting (success or failure), always release the claim: `github_manage_labels(prs: [<number>], remove: ["sweep-claimed"])`**
>
> Tool preferences:
>
> - Use Glob (not find/ls) for file discovery
> - Use Grep (not grep/rg) for content search
> - Use Read (not cat/head/tail) for reading files
> - Use worktree_run for git commands (not git -C via Bash)
> - Use worktree_commit/worktree_push for commits and pushes

**CI fix sub-agent:**

> Fix the CI failure on PR #\<number\> in worktree \<path\>. The failing CI label is \<ci-failure-label\>.
> **This PR is already claimed** — `sweep-claimed` was added by the orchestrator before spawning you.
> Diagnose with `ci_get_logs`, apply the fix, run `make pc`, commit, push.
> After a successful push, remove the CI failure label: `github_manage_labels(prs: [<number>], remove: ["<ci-failure-label>"])`.
> If unfixable, comment the root cause and what was attempted — do not remove the CI failure label.
> **Before exiting (success or failure), always release the claim: `github_manage_labels(prs: [<number>], remove: ["sweep-claimed"])`**
>
> Tool preferences:
>
> - Use Glob (not find/ls) for file discovery
> - Use Grep (not grep/rg) for content search
> - Use Read (not cat/head/tail) for reading files
> - Use worktree_run for git commands (not git -C via Bash)
> - Use worktree_commit/worktree_push for commits and pushes
