# =============================================================================
# Locals
# =============================================================================

locals {
  runner_log_group_base         = "/github-runners/${local.name_prefix}-runner"
  runner_android_log_group_base = "/github-runners/${local.name_prefix}-runner-android"
}

# =============================================================================
# Self-Hosted GitHub Actions Runners (github-aws-runners module)
# =============================================================================
#
# Uses the community-maintained github-aws-runners/terraform-aws-github-runner
# module for robust, battle-tested self-hosted runner infrastructure.
#
# Architecture:
#   GitHub webhook (workflow_job) → API Gateway → Lambda → EC2 spot (non-ephemeral)
#   Runner boots once, processes jobs from queue, scale-down Lambda terminates after idle timeout
#
# Cost: ~$175-215/month (pre-optimization; target ~$140-180/month after LS-3572) (scale-to-zero, spot instances) vs ~$1,370/month on
#        GitHub-hosted runners (~96% savings). LS-8693 moved the fleet from
#        8 GB c-family to 16 GB m-family xlarge (same 4 vCPU): ~15-25% higher
#        spot rate, required to stop kernel OOM kills of the test job.
# =============================================================================

module "github_runners" {
  source  = "github-aws-runners/github-runner/aws"
  version = "7.5.0"

  aws_region = var.aws_region
  vpc_id     = local.vpc_id
  subnet_ids = local.public_subnet_ids

  prefix = "${local.name_prefix}-runner"

  # ── GitHub App authentication ───────────────────────────────────────────────
  github_app = {
    key_base64     = var.github_app_key_base64
    id             = var.github_app_id
    webhook_secret = var.github_app_webhook_secret
  }

  # ── Lambda zips ─────────────────────────────────────────────────────────────
  # webhook.zip and runner-binaries-syncer.zip are pre-downloaded from the module
  # release (scripts/download-runner-lambdas.js). runners.zip (the control-plane
  # bundle) is built from PATCHED upstream source — it carries the scale-down
  # job-heartbeat override (LS-7874/LS-7877) so a runner actively executing a job
  # (which self-tags ghr:job_heartbeat via the runner-level job hooks) is never
  # terminated mid-run by a transient GitHub busy:false reading. See
  # terraform/runners/lambda-patches/README.md and
  # scripts/build-runner-control-plane-lambda.sh.
  webhook_lambda_zip                = "${path.module}/lambdas/webhook.zip"
  runners_lambda_zip                = "${path.module}/lambdas/runners.zip"
  runner_binaries_syncer_lambda_zip = "${path.module}/lambdas/runner-binaries-syncer.zip"

  # ── Runner configuration ────────────────────────────────────────────────────
  enable_organization_runners = false # repo-level runners
  enable_ephemeral_runners    = false # non-ephemeral: instance processes multiple sequential jobs
  enable_jit_config           = false # JIT is ephemeral-only; keep disabled for non-ephemeral mode

  # Delay between receiving a workflow_job webhook and the scale-up Lambda
  # launching a new instance. 30s (module default) gives idle non-ephemeral
  # runners time to pick up the queued job before a redundant instance is
  # launched — especially effective for sequential CI stages where one runner
  # can claim the next job in the pipeline.
  delay_webhook_event = 30
  # Scale-up Lambda checks via the GitHub API whether the job is still queued
  # before launching. Prevents redundant instance launches when an idle runner
  # already claimed the job. Requires `actions: read` on the GitHub App.
  enable_job_queued_check = true

  # Spot instances with fleet diversification across types and AZs.
  # capacity-optimized-prioritized picks from the pools with the most
  # available capacity (fewest reclamations) while respecting the type
  # priority order in var.github_runners_instance_types.
  instance_target_capacity_type = "spot"
  instance_allocation_strategy  = "capacity-optimized-prioritized"
  instance_types                = var.github_runners_instance_types

  # Check every minute for idle runners. Non-ephemeral runners stay alive between
  # jobs so we need frequent polling to reclaim instances quickly once they go idle.
  scale_down_schedule_expression = "cron(* * * * ? *)"
  runners_maximum_count          = var.github_runners_max_count

  # No warm pool — scale to zero any time there are no running jobs. The first
  # job of a burst incurs a ~30s cold-boot penalty (pre-baked AMI), but
  # enable_job_queued_check + delay_webhook_event ensure subsequent jobs in the
  # same burst reuse the runner that just booted instead of launching duplicates.

  # Limit scale-up Lambda to 1 concurrent invocation (module default). Allowing
  # multiple simultaneous invocations widens the EC2 tag propagation race window:
  # each invocation reads the current runner count before newly launched instances
  # have their tags fully propagated, causing all concurrent Lambdas to conclude
  # that launching is safe and collectively exceed runners_maximum_count. Observed
  # currentRunners: 23 vs maximumRunners: 20 on Apr 9. Serializing scale-up
  # decisions eliminates the race at the cost of slightly slower burst response
  # (acceptable given delay_webhook_event = 30 and enable_job_queued_check = true).
  scale_up_reserved_concurrent_executions = 1

  # Runner OS and labels
  runner_os           = "linux"
  runner_architecture = "x64"
  runner_extra_labels = ["ci-runner"]
  runner_run_as       = "ubuntu" # Packer AMI is Ubuntu, not Amazon Linux

  # Attach extra IAM policies to the module's runner instance role. The
  # permissions boundary already permits these actions, but the module's runner
  # role also needs an attached policy granting them (LS-1663):
  #   - runner_cache:    read/write the pnpm store tarball in the cache bucket.
  #   - runner_self_tag: manage ONLY the ghr:job_heartbeat tag on the runner's
  #                      own instance so any executing job (via the runner-level
  #                      job hooks) can mark itself active and survive scale-down
  #                      (LS-7874/LS-7877, see runner-self-tag.tf).
  runner_iam_role_managed_policy_arns = [
    aws_iam_policy.runner_cache.arn,
    aws_iam_policy.runner_self_tag.arn,
  ]

  # CloudWatch agent — custom config avoids the module default's invalid
  # log_class property that causes the agent to fail on startup (LS-1667).
  # Ships cloud-init (userdata) and syslog output to CloudWatch for debugging
  # runner boot failures and spot interruption events.
  # amazon-cloudwatch-agent is now baked into the AMI (LS-2247/LS-2301).
  enable_cloudwatch_agent = true
  cloudwatch_config = jsonencode({
    logs = {
      force_flush_interval = 5
      logs_collected = {
        files = {
          collect_list = [
            {
              # Runner boot output: userdata script, apt-get, runner registration.
              # Useful for diagnosing why a runner failed to appear after scale-up.
              file_path       = "/var/log/user-data.log"
              log_group_name  = "${local.runner_log_group_base}/cloud-init"
              log_stream_name = "{instance_id}"
              timezone        = "UTC"
            },
            {
              # System log: kernel messages, spot interruption notices (from
              # spot-handler loop in runner-userdata.sh), and service events.
              file_path       = "/var/log/syslog"
              log_group_name  = "${local.runner_log_group_base}/syslog"
              log_stream_name = "{instance_id}"
              timezone        = "UTC"
            },
          ]
        }
      }
    }
  })

