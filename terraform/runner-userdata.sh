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
