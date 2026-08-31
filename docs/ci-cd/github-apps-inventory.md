# GitHub Apps Inventory

Living reference (not an ADR — see [`docs/decisions/0006-three-github-apps-separation-of-duties.md`](../decisions/0006-three-github-apps-separation-of-duties.md)
for the original 3-app design decision, which this doc supersedes in coverage:
it now documents all 6 apps actually installed, not just the original 3, and
notes where reality has diverged from that decision).

Six GitHub Apps are installed on this repo (GitHub → Settings → Developer
settings → GitHub Apps). This doc maps each to its client-id, its paired
secrets, what actually uses it, and what it's permitted to do.

**Permissions columns are best-effort** — the GitHub API endpoints that would
let an agent confirm a token's exact granted scopes (e.g. listing an app's
installation permissions) themselves require permissions none of these app
tokens currently have (observed 403 "Resource not accessible by integration"
probing this during LS-9571). Where a permission is inferred rather than
confirmed from the GitHub UI, it's marked (inferred).

## Legacy Sports Code Bot

- **Client ID:** `3158619` ("Agent Author" in code/secrets)
- **Secrets:** `AGENT_AUTHOR_APP_PRIVATE_KEY` (no separate `_APP_ID` secret — the id is hardcoded as `3158619` at each call site)
- **Used by:** ~15 workflows for authoring-adjacent writes — `check-schema.yml`, `check-conflicts.yml`, `check-conflicts-sweep.yml`, `check-migrations-applied.yml`, `ci-orchestrator.yml`, `deploy-storybook.yml`, `dependabot-lockfile-fix.yml`, `e2e-hold-resume.yml`, `integration-advisory.yml`, `jira-link-check.yml`, `rebuild-runner-ami.yml`, `review.yml`, `terraform-plan.yml`
- **Permissions:** `contents: write`, `pull_requests: write` (per ADR-0006's "Author Agent App" role). **Confirmed NOT to have `Commit statuses: write`** — 403'd with "Resource not accessible by integration" when used for the CI Gate status-post step during LS-9571 (PR #7415, run `33341720008`).
- **ADR-0006 role:** Author Agent App — writes commits, opens PRs, applies author-owned labels (`bot:ready-for-review`). Cannot approve reviews, cannot merge.

## Legacy Sports Review Bot

- **Client ID:** `3142924` (`vars.REVIEWER_BOT_APP_ID`, falls back to this literal if the repo var is unset)
- **Secrets:** `BOT_APP_PRIVATE_KEY`
- **Used by:** `review.yml`, `review-label-guard.yml`, `review-bot-override.yml`, `security-review-override.yml`, `pr-workflow-guide.yml`, `code-writer-bot.yml`, `test-v14-reviewer-fail.yml`, `run-playwright-tests.yml`. Also referenced (raw, not via `create-github-app-token`) by `lambda-terraform-apply.yml`'s "Sync Review Bot App Key to Secrets Manager" step, which mirrors this secret into AWS Secrets Manager — **that step's own inline comments and env var name it `agent_author_app_private_key`**, a leftover naming artifact from an earlier design; it is unambiguously the Review Bot's key (confirmed by the step's own comment: "same key used by review.yml for review-bot token generation"), not Legacy Sports Code Bot's.
- **Permissions:** `pull_requests: write` (reviews) (per ADR-0006). Cannot push commits or merge.
- **ADR-0006 role:** Reviewer Bot App — reads PR diffs, posts review comments, applies review-owned labels (`merge-when-ready`, `bot:changes-requested`).

## Personal Merge Queue

- **Secrets:** `MERGE_QUEUE_APP_ID`, `MERGE_QUEUE_APP_PRIVATE_KEY`
- **Used by:** `merge-queue.yml`, `ci-orchestrator.yml`
- **Permissions:** ADR-0006 documents `contents: write` + `pull_requests: write` (merge only). **Confirmed NOT to have `Commit statuses: write`** — despite `.github/scripts/merge-queue-processor.js` calling `github.rest.repos.createCommitStatus` with this app's token in its `bot-review` self-heal path, LS-9571 (PR #7415) proved that call 403s with "Resource not accessible by integration" when tested against the CI Gate status. Those `createCommitStatus` calls were wrapped in a try/catch that only logged a warning, so this had been silently failing in production; fixed in LS-9773 by switching those two calls to the Legacy Sports CI app instead (see its entry above).
- **ADR-0006 role:** Merge Queue Bot App — triggers the merge queue / squash-merges when `merge-when-ready` is set and checks pass. Cannot review or push new commits.

## Legacy Sports CI

- **Client ID:** `3148299`
- **Secrets:** `RUNNER_GITHUB_APP_ID`, `RUNNER_GITHUB_APP_KEY_BASE64` (base64-encoded PEM — note the different secret naming convention vs. every other app here, which stores a raw PEM; `actions/create-github-app-token` accepts either form), `RUNNER_GITHUB_APP_WEBHOOK_SECRET`
- **Used by:**
  - `terraform/runners/github-runners.tf` (via `runner-terraform-apply.yml` and `rollback.yml`, mapping the secrets to `TF_VAR_github_app_key_base64` / `TF_VAR_github_app_id` / `TF_VAR_github_app_webhook_secret`) to configure the `github-aws-runners` module's `github_app` block: `id` for self-hosted runner registration, `webhook_secret` for the `workflow_job` webhook that triggers the scale-up Lambda.
  - **`ci-pipeline.yml`** (`summarize` job, "Generate CI App Token" step) — posts the `CI Gate` commit status (LS-9571, PR #7415).
  - **`merge-queue.yml`** (via `merge-queue-processor.js`, `ciAppToken`) — posts the `bot-review` self-heal escalation/pending status when the Reviewer Bot crashes or stalls (LS-9209 self-heal path; LS-9773, PR #7418).
  - **`check-conflicts.yml`** (`check-conflicts` job, "Generate CI App Token" step) — posts the `No Merge Conflicts` commit status (LS-9775).
  - **`security-scanning.yml`** (`security-gate` job, "Generate CI App Token" step) — posts the `security` commit status (LS-9775).
- **Permissions:** explicitly granted `Commit statuses: write` (2026-08-30, in response to LS-9571) after both Legacy Sports Code Bot and Personal Merge Queue were confirmed NOT to hold it — see their entries above. Base permission set otherwise unconfirmed from the GitHub UI (originally just enough for runner registration + webhook — likely something in the `Self-hosted runners` / `Administration` family).

## Legacy Sports CI Android

- **Secrets:** `RUNNER_ANDROID_GITHUB_APP_ID`, `RUNNER_ANDROID_GITHUB_APP_KEY_BASE64`, `RUNNER_ANDROID_GITHUB_APP_WEBHOOK_SECRET`
- **Used by:** `terraform/runners/github-runners.tf` only (via `runner-terraform-apply.yml`) — the Android-runner-pool equivalent of Legacy Sports CI: `id = var.github_app_android_id`, `webhook_secret = var.github_app_android_webhook_secret`, its own separate webhook for the Android self-hosted runner pool.
- **Permissions:** not confirmed; same inference as Legacy Sports CI (runner registration + webhook, not status/PR writes).

## Legacy Sports PR Preview

- **Secrets:** `PREVIEW_APP_ID`, `PREVIEW_APP_PRIVATE_KEY`
- **Used by:** `ci-pipeline.yml` (Deploy Playwright Report step), `deploy-storybook.yml`, `deploy-pr-preview.yml`, `run-playwright-tests.yml`
- **Permissions:** not confirmed; scoped (per `create-github-app-token`'s `repositories:` input) to the `legacy-sports-deploys` repo specifically, where it pushes Playwright HTML reports, Storybook builds, and PR preview deploys — temporary/preview build artifacts hosted via GitHub Pages on that separate repo.

## Open items

- Confirm exact granted permissions for Legacy Sports CI Android and Legacy Sports PR Preview from the GitHub UI (Settings → GitHub Apps → _app_ → Permissions & events) — this doc's permission claims for those two are inferred from usage, not confirmed. (Legacy Sports CI's `Commit statuses: write` grant is confirmed — see its entry above.)
- Legacy Sports Code Bot and Personal Merge Queue are both confirmed to lack `Commit statuses: write`; if either is found to need it for something else in the future, don't assume — test it the way LS-9571/LS-9773 did.
- Consider whether the sticky-PR-comment and label calls in `ci-pipeline.yml` (currently on Legacy Sports Code Bot) should also move to Legacy Sports CI now that it's the established "CI-pipeline-originated writes" identity — not done here to keep LS-9571/LS-9773 minimal; those two calls are confirmed working on their current app.