  # Time for the instance to boot and register as a runner (~30s with pre-baked AMI
  # plus userdata_pre_install). Scale-down Lambda won't terminate instances younger
  # than this even if they appear idle. 2 minutes provides ample protection — actual
  # boot time is ~30s — and makes minimum_running_time_in_minutes = 2 the effective
  # billing floor (max(2, 2) = 2).
  runner_boot_time_in_minutes = 2

  # Minimum runtime before the scale-down Lambda considers a runner eligible for
  # termination. Reduced from 5 → 2 minutes (LS-3572): live data showed short
  # self-hosted jobs (detect-changes: 22s, security-scan-plan: 10s, secret-detection: 11s)
  # were each billing a full 5-minute floor despite running in under 30 seconds.
  # 2 minutes is still sufficient for a warm runner to pick up a follow-on stage
  # in a burst — confirmed by scale-down logs showing zero idle terminations
  # during active bursts, meaning chaining happens in seconds not minutes.
  minimum_running_time_in_minutes = 2

  # ── AMI (pre-baked via Packer — see terraform/packer/runner-ami.pkr.hcl) ──
  # Ubuntu 22.04 with Node.js 22, pnpm, Playwright deps, runner deps pre-installed.
  # Boots in ~30s instead of 5-7 min from stock AMI.
  #
  # LS-2429: AMI selection is version-scoped by Playwright version via the
  # name filter below. Packer stamps the Playwright version into the AMI name
  # (legacy-sports-runner-pw<version>-<timestamp>) so that terraform selects
  # exactly the AMI built for var.runner_ami_playwright_version — no explicit
  # AMI ID, no SSM parameter. Multiple versions of the AMI coexist in the
  # account until pruned, enabling trivial rollback by reverting the tfvars
  # change that bumped this variable.
  ami = {
    filter = {
      name  = ["legacy-sports-runner-pw${var.runner_ami_playwright_version}-*"]
      state = ["available"]
    }
    owners = ["self"]
  }

  # ── Instance configuration ─────────────────────────────────────────────────
  block_device_mappings = [{
    device_name           = "/dev/sda1"
    delete_on_termination = true
    volume_type           = "gp3"
    volume_size           = 60
    encrypted             = true
    iops                  = null
    throughput            = null
    kms_key_id            = null
    snapshot_id           = null
  }]

  # ── Custom userdata template (Ubuntu-based, replaces module's Amazon Linux default)
  userdata_template = "${path.module}/runner-userdata.sh"

  # Pre-install: restore pnpm store from S3 cache so the first job on this
  # instance finds a warm cache instead of downloading all packages fresh.
  # Falls back silently if the cache object does not exist yet (first runner
  # boot after deployment, or cache expired). Runs as root; ownership is fixed
  # after extraction so the ubuntu runner user can access the store.
  userdata_pre_install = <<-EOT
    echo "Using pre-baked Ubuntu AMI - Node.js, pnpm, Playwright already installed"

    # Convert Ubuntu apt sources from HTTP to HTTPS so apt-get update works under
    # the runner SG egress policy (port 443 open, port 80 limited to 169.254.169.254).
    # The GitHub Actions runner's installdependencies.sh runs apt-get update and
    # fails if it can't reach HTTP mirrors. HTTPS mirrors are fully equivalent and
    # supported by apt-transport-https (pre-installed on Ubuntu 22.04).
    sed -i 's|http://us-east-1.ec2.archive.ubuntu.com|https://archive.ubuntu.com|g' /etc/apt/sources.list
    sed -i 's|http://security.ubuntu.com|https://security.ubuntu.com|g' /etc/apt/sources.list
    # Prefer IPv4 to skip IPv6 timeout delays (VPC has no IPv6 internet route).
    echo 'Acquire::ForceIPv4 "true";' > /etc/apt/apt.conf.d/99force-ipv4

    CACHE_BUCKET="${local.name_prefix}-runner-cache"
    PNPM_STORE="/home/ubuntu/.local/share/pnpm/store"

    if aws s3api head-object --bucket "$CACHE_BUCKET" --key "pnpm-store/latest.tar.gz" >/dev/null 2>&1; then
      echo "[cache] Restoring pnpm store from s3://$CACHE_BUCKET/pnpm-store/latest.tar.gz"
      mkdir -p /home/ubuntu/.local/share/pnpm
      aws s3 cp "s3://$CACHE_BUCKET/pnpm-store/latest.tar.gz" - 2>/dev/null \
        | tar xzf - -C "$PNPM_STORE" --no-same-owner --no-same-permissions 2>/dev/null \
        || echo "[cache] Restore failed — continuing without cache"
      chown -R ubuntu:ubuntu /home/ubuntu/.local/share/pnpm 2>/dev/null || true
      echo "[cache] pnpm store restored"
    else
      echo "[cache] No pnpm cache found — first boot will download packages fresh"
    fi
  EOT

  # ── Pre-job env injection hook (LS-4948) ──────────────────────────────────
  # Runs before each job's steps via ACTIONS_RUNNER_HOOK_JOB_STARTED.
  #
  # The runner systemd service does not load /etc/environment (no PAMName=,
  # no EnvironmentFile=) and does not source /etc/profile.d/*.sh (non-login
  # shell), so Packer-baked env vars like JAVA_HOME, ANDROID_HOME, and
  # PLAYWRIGHT_BROWSERS_PATH never reach a default `runs: |` job step. Writing
  # them to /opt/actions-runner/.env from Packer also fails — the runner
  # agent's config.sh overwrites .env at boot, dropping anything Packer wrote
  # (this is why LS-4902 / LS-4936 looked correct but never reached a live
  # runner; see drift instances D-1/D-2/D-3 in docs/runners/ami-env-drift.md).
  #
  # The reliable channel is the runner agent's own job_started hook — it runs
  # in the same shell context as the job's steps, has $GITHUB_ENV and
  # $GITHUB_PATH available, and the values it writes there are exposed to
  # every step that follows.
  #
  # Source of truth: the Packer-baked /etc/profile.d/*.sh files. We source
  # them here and forward an explicit, named list of vars to $GITHUB_ENV so
  # the contract is reviewable rather than implicit.
  runner_hook_job_started = <<-EOT
    #!/bin/bash
    set -euo pipefail

