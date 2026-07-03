---
name: failure-archaeology
description: "Where this repo's incident record lives and how to dig it up before re-fighting an old battle. Load when: investigating whether a bug/CI failure/outage has happened before, hunting the origin of a workaround or odd config, writing an RCA, or when git log/blame returns suspiciously little history."
---

# Skill: Failure Archaeology

Before you debug, design, or "clean up" anything surprising, check whether the battle was already fought. This repo has an unusually rich incident record — but it is scattered across five homes, and the git clone itself lies about history. This skill is the index and the digging method.

## Precondition: know that your clone is shallow

**Every cloud clone of this repo is grafted.** `git log` and `git blame` end silently at the graft commit — they do not error, they just present ~10 days of history as if it were everything. Anything older (the vast majority of the record) is invisible locally.

Verify before trusting any local history query:

```bash
git log --reverse --oneline | head -3   # oldest visible commit = the graft, not the repo root
cat .git/shallow                        # present ⇒ shallow; contains the graft SHA
```

In this audit's snapshot the graft was `a1316f0` (2026-06-22) with ~250 visible commits. Consequences:

| Symptom                                               | Reality                                                                                                                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git log --grep LS-1234` returns nothing              | The ticket is older than the graft, not absent                                                                                                                                     |
| `git blame` attributes a line to the graft commit     | The graft absorbed all prior authorship — the attribution is meaningless                                                                                                           |
| `git merge-base origin/main <ref>` fails `bad object` | Shallowness broke ancestry — this exact failure broke `classify-changes`/nx-affected in cloud sessions (LS-8209; `.claude/cloud-setup.sh` § "Deepen the shallow clone" is the fix) |

**Deep history lives on GitHub.** Use `mcp__github__search_commits` / `mcp__github__list_commits` (with `path:` for per-file history) / `mcp__github__get_commit`, or the GitHub web UI. Cite commit hashes in docs only when they fall inside the graft window — otherwise cite the doc or GitHub PR.

## Where the durable record lives

| Home                                                                      | What it holds                                                                                                                                                   | Notes                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/fixes/`](../../../docs/fixes/README.md)                            | RCAs of production incidents (connection-pool exhaustion, terraform locks, LS-102, LS-138)                                                                      | Includes one **OPEN** deferred investigation: [LS-4697 insert long-tail](../../../docs/fixes/LS-4697-insert-long-tail-investigation.md) — listed under "Open investigations" in its README                                                                                                          |
| [`docs/migration-history/`](../../../docs/migration-history/README.md)    | Completed one-time migration/refactor summaries (auth removal, Tamagui, Vite, CLI)                                                                              | Historical record only — treat every claim as of-its-date, not current                                                                                                                                                                                                                              |
| [`docs/decisions/`](../../../docs/decisions/README.md)                    | ADRs — the _why_ behind load-bearing choices (worktrees, CloudWatch-first, lock watchdog, nightly bisect)                                                       | The README is the index — don't trust any hardcoded count                                                                                                                                                                                                                                           |
| [`docs/rfcs/`](../../../docs/rfcs/)                                       | Accepted [modules-pool RFC](../../../docs/rfcs/modules-pool/README.md) + drafts                                                                                 | The modules-pool RFC is the canonical worktree/node_modules incident record                                                                                                                                                                                                                         |
| **Workflow-file comments**                                                | The de-facto durable CI incident log — ticket-keyed comments at the exact line the incident shaped                                                              | Verified examples: `.github/workflows/run-playwright-tests.yml` shard-ceiling block (LS-7866→LS-7867, incl. the raise protocol) and `.github/workflows/check-conflicts.yml` (LS-4479 header, LS-8229 sticky-comment marker). Grep workflows for a ticket key before assuming a setting is arbitrary |
| **Commit bodies**                                                         | Full RCAs ride on fix commits                                                                                                                                   | Model example: `8575ba9` (LS-8249) — symptom, evidence (live JWT probe), Apollo-cache mechanism, relationship to the sibling fix, validation. Write RCA commits like this one                                                                                                                       |
| [`docs/ci-cd/`](../../../docs/ci-cd/) + `docs/ci-cd/archive/`             | The CI greenfield-rebuild era (LS-3857): design, gap analysis, [retrospective](../../../docs/ci-cd/ci-rebuild-retrospective.md), abandoned Nx-Cloud/DTE program | Archive = dead ends deliberately recorded; do not resurrect without reading the retrospective                                                                                                                                                                                                       |
| [`docs/runners/ami-env-drift.md`](../../../docs/runners/ami-env-drift.md) | Claim-vs-observed ledger for the runner AMI                                                                                                                     | See house patterns below                                                                                                                                                                                                                                                                            |

