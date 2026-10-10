#!/bin/bash -e

exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

set +x

%{ if enable_debug_logging }
set -x
%{ endif }

${pre_install}

# Ubuntu-based AMI — use apt instead of dnf
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq jq git curl

# ── Spot interruption handler ───────────────────────────────────────────────
# EC2 spot gives a 2-minute warning via the instance metadata endpoint before
# termination. This background loop polls for the warning, then stops the
# runner with SIGTERM.
#
# SIGTERM on Runner.Listener does NOT drain: it cancels the running job within
# seconds ("The runner has received a shutdown signal" → "The operation was
# canceled." ~12s later, mid-step). LS-11030: an e2e shard was cancelled that
# way while its last tests were in flight, with nearly the full 2-minute
# warning still unused, and had to be re-run from scratch (+22 min).
#
# So the SIGTERM waits while a job is still running (Runner.Worker alive),
# until the job finishes or the deadline (`time` from the notice minus
# SPOT_CANCEL_MARGIN seconds), whichever comes first. The margin leaves the
# runner time to report the cancellation before the instance goes away. A job
# lost with no report would sit until GitHub's lost-runner timeout instead.
# With no job running, the SIGTERM is sent at once, as before. Keep the
# "Spot interruption notice" text: the aws-server death-verdict tool matches it
# in syslog.
# Placed after apt-get install to guarantee curl and jq are available.
(
  SPOT_CANCEL_MARGIN=35
  while true; do
    if notice=$(curl -sf -H "X-aws-ec2-metadata-token: $(curl -sf -X PUT 'http://169.254.169.254/latest/api/token' -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600')" \
       http://169.254.169.254/latest/meta-data/spot/instance-action 2>/dev/null); then
      echo "[spot-handler] Spot interruption notice received: $notice"
      now=$(date +%s)
      action_at=$(date -d "$(echo "$notice" | jq -r '.time // empty' 2>/dev/null)" +%s 2>/dev/null || echo 0)
      # Unparseable or past time: assume the documented 2-minute warning.
      if [ "$action_at" -le "$now" ]; then
        action_at=$((now + 120))
      fi
      deadline=$((action_at - SPOT_CANCEL_MARGIN))
      while pgrep -f Runner.Worker >/dev/null && [ "$(date +%s)" -lt "$deadline" ]; do
        sleep 1
      done
      if pgrep -f Runner.Worker >/dev/null; then
        echo "[spot-handler] Job still running $SPOT_CANCEL_MARGIN s before interruption — sending SIGTERM to runner (job will be cancelled)"
      else
        echo "[spot-handler] No job running — sending SIGTERM to runner"
      fi
      pkill -SIGTERM -f Runner.Listener || true
      break
    fi
    sleep 5
  done
) &

user_name=ubuntu

${install_runner}

${post_install}

# Register runner job hooks
%{ if hook_job_started != "" }
cat > /opt/actions-runner/hook_job_started.sh <<'EOF'
${hook_job_started}
EOF
chmod +x /opt/actions-runner/hook_job_started.sh
echo ACTIONS_RUNNER_HOOK_JOB_STARTED=/opt/actions-runner/hook_job_started.sh | tee -a /opt/actions-runner/.env
%{ endif }

%{ if hook_job_completed != "" }
cat > /opt/actions-runner/hook_job_completed.sh <<'EOF'
${hook_job_completed}
EOF
chmod +x /opt/actions-runner/hook_job_completed.sh
echo ACTIONS_RUNNER_HOOK_JOB_COMPLETED=/opt/actions-runner/hook_job_completed.sh | tee -a /opt/actions-runner/.env
%{ endif }

${start_runner}