    # Source the Packer-baked env files (login-shell semantics) so the
    # variables they define are present in this hook's shell. Each file is
    # optional — a missing file means that toolchain is not installed on
    # this AMI and we silently skip its var.
    for f in /etc/profile.d/java.sh /etc/profile.d/android-sdk.sh /etc/profile.d/playwright.sh; do
      # shellcheck disable=SC1090
      [[ -f "$f" ]] && source "$f"
    done

    # Forward the named contract to $GITHUB_ENV so every step in this job
    # inherits the vars. Skipping empty values keeps the env clean if a
    # toolchain is intentionally missing on a future AMI variant.
    #
    # Security: each value is single-line by contract (these are file paths
    # baked in by Packer at AMI build time, see /etc/profile.d/{java,android-sdk,playwright}.sh).
    # We defensively reject any value containing a newline or carriage return
    # before writing to $GITHUB_ENV — without this, a future change that
    # routes a less-trusted source through this hook could let an attacker
    # who controls the source inject extra `NAME=value` lines (e.g.
    # `JAVA_HOME=foo\nEVIL=1`), which the runner would then expose to every
    # subsequent step. The GitHub Actions multiline-value protocol for
    # $GITHUB_ENV is a heredoc (NAME<<EOF…EOF), not URL-encoding; rejecting
    # the input outright is the right shape for single-line-by-contract vars.
    emit_env() {
      local name="$1" value="$2"
      if [[ -z "$value" ]]; then
        return
      fi
      if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
        echo "[hook_job_started] WARN: refusing to emit $name — value contains newline/CR" >&2
        return
      fi
      echo "$name=$value" >> "$GITHUB_ENV"
    }
    emit_env JAVA_HOME               "$${JAVA_HOME:-}"
    emit_env ANDROID_HOME            "$${ANDROID_HOME:-}"
    # ANDROID_SDK_ROOT is the newer name; modern Android tooling prefers it
    # but still honors ANDROID_HOME, so we export both as aliases.
    emit_env ANDROID_SDK_ROOT        "$${ANDROID_HOME:-}"
    emit_env PLAYWRIGHT_BROWSERS_PATH "$${PLAYWRIGHT_BROWSERS_PATH:-}"

    # Forward PATH additions to $GITHUB_PATH so `sdkmanager`, `adb`, `aapt2`,
    # and `javac` resolve from a bare `runs: | sdkmanager ...` step without
    # forcing every workflow to use `shell: bash -l {0}`.
    {
      [[ -n "$${JAVA_HOME:-}"    ]] && echo "$JAVA_HOME/bin"
      [[ -n "$${ANDROID_HOME:-}" ]] && echo "$ANDROID_HOME/cmdline-tools/latest/bin"
      [[ -n "$${ANDROID_HOME:-}" ]] && echo "$ANDROID_HOME/platform-tools"
    } >> "$GITHUB_PATH"

