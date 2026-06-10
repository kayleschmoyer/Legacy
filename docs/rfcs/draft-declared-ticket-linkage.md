# Declare Jira ticket linkage on PRs and make branch sync forward-only (LS-7893)

## Status

Draft

## Problem

`jira-branch-sync.yml` keeps Jira ticket statuses in sync with PR activity, but it
**infers** which tickets a PR works on from four fuzzy sources: branch name, PR
title, PR body closing-keywords, and — on `claude/*` push events — a sweep of every
`LS-####` key in every commit message in the push payload. Inference plus an
unguarded state machine produces systematic drift:

1. **Push events unconditionally downgrade tickets to "In Progress"**, even when
   the branch's PR is open and in review. The workflow comment claims the
   transition only fires "when the branch has no associated open PR", but no such
   check exists in the code. Every review-fix push knocks the ticket from
   In Review back to In Progress, and nothing moves it forward again until merge.
   Verified 2026-06-10: PR for `claude/hopeful-darwin-nt7z6b` opened 16:49
   (LS-7523 → In Review); push at 16:56 (run 27291997543) moved LS-7520 and
   LS-7523 → In Progress while the PR sat in review. Since nearly every agent PR
   has review-fix pushes, most in-review tickets display the wrong status.
2. **Commit-message sweeping captures unrelated tickets.** After a rebase onto
   `main`, the push payload includes main's commits, so keys belonging to other
   (often already-Done) tickets get swept in and transitioned. The LS-7520 +
   LS-7523 pair above is this in action.
3. **Nonexistent keys fail at the worst time.** A typo'd or never-created key
   (e.g. LS-7778) 404s during the transition step — after merge, when the author
   is gone — failing the run and masking real signal.
4. **Epic rollup amplifies all of the above**: the sync recalculates parent epic
   status from (now wrong) child statuses, spreading drift upward.

There is also no single trustworthy answer to "which ticket is this PR for?" —
each consumer (sync, audit, reviewer bot, sweep agents, humans) re-derives it
from different fields and can disagree.

## Goals

- A PR **declares** its ticket linkage in exactly one machine-readable place,
  visible to humans and parseable by every actor.
- Ticket existence is validated **before merge**, while the author is present.
- Automated transitions are **monotonic**: automation can only move a ticket
  forward (`To Do → In Progress → In Review → Done`), with two explicit,
  event-scoped exceptions (PR closed unmerged; PR converted to draft).
- A push to a branch with an open PR never changes ticket status.
- Unrelated tickets can never be transitioned by rebases or multi-key commit
  messages.
- The reconciliation audit (`jira-status-audit.yml`) reads the same declaration
  and can therefore auto-repair drift instead of only labeling it.

## Non-goals

- Two-way sync (Jira → GitHub). Manual Jira changes remain reconciled by the
  existing audit, not by this work.
- Changing the epic rollup rules (LS-4683 semantics stay as-is; rollup just
  starts from correct child states).
- Multi-ticket PRs. The repo rule is one ticket = one worktree = one PR;
  `related` keys are informational only.
- Migrating historical/closed PRs to the new marker.

## Proposal

### 1. Structured `jira-link` marker in the PR body (single source of truth)

```markdown
<!-- jira-link
primary: LS-7523
related: LS-7520
-->

**Jira:** [LS-7523](https://bkrupa.atlassian.net/browse/LS-7523)
```

- `primary` — exactly one key (or `none`): the ticket this PR works on. The
  **only** key the sync transitions on PR events.
- `related` — optional, comma/space-separated, never auto-transitioned. Jira's
  own PR-link scanner still surfaces these on the tickets.
- The HTML comment is the parse target (stable, invisible, not mangled by
  prose edits); the visible line is for humans.
- Correcting linkage = editing the PR body. No force-push or branch rename.

### 2. Authoring and validation

- **Authoring**: `github_create_pr` (worktree MCP server) and the
  `create-pr` / `work-ticket` skill templates emit the marker from the ticket
  the session is working. Dependabot and other botomated PRs get
  `primary: none`.
- **Validation**: new required check **`Jira Link Check`** on
  `pull_request: [opened, edited, reopened]`:
  - marker present, parseable, exactly one `primary` (or explicit `none`),
  - primary key exists in Jira (single GET — kills the 404-after-merge class),
  - PR title contains the primary key (keeps Jira's native scanner and human
    scanning working),
  - `primary: none` additionally requires the `no-jira` label (deliberate,
    visible opt-out).
  - Failure output includes a copy-pasteable marker block.

### 3. Forward-only sync state machine

`jira-branch-sync.yml` trigger logic is rewritten to consume only declarations:

| Event                                   | Keys used             | Transition    |
| --------------------------------------- | --------------------- | ------------- |
| PR opened / reopened / ready_for_review | `primary` from marker | → In Review   |
| PR converted_to_draft                   | `primary`             | → In Progress |
| PR merged                               | `primary`             | → Done        |
| PR closed unmerged                      | `primary`             | → In Progress |
| Push, **no open PR for branch**         | branch-name keys only | → In Progress |
| Push, open PR exists                    | —                     | no-op         |

Structural guards independent of event handling:

- **Open-PR check on push**: `GET /repos/{repo}/pulls?head={owner}:{branch}&state=open`;
  any result → exit 0. Commit-message sweeping is **deleted** (rebase
  contamination vector; redundant once PRs declare). For `claude/*` branches
  with no key in the branch name, the pre-PR "In Progress" nudge is skipped —
  the `work-ticket` skill already transitions on claim.