## House recovery patterns

Each is the repo's _established_ response shape — reach for these before inventing a new one.

| Pattern                           | Rule                                                                                                                                                                                                                      | Verified example                                                                                                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Forward-fix, no reverts**       | Broken `main` is repaired by a forward fix (typically within 24h), never `git revert` — zero revert commits exist in the visible history                                                                                  | The LS-8247→LS-8249 next-day sweep (`8575ba9`)                                                                                                                                                                                                                   |
| **Rescue migration**              | When schema and deployed code drift (migration order vs deploy order), write one fully idempotent migration that enumerates every possible DB state and converges all of them — never edit or re-order applied migrations | `lib/db-client/migrations/20260526_100000_rescue_leagues_baseball_column_renames.ts` (LS-4870): handles states A–D in its header comment. Ordering traps: [domain-reference § Migration-order landmines](../domain-reference/SKILL.md#migration-order-landmines) |
| **Regression-guard test per bug** | Every client-reported bug fix lands with a test that names the bug ID and pins the fixed behavior                                                                                                                         | BLD-034 → `lib/shared-components/src/features/leagues/TradingCenter.spec.tsx`, test "renders all 11 completed trades when 11 are returned — no silent cap at 10"                                                                                                 |
| **Claim-vs-observed ledger**      | For infra that drifts invisibly, maintain a two-column ledger (what config claims vs what jobs observe) plus a diagnostic workflow to refresh it                                                                          | [`docs/runners/ami-env-drift.md`](../../../docs/runners/ami-env-drift.md) (LS-4947) + `runner-env-dump.yml`                                                                                                                                                      |

## Digging method

1. **Ticket key in hand?** `git log --all --grep "LS-####"` — but only trust a miss after the shallow check above; fall back to `mcp__github__search_commits`.
2. **Odd config/workaround in a file?** Grep the file and its directory for `LS-` / `BLD-` keys and read the comment; workflow files especially are annotated at the incident site.
3. **Symptom in hand?** Scan the [curated incident index](references/incident-index.md) first — ~30 one-line entries, symptom → root cause → evidence → status, including the [BLD-### client bug-bash index](references/incident-index.md#bld--client-bug-bash-index).
4. **Still nothing?** Check `docs/fixes/`, then ADRs (a "bug" may be a recorded trade-off, e.g. LS-4183 strict-checks-off), then Jira via the `jira_*` tools.

## When NOT to use this skill

- **Making a change** → [dev-process](../dev-process/SKILL.md) picks the entrypoint; this skill only tells you whether your change re-opens an old wound.
- **Debugging a live failure right now** → [debugging](../debugging/SKILL.md) routes the investigation; come here to check for prior art on the failure class.
- **Nightly integration-suite failures** → [nightly-green-campaign](../nightly-green-campaign/SKILL.md) is the operational playbook; its class-of-bug catalog supersedes this index for that domain.

## Related skills

- [debugging](../debugging/SKILL.md) — live-failure routing
- [dev-process](../dev-process/SKILL.md) — change-making framework
- [nightly-green-campaign](../nightly-green-campaign/SKILL.md) — E2E-flake incident domain
- [domain-reference](../domain-reference/SKILL.md) — migration-order landmines, data-model ground truth
- [database](../database/SKILL.md) — writing migrations (incl. rescue-style)

## Provenance and maintenance

Created 2026-07-02 from the Phase-1 skills audit (failure-archaeology slot): the incident record existed but was undiscoverable, docs/fixes/README omitted its one OPEN item, BLD IDs were unindexed, and nothing warned about the shallow clone.

Re-verify volatile facts:

- Graft point / depth: `git log --reverse --oneline | head -1` and `cat .git/shallow` (graft SHA and window move on every re-clone)
- Zero reverts: `git log --oneline | grep -ciE "^[0-9a-f]+ revert"`
- Rescue migration exists: `ls lib/db-client/migrations | grep 20260526_100000`
- BLD-034 guard test: `grep -rn "BLD-034" lib/shared-components/src/features/leagues/TradingCenter.spec.tsx`
- Workflow incident comments: `grep -n "LS-7866" .github/workflows/run-playwright-tests.yml`; `grep -n "LS-4479" .github/workflows/check-conflicts.yml`
- LS-4697 still open: check its Jira status before citing; doc at `docs/fixes/LS-4697-insert-long-tail-investigation.md`