    # ── Runner job heartbeat (LS-7877) ──────────────────────────────────────
    # While a job executes, tag this instance ghr:job_heartbeat=<unix-seconds>
    # once a minute so the patched scale-down Lambda treats the runner as active
    # and never reclaims it mid-job. Running from the runner's own job_started
    # hook covers EVERY self-hosted job automatically (integration, e2e shards,
    # the android build) — superseding the per-workflow heartbeat steps this
    # replaces (LS-7874) and the idle-strike debounce (LS-7870). The
    # job_completed hook stops the loop and deletes the tag, so the heartbeat
    # only ever runs WHILE a job executes — a genuinely idle runner emits NO
    # heartbeat and scale-to-zero keeps working. Best-effort and IMDSv2-only: on
    # a GitHub-hosted fallback runner (no AWS IMDS) every metadata/AWS call
    # fails quietly and this is a no-op. The scoped ec2:CreateTags/DeleteTags
    # grant lives in runner-self-tag.tf.
    HB_TOKEN=$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" \
      -H "X-aws-ec2-metadata-token-ttl-seconds: 600" 2>/dev/null) || HB_TOKEN=""
    if [[ -n "$HB_TOKEN" ]]; then
      HB_IID=$(curl -sf -H "X-aws-ec2-metadata-token: $HB_TOKEN" \
        http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null) || HB_IID=""
      HB_REGION=$(curl -sf -H "X-aws-ec2-metadata-token: $HB_TOKEN" \
        http://169.254.169.254/latest/meta-data/placement/region 2>/dev/null) || HB_REGION=""
      if [[ -n "$HB_IID" && -n "$HB_REGION" ]]; then
        echo "[heartbeat] tagging $HB_IID in $HB_REGION every 60s (ghr:job_heartbeat)"
        # Synchronous first beat so a scale-down poll landing between job start
        # and the first loop tick already sees the runner as active.
        aws ec2 create-tags --region "$HB_REGION" --resources "$HB_IID" \
          --tags "Key=ghr:job_heartbeat,Value=$(date +%s)" >/dev/null 2>&1 || true
        # Bounded loop (~370 min, just past the longest self-hosted job — the
        # android build's 360-min default timeout) so a missed stop can never
        # leak the instance: once the loop exits the tag goes stale within the
        # TTL and normal scale-down resumes. The job_completed hook is the
        # primary stop; this bound is only a backstop for an unclean exit.
        nohup bash -c '
          for _ in $(seq 1 370); do
            sleep 60
            aws ec2 create-tags --region "'"$HB_REGION"'" --resources "'"$HB_IID"'" \
              --tags "Key=ghr:job_heartbeat,Value=$(date +%s)" >/dev/null 2>&1 || true
          done
        ' >/tmp/runner-heartbeat.log 2>&1 &
        # Record the loop PID + instance/region so the job_completed hook can
        # stop it. Guarded so a bookkeeping write can never fail the job (set -e);
        # a missed file just falls back to the loop's bounded self-expiry.
        echo "$!" > /opt/actions-runner/.job-heartbeat.pid || true
        printf '%s\n%s\n' "$HB_IID" "$HB_REGION" > /opt/actions-runner/.job-heartbeat.meta || true
      fi
    fi
  EOT

  # ── Inter-job cleanup hook (non-ephemeral isolation) ───────────────────────
  # Runs after each job completes via ACTIONS_RUNNER_HOOK_JOB_COMPLETED.
  # Removes workspace and temp artifacts to prevent cross-job data leakage.
  # pnpm store and Nx cache are intentionally preserved for performance.
  runner_hook_job_completed = <<-EOT
    #!/bin/bash
    set -euo pipefail

    echo "[cleanup] Post-job cleanup started at $(date -u)"

    # ── Stop runner job heartbeat (LS-7877) ─────────────────────────────────
    # Kill the heartbeat loop started by the job_started hook and delete the tag
    # so this reusable non-ephemeral runner is immediately eligible for normal
    # idle scale-down once the job ends. Best-effort: if anything here fails the
    # tag goes stale within the TTL and scale-down resumes anyway.
    if [[ -f /opt/actions-runner/.job-heartbeat.pid ]]; then
      kill "$(cat /opt/actions-runner/.job-heartbeat.pid)" 2>/dev/null || true
      rm -f /opt/actions-runner/.job-heartbeat.pid
    fi
    if [[ -f /opt/actions-runner/.job-heartbeat.meta ]]; then
      HB_IID=$(sed -n '1p' /opt/actions-runner/.job-heartbeat.meta)
      HB_REGION=$(sed -n '2p' /opt/actions-runner/.job-heartbeat.meta)
      if [[ -n "$HB_IID" && -n "$HB_REGION" ]]; then
        aws ec2 delete-tags --region "$HB_REGION" --resources "$HB_IID" \
          --tags "Key=ghr:job_heartbeat" >/dev/null 2>&1 || true
      fi
      rm -f /opt/actions-runner/.job-heartbeat.meta
    fi

    # Derive the runner workspace root from the environment, falling back to the
    # default GitHub Actions runner path if RUNNER_WORKSPACE is not set.
    WORKSPACE_ROOT="$${RUNNER_WORKSPACE:-/opt/actions-runner/_work}"

    # Remove the job workspace (prevents stale files and secrets from leaking
    # to the next job). The runner re-creates this directory per job.
    if [[ -n "$${GITHUB_WORKSPACE:-}" ]]; then
      echo "[cleanup] Removing GITHUB_WORKSPACE: $GITHUB_WORKSPACE"
      rm -rf "$GITHUB_WORKSPACE"
    else
      echo "[cleanup] GITHUB_WORKSPACE not set; skipping workspace deletion"
    fi

    # Clear the runner's temp directory and cached action code (action outputs,
    # tool caches for this job, and downloaded marketplace actions).
    # _actions is removed to prevent a compromised job from tampering with
    # cached action code that would run in subsequent jobs.
    rm -rf "$WORKSPACE_ROOT/_temp/"
    rm -rf "$WORKSPACE_ROOT/_actions/"

    # Remove temp files written by npm/pnpm/Nx during the job
    rm -rf /tmp/npm-* /tmp/pnpm-* /tmp/nx-*

    # Remove any git credential helpers written by actions/checkout
    find "$WORKSPACE_ROOT" -name "git-credentials-*" -delete 2>/dev/null || true

    # Remove per-job .npmrc files that may contain registry auth tokens.
    # Restricted to the job workspace (not _actions) to avoid mutating action checkouts.
    if [[ -n "$${GITHUB_WORKSPACE:-}" ]]; then
      find "$GITHUB_WORKSPACE" -name ".npmrc" -delete 2>/dev/null || true
    fi

    echo "[cleanup] Post-job cleanup completed at $(date -u)"

    # Sync pnpm store to S3 so the next new runner instance starts warm.
    # Runs in background (nohup + disown) so it does not delay the runner
    # from picking up the next queued job. A partial upload is harmless —
    # the pnpm store is content-addressable, so the next sync will fill gaps.
    PNPM_STORE="/home/ubuntu/.local/share/pnpm/store"
    CACHE_BUCKET="${local.name_prefix}-runner-cache"
    if [[ -d "$PNPM_STORE" ]]; then
      (
        nohup bash -c \
          "tar czf - \"$PNPM_STORE\" 2>/dev/null \
             | aws s3 cp - \"s3://$CACHE_BUCKET/pnpm-store/latest.tar.gz\" \
           && echo '[cache] pnpm store sync complete' \
           || echo '[cache] pnpm store sync failed'" \
          >> /tmp/cache-sync.log 2>&1 &
        disown
      ) || true
      echo "[cache] pnpm store sync started in background → /tmp/cache-sync.log"
    fi
  EOT

  # ── VPC egress restrictions (LS-1654) ──────────────────────────────────────
  # Replace the module's default "all outbound" rule with least-privilege egress.
  # Runners need: HTTPS (GitHub API, npm, S3), DNS, PostgreSQL (VPC RDS for
  # migration checks), and EC2 instance metadata (spot interruption notices).
  runner_egress_rules = [
    {
      cidr_blocks      = ["0.0.0.0/0"]
      ipv6_cidr_blocks = ["::/0"]
      prefix_list_ids  = null
      from_port        = 443
      protocol         = "tcp"
      security_groups  = null
      self             = false
      to_port          = 443
      description      = "HTTPS - GitHub API, npm registry, S3, VPC endpoints"
    },
    {
      cidr_blocks      = [local.vpc_cidr_block]
      ipv6_cidr_blocks = []
      prefix_list_ids  = null
      from_port        = 53
      protocol         = "udp"
      security_groups  = null
      self             = false
      to_port          = 53
      description      = "DNS (UDP) - VPC DNS resolver"
    },
    {
      cidr_blocks      = [local.vpc_cidr_block]
      ipv6_cidr_blocks = []
      prefix_list_ids  = null
      from_port        = 53
      protocol         = "tcp"
      security_groups  = null
      self             = false
      to_port          = 53
      description      = "DNS (TCP) - VPC DNS resolver"
    },
    {
      cidr_blocks      = local.public_subnet_cidr_blocks
      ipv6_cidr_blocks = []
      prefix_list_ids  = null
      from_port        = 5432
      protocol         = "tcp"
      security_groups  = null
      self             = false
      to_port          = 5432
      description      = "PostgreSQL - RDS in public subnets (historical placement, migration checks)"
    },
    {
      cidr_blocks      = ["169.254.169.254/32"]
      ipv6_cidr_blocks = []
      prefix_list_ids  = null
      from_port        = 80
      protocol         = "tcp"
      security_groups  = null
      self             = false
      to_port          = 80
      description      = "EC2 instance metadata - spot interruption notices and IMDSv2 token service"
    },
    {
      # SSH egress to in-VPC build instances. Required for rebuild-runner-ami.yml:
      # Packer launches a c7a.xlarge in a public subnet and the runner SSHes into
      # it via private IP to provision the new AMI. Scoped to the VPC CIDR so this
      # does not weaken the "no public SSH egress" posture (LS-4920).
      cidr_blocks      = [local.vpc_cidr_block]
      ipv6_cidr_blocks = []
      prefix_list_ids  = null
      from_port        = 22
      protocol         = "tcp"
      security_groups  = null
      self             = false
      to_port          = 22
      description      = "SSH - in-VPC Packer build instances (rebuild-runner-ami)"
    },
  ]

  # ── IAM hardening (LS-1653) ────────────────────────────────────────────────
  # Permissions boundary prevents the runner role from exceeding least-privilege,
  # regardless of what the module's default policy grants.
  role_permissions_boundary = aws_iam_policy.runner_permissions_boundary.arn

  # Ensure log groups (with retention policy) exist before the module creates
  # EC2 instances. Without this edge, Terraform may launch runners in parallel
  # with log group creation, letting the CloudWatch agent create the group first
  # with default "never expire" retention.
  #
  # Note: cross-state depends_on against main/'s aws_iam_role_policy.github_actions_additional
  # and aws_iam_policy.github_actions_supplemental was removed as part of LS-2425
  # state separation — those policies live in terraform/main/ now and cross-state
  # depends_on is not supported. The race they were guarding against (AccessDenied
  # on first runner-apply when IAM perms hadn't propagated) was a one-time bootstrap
  # concern and has long since been resolved in production.
  depends_on = [
    aws_cloudwatch_log_group.runner_cloud_init,
    aws_cloudwatch_log_group.runner_syslog,
  ]

  tags = local.common_tags
}

# =============================================================================
# Android Self-Hosted GitHub Actions Runners (LS-8910)
# =============================================================================
# A second, independent instance of the same github-aws-runners module,
# dedicated to the three Android-only workflows (build-android-app.yml,
# e2e-native-android.yml, run-maestro-sweep.yml). This is the "two module
# instances" approach, not the module's multi-runner variant — LS-8910
# deliberately scoped out the multi-runner Terraform migration as higher-risk
# for a first cut. The tradeoff of that choice: because a GitHub App has
# exactly one webhook URL and each module instance provisions its own webhook
# Lambda + API Gateway, this pool needs its OWN GitHub App (github_app_android_*
# variables) — a one-time manual prerequisite a repo admin must complete
# before this pool receives any workflow_job webhooks. See the LS-8910 PR
# description for the full rollout runbook.
#
# Everything else mirrors the default pool above: same instance type list
# (var.github_runners_instance_types — LS-8693's ≥16 GB RAM / 4 vCPU floor
# applies here too, this pool is NOT a place to reintroduce smaller types),
# same spot/capacity-optimized-prioritized config, same non-ephemeral +
# job-heartbeat + inter-job-cleanup hooks, same egress rules, same shared IAM
# policies (runner_cache, runner_self_tag, runner_permissions_boundary — all
# three were widened in this same PR to cover both pools' ghr:environment tag
# values, see local.runner_environments in main.tf). What differs: prefix,
# GitHub App credentials, max count (small — Android jobs never fan out), the
# AMI filter (selects the runner_android Packer source, 60 GB root volume —
# unchanged from before the split), and the runner label
# (var.github_runners_android... no such var; label is a literal below,
# matched by the ANDROID_RUNNER_LABEL repo variable the three Android
# workflows were updated to use in this same PR).
module "github_runners_android" {
  source  = "github-aws-runners/github-runner/aws"
  version = "7.5.0"

