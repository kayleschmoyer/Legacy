---
name: e2e-hold
description: 'External E2E blocker protocol: attribute a red E2E check to the PR or to main with evidence, and when the failure is pre-existing on main — file/link a blocker ticket, hold the PR with a machine-readable marker, alert the user, arm a long-poll monitor, and rebase to resume once the blocker is fixed. Load when: an E2E check fails on a PR and the failing specs look unrelated to the diff, or a sweep encounters a PR labeled blocked:e2e-on-main.'
---

# External E2E Blocker Protocol (hold-and-resume)

A PR's E2E check can go red because of changes that are **not on the PR** — a regression that already merged to main, or an infra break. This protocol prevents the two failure modes that follow:

1. **Landing red** — merging (or pushing toward merge) while E2E is failing, because "it's not my fault".
2. **Getting stuck** — burning cycles debugging failures the PR didn't cause, or silently parking until the session dies.

## The iron rule

> **A red E2E check never merges — attribution changes _who fixes it_, never whether it blocks.** Even when the failure is proven pre-existing on main, do not merge, do not ask the maintainer for an override, and do not mark the PR ready-to-land. The only exit from a red E2E check is: the failure is fixed (by this PR or by the blocker ticket's fix) and the check is green on the current HEAD.

## Phase A: Attribution gate (mandatory before blaming main)

Default verdict is **"this PR caused it."** You may only enter the hold protocol with positive evidence. LS-8540 is the cautionary tale: 24 identical `TimeoutError` failures on PR #6194 looked sitewide, reproduced deterministically on re-run — and were still that PR's own regression. "Looks unrelated to my diff" is not evidence.

There is **no standing E2E-on-main signal** — hermetic E2E runs only on PR branches via the CI orchestrator, so "is main broken?" must be probed:

1. **Extract the failing specs** from the run: `ci_get_playwright_test_result` / `ci_get_logs(runId)`. Record spec paths, test titles, and error signatures.
2. **Diff-relevance check** (fast, weak): map failing specs to surfaces via `apps/web-e2e/src/e2e-surface-map.json` and compare against the PR's changed files (`github_pr_diff`). Overlap → almost certainly yours; fix normally. No overlap → continue probing (still not proof).
3. **Cross-PR corroboration** (fast, supporting only): are other open PRs' latest runs failing the **same specs with the same signatures**? (`github_pr_dashboard` → `ci_view_run({ runIds: [...] })` on the failing PRs' runs.) Corroboration supports "pre-existing"; lack of it strongly suggests the failure is yours.
4. **Local baseline — the authoritative probe.** Run the failing spec(s) locally (hermetic specs run anywhere — see the [testing skill](../../testing/SKILL.md) for the local run recipe):
   - On **your branch**: confirm the failure reproduces (if it doesn't, treat as flake/infra — `ci_rerun` once, then re-triage).
   - On **`origin/main`**: stash your diff (`worktree_stash`) or run in a clean checkout of `origin/main`.
   - **Fails on `origin/main` too → pre-existing. Enter Phase B.**
   - **Passes on `origin/main`, fails on your branch → it is yours**, no matter how unrelated it looks. Fix it normally ([e2e-determinism](../../testing/references/e2e-determinism.md)).
5. **Identify the first bad main commit** (strengthens the ticket, not required to hold): query the **E2E test-result ledger** ([testing § E2E Ledger](../../testing/references/e2e-ledger.md), LS-9757) for the failing spec first — it returns the spec's full pass/fail/flaky timeline across SHAs directly, replacing manual cross-referencing of PR run IDs (the LS-9695 investigation is the worked example of what that manual archaeology looked like before the ledger existed).

   ```bash
   node .github/scripts/e2e-ledger/query-e2e-ledger.mjs --spec <spec-path> --json
   ```

   Returns `{ spec, records: [...] }`, each record shaped `{sha, prNumber, timestamp, spec, testName, status, retryCount, relatedToDiff}`, ordered oldest to newest; the first `failed`/`flaky` record after a run of `passed` records is the introducing commit. Requires AWS credentials with read access to `legacy-sports-dev-ci-artifacts` in the environment. If the ledger has no data for this spec (e.g. a brand-new spec with no history), fall back to the manual method: walk recent merges to main (`worktree_log`) and bisect locally against the failing spec.

   Once the ledger confirms the introducing commit, cite it directly in the blocker ticket body (Phase B step 2) instead of the manual bisection notes.

## Phase B: Find-or-create the blocker ticket

Never file a duplicate — several held PRs must converge on **one** blocker ticket.

1. **Search first**: `jira_search` for open tickets with the canonical summary prefix, e.g. JQL `summary ~ "E2E broken on main" AND statusCategory != Done`. Match on spec names/signature in the results. A PR already holding for the same break will also have the key in its `<!-- e2e-hold -->` marker — `github_pr_dashboard` + `github_list_pr_comments` on other `blocked:e2e-on-main` PRs is a second dedup path.
2. **If none exists, create it** — `jira_create_ticket(type: "Bug")` with the canonical summary prefix:

   ```
   summary: "E2E broken on main: <primary spec or failure signature>"
   ```

   Body must contain: failing spec paths + test titles, error signatures, evidence from Phase A (run IDs, local baseline result on `origin/main`, suspect commit/PR if bisected), and the list of PRs currently held by it.

3. **Link it as a blocker to your own ticket**: `jira_link_issues(inwardKey: "<your LS-####>", outwardKey: "<blocker LS-####>")` — inward is the blocked ticket, outward is the blocker.

4. **Optionally dispatch a fix chip** (`mcp__ccd_session__spawn_task`, one chip = the blocker ticket) so the blocker gets fixed without waiting for a human to pick it up. The chip's job is **fix and merge the blocker ticket only** — its prompt must NOT tell it to rebase, update, label, or otherwise poke the held PR. Resume is owned by the auto-resume backstop and this session's Phase D monitor; a chip that also pokes the held PR races the holder's local rebase (`push --force-with-lease` collisions).

## Phase C: Hold the PR (visible, machine-readable)

A hold that isn't surfaced is just abandonment. All four steps are required before the hold is legitimate:

1. **Post the hold marker comment** on the PR (`github_comment_pr`):

   ```markdown
   ⏸️ **Held: E2E is broken on `main`, not by this PR.**

   Blocker: LS-#### · Failing specs: `<spec1>`, `<spec2>` · Evidence: fails on `origin/main` at `<sha>` (local baseline), corroborated by PR #<n>.

   This PR resumes automatically (rebase → revalidate → re-review) once the blocker is fixed.

   <!-- e2e-hold
   blocker: LS-####
   specs: <spec1>, <spec2>
   held-at: <ISO date>
   -->
   ```

   The HTML marker is the machine-readable contract — sweep agents and future sessions parse the blocker key from it.

2. **Apply the hold label**: `github_manage_labels(prs: [<PR#>], add: ["blocked:e2e-on-main"])`. Keep `agent-in-progress` — this session is still watching. The PR stays **Ready** (not draft).
3. **Alert the user** with `PushNotification`: e.g. `PR #<n> held: E2E broken on main (<spec>), filed LS-####, monitor armed`. This is exactly the kind of event the user wants to know about now — a PR they expect to land is blocked on external work.
4. **Arm the monitor** (Phase D) before ending the turn. A hold without an armed monitor (or, if the session is about to die anyway, without the marker comment for the sweep net) is a protocol violation.

## Phase D: Arm the long-poll monitor

> **Polling carve-out**: the never-poll-CI rule exists because PR events on the bound branch arrive as push notifications. Blocker-ticket resolution and main-branch E2E health are **not** push events — nothing will wake the session when someone else's fix merges. A low-frequency long-poll (10-minute interval) on those two signals is the sanctioned mechanism, not a rule violation. Do not tighten the interval below 10 minutes.

Arm a persistent `Monitor` that emits on **every** terminal condition (resolution, and poll-failure — silence must not be ambiguous):

```bash
# Monitor({ description: "E2E-hold blocker LS-#### for PR #<n>", persistent: true, command: <below> })
KEY=LS-####   # blocker ticket
fails=0
while true; do
  ok=1
  # Signal 1: a merged PR referencing the blocker key (commit-format rule guarantees the key in the title)
  merged=$(gh pr list --repo bkrupa/legacy-sports --state merged --search "$KEY" --limit 1 --json number -q '.[0].number' 2>/dev/null) || ok=0
  if [ -n "$merged" ]; then echo "E2E-HOLD RESOLVED: fix PR #$merged for $KEY merged"; exit 0; fi
  # Signal 2: blocker ticket closed in Jira (covers no-PR fixes, e.g. infra); needs JIRA_EMAIL/JIRA_API_TOKEN
  if [ -n "$JIRA_API_TOKEN" ] && [ -n "$JIRA_EMAIL" ]; then
    status=$(curl -sf -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
      "https://bkrupa.atlassian.net/rest/api/3/issue/$KEY?fields=status" | jq -r '.fields.status.name') || ok=0
    case "$status" in Done|Closed|Resolved) echo "E2E-HOLD RESOLVED: $KEY is $status"; exit 0;; esac
  fi
  # Never let repeated poll failures masquerade as "still holding"
  if [ "$ok" -eq 0 ]; then fails=$((fails+1)); else fails=0; fi
  if [ "$fails" -ge 6 ]; then echo "E2E-HOLD WARNING: polls for $KEY failing for ~1h — check gh/Jira auth"; fails=0; fi
  sleep 600
done
```

With the monitor armed, the marker posted, the label applied, and the user notified, **the turn may end** — this is the "Held on external E2E blocker (armed)" state in [drive.md's terminal states](drive.md#terminal-states-the-only-places-this-loop-may-stop). The session is parked, not stuck: the monitor wakes it, and if the session dies anyway, the sweep net (below) resumes the PR.

## Auto-resume backstop (tokenless)

`.github/workflows/e2e-hold-resume.yml` (LS-9218) resumes held PRs with **zero agent tokens**: on every merge to `main` it matches the merged PR's LS-#### title keys against each held PR's `<!-- e2e-hold -->` marker `blocker:` key. On a match it runs `update-branch` (merging fresh main → a `synchronize` event that re-fires CI + review while this session sleeps), appends ▶️ auto-resumed to the hold comment, removes `blocked:e2e-on-main`, and ensures `bot:ready-for-review`. If `update-branch` hits conflicts it leaves the hold **fully intact** and appends a ⚠️ failure note — the rebase path is then this session's (or a resume chip's) job.

Because the workflow fires within seconds of the fix merging and the Phase D monitor polls at 10 minutes, **expect the backstop to have already acted by the time this session wakes**. Phase E reconciles the two.

The backstop only matches fixes whose PR title carries the blocker key. Fixes without a PR (infra, Jira-only closure) or with a mistitled PR still rely on the Phase D monitor and the sweep net — the backstop is a layer, not a replacement for arming the monitor.

## Phase E: Resume on blocker resolution

When the monitor fires (or a sweep resume-chip picks up a held PR whose blocker is Done):

1. **Confirm one-shot**: `jira_view(key: <blocker>)` shows Done, or `github_view_pr` on the fix PR shows `state: "MERGED"`. If neither confirms (monitor false positive), re-arm and stay held.
2. **Disarm the monitor**: `TaskStop` it if still running.
3. **Check whether the backstop already resumed**: `github_view_pr` on your PR — if `blocked:e2e-on-main` is gone and the remote head has advanced past your local head, the backstop's `update-branch` already re-fired CI. **Do not rebase over it** (the one case where [the rebase-vs-merge rule](../../worktree-workflow/references/rebase.md#rebase-vs-merge-main-one-rule-ls-10377) says to take the remote's merge commit as canonical, not rewrite it): `git fetch` and fast-forward/reset your local branch to `origin/<branch>` (the remote merge commit is canonical; a local rebase + `push --force-with-lease` here would fail or erase the revalidation in flight), then skip to step 5.
4. **Backstop didn't act or failed on conflicts** (hold label still present, or the hold comment carries the ⚠️ auto-resume-failed note): resume manually —
   - **Rebase onto main** to pick up the fix (default per the [rebase-vs-merge rule](../../worktree-workflow/references/rebase.md#rebase-vs-merge-main-one-rule-ls-10377); `update-branch` is the tokenless backstop's tool, not the agent's): `/rebase` (worktree_rebase_onto_main → stabilize → validate). Push.
   - **Un-hold**: `github_manage_labels(prs: [<PR#>], remove: ["blocked:e2e-on-main"])`, update the hold comment (▶️ resumed: blocker LS-#### resolved by PR #<n>), and re-apply `bot:ready-for-review` (**last** label op) to re-fire review + CI.
5. **Re-enter the drive loop** ([drive.md Step 6](drive.md#step-6-event-handling-loop)) and drive to merge.
6. **If the same specs fail again** on the new run: the blocker fix was incomplete. Re-run Phase A (the failure may be yours now). If it is still pre-existing, comment the evidence on the blocker ticket (or its successor), re-hold **once**. On a second recurrence, stop and escalate to the user with the full history — do not loop hold/resume silently.

## Sweep net (recovery when the holding session dies)

Sweep agents ([sweep.md](sweep.md)) treat `blocked:e2e-on-main` specially — the label exempts the PR from the 90-minute staleness rule (a held PR is quiet by design, not stalled):

- Parse the blocker key from the `<!-- e2e-hold -->` marker (`github_list_pr_comments`), then `jira_view` it.
- **Blocker still open** → the hold is valid: skip the PR, count it as "held" in the report. Do not strip `agent-in-progress`.
- **Blocker Done/Closed** → the holding session is gone or asleep: dispatch a **resume chip** whose prompt is Phase E of this protocol (rebase → un-hold → `bot:ready-for-review` → drive to merge).
- **No parseable marker** (label without comment) → malformed hold: treat as a normal stalled PR (Step 2b), and fix the marker if re-holding.

## Related

- [drive.md](drive.md) — terminal states, event loop
- [ci-event-response.md](ci-event-response.md) — E2E failure classification routes here
- [testing/references/e2e-determinism.md](../../testing/references/e2e-determinism.md) — fixing failures that ARE yours
- [worktree-workflow rebase reference](../../worktree-workflow/references/rebase.md) — the resume rebase
