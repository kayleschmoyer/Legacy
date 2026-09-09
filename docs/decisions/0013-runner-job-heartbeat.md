# 0013. Runner survival via a runner-level job heartbeat (single mechanism)

Date: 2026-06-10

## Status

Accepted

## Context

The self-hosted GitHub Actions runner fleet uses the upstream
[`github-aws-runners/terraform-aws-github-runner`](https://github.com/github-aws-runners/terraform-aws-github-runner)
module (`terraform/runners/`). Its **scale-down** control-plane Lambda runs every
minute and de-registers + terminates any non-ephemeral runner whose GitHub API
`busy` flag reads `false` (once past `minimum_running_time_in_minutes`), acting on
a **single** per-minute poll.

The GitHub `busy` flag is eventually consistent and intermittently returns a
**false-negative** for a runner that is actively executing a job. A long job is
exposed to one poll per minute, so the longest jobs accumulate the highest
cumulative chance of catching a stray `busy:false` and being terminated mid-run.
This was confirmed in production: EC2 `StateReason = Client.UserInitiatedShutdown`
(an API `TerminateInstances`, **not** spot reclamation), with the scale-down log
showing the runner `Busy: true` for consecutive minutes then a single
`Busy: false` immediately before termination.

Scope is small and known: only **self-hosted** EC2 jobs (`CI_RUNNER_LABEL`) are
governed by this Lambda — every `ubuntu-latest` job is GitHub-hosted and
unaffected. The at-risk long jobs are **integration** (the ~1400s `live-draft-ui`
shard is the worst case), the **e2e Playwright shards**, and the **android
build**. The module exposes no busy-recheck knob, and the only busy-independent
guard (`minimum_running_time_in_minutes`, purely age-based) cannot cover a job's
`timeout-minutes` (120 for integration, 360 default for the android build)
without keeping every short-job runner alive for hours — which prices out
scale-to-zero and reverses LS-3572.

### Evolution that led here

1. **LS-7870 — idle-strike debounce.** Patched the Lambda to require
   `SCALE_DOWN_IDLE_STRIKES` (default 3) consecutive idle polls before removal,
   persisting the count in a `ghr:idle_strikes` EC2 tag. **Insufficient**: the
   `live-draft-ui` shard's multi-minute quiet phases accrued enough consecutive
   idle readings to still trip removal.
2. **LS-7874 — per-workflow job heartbeat.** Added a second, targeted mechanism:
   the integration job tagged its own instance `ghr:job_heartbeat=<unix-seconds>`
   once a minute via explicit workflow steps, and the Lambda treated any runner
   whose heartbeat was fresher than `SCALE_DOWN_HEARTBEAT_TTL_SECONDS` (default 180) as active. **Proven** (run 27253153489: 0 runner-shutdowns) — but it was
   opt-in per workflow (integration only) and left the Lambda carrying _two_
   competing survival mechanisms.
3. **LS-7877 (this ADR).** Move the heartbeat to the runner level so it covers
   every self-hosted job automatically, then retire the now-redundant debounce.

### Alternatives considered

1. **Raise `minimum_running_time_in_minutes`** to cover the longest timeout.
   Rejected: a purely age-based guard would keep every short-job runner alive for
   ~2 hours, pricing out scale-to-zero and reversing LS-3572.
2. **Just raise the idle-strike threshold.** Rejected: delays reclaiming
   genuinely-idle runners (higher cost), and still failed the `live-draft-ui`
   shard whose quiet phase exceeds any practical strike count.
3. **Ephemeral one-job-per-runner mode.** Rejected: avoids the mid-job race but
   loses the warm-pool cold-start advantage, and the module's ephemeral path does
   not fully gate the busy-poll termination either.
4. **Keep both mechanisms (debounce + heartbeat).** Rejected: two overlapping
   survival paths in a hand-maintained vendored-Lambda patch is needless
   complexity and maintenance burden once the heartbeat covers every job.

## Decision

We will make a **single runner-level job-hook heartbeat the sole runner-survival
mechanism**, and retire the idle-strike debounce.

Concretely:

1. **Runner-level heartbeat daemon** (`terraform/runners/github-runners.tf`). The
   GitHub Actions runner job hooks drive it:
   - `ACTIONS_RUNNER_HOOK_JOB_STARTED` starts a background loop that tags the
     instance `ghr:job_heartbeat=<unix-seconds>` once a minute (IMDSv2 for the
     instance-id/region), recording the loop PID + instance/region to small files
     so the completion hook can stop it.
   - `ACTIONS_RUNNER_HOOK_JOB_COMPLETED` kills the loop and deletes the tag.

   Because it lives in the runner hooks, it covers **every** self-hosted job
   (integration, e2e shards, android build, and any future self-hosted job)
   automatically — no per-workflow steps. Every IMDS/AWS/bookkeeping call is
   best-effort, so it is a no-op on a GitHub-hosted fallback runner and can never
   fail a job; a bounded backstop loop (just past the longest job timeout)
   prevents a missed stop from leaking an instance.

2. **Correctness invariant — heartbeat ONLY during an active job.** The hooks run
   only while a job executes. A genuinely **idle** runner runs no loop, emits no
   heartbeat, and is therefore reclaimed by normal scale-down — **scale-to-zero
   is preserved**. The heartbeat must never run for the instance lifetime.

3. **Patched Lambda reduced to one check** (`terraform/runners/lambda-patches/scale-down-heartbeat.patch`,
   against upstream v7.5.0). The patch surfaces the `ghr:job_heartbeat` tag and,
   in `removeRunner`, defers removal while that tag is fresher than
   `SCALE_DOWN_HEARTBEAT_TTL_SECONDS` (default 180). The idle-strike debounce —
   the `ghr:idle_strikes` tag surfacing, `SCALE_DOWN_IDLE_STRIKES`, the strike
   increment/reset logic, and its tests — is removed. The TTL is **self-healing**:
   when the job ends the tag is deleted (immediate eligibility for scale-down),
   and if the runner dies uncleanly the tag goes stale within the TTL and ordinary
   scale-down resumes — so a forgotten heartbeat can never leak an instance the
   way a sticky `ghr:bypass-removal` tag would.

4. **Least-privilege self-tagging retained** (`terraform/runners/runner-self-tag.tf`).
   The runner instance role keeps the narrow `ec2:CreateTags`/`DeleteTags` grant
   constrained (via `aws:TagKeys`) to the single `ghr:job_heartbeat` key on
   runner-fleet instances, so a compromised runner cannot set
   `ghr:bypass-removal` or rewrite `ghr:environment`.

### Rollout

Touches `terraform/`, `.github/`, and the vendored-Lambda patch, so the change is
**CODEOWNERS-gated** (maintainer approval). **Acceptance is post-apply**: the
patched `runners.zip` must be built (`make runner-lambdas-sync` /
`scripts/build-runner-control-plane-lambda.sh`) and `terraform apply` run for
`terraform/runners/` (via `runner-terraform-apply.yml`) before the new userdata
and Lambda reach live runners; survival is then confirmed by observing live CI
runs (0 runner-shutdown cancellations across ≥2 runs of each long job) and that
idle runners still scale to zero.

## Amendment (LS-9836)

The heartbeat override's freshness check originally trusted the
`ghr:job_heartbeat` value from the single EC2 snapshot `scaleDown()` takes at
the top of its invocation, not a live read at decision time. Because
`evaluateAndRemoveRunners` walks the whole fleet sequentially with multiple
awaited GitHub API calls per runner, that snapshot could go stale (relative
to `SCALE_DOWN_HEARTBEAT_TTL_SECONDS`) purely from invocation latency, on a
runner that was heartbeating the entire time — killing two genuinely-busy E2E
shards on PR #7503. The patch (`scale-down-heartbeat.patch`) now re-fetches
the tag live, immediately before the termination decision, closing that gap.
See `terraform/runners/lambda-patches/README.md` § LS-9836 for the full
analysis.

## Consequences

### Easier

- One survival mechanism instead of two: the vendored-Lambda patch shrinks to a
  single heartbeat-TTL check, easier to re-base on each module-version bump.
- Every self-hosted job is protected automatically — no per-workflow opt-in, so
  new long jobs (or new workflows) are covered without further changes.

### Harder

- Runner survival now depends on the runner job hooks firing and the instance
  profile being able to reach IMDS + `ec2:CreateTags`. A regression in the
  userdata/hook wiring silently reverts to the upstream single-poll behavior
  (mitigated by the self-healing TTL and the bounded backstop loop).
- The heartbeat code lives in a Terraform-templated heredoc, where shell `${...}`
  must be escaped as `$${...}`; future edits must preserve that escaping.

### Now constrained

- The vendored-Lambda patch is pinned to upstream v7.5.0; bumping the module
  version requires re-basing `scale-down-heartbeat.patch` and re-running
  `make runner-lambdas-sync` (the build fails loudly if the patch no longer
  applies). See `terraform/runners/lambda-patches/README.md`.
- The correctness invariant (heartbeat only during an active job) constrains any
  future change to the heartbeat: it must remain bound to job start/stop and must
  never become instance-lifetime, or scale-to-zero breaks.
- `SCALE_DOWN_IDLE_STRIKES` / `ghr:idle_strikes` no longer exist; tooling or
  runbooks must not reference them.