  aws_region = var.aws_region
  vpc_id     = local.vpc_id
  subnet_ids = local.public_subnet_ids

  prefix = "${local.name_prefix}-runner-android"

  github_app = {
    key_base64     = var.github_app_android_key_base64
    id             = var.github_app_android_id
    webhook_secret = var.github_app_android_webhook_secret
  }

  webhook_lambda_zip                = "${path.module}/lambdas/webhook.zip"
  runners_lambda_zip                = "${path.module}/lambdas/runners.zip"
  runner_binaries_syncer_lambda_zip = "${path.module}/lambdas/runner-binaries-syncer.zip"

  enable_organization_runners = false
  enable_ephemeral_runners    = false
  enable_jit_config           = false

  delay_webhook_event     = 30
  enable_job_queued_check = true

  instance_target_capacity_type = "spot"
  instance_allocation_strategy  = "capacity-optimized-prioritized"
  instance_types                = var.github_runners_instance_types

  scale_down_schedule_expression = "cron(* * * * ? *)"
  runners_maximum_count          = var.github_runners_android_max_count

  scale_up_reserved_concurrent_executions = 1

  runner_os           = "linux"
  runner_architecture = "x64"
  runner_extra_labels = ["ci-runner-android"]
  runner_run_as       = "ubuntu"

  runner_iam_role_managed_policy_arns = [
    aws_iam_policy.runner_cache.arn,
    aws_iam_policy.runner_self_tag.arn,
  ]

  enable_cloudwatch_agent = true
  cloudwatch_config = jsonencode({
    logs = {
      force_flush_interval = 5
      logs_collected = {
        files = {
          collect_list = [
            {
              file_path       = "/var/log/user-data.log"
              log_group_name  = "${local.runner_android_log_group_base}/cloud-init"
              log_stream_name = "{instance_id}"
              timezone        = "UTC"
            },
            {
              file_path       = "/var/log/syslog"
              log_group_name  = "${local.runner_android_log_group_base}/syslog"
              log_stream_name = "{instance_id}"
              timezone        = "UTC"
            },
          ]
        }
      }
    }
  })

  runner_boot_time_in_minutes     = 2
  minimum_running_time_in_minutes = 2

  # AMI filter selects the "android" Packer source's name prefix — see
  # terraform/runners/packer/runner-ami.pkr.hcl's source.amazon-ebs.runner_android.
  # Reuses the SAME var.runner_ami_playwright_version as the default pool:
  # both AMI variants build in one `packer build` invocation (no `-only` flag
  # in rebuild-runner-ami.yml) and always ship the same Playwright version.
  ami = {
    filter = {
      name  = ["legacy-sports-runner-android-pw${var.runner_ami_playwright_version}-*"]
      state = ["available"]
    }
    owners = ["self"]
  }

  # 60 GB — unchanged from the pre-split single AMI. This pool exists
  # specifically so the DEFAULT pool no longer has to carry this; the Android
  # SDK/NDK genuinely need the space here.
  block_device_mappings = [{
    device_name           = "/dev/sda1"
    delete_on_termination = true
    volume_type           = "gp3"
    volume_size           = 60
    encrypted             = true
    iops                  = null
    throughput            = null
    kms_key_id            = null
    snapshot_id           = null
  }]

  userdata_template = "${path.module}/runner-userdata.sh"

