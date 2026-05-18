# 0010. Terraform state lock watchdog on a GitHub-hosted runner

Date: 2026-05-18

## Status

Accepted

## Context

On 2026-05-18 a `lambda-terraform-apply` workflow run terminated mid-apply during a
NAT-instance replacement — after the old NAT instance was destroyed and a new one
created, but before `source_dest_check=false` had been flipped on the replacement
or `aws_route.private_lambda_internet` had been updated to point at its ENI. AWS
was left half-broken: Lambdas in private subnets lost all egress to public AWS
APIs (Secrets Manager, etc.), and the GraphQL Lambda hung on cold-start for
roughly two hours. The full incident is documented in LS-4526.

The reason recovery did not happen automatically was the S3 native lockfile.
The crashed run never reached its lock-release step, so the lock object sat in
S3 at full age. Five subsequent apply retries piled up failing on the stuck lock
— none of them able to repair the damaged NAT-instance state because none of
them could acquire the lock to plan against the live state.

`lambda-terraform-apply.yml` already contains a "Clear Stale Locks" step that
unconditionally removes the lockfile at the start of every triggered run, which
in isolation would have recovered within minutes. The actual gap is that the
workflow is trigger-driven: it fires when the umbrella `Deploy` or
`Upload Lambdas` workflow completes. If no Lambda uploads arrive for hours,
the "Clear Stale Locks" step never runs, and the lock sits indefinitely.

LS-4527 asked us to make this failure mode either impossible or self-healing.
Four options were proposed in the ticket.

## Options considered

### 1. Split NAT-instance changes into a separate workflow on an unrelated runner

The motivation: a self-hosted runner that lives inside the dev VPC depends on
the very NAT instance it would be modifying, so a partial apply can sever the
runner's own egress mid-step.

Today this premise does not actually apply to our setup. `lambda-terraform-apply.yml`
runs on `${{ vars.CI_RUNNER_LABEL || 'ubuntu-latest' }}` — `ubuntu-latest` by
default, with the override only kicking in if the `CI_RUNNER_LABEL` repo variable
is explicitly set to a self-hosted label. The self-hosted runners themselves
launch in **public** subnets (`subnet_ids = local.public_subnet_ids` in
`terraform/runners/github-runners.tf`), so they have direct IGW egress and do
not depend on the NAT instance either.

What actually broke recovery in LS-4526 was lock-holding, not runner egress.
Splitting workflows would add organizational complexity (path-based detection
of "is this change NAT-affecting?", separate state files, separate IAM roles)
without addressing the failure mode that occurred. Rejected.

### 2. Pre-warm the GraphQL Lambda via provisioned concurrency

Provisioned concurrency keeps a pool of warm Lambda execution environments,
which would mask cold-start failures while the underlying network path was broken.

This option hides a symptom rather than addressing the AC. A broken NAT still
breaks Lambdas as soon as the warm pool churns or any new container is created.
It costs roughly $15-30 per Lambda per month continuously, never expires, and
does nothing to help recovery — the apply retries would still fail on the stuck
lock. Rejected.

### 3. Stale-lock auto-recovery via a scheduled GitHub Actions workflow

A cron workflow that inspects the S3 lockfile on a schedule and force-removes
it when (a) the lockfile is older than a chosen threshold, and (b) no apply
workflow is currently in flight.

The trade-off the ticket flagged — "false positives could break legitimate
long-running applies" — is the design constraint here. We mitigate it by:

1. **Threshold > apply timeout.** The two apply workflows set
   `timeout-minutes: 20`. With a 20-minute stale threshold, a healthy
   long-running apply terminates (one way or the other) before the watchdog
   would consider its lock stale.
2. **Active-run check.** Before removing a stale lock, the watchdog queries
   the GitHub Actions REST API for `in_progress` and `queued` runs of
   `lambda-terraform-apply.yml`, `runner-terraform-apply.yml`, and
   `rollback.yml`. If any is active, the watchdog hands off — the active run
   either holds the lock legitimately or will run its own "Clear Stale Locks"
   step. The watchdog only acts when both conditions are met: stale AND nothing
   else is running.
3. **Runs on `ubuntu-latest`.** The watchdog is independent of any VPC
   infrastructure. Even if the dev NAT instance is fully destroyed, the
   GitHub-hosted runner has full direct internet egress and can reach S3 and
   the GitHub Actions API to do its job.
