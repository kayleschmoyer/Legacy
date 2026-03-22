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
# termination. This background loop polls for the warning and sends SIGTERM
# to the runner process, letting it finish the current step and drain
# gracefully instead of being killed mid-upload (e.g., during cache save).
# Placed after apt-get install to guarantee curl is available.
(
  while true; do
    if curl -sf -H "X-aws-ec2-metadata-token: $(curl -sf -X PUT 'http://169.254.169.254/latest/api/token' -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600')" \
       http://169.254.169.254/latest/meta-data/spot/instance-action >/dev/null 2>&1; then
      echo "[spot-handler] Spot interruption notice received — sending SIGTERM to runner"
      # Find the Runner.Listener process and signal it to drain
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
