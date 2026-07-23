# Reference: Post-Merge & Deploy (Phase 7, environment-neutral)

What happens after a PR merges to `main` — deploy workflows, preview deployments, and local cleanup. Environment-neutral; linked from both [workflow-overview](../SKILL.md) and [cloud-agent-mode](../../cloud-agent-mode/SKILL.md).

## Deploy Workflows

| Workflow                     | Trigger                                             | Targets                                   |
| ---------------------------- | --------------------------------------------------- | ----------------------------------------- |
| `deploy-web.yml`             | Push to `main` (web/shared-components paths)        | GitHub Pages (legacy-fantasy.com)         |
| `upload-lambdas.yml`         | Push to `main` (lambda paths)                       | S3 artifact upload for Lambda deployment  |
| `lambda-terraform-apply.yml` | workflow_run: "Upload Lambdas" (on main) + dispatch | Terraform apply + Lambda function updates |
| `deploy-storybook.yml`       | Push to `main` (component paths)                    | GitHub Pages (Storybook)                  |
| `deploy-pr-preview.yml`      | PR events                                           | Preview deployments for PRs               |

**Lambda upload CI guard:** `upload-lambdas.yml` verifies CI passed before uploading. On push events it resolves the merged PR's head SHA and searches for a completed CI Orchestrator run on that SHA. The orchestrator emits two runs per PR SHA — one from the `pull_request` event (conclusion: `skipped`) and one from `pull_request_review` (the real run). The guard prefers runs with `conclusion: success`; if none exists it falls back to the first matching run and rejects non-success conclusions. This means a deploy blocked by the guard with `conclusion: skipped` indicates the real CI run is missing, not that CI failed.

**NX_BASE concurrent-deploy race:** When two squash-merges land on `main` close together, `nrwl/nx-set-shas` can set `NX_BASE` to a SHA from a concurrent/newer successful run — a commit that is not an ancestor of the current HEAD. `nx affected --base=<future-sha>` then fails with `fatal: bad object`, producing zero affected lambdas and silently skipping all deploys. The detect step in `upload-lambdas.yml` guards against this with `git merge-base --is-ancestor "$EFFECTIVE_BASE" "$HEAD_SHA"` and falls back to `HEAD~1` when the race is detected; it also exports the resolved value as `NX_BASE` so the `nx` CLI reads the corrected SHA rather than the original bad value. If all Lambda deploys appear to have stopped (check `gh run list --workflow=upload-lambdas.yml`), a concurrent-push race is the first thing to suspect.

## PR Preview Deployments

`deploy-pr-preview.yml` deploys web builds for open PRs to the `gh-pages` branch of `bkrupa/legacy-sports-deploys`. Previews live at **subdirectory paths**, not separate branches:

```
https://bkrupa.github.io/legacy-sports-deploys/pr-<N>/
```

where `<N>` is the numeric PR number (e.g. `pr-2317/`).

**Agents: do not list branches of `legacy-sports-deploys` to check for a preview.** There is no `pr-<N>` branch — previews are paths inside `gh-pages`. The correct way to reference or verify a preview:

- **Construct the URL directly** — if the preview deploy job ran and succeeded, the preview is there: `https://bkrupa.github.io/legacy-sports-deploys/pr-<N>/` (replace `<N>` with the PR number). Note: the preview only exists if `apps/web`, `lib/shared-components`, or `lib/ui-abstractions` were changed — CI can pass without the preview job running.
- **Verify deployment via the gh-pages tree** (if you must confirm a path exists; replace `<N>` with the PR number):
  ```bash
  PR=2317  # replace with actual PR number
  gh api "repos/bkrupa/legacy-sports-deploys/git/trees/gh-pages?recursive=1" \
    --jq ".tree[] | select(.path | startswith(\"pr-${PR}/\")) | .path" | head -5
  ```
- **Playwright reports** for a PR use the analogous `gh-pages` subdirectory: `playwright-report/pr-<N>/` (e.g. `https://bkrupa.github.io/legacy-sports-deploys/playwright-report/pr-2317/`). See [read-playwright-report skill](../../read-playwright-report/SKILL.md) for how to download and parse reports.

Preview deployments are kicked off by the deploy workflow after successful PR CI; changes to `apps/web`, `lib/shared-components`, or `lib/ui-abstractions` affect whether the `web-build` artifact is present, but the deploy can still proceed via its fallback build path when that artifact is absent.

## Web Deploy Pipeline

1. Extract version info from `apps/web/package.json`
2. Build with production env vars (GraphQL host, OAuth, analytics, etc.)
3. Add CNAME for `legacy-fantasy.com`
4. Deploy to GitHub Pages
5. Upload sourcemaps to Rollbar
6. Create GitHub Release (`web-v{version}-{build_number}`) and force-push the stable `web-latest` pointer tag
7. Discord notifications (deploy + release)

## Cleanup

After merge, the merge queue deletes the source branch. Locally (cloud sessions have no worktree to clean):

1. `twig worktree clean` (never `git worktree remove` directly)
2. `git branch -d LS-####/description`
3. Jira "Done" (if not already transitioned by Jira Branch Sync)

> See [worktree-workflow/SKILL.md](../../worktree-workflow/SKILL.md) for the full cleanup procedure (remove all symlinks before `twig worktree clean`).

## Related

- [ci-and-merge-pipeline.md](./ci-and-merge-pipeline.md) — the CI and merge-queue machinery that precedes deploy.
- [ticket-to-merge-spine.md](./ticket-to-merge-spine.md) — the ordering through merge.
