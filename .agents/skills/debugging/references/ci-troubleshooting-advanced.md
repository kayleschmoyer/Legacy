# Advanced CI Troubleshooting (Items 8–15)

These are less common failure types. Check the primary troubleshooting items (1–7 in the main skill) first.

### 8. Concurrency cancellations (not a real failure)

If you push a new commit while CI is running, the orchestrator's `cancel-in-progress: true` kills the previous run. This appears as a failure but is expected behavior.

**Pattern in logs:**

```
The run was canceled because a more recent commit was pushed to the branch.
```

Or:

```
##[error]The operation was canceled.
```

**How to identify:**

```powershell
gh run view RUN_ID | Select-String "cancel|The operation was canceled"
```

**No fix needed** — the newer run supersedes it.

### 9. Agent skills lint failure

The `quality-gates` job runs `node scripts/lint-skills.js` before the main quality checks. This validates all skill files under `.agents/skills/` using the `agentskills` CLI.

**Pattern in logs:**

```
✖ skill-name
N skill(s) failed validation, M passed.
```

**How to find:**

```powershell
gh run view RUN_ID --log-failed | Select-String "skill.*failed validation|✖"
```

**Fix locally:**

```powershell
# Validate all skills
node scripts/lint-skills.js

# Validate a single skill
uvx --from skills-ref agentskills validate .agents/skills/SKILL_NAME
```

### 10. E2E test failures

E2E failures have unique root causes beyond unit test failures — the dev server may crash or fail to start.

**Pattern in logs:**

```
❌ Development server failed to start within 60 seconds
❌ Development server process died unexpectedly
```

**How to find:**

```powershell
# Server-level failures
gh run view RUN_ID --log-failed | Select-String "server.*fail|server.*died|server.*crash" -Context 5

# Playwright test failures
gh run view RUN_ID --log-failed | Select-String "FAIL.*e2e|playwright.*error" -Context 5
```

**Fix locally:**

```powershell
# Start the dev server first
pnpm exec nx serve web

# Run E2E tests in another terminal
pnpm exec nx e2e web-e2e
```

### 11. Setup / workspace detection failures

The `setup` composite action validates the Nx workspace after installing dependencies. Failures here block every downstream job.

**Pattern in logs:**

```
❌ Nx CLI not available through any method
❌ node_modules directory not found after installation
❌ Nx workspace configuration invalid after recovery attempt
⚠️ nx binary exists but not functional or timed out
```

**How to find:**

```powershell
gh run view RUN_ID --log-failed | Select-String "Nx CLI not available|node_modules.*not found|workspace.*invalid|nx binary.*not functional" -Context 5
```

**Resolution:** Usually a transient runner issue or cache corruption. Rerun the job:

```powershell
gh run rerun RUN_ID --failed
```

If it persists, clear the Nx cache locally and push an empty commit to bust the CI cache:

```powershell
pnpm exec nx reset
git commit --allow-empty -m "chore: bust CI cache"
git push origin HEAD
```

### 13. Terraform state lock conflicts

Lambda deployments use Terraform with DynamoDB state locking. Stale locks can block deployments indefinitely.

**Pattern in logs:**

```
Error acquiring the state lock
Lock Info:
  ID:
  Path:    terraform-state-locks
  Operation: OperationTypePlan
```

**How to find:**

```powershell
# Find the deployment run
gh run list --workflow lambda-terraform-apply.yml --limit 5

# Check for lock errors
gh run view RUN_ID --log-failed | Select-String "state lock|Lock Info" -Context 10
```

**Resolution:** The CI pipeline auto-cleans locks older than 30 minutes. For manual intervention:

```powershell
# Find the lock ID from the logs, then force-unlock
# (requires AWS credentials and Terraform CLI)
cd terraform/lambda
terraform force-unlock LOCK_ID
```

### 14. Merge queue failures

The merge queue re-evaluates PRs after CI completes. Special failure modes exist here.

**Pattern in logs:**

```
# Permission error
HttpError: Resource not accessible by integration

# Checks not yet registered
No check runs found for the latest commit

# Already at head
Branch is already up to date
```

**How to find:**

```powershell
# Find merge queue runs
gh run list --workflow merge-queue.yml --limit 5

# Check for specific errors
gh run view RUN_ID --log-failed | Select-String "HttpError|not accessible|No check runs" -Context 5
```

**Resolution:**

- **Permission errors:** Ensure the GitHub App (`MERGE_QUEUE_APP_ID`) has sufficient permissions
- **Checks not registered:** The merge queue waits — no action needed, it re-evaluates on next trigger
- **Stuck PRs:** Remove and re-add the `merge-when-ready` label to re-trigger

```powershell
gh pr edit PR_NUMBER --remove-label merge-when-ready
gh pr edit PR_NUMBER --add-label merge-when-ready
```

### 15. Build artifact download failures in E2E

The E2E job downloads web build artifacts from the `build-validation` stage. If the artifact is missing, the download silently fails (`continue-on-error: true`), and E2E may run against stale content.

**How to identify:**

```powershell
gh run view RUN_ID --log | Select-String "download-artifact|Unable to find.*artifact|Artifact not found" -Context 3
```

**Resolution:** If E2E fails with seemingly correct test code, check whether the artifact was actually downloaded. If not, the web build may have failed silently in `build-validation`. Investigate that job first.
