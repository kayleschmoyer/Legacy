# Advanced CI Troubleshooting

Less common CI failure types. Check the six primary failure categories (4a–4f in [ci-failure.md](ci-failure.md)) first. Sections here are lettered A1–A8 so they can't collide with ci-failure.md's numbering.

For **what blocks merge** (required status contexts, who writes them, the config-vs-live ruleset staging model, stuck-'Expected' diagnosis) the home is [pr-lifecycle/references/ci-checks-reference.md](../../pr-lifecycle/references/ci-checks-reference.md) — load it before touching anything merge-gate-related.

### A1. Concurrency cancellations (not a real failure)

Superseded runs are cancelled when newer commits or events displace them; GitHub renders the cancelled run as a failure.

**Pattern in logs:**

```
The run was canceled because a more recent commit was pushed to the branch.
##[error]The operation was canceled.
```

**How to identify:**

```
ci_search_logs(runId: RUN_ID, pattern: "cancel|The operation was canceled")
```

**No fix needed** — the newer run supersedes it. If the _newest_ head SHA is the one stuck without checks, that's a merge-gate problem, not a cancellation: see [ci-checks-reference.md](../../pr-lifecycle/references/ci-checks-reference.md) (the trigger/concurrency design and its history live there).

### A2. Agent skills lint failure

The `custom-checks` job in `ci-pipeline.yml` runs `node scripts/lint-skills.js`, which validates every directory under `.agents/skills/` with the `agentskills` CLI.

**Pattern in logs:**

```
✖ skill-name
N skill(s) failed validation, M passed.
```

**How to find:**

```
ci_search_logs(runId: RUN_ID, pattern: "skill.*failed validation|✖")
```

**Fix locally:**

```bash
# Validate all skills
node scripts/lint-skills.js

# Validate a single skill
uvx --from skills-ref agentskills validate .agents/skills/SKILL_NAME
```

### A3. E2E test failures

E2E failures have root causes beyond test bugs — the dev server may crash or fail to start.

**Pattern in logs:**

```
❌ Development server failed to start within 60 seconds
❌ Development server process died unexpectedly
```

**How to find:**

```
ci_search_logs(runId: RUN_ID, pattern: "server.*fail|server.*died|server.*crash", context: 5)
ci_search_logs(runId: RUN_ID, pattern: "FAIL.*e2e|playwright.*error", context: 5)
```

**Fix locally** (see [testing](../../testing/SKILL.md) for the full E2E workflow, including `nx_run_e2e_specs` and flag seeding — unseeded GrowthBook flags are the historically dominant CI E2E failure class):

```bash
pnpm exec nx serve web        # dev server on :4200
pnpm exec nx e2e web-e2e      # in a second terminal
```

### A4. Setup / workspace detection failures

The `setup` composite action validates the Nx workspace after installing dependencies. Failures here block every downstream job.

**Pattern in logs:**

```
❌ Nx CLI not available through any method
❌ node_modules directory not found after installation
❌ Nx workspace configuration invalid after recovery attempt
```

**How to find:**

```
ci_search_logs(runId: RUN_ID, pattern: "Nx CLI not available|node_modules.*not found|workspace.*invalid|nx binary.*not functional", context: 5)
```

**Resolution:** usually a transient runner issue or cache corruption — `ci_rerun(runId: RUN_ID)`. If it persists, clear the local Nx cache with `make clean-cache` (never raw `pnpm exec nx reset` — it destroys the pooled `node_modules` symlink, LS-5242) and push an empty commit to bust the CI cache:

```bash
make clean-cache
```

```
worktree_commit({ message: "chore: bust CI cache", allowEmpty: true }) + worktree_push()
```

### A5. Terraform state lock conflicts

Lambda deployments run Terraform from `terraform/main/` with S3-based state locking (`terraform.tfstate.tflock` object). Stale locks from failed/timed-out runs block deployments.

**Pattern in logs:**

```
Error acquiring the state lock
Lock Info:
  ID: ...
```

**How to find:**

```
ci_list_runs(workflow: "lambda-terraform-apply.yml", limit: 5)
ci_search_logs(runId: RUN_ID, pattern: "state lock|Lock Info", context: 10)
```

**Resolution:** `lambda-terraform-apply.yml` clears stale locks itself in its "Clear Stale Locks" step, so a rerun usually suffices. For manual intervention (requires AWS credentials — if they are expired, stop and prompt the user to re-authenticate; auth-generation commands are user-only, Tier 1):

```bash
node scripts/terraform-unlock.js            # inspect
node scripts/terraform-unlock.js --latest   # release
# Or, with a LOCK_ID from the logs (no cd — AGENTS.md):
terraform -chdir=terraform/main force-unlock LOCK_ID
```

Incident history and the lock-watchdog design: [terraform skill](../../terraform/SKILL.md).

### A6. Merge queue failures

The merge queue re-evaluates PRs after CI completes (`merge-queue.yml`).

**Pattern in logs:**

```
HttpError: Resource not accessible by integration   # permission error
No check runs found for the latest commit           # checks not yet registered
Branch is already up to date                        # already at head
```

**How to find:**

```
ci_list_runs(workflow: "merge-queue.yml", limit: 5)
ci_search_logs(runId: RUN_ID, pattern: "HttpError|not accessible|No check runs", context: 5)
```

**Resolution:**

- **Permission errors:** the GitHub App credentials (`MERGE_QUEUE_APP_ID`) need attention — escalate to the owner.
- **Checks not registered:** the queue waits and re-evaluates on the next trigger — no action needed.
- **Stuck PRs:** run `github_pr_why_blocked(prNumber: PR_NUMBER)` and follow [ci-checks-reference.md](../../pr-lifecycle/references/ci-checks-reference.md). Label mechanics are owned by [pr-lifecycle](../../pr-lifecycle/SKILL.md) — `merge-when-ready` is bot-applied, so re-labeling by hand is not the unstick tool.

### A7. Build artifact download failures in E2E

The E2E job downloads web build artifacts from the `build` job. If the artifact is missing, the download silently fails (`continue-on-error: true`) and E2E may run against stale content.

**How to identify:**

```
ci_search_logs(runId: RUN_ID, pattern: "download-artifact|Unable to find.*artifact|Artifact not found", context: 3)
```

**Resolution:** if E2E fails with seemingly correct test code, check whether the artifact was actually downloaded. If not, the web build may have failed silently — investigate the `build` job first.

### A8. Shell fallbacks

Every `ci_*` command above has a `gh` equivalent (`gh run list --workflow <file> --limit 5`, `gh run view RUN_ID --log-failed`, `gh run rerun RUN_ID --failed`) — use them only when the CI MCP server is unavailable, per [mcp-first](../../mcp-first/SKILL.md).

## Provenance and maintenance

Rewritten 2026-07-02 by the skills audit (debugging-playbook refresh): renumbered 8–15 → A1–A8 (old numbering skipped 12 and cross-referenced nonexistent "items 1–7"), fixed `terraform/lambda` → `terraform/main` + no-cd rule, DynamoDB → S3 state locking, `quality-gates`/`build-validation` → current `custom-checks`/`build` job ids, replaced banned `pnpm exec nx reset` and manual `merge-when-ready` re-labeling. Re-verify volatile facts:

- Job ids: `grep -n "^  [a-z-]*:" .github/workflows/ci-pipeline.yml`
- lint-skills wiring: `grep -n "lint-skills" .github/workflows/ci-pipeline.yml`
- Stale-lock step: `grep -n "Clear Stale Locks" .github/workflows/lambda-terraform-apply.yml`
- Terraform dirs: `ls terraform/`