  # Same pnpm-store cache restore as the default pool — Android jobs run pnpm
  # install too, and sharing one cache bucket (aws_iam_policy.runner_cache
  # already grants both pools access) means whichever pool ran last warms the
  # other's next cold boot.
  userdata_pre_install = <<-EOT
    echo "Using pre-baked Ubuntu AMI (android variant) - Node.js, pnpm, Playwright, Android SDK already installed"

    sed -i 's|http://us-east-1.ec2.archive.ubuntu.com|https://archive.ubuntu.com|g' /etc/apt/sources.list
    sed -i 's|http://security.ubuntu.com|https://security.ubuntu.com|g' /etc/apt/sources.list
    echo 'Acquire::ForceIPv4 "true";' > /etc/apt/apt.conf.d/99force-ipv4

    CACHE_BUCKET="${local.name_prefix}-runner-cache"
    PNPM_STORE="/home/ubuntu/.local/share/pnpm/store"

    if aws s3api head-object --bucket "$CACHE_BUCKET" --key "pnpm-store/latest.tar.gz" >/dev/null 2>&1; then
      echo "[cache] Restoring pnpm store from s3://$CACHE_BUCKET/pnpm-store/latest.tar.gz"
      mkdir -p /home/ubuntu/.local/share/pnpm
      aws s3 cp "s3://$CACHE_BUCKET/pnpm-store/latest.tar.gz" - 2>/dev/null \
        | tar xzf - -C "$PNPM_STORE" --no-same-owner --no-same-permissions 2>/dev/null \
        || echo "[cache] Restore failed — continuing without cache"
      chown -R ubuntu:ubuntu /home/ubuntu/.local/share/pnpm 2>/dev/null || true
      echo "[cache] pnpm store restored"
    else
      echo "[cache] No pnpm cache found — first boot will download packages fresh"
    fi
  EOT

  # Identical hooks to the default pool — see the base module block above for
  # the full rationale on job heartbeat + inter-job cleanup. Duplicated
  # verbatim (Packer/Terraform HCL has no shared-block mechanism for module
  # arguments) rather than factored out, to keep each pool's config
  # independently readable and independently editable.
  runner_hook_job_started = <<-EOT
    #!/bin/bash
    set -euo pipefail

    for f in /etc/profile.d/java.sh /etc/profile.d/android-sdk.sh /etc/profile.d/playwright.sh; do
      # shellcheck disable=SC1090
      [[ -f "$f" ]] && source "$f"
    done

    emit_env() {
      local name="$1" value="$2"
      if [[ -z "$value" ]]; then
        return
      fi
      if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
        echo "[hook_job_started] WARN: refusing to emit $name — value contains newline/CR" >&2
        return
      fi
      echo "$name=$value" >> "$GITHUB_ENV"
    }
    emit_env JAVA_HOME               "$${JAVA_HOME:-}"
    emit_env ANDROID_HOME            "$${ANDROID_HOME:-}"
    emit_env ANDROID_SDK_ROOT        "$${ANDROID_HOME:-}"
    emit_env PLAYWRIGHT_BROWSERS_PATH "$${PLAYWRIGHT_BROWSERS_PATH:-}"

    {
      [[ -n "$${JAVA_HOME:-}"    ]] && echo "$JAVA_HOME/bin"
      [[ -n "$${ANDROID_HOME:-}" ]] && echo "$ANDROID_HOME/cmdline-tools/latest/bin"
      [[ -n "$${ANDROID_HOME:-}" ]] && echo "$ANDROID_HOME/platform-tools"
    } >> "$GITHUB_PATH"