4. **Auditability.** Every decision (skipped vs. removed) is logged to the
   workflow summary, and removals notify Discord so the team sees the action
   without having to read CI history.

Accepted.

### 4. Hourly drift-detection workflow

A scheduled `terraform plan -detailed-exitcode` that opens an alert when drift
is detected.

Useful as a supplement — it catches the _next_ failure mode (apply succeeded
but state diverged from reality, for any reason) — but it is detection-only.
A drift alert does not unstick a held lock, so the dev environment would still
be unrecoverable for an hour while a human pages in. Does not satisfy AC1 alone.
Deferred to a future ticket if monitoring gaps justify it.

## Decision

Adopt Option 3. Add `.github/workflows/terraform-lock-watchdog.yml`:

- Runs on `ubuntu-latest` (GitHub-hosted; no dependency on the legacy-sports VPC,
  NAT instance, or self-hosted runners).
- Schedule: every 15 minutes (`cron: "*/15 * * * *"`) plus `workflow_dispatch`
  with optional `dry-run` and `stale-threshold-minutes` inputs.
- Stale threshold: 20 minutes (overridable per-run via the dispatch input).
  Chosen to comfortably exceed the apply workflows' own `timeout-minutes: 20`.
- For each of the two state lockfiles
  (`legacy-sports/terraform.tfstate.tflock` and
  `legacy-sports/runners.tfstate.tflock`):
  1. Skip if no lockfile is present.
  2. Skip if the lockfile is younger than the stale threshold.
  3. Skip if any apply workflow is currently `in_progress` or `queued`.
  4. Otherwise, `aws s3 rm` the lockfile and notify Discord.
- Uses the existing `legacy-sports-dev-github-actions` OIDC role; no new IAM
  permissions are needed (the role already performs `aws s3 rm` on the same
  paths inside the existing apply workflows).

The recovery time after a partial-apply incident is bounded to roughly one cron
tick beyond the apply timeout — about 35 minutes worst case, versus the
indefinite hold seen in LS-4526.

## Consequences

### Easier

- A future partial-apply that orphans the lock self-heals within ~35 minutes
  regardless of whether new triggers arrive. The dev environment cannot stay
  unrecoverable for hours.
- The watchdog is independent of the affected infrastructure, so it remains
  operational even when the NAT path, RDS, or any in-VPC service is broken.
- Discord notifications give the team early visibility when a lock is removed
  (signal of an upstream apply crash worth investigating) or when the watchdog
  declined to act because applies are still in flight (signal that something
  legitimate is taking unusually long).

### Harder

- One extra scheduled workflow run every 15 minutes (96/day). At
  `ubuntu-latest` GitHub-hosted pricing this is effectively zero cost on a
  private repo allowance, and each run is bounded to ~30 seconds.
- The active-run check uses `gh run list --status in_progress` and
  `--status queued`. If GitHub's API ever lags reporting a brand-new run,
  there is a narrow window where the watchdog could see "no active runs"
  while a run is starting. The 20-minute stale threshold makes this window
  irrelevant in practice — a brand-new run cannot have created a 20-minute-old
  lockfile.

### Now constrained

- Apply workflows must keep `timeout-minutes` no greater than the watchdog's
  `STALE_THRESHOLD_MINUTES`. The current pair (20-minute apply timeout, 20-minute
  stale threshold) sits at the boundary: GitHub kills a runaway apply at the
  20-minute mark, so any lock that survives ≥ 20 minutes is by definition
  orphaned. The active-run check is the second layer of defense — even at the
  boundary, an apply still listed as `in_progress` (waiting for the cancellation
  to register) keeps the watchdog away from its lock. If the apply timeout is
  ever raised, the watchdog threshold must be raised in lockstep to preserve
  the "healthy long-running apply is never interrupted" invariant.
- The list of workflows the watchdog checks for activity
  (`lambda-terraform-apply.yml`, `runner-terraform-apply.yml`, `rollback.yml`)
  must stay in sync with the actual set of workflows that perform
  `terraform apply` against either state file. If a fourth apply workflow is
  added, its filename must be appended to the `WORKFLOWS` array in
  `terraform-lock-watchdog.yml` or it will be ignored when evaluating active
  runs.
