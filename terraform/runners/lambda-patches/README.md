# Runner control-plane Lambda patches

The self-hosted GitHub Actions runners use the upstream
[`github-aws-runners/terraform-aws-github-runner`](https://github.com/github-aws-runners/terraform-aws-github-runner)
module. Its Lambda bundles (`webhook.zip`, `runners.zip`,
`runner-binaries-syncer.zip`) are **not** committed — they are fetched from the
release matching the pinned module version (see `terraform/runners/.gitignore`).
`scripts/download-runner-lambdas.js` downloads the two unpatched bundles;
`scripts/build-runner-control-plane-lambda.sh` builds a **patched** `runners.zip`
from source.

## scale-down-idle-debounce.patch (LS-7870)

### Problem

The control-plane **scale-down** Lambda runs every minute and de-registers +
terminates any non-ephemeral runner whose GitHub API `busy` flag reads `false`
(once past `minimum_running_time_in_minutes`). It acts on a **single** reading
with no debounce (`removeRunner` in `scale-runners/scale-down.ts`).

The GitHub `busy` flag is eventually consistent and intermittently returns a
**false-negative** for a runner that is actively executing a job. A long job is
exposed to one poll per minute, so the longest job (the ~1400s `live-draft-ui`
integration shard) has the highest cumulative chance of catching a stray
`busy:false` and being killed mid-run. This was confirmed in production: EC2
`StateReason = Client.UserInitiatedShutdown` (an API `TerminateInstances`, **not**
spot reclamation), with the scale-down log showing the runner `Busy: true` for
consecutive minutes then a single `Busy: false` immediately before termination.

### Why a source patch

The module exposes no debounce / busy-recheck knob, and the only busy-independent
protection (`minimum_running_time_in_minutes`, purely age-based) cannot cover the
integration job's 120-minute `timeout-minutes` without keeping every short-job
runner alive for ~2 hours — pricing out scale-to-zero and reversing LS-3572.
Ephemeral mode does not gate the busy-poll path either. The decision logic lives
in the Lambda, so the fix lives in a patch to the Lambda.

### What the patch does

Requires `SCALE_DOWN_IDLE_STRIKES` (default **3**) consecutive idle observations
before a runner is removed, persisting the count in the `ghr:idle_strikes` EC2
tag:

- `scale-runners/scale-down.ts` — in `removeRunner`, when the runner reads idle,
  first honor a fresh `ghr:job_heartbeat` tag (LS-7874, see below); otherwise
  increment the strike tag and defer removal until the count reaches the
  threshold; when the runner reads busy, clear the tag so the streak restarts.
- `aws/runners.ts` / `aws/runners.d.ts` — surface the `ghr:idle_strikes` and
  `ghr:job_heartbeat` tags on the runner object (mirrors the existing
  `ghr:bypass-removal` / `ghr:orphan` handling).
- `scale-runners/scale-down.test.ts` — pins `SCALE_DOWN_IDLE_STRIKES=1` for the
  existing single-shot assertions and adds the debounce + heartbeat tests.

The threshold defaults to 3 in code because the module's scale-down Lambda
environment block is fixed and cannot pass a new env var from our Terraform. With
the every-minute schedule, a genuinely idle runner is still reclaimed within ~3
minutes; a transient one-poll `busy:false` blip never triggers removal. No IAM
change is required — `tag`/`untag` (`ec2:CreateTags`/`DeleteTags`) are already
granted to the scale-down role for orphan marking.

### Job-heartbeat override (LS-7874)

The strike debounce alone proved **insufficient** for the heaviest integration
shard. `live-draft-ui` (~1400 s) has multi-minute quiet polling phases
(`[live-draft] +236.1s miss #1 …`) during which the GitHub `busy` flag stays
false long enough to accrue `SCALE_DOWN_IDLE_STRIKES` consecutive idle readings,
so the runner was still terminated mid-run (`Client.UserInitiatedShutdown`) even
on `main` after LS-7870.

The robust fix removes the dependency on the flaky `busy` flag entirely: a
running integration job marks its own runner active. While the shard runs it
tags its instance with `ghr:job_heartbeat=<unix-seconds>` once a minute (see the
"Start runner heartbeat" step in `.github/workflows/run-playwright-tests.yml`),
and the patched Lambda treats any runner whose heartbeat is fresher than
`SCALE_DOWN_HEARTBEAT_TTL_SECONDS` (default **180**) as busy — skipping removal
and clearing any accrued idle strikes — regardless of the GitHub flag. The check
sits at the top of the idle branch in `removeRunner`, ahead of the strike logic.

The TTL is **self-healing**: when the job ends the always() "Stop runner
heartbeat" step deletes the tag (immediate eligibility for normal scale-down),
and if the runner dies uncleanly the tag simply goes stale within the TTL and
ordinary scale-down resumes — so a forgotten heartbeat can never leak an
instance the way a sticky `ghr:bypass-removal` tag would.

Unlike the strike tag, the heartbeat is written by the **runner instance**, so it
needs `ec2:CreateTags`/`DeleteTags` on itself. That grant lives in
`terraform/runners/runner-self-tag.tf` and is constrained (via an `aws:TagKeys`
condition) to the single `ghr:job_heartbeat` key, so a compromised runner cannot
set `ghr:bypass-removal` or rewrite `ghr:environment`. The permissions boundary
already allows these actions, so no boundary change is needed.

Because the module's Lambda environment block is fixed, both
`SCALE_DOWN_IDLE_STRIKES` and `SCALE_DOWN_HEARTBEAT_TTL_SECONDS` default in code;
set `SCALE_DOWN_HEARTBEAT_TTL_SECONDS=0` to disable the override.

## Maintenance contract

The patch is pinned to a specific upstream version. When you bump the module
version in `terraform/runners/github-runners.tf`:

1. Run `make runner-lambdas-sync` (or the build script directly). If the patch no
   longer applies, the build **fails loudly**.
2. Re-base the patch on the new source: clone the new tag, re-apply the three
   edits described above, and regenerate the patch with `git diff >
terraform/runners/lambda-patches/scale-down-idle-debounce.patch`.
3. Re-run the build and the upstream control-plane tests.

Regenerate locally with:

```bash
make runner-lambdas-sync          # downloads webhook + syncer, builds patched runners.zip
# or just the patched bundle:
bash scripts/build-runner-control-plane-lambda.sh
```
