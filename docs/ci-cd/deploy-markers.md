# Deploy markers — what is actually deployed

The umbrella `Deploy` workflow (`.github/workflows/deploy.yml`) remembers, per target, the commit it last deployed successfully. It decides what to ship by comparing main with those markers, not by looking at the push that triggered it (LS-10369).

## Why

Deploy used to diff only the pushed range. A Deploy that was cancelled or failed was never retried, and its changes shipped only if a later push happened to touch the same paths. Cancellation is routine: `deploy-main` keeps one running and one pending run, so a third merge in a burst cancels the pending one. On 2026-10-01 this left 13 lambda-affecting commits on main and not deployed, behind a green Deploy.

## How it works

| Piece       | Where                                                                                   | Behaviour                                                                                                                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Markers     | SSM `/legacy-sports/dev/deploy/last-deployed/{lambdas,terraform,web,android,storybook}` | The full SHA the target was last deployed from.                                                                                                                                                                                                              |
| Detect      | `deploy.yml` → `Detect Deploy Targets`                                                  | A target is deployed when its paths changed over `<marker>..HEAD`. A marker that is missing, unreadable, not a SHA, or not an ancestor of HEAD deploys the target.                                                                                           |
| Lambda base | `upload-lambdas.yml` → `Detect Affected Lambdas`                                        | `nx affected` is based on the `lambdas` marker. `NX_BASE` with its `HEAD~1` guards is the fallback only.                                                                                                                                                     |
| Record      | `deploy.yml` → `Rollup Status` → `Record last-deployed markers`                         | Advances the marker of each targeted target whose child succeeded. `lambdas` needs Upload Lambdas **and** Apply Lambda Infrastructure to succeed. A marker never moves backwards.                                                                            |
| Alert       | `lambda-drift-check.yml` → `Check Deploy Marker Drift`                                  | After every Deploy completes: posts to Discord when a target has undeployed commits older than `vars.DEPLOY_MARKER_STALE_MINUTES` (default 60) and no Deploy is queued or running. Posts only when the set of behind targets changes, plus once on recovery. |

All of the decisions, and the per-target path sets, live in `.github/scripts/deploy-markers.mjs` (tests: `.github/scripts/__tests__/deploy-markers.test.mjs`).

Because a marker moves only on success, **any later Deploy of any kind picks up whatever an earlier one dropped** — a docs-only push after a cancelled lambda Deploy still uploads those lambdas.

## Merge-queue batches (LS-10964)

The batched merge queue lands a tested batch as N squash merges seconds apart, and only the last one equals the tested tree. Deploy's first job, `Supersede Gate` (push only, ubuntu-latest), waits `DEPLOY_SETTLE_SECONDS` (90) and then skips the run when main has moved past the run's commit **and** a newer push-triggered Deploy run is pending or running. The skipped run writes no markers and posts nothing. The newer run diffs against the markers, so it ships every skipped commit. If the gate cannot read main or finds no newer run, it deploys as before. `workflow_dispatch` runs skip the gate.

A superseded run still concludes `success`, so it still fires every `workflow_run: [Deploy]` consumer. Those consumers detect it with `.github/scripts/deploy-superseded.mjs`: the run's `Supersede Gate` job succeeded and `Detect Deploy Targets` was skipped. When they find one, they stand down:

- The full-suite lanes (`run-playwright-tests`, `cross-browser-e2e`, `run-maestro-sweep`, `e2e-native-android`) skip through `full-suite-gate.mjs`. A run skipped this way does not count toward their debounce.
- `lambda-drift-check` and `terraform-lock-watchdog` skip their work through a `Superseded Deploy Check` job.

The newer Deploy triggers all of them again. If the check cannot tell whether a run was superseded, the consumer runs as before.

`force-*` dispatch inputs are unchanged: a forced target deploys from HEAD regardless of its marker and advances it on success.

## Reading the markers

Every Deploy run summary has two tables:

- **Deploy Targets** (Detect Deploy Targets job) — per target: whether it deploys, why, the marker it was compared against, and the number of commits since that marker.
- **Last-Deployed Markers** (Rollup Status job) — per target: the marker after this run and how many commits it advanced, or why it did not move.

From a shell:

```bash
aws ssm get-parameters-by-path --path /legacy-sports/dev/deploy/last-deployed --region us-east-1 --query "Parameters[].[Name,Value,LastModifiedDate]" --output table
```

What a target still owes (commits on main touching its paths since its marker; path sets are `DEPLOY_TARGET_PATHS` in the script):

```bash
git log --oneline <marker-sha>..origin/main -- lambdas lib tools/mcp tools/vite-configs
```

## Resetting a marker

The safe direction is always "deploy more".

- **Redeploy a target from scratch** — delete its marker. The next Deploy treats the target as changed; for `lambdas` the affected base falls back to `NX_BASE`/`HEAD~1`, so pair it with `force-lambdas` if every lambda must be rebuilt.

  ```bash
  aws ssm delete-parameter --name /legacy-sports/dev/deploy/last-deployed/web --region us-east-1
  ```

- **Rewind a marker** — set it to an older commit on main to re-cover everything since. For `lambdas` this also widens the `nx affected` range.

  ```bash
  aws ssm put-parameter --name /legacy-sports/dev/deploy/last-deployed/lambdas --value <older-full-sha> --type String --overwrite --region us-east-1
  ```

- **Just ship it now** — run the `Deploy` workflow on main with no inputs. It deploys everything owed since each marker.

Do not move a marker **forward** by hand: that tells Deploy the commits in between are deployed, and nothing will ship them.

To make the drift alert post again for a set of targets it has already reported, delete `/legacy-sports/dev/deploy/marker-drift/alerted-targets`.

## Notes

- `/legacy-sports/dev/deploy/lambdas-last-uploaded-sha` is the LS-10366 upload-only marker. It is read once as a bootstrap when the `lambdas` marker does not exist yet and is no longer written; it can be deleted once `last-deployed/lambdas` exists.
- The first Deploy after LS-10369 merges finds no markers and deploys every target once.
- The Deploy role (`legacy-sports-dev-github-actions`) already has `ssm:GetParameter`/`PutParameter` on `/legacy-sports/dev/*`. If a read is ever denied, the target is deployed; if a write is denied, the Deploy still succeeds and the next one ships that target again.
- A standalone `upload-lambdas.yml` dispatch does not advance the `lambdas` marker — only the umbrella Deploy does, after the apply.
