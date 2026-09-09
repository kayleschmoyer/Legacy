# Runner control-plane Lambda patches

The self-hosted GitHub Actions runners use the upstream
[`github-aws-runners/terraform-aws-github-runner`](https://github.com/github-aws-runners/terraform-aws-github-runner)
module. Its Lambda bundles (`webhook.zip`, `runners.zip`,
`runner-binaries-syncer.zip`) are **not** committed — they are fetched from the
release matching the pinned module version (see `terraform/runners/.gitignore`).
`scripts/download-runner-lambdas.js` downloads the two unpatched bundles;
`scripts/build-runner-control-plane-lambda.sh` builds a **patched** `runners.zip`
from source.

## scale-down-heartbeat.patch (LS-7874 / LS-7877)

> **Design decision:** see [ADR 0013 — Runner survival via a runner-level job
> heartbeat (single mechanism)](../../../docs/decisions/0013-runner-job-heartbeat.md)
> for the full rationale, the LS-7870 → LS-7874 → LS-7877 evolution, and the
> alternatives considered.

### Problem

The control-plane **scale-down** Lambda runs every minute and de-registers +
terminates any non-ephemeral runner whose GitHub API `busy` flag reads `false`
(once past `minimum_running_time_in_minutes`). It acts on a **single** reading
with no busy-recheck (`removeRunner` in `scale-runners/scale-down.ts`).

The GitHub `busy` flag is eventually consistent and intermittently returns a
**false-negative** for a runner that is actively executing a job. A long job is
exposed to one poll per minute, so the longest job (the ~1400s `live-draft-ui`
integration shard) has the highest cumulative chance of catching a stray
`busy:false` and being killed mid-run. This was confirmed in production: EC2
`StateReason = Client.UserInitiatedShutdown` (an API `TerminateInstances`, **not**
spot reclamation), with the scale-down log showing the runner `Busy: true` for
consecutive minutes then a single `Busy: false` immediately before termination.

### Why a source patch

The module exposes no busy-recheck knob, and the only busy-independent protection
(`minimum_running_time_in_minutes`, purely age-based) cannot cover a job's
`timeout-minutes` (120 for integration, 360 for the android build) without
keeping every short-job runner alive for hours — pricing out scale-to-zero and
reversing LS-3572. Ephemeral mode does not gate the busy-poll path either. The
decision logic lives in the Lambda, so the fix lives in a patch to the Lambda.

### What the patch does — job-heartbeat override

The patch removes the dependency on the flaky `busy` flag entirely: a runner
**actively executing a job** marks itself active. The runner-level job hooks
(`ACTIONS_RUNNER_HOOK_JOB_STARTED` / `ACTIONS_RUNNER_HOOK_JOB_COMPLETED`, wired
through the runner userdata in `terraform/runners/github-runners.tf`) tag the
instance with `ghr:job_heartbeat=<unix-seconds>` once a minute while a job runs
and delete the tag when the job completes. Because this lives at the runner
level, it covers **every** self-hosted job automatically (integration, e2e
shards, the android build) with no per-workflow steps.

The patched Lambda treats any runner whose heartbeat is fresher than
`SCALE_DOWN_HEARTBEAT_TTL_SECONDS` (default **180**) as active — skipping removal
— regardless of the GitHub flag. The check sits at the top of the idle branch in
`removeRunner`. The three edits:

- `scale-runners/scale-down.ts` — in `removeRunner`, when the runner reads idle,
  honor a fresh `ghr:job_heartbeat` tag and defer removal; otherwise fall through
  to upstream's normal de-register + terminate.
- `aws/runners.ts` / `aws/runners.d.ts` — surface the `ghr:job_heartbeat` tag on
  the runner object (mirrors the existing `ghr:bypass-removal` / `ghr:orphan`
  handling).
- `scale-runners/scale-down.test.ts` — adds two tests: a fresh heartbeat defers
  removal; a stale heartbeat is reaped by the normal idle path.

The TTL is **self-healing**: when the job ends the `job_completed` hook deletes
the tag (immediate eligibility for normal scale-down), and if the runner dies
uncleanly the tag simply goes stale within the TTL and ordinary scale-down
resumes — so a forgotten heartbeat can never leak an instance the way a sticky
`ghr:bypass-removal` tag would. A genuinely **idle** runner emits no heartbeat at
all (the hooks only run while a job executes), so **scale-to-zero is preserved**.

Because the module's scale-down Lambda environment block is fixed and cannot pass
a new env var from our Terraform, `SCALE_DOWN_HEARTBEAT_TTL_SECONDS` defaults in
code; set it to `0` to disable the override.

Unlike a control-plane-only change, the heartbeat is written by the **runner
instance**, so it needs `ec2:CreateTags`/`DeleteTags` on itself. That grant lives
in `terraform/runners/runner-self-tag.tf` and is constrained (via an
`aws:TagKeys` condition) to the single `ghr:job_heartbeat` key, so a compromised
runner cannot set `ghr:bypass-removal` or rewrite `ghr:environment`. The
permissions boundary already allows these actions, so no boundary change is
needed.

> **History (LS-7870, retired in LS-7877).** An earlier iteration of this patch
> added a generic _idle-strike debounce_ (`ghr:idle_strikes` tag,
> `SCALE_DOWN_IDLE_STRIKES` env) requiring N consecutive idle reads before
> removal. The strike debounce proved insufficient on its own — `live-draft-ui`'s
> multi-minute quiet phases accrued enough consecutive idle readings to still
> trip removal — so the job-heartbeat override was added alongside it (LS-7874).
> Once the heartbeat moved to a runner-level daemon covering every self-hosted
> job (LS-7877), the debounce became redundant and was removed, shrinking the
> patch to the single heartbeat-TTL check documented above.

### LS-9836 — drain-before-stop: the heartbeat check read a stale snapshot

Two E2E shards on PR #7503 were killed mid-run (`##[error]The runner has
received a shutdown signal`) while genuinely busy — one 92% through its test
list, the other mid-setup — roughly two minutes apart on two different
instances. That is graceful scale-down terminating a busy runner, the exact
failure mode LS-7874/LS-7877 exists to prevent, so this was either a
regression of that mechanism or a code path it never covered.

Reading the real upstream `scale-down.ts` (not just the patch hunks) found
the gap: `scaleDown()` takes **one** `listEC2Runners()` snapshot at the top of
the invocation, then `evaluateAndRemoveRunners()` walks every runner in the
fleet **sequentially**, each iteration awaiting several GitHub API round-trips
(`removeRunner`'s per-runner `getGitHubRunnerBusyState` calls, uncached "to
minimize race condition"). The heartbeat check reused `runnerList.jobHeartbeat`
— a field read off that same top-of-invocation snapshot — as if it were
current. For a runner near the end of a large or GitHub-API-slow invocation,
that snapshot can already be older than `SCALE_DOWN_HEARTBEAT_TTL_SECONDS`
(default 180) purely from Lambda-side latency, even though the runner kept
tagging `ghr:job_heartbeat` every 60 seconds the entire time. The override was
silently defeated by its own input being stale, not by the job actually going
idle — a gap the original design never accounted for, since it assumed the
check ran effectively at poll time rather than at the end of a
variable-length per-invocation loop.

**Fix (drain-before-stop):** `removeRunner` now calls a new
`getJobHeartbeatTag(instanceId)` (`aws/runners.ts`) that fetches the
`ghr:job_heartbeat` tag live via a single-instance `DescribeInstances`,
immediately before the termination decision — not the batch snapshot from the
top of the run. This is the last possible check before `terminateRunner` is
called, so it always sees the runner's true current state regardless of how
long the invocation took to reach it. AWS confirmation via CloudTrail
`TerminateInstances`/scale-down CloudWatch logs was not obtainable for this
investigation — the CCR session has no AWS CLI — so this fix is grounded in
the GitHub Actions job logs (exact "shutdown signal" wording, matching the
graceful-stop signature already established as production fact by LS-7874)
and in reading the real upstream source rather than in a CloudTrail verdict;
confirming the CloudTrail `death-verdict` for `i-0302a5868cfff4425` /
`i-09db4ca34e6c3b3ef` from a local/AWS-CLI-enabled session remains open
follow-up, tracked on LS-9836.

## Maintenance contract

The patch is pinned to a specific upstream version. When you bump the module
version in `terraform/runners/github-runners.tf`:

1. Run `make runner-lambdas-sync` (or the build script directly). If the patch no
   longer applies, the build **fails loudly**.
2. Re-base the patch on the new source: clone the new tag, re-apply the three
   edits described above, and regenerate the patch with `git diff >
terraform/runners/lambda-patches/scale-down-heartbeat.patch`.
3. Re-run the build and the upstream control-plane tests.

Regenerate locally with:

```bash
make runner-lambdas-sync          # downloads webhook + syncer, builds patched runners.zip
# or just the patched bundle:
bash scripts/build-runner-control-plane-lambda.sh
```