    HB_TOKEN=$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" \
      -H "X-aws-ec2-metadata-token-ttl-seconds: 600" 2>/dev/null) || HB_TOKEN=""
    if [[ -n "$HB_TOKEN" ]]; then
      HB_IID=$(curl -sf -H "X-aws-ec2-metadata-token: $HB_TOKEN" \
        http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null) || HB_IID=""
      HB_REGION=$(curl -sf -H "X-aws-ec2-metadata-token: $HB_TOKEN" \
        http://169.254.169.254/latest/meta-data/placement/region 2>/dev/null) || HB_REGION=""
      if [[ -n "$HB_IID" && -n "$HB_REGION" ]]; then
        echo "[heartbeat] tagging $HB_IID in $HB_REGION every 60s (ghr:job_heartbeat)"
        aws ec2 create-tags --region "$HB_REGION" --resources "$HB_IID" \
          --tags "Key=ghr:job_heartbeat,Value=$(date +%s)" >/dev/null 2>&1 || true
        nohup bash -c '
          for _ in $(seq 1 370); do
            sleep 60
            aws ec2 create-tags --region "'"$HB_REGION"'" --resources "'"$HB_IID"'" \
              --tags "Key=ghr:job_heartbeat,Value=$(date +%s)" >/dev/null 2>&1 || true
          done
        ' >/tmp/runner-heartbeat.log 2>&1 &
        echo "$!" > /opt/actions-runner/.job-heartbeat.pid || true
        printf '%s\n%s\n' "$HB_IID" "$HB_REGION" > /opt/actions-runner/.job-heartbeat.meta || true
      fi
    fi
  EOT

  runner_hook_job_completed = <<-EOT
    #!/bin/bash
    set -euo pipefail

    echo "[cleanup] Post-job cleanup started at $(date -u)"

    if [[ -f /opt/actions-runner/.job-heartbeat.pid ]]; then
      kill "$(cat /opt/actions-runner/.job-heartbeat.pid)" 2>/dev/null || true
      rm -f /opt/actions-runner/.job-heartbeat.pid
    fi
    if [[ -f /opt/actions-runner/.job-heartbeat.meta ]]; then
      HB_IID=$(sed -n '1p' /opt/actions-runner/.job-heartbeat.meta)
      HB_REGION=$(sed -n '2p' /opt/actions-runner/.job-heartbeat.meta)
      if [[ -n "$HB_IID" && -n "$HB_REGION" ]]; then
        aws ec2 delete-tags --region "$HB_REGION" --resources "$HB_IID" \
          --tags "Key=ghr:job_heartbeat" >/dev/null 2>&1 || true
      fi
      rm -f /opt/actions-runner/.job-heartbeat.meta
    fi

    WORKSPACE_ROOT="$${RUNNER_WORKSPACE:-/opt/actions-runner/_work}"

    if [[ -n "$${GITHUB_WORKSPACE:-}" ]]; then
      echo "[cleanup] Removing GITHUB_WORKSPACE: $GITHUB_WORKSPACE"
      rm -rf "$GITHUB_WORKSPACE"
    else
      echo "[cleanup] GITHUB_WORKSPACE not set; skipping workspace deletion"
    fi

    rm -rf "$WORKSPACE_ROOT/_temp/"
    rm -rf "$WORKSPACE_ROOT/_actions/"
    rm -rf /tmp/npm-* /tmp/pnpm-* /tmp/nx-*
    find "$WORKSPACE_ROOT" -name "git-credentials-*" -delete 2>/dev/null || true

    if [[ -n "$${GITHUB_WORKSPACE:-}" ]]; then
      find "$GITHUB_WORKSPACE" -name ".npmrc" -delete 2>/dev/null || true
    fi

    echo "[cleanup] Post-job cleanup completed at $(date -u)"

    PNPM_STORE="/home/ubuntu/.local/share/pnpm/store"
    CACHE_BUCKET="${local.name_prefix}-runner-cache"
    if [[ -d "$PNPM_STORE" ]]; then
      (
        nohup bash -c \
          "tar czf - \"$PNPM_STORE\" 2>/dev/null \
             | aws s3 cp - \"s3://$CACHE_BUCKET/pnpm-store/latest.tar.gz\" \
           && echo '[cache] pnpm store sync complete' \
           || echo '[cache] pnpm store sync failed'" \
          >> /tmp/cache-sync.log 2>&1 &
        disown
      ) || true
      echo "[cache] pnpm store sync started in background → /tmp/cache-sync.log"
    fi
  EOT

  # Same least-privilege egress as the default pool.
  runner_egress_rules = [
    {
      cidr_blocks      = ["0.0.0.0/0"]
      ipv6_cidr_blocks = ["::/0"]
      prefix_list_ids  = null
      from_port        = 443
      protocol         = "tcp"
      security_groups  = null
      self             = false
      to_port          = 443
      description      = "HTTPS - GitHub API, npm registry, S3, VPC endpoints"
    },
    {
      cidr_blocks      = [local.vpc_cidr_block]
      ipv6_cidr_blocks = []
      prefix_list_ids  = null
      from_port        = 53
      protocol         = "udp"
      security_groups  = null
      self             = false
      to_port          = 53
      description      = "DNS (UDP) - VPC DNS resolver"
    },
    {
      cidr_blocks      = [local.vpc_cidr_block]
      ipv6_cidr_blocks = []
      prefix_list_ids  = null
      from_port        = 53
      protocol         = "tcp"
      security_groups  = null
      self             = false
      to_port          = 53
      description      = "DNS (TCP) - VPC DNS resolver"
    },
    {
      cidr_blocks      = local.public_subnet_cidr_blocks
      ipv6_cidr_blocks = []
      prefix_list_ids  = null
      from_port        = 5432
      protocol         = "tcp"
      security_groups  = null
      self             = false
      to_port          = 5432
      description      = "PostgreSQL - RDS in public subnets (historical placement, migration checks)"
    },
    {
      cidr_blocks      = ["169.254.169.254/32"]
      ipv6_cidr_blocks = []
      prefix_list_ids  = null
      from_port        = 80
      protocol         = "tcp"
      security_groups  = null
      self             = false
      to_port          = 80
      description      = "EC2 instance metadata - spot interruption notices and IMDSv2 token service"
    },
    {
      cidr_blocks      = [local.vpc_cidr_block]
      ipv6_cidr_blocks = []
      prefix_list_ids  = null
      from_port        = 22
      protocol         = "tcp"
      security_groups  = null
      self             = false
      to_port          = 22
      description      = "SSH - in-VPC Packer build instances (rebuild-runner-ami)"
    },
  ]

  # Shared boundary — widened (this PR) to cover both pools' ghr:environment
  # tag values. See the EC2SelfTerminate Sid comment above.
  role_permissions_boundary = aws_iam_policy.runner_permissions_boundary.arn

  depends_on = [
    aws_cloudwatch_log_group.runner_android_cloud_init,
    aws_cloudwatch_log_group.runner_android_syslog,
  ]

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "runner_android_cloud_init" {
  name              = "${local.runner_android_log_group_base}/cloud-init"
  retention_in_days = local.log_retention_days[var.environment]

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "runner_android_syslog" {
  name              = "${local.runner_android_log_group_base}/syslog"
  retention_in_days = local.log_retention_days[var.environment]

  tags = local.common_tags
}

# =============================================================================
# CloudWatch Log Groups for Runner Logs (LS-1667)
# =============================================================================
# Explicit log groups prevent the CloudWatch agent from creating them on first
# boot with "Never expire" retention, which would cause unbounded log growth.
# The agent ships cloud-init (userdata) and syslog to these groups.
# =============================================================================
resource "aws_cloudwatch_log_group" "runner_cloud_init" {
  name              = "${local.runner_log_group_base}/cloud-init"
  retention_in_days = local.log_retention_days[var.environment]

  tags = local.common_tags

  # Note: cross-state depends_on against main/'s aws_vpc_endpoint.logs was removed
  # as part of LS-2425 state separation, and the endpoint itself was removed in
  # LS-8906 (cost optimization). The runtime CloudWatch agent now ships logs
  # through the NAT instance (terraform/main/nat-instance.tf) instead of a
  # dedicated VPC endpoint; this has no bearing on terraform creating the log
  # group itself, which uses the public CloudWatch Logs API.
}

resource "aws_cloudwatch_log_group" "runner_syslog" {
  name              = "${local.runner_log_group_base}/syslog"
  retention_in_days = local.log_retention_days[var.environment]

  tags = local.common_tags
}

# =============================================================================
# Module IAM Permissions Boundary (LS-1653)
# =============================================================================
# Applied to ALL IAM roles created by the github-aws-runners module: EC2 runner
# instances AND Lambda functions (webhook, scale-up, scale-down, syncer).
# Limits the maximum permissions any module-created role can assume, regardless
# of the policies the module attaches.
#
# Threat model: a compromised runner or Lambda cannot escalate beyond these
# actions. The boundary covers:
#   - SSM (Session Manager for EC2, Parameter Store for Lambda config/secrets)
#   - CloudWatch Logs (Lambda execution logs + future runner log shipping)
#   - S3 read (runner binary bucket managed by the module)
#   - SQS + EventBridge (inter-Lambda messaging for scale-up pipeline)
#   - EC2 fleet + describe (scale-up Lambda launches spot instances)
#   - IAM PassRole (scale-up Lambda passes runner profile to EC2, constrained
#     to ec2.amazonaws.com via PassedToService condition)
#   - EC2 self-terminate (ephemeral runners clean up after job completion)
#
# Runners do NOT run AWS CLI commands for deployments — that is handled by the
# GitHub Actions OIDC role (github-actions-oidc.tf).
# =============================================================================
resource "aws_iam_policy" "runner_permissions_boundary" {
  name        = "${local.name_prefix}-runner-permissions-boundary"
  description = "Permissions boundary for all IAM roles created by the github-runners module (EC2 runner instances and Lambda functions). Limits the maximum permissions any module-created role can assume, regardless of attached policies."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # SSM Session Manager — EC2 runner health checks and debugging.
      {
        Sid    = "SSMSessionManager"
        Effect = "Allow"
        Action = [
          "ssm:UpdateInstanceInformation",
          "ssmmessages:CreateControlChannel",
          "ssmmessages:CreateDataChannel",
          "ssmmessages:OpenControlChannel",
          "ssmmessages:OpenDataChannel",
          "ec2messages:AcknowledgeMessage",
          "ec2messages:DeleteMessage",
          "ec2messages:FailMessage",
          "ec2messages:GetEndpoint",
          "ec2messages:GetMessages",
          "ec2messages:SendReply"
        ]
        Resource = "*"
      },
      # SSM Parameter Store — scoped to runner-prefixed parameters.
      # Lambdas read config/secrets; EC2 runners write registration tokens.
      # Two resource paths are required: the module stores app secrets under
      # the github-action-runners/ namespace, while runner tokens and config
      # live under the top-level name_prefix path.
      {
        Sid    = "SSMParameterStore"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath",
          "ssm:PutParameter",
          "ssm:DeleteParameter",
          "ssm:AddTagsToResource",
          "ssm:RemoveTagsFromResource",
          "ssm:ListTagsForResource"
        ]
        Resource = [
          "arn:aws:ssm:${local.region}:${local.account_id}:parameter/${local.name_prefix}-runner*",
          "arn:aws:ssm:${local.region}:${local.account_id}:parameter/github-action-runners/${local.name_prefix}-runner*",
        ]
      },
      # SSM DescribeParameters — does not support resource-level scoping.
      {
        Sid    = "SSMDescribeParameters"
        Effect = "Allow"
        Action = [
          "ssm:DescribeParameters"
        ]
        Resource = "*"
      },
      # CloudWatch Logs — module Lambdas log to /aws/lambda/... paths, not
      # /github-runners/. Must allow both for Lambdas and future runner logs.
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Resource = [
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/github-runners/*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/github-runners/*:*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}-runner-*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}-runner-*:*"
        ]
      },
      # S3 — runner binary bucket (managed by the module).
      # PutObject is required by the runner-binaries-syncer Lambda to upload
      # new runner tarballs; PutObjectTagging is required by the syncer to tag
      # uploaded objects (the module uses tags to track the current version);
      # GetObject/ListBucket are used by EC2 instances and scale-up Lambda to
      # download the binary during provisioning.
      {
        Sid    = "S3RunnerBinaries"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:ListBucket",
          "s3:PutObject",
          "s3:PutObjectTagging"
        ]
        Resource = [
          "arn:aws:s3:::${local.name_prefix}-runner-*",
          "arn:aws:s3:::${local.name_prefix}-runner-*/*"
        ]
      },
      # KMS — SSM SecureString registration tokens are encrypted with the
      # AWS-managed aws/ssm key. When an EC2 instance calls
      # ssm:GetParameter --with-decryption, IAM evaluates the caller's
      # kms:Decrypt against the boundary. Without this grant the boundary
      # blocks the decrypt even though the identity policy allows it, and
      # config.sh silently fails to obtain the GitHub registration token.
      # ViaService condition scopes the grant to SSM-initiated KMS calls only.
      {
        Sid    = "KMSSSMDecrypt"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:ViaService" = "ssm.${local.region}.amazonaws.com"
          }
        }
      },
      # SQS — scale-up Lambda reads from the queued-builds queue, webhook
      # Lambda sends to EventBridge which routes to SQS
      {
        Sid    = "SQS"
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = "arn:aws:sqs:${local.region}:${local.account_id}:${local.name_prefix}-runner-*"
      },
      # EventBridge — webhook Lambda publishes events to the runner event bus
      {
        Sid    = "EventBridge"
        Effect = "Allow"
        Action = [
          "events:PutEvents"
        ]
        Resource = "arn:aws:events:${local.region}:${local.account_id}:event-bus/${local.name_prefix}-runner-*"
      },
      # EC2 fleet — scale-up Lambda launches spot instances
      {
        Sid    = "EC2Fleet"
        Effect = "Allow"
        Action = [
          "ec2:CreateFleet",
          "ec2:RunInstances",
          "ec2:CreateTags",
          "ec2:DeleteTags"
        ]
        Resource = [
          "arn:aws:ec2:${local.region}:${local.account_id}:*",
          "arn:aws:ec2:${local.region}::image/*"
        ]
      },
      # EC2 describe — needed for instance metadata and spot interruption checks
      {
        Sid    = "EC2Describe"
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "ec2:DescribeTags"
        ]
        Resource = "*"
      },
      # IAM PassRole — scale-up Lambda passes the runner instance profile role
      # to EC2 instances it launches. Constrained to ec2.amazonaws.com to
      # prevent passing roles to other services.
      {
        Sid    = "IAMPassRole"
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = "arn:aws:iam::${local.account_id}:role/${local.name_prefix}-runner*"
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "ec2.amazonaws.com"
          }
        }
      },
      # EC2 terminate — used by the scale-down Lambda to reclaim idle runners.
      # Scoped to instances tagged with a runner environment prefix so the Lambda
      # cannot terminate unrelated EC2 instances in the account.
      # LS-8910: this boundary is shared by BOTH the default pool and the
      # Android pool (module "github_runners_android" below also sets
      # role_permissions_boundary = aws_iam_policy.runner_permissions_boundary.arn),
      # so the condition must list both pools' ghr:environment tag values —
      # StringEquals against a list is an OR. Without this, the Android pool's
      # own scale-down Lambda role would have terminate permission granted by
      # its identity policy but DENIED by this boundary (boundary ∩ identity),
      # and Android runners would never scale to zero.
      {
        Sid    = "EC2SelfTerminate"
        Effect = "Allow"
        Action = [
          "ec2:TerminateInstances"
        ]
        Resource = "arn:aws:ec2:${local.region}:${local.account_id}:instance/*"
        Condition = {
          StringEquals = {
            "ec2:ResourceTag/ghr:environment" = local.runner_environments
          }
        }
      }
    ]
  })

  tags = local.common_tags

  # Note: cross-state depends_on against main/'s aws_iam_role_policy.github_actions_additional
  # was removed as part of LS-2425 state separation. The bootstrap race it guarded
  # against is no longer relevant — the policy is stable in production.
}