- **Monotonic transition guard**: read current status first; consult an
  allowed-moves table (`To Do → In Progress → In Review → Done`). The two
  downgrades above are permitted only from In Review and only on their
  specific events. A merged PR can never un-Done a ticket; a push can never
  demote anything. This makes the system safe even against future buggy or
  racing callers.

### 4. Reconciliation reads the same declaration

`jira-status-audit.yml` switches from title parsing to the marker. Expected
state becomes computable from one field ("PR open & ready, primary In
Progress → expected In Review"), so the audit auto-repairs (applying the same
monotonic guard) instead of only labeling mismatches.

### 5. Implementation shape

Extract parsing + state-machine logic from inline workflow bash into a small
unit-tested Node package (e.g. `tools/jira-sync/`). The two workflows become
thin event adapters. The current ~560-line untestable YAML is how the
"comment says one thing, code does another" bug survived.

## Alternatives Considered

### Alternative A: Patch the existing bash in place (add open-PR check, drop commit sweep)

Minimal diff; fixes the two acute bugs.

**Why rejected**: leaves inference (title/body keyword parsing) as the source
of truth, leaves the state machine non-monotonic, leaves 404s post-merge, and
leaves the logic untestable inline bash. The acute fix is subsumed by phase 1
of this proposal at similar cost.

### Alternative B: Drive transitions from Jira's native GitHub integration (Branch Sync app)

Jira's own DVCS/GitHub app can transition on PR events via smart commits.

**Why rejected**: smart-commit syntax in commit messages reintroduces the
commit-sweep contamination problem; transition rules are configured in Jira
(invisible to repo review, not version-controlled); no monotonic guard; no
existence validation pre-merge; epic rollup logic (LS-4683) not expressible.

### Alternative C: Status checks derived from branch protection labels (e.g. `jira:LS-1234` PR label)

Labels are machine-readable and visible.

**Why rejected**: labels are repo-global objects (one label per ticket key
pollutes the label namespace at this PR volume), are not editable as text in
review, and bots routinely manage labels (ownership collisions with the
existing Label Ownership table in pr-lifecycle).

## Risks

| Risk                                                                | Likelihood | Impact | Mitigation                                                                                                                                                                                               |
| ------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRs opened before rollout lack the marker                           | High       | Low    | Sync falls back to title-key parsing when marker absent; required check enabled only after authoring tooling ships                                                                                       |
| Authoring tooling misses a path (manual `gh pr create`, hotfix PRs) | Med        | Low    | `Jira Link Check` fails fast with a copy-pasteable block; author fixes by editing the body                                                                                                               |
| Monotonic guard blocks a legitimate manual re-open flow             | Low        | Med    | Reopen event explicitly allowed (Done → In Review on `reopened` of a previously merged-then-reverted ticket is handled by the revert entrypoint, not sync); audit labels anything it refuses to auto-fix |
| Extra Jira GET per transition (status read) hits rate limits        | Low        | Low    | Existing retry/backoff helper; reads are 1 per ticket per event, volume is already comparable                                                                                                            |
| `pull_request: edited` fires `Jira Link Check` on every body edit   | High       | Low    | Check is a single parse + one Jira GET (<5 s); concurrency-grouped per PR                                                                                                                                |

## Test Plan

Unit (in `tools/jira-sync/`, runs in `make pc`):

- Marker parsing: valid block, missing block, multiple primaries, `none`,
  malformed YAML-ish content, marker plus prose containing decoy `LS-####` keys.
- Transition table: every (event × current-status) cell asserts the expected
  action, including all no-op/downgrade-refusal cells.
- Open-PR gate: push with open PR → no-op; without → branch-name keys only.

Integration (staged on a test branch + scratch Jira tickets, as in prior CI
validation rounds):

1. Open PR with marker → ticket In Review; push fix commit → status unchanged
   (the headline regression test).
2. Rebase branch onto main containing foreign `LS-####` commits, push →
   foreign tickets untouched.
3. Merge PR → Done; subsequent branch push → Done unchanged.
4. PR with nonexistent primary → `Jira Link Check` fails pre-merge; sync never
   404s.
5. Convert to draft → In Progress; mark ready → In Review.
6. Audit run on a deliberately drifted ticket → auto-repaired, guard-refused
   cases labeled.

## Rollout

1. **Phase 1** — `tools/jira-sync/` package + rewritten `jira-branch-sync.yml`
   consuming it, with marker parsing **falling back to title keys** when no
   marker exists. Push-event open-PR gate and monotonic guard land here (the
   acute bug fix). Commit-message sweeping removed.
2. **Phase 2** — authoring: `github_create_pr` + skill templates emit the
   marker on every new PR.
3. **Phase 3** — `Jira Link Check` workflow added (non-required), watched for
   ~3 days of agent PR volume, then made required via ruleset (per the
   ruleset-drift process: owner merges + runs apply-ruleset.sh).
4. **Phase 4** — `jira-status-audit.yml` switches to marker-first parsing and
   gains auto-repair.

Rollback: each phase is independently revertible; phase 1 keeps behavior for
markerless PRs identical to today minus the two bug paths (push downgrade,
commit sweep), which is the desired end-state even if later phases stall.

## Open Questions

- Should `related` keys get a Jira remote-link created explicitly, or is
  Jira's native scanner sufficient? (Proposal assumes native scanner.)
- Does the merge-queue retarget flow (`merge-when-ready`) emit
  `closed`+`merged` with the marker intact in all cases, or do queue-created
  temporary PRs need an exemption in `Jira Link Check`?
- Should the audit's auto-repair be gated behind a dry-run period (label-only
  with proposed action) before enabling writes?
