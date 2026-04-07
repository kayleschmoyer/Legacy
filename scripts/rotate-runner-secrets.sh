#!/usr/bin/env bash
# rotate-runner-secrets.sh
#
# Rotates the GitHub App credentials used by the self-hosted runner fleet.
#
# WHAT THIS SCRIPT AUTOMATES:
#   - Generates a new cryptographically random webhook secret
#   - Updates the SSM Parameter Store value that the github-aws-runners module reads
#   - Guides you through the private key rotation (requires GitHub App admin page)
#
# WHAT REQUIRES MANUAL STEPS:
#   - Updating the GitHub App webhook secret on GitHub (requires App admin access)
#   - Generating and uploading a new GitHub App private key (GitHub UI only)
#
# Prerequisites: aws CLI (authenticated)
# Usage: bash scripts/rotate-runner-secrets.sh [--dry-run]
#
# After running:
#   1. Complete the manual steps printed below
#   2. Update terraform/runners/secrets.auto.tfvars with the new values
#   3. Run: terraform -chdir=terraform/runners apply

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "[dry-run] No AWS or GitHub changes will be made."
fi

# ── Detect prefix from terraform config ──────────────────────────────────────

RUNNERS_TF="$(dirname "$0")/../terraform/runners/github-runners.tf"
if [[ ! -f "$RUNNERS_TF" ]]; then
  echo "ERROR: terraform/runners/github-runners.tf not found. Run from repo root or adjust path." >&2
  exit 1
fi

# Extract project_name and environment from variables.tf defaults, fall back to
# env vars TF_VAR_project_name / TF_VAR_environment if set.
PROJECT_NAME="${TF_VAR_project_name:-$(sed -n '/variable "project_name"/,/^}/{/default/{s/.*default[^"]*"\([^"]*\)".*/\1/p}}' "$(dirname "$0")/../terraform/main/variables.tf" | head -n1)}"
ENVIRONMENT="${TF_VAR_environment:-${ENVIRONMENT:-prod}}"
PREFIX="${PROJECT_NAME}-${ENVIRONMENT}-runner"

echo "Detected runner prefix: ${PREFIX}"
echo "SSM parameter path:     github-action-runners/${PREFIX}/"
echo ""

# ── Locate SSM parameters ─────────────────────────────────────────────────────

SSM_PATH="github-action-runners/${PREFIX}"

echo "Searching for runner SSM parameters..."
SSM_PARAMS=$(aws ssm get-parameters-by-path \
  --path "/${SSM_PATH}" \
  --with-decryption \
  --query "Parameters[*].Name" \
  --output text 2>/dev/null || echo "")

if [[ -z "$SSM_PARAMS" ]]; then
  echo "WARNING: No SSM parameters found under /${SSM_PATH}"
  echo "         Either runners are not deployed or the path differs."
  echo "         Set TF_VAR_environment=<env> to target a specific environment."
  echo ""
fi

# Find the webhook secret parameter specifically
WEBHOOK_PARAM=$(aws ssm describe-parameters \
  --parameter-filters "Key=Path,Values=/${SSM_PATH}" \
  --query "Parameters[?contains(Name, 'webhook')].Name | [0]" \
  --output text 2>/dev/null || echo "None")

if [[ "$WEBHOOK_PARAM" == "None" || -z "$WEBHOOK_PARAM" ]]; then
  echo "WARNING: Could not auto-detect webhook secret SSM parameter."
  echo "         Checking common parameter name patterns..."
  for CANDIDATE in \
    "/${SSM_PATH}/github_app_webhook_secret" \
    "/${SSM_PATH}/webhook_secret" \
    "/${SSM_PATH}/github-app-webhook-secret"; do
    if aws ssm get-parameter --name "$CANDIDATE" --query "Parameter.Name" --output text &>/dev/null; then
      WEBHOOK_PARAM="$CANDIDATE"
      echo "  Found: ${WEBHOOK_PARAM}"
      break
    fi
  done
fi

if [[ "$WEBHOOK_PARAM" == "None" || -z "$WEBHOOK_PARAM" ]]; then
  echo "ERROR: Could not locate the webhook secret SSM parameter." >&2
  echo "       Run: aws ssm get-parameters-by-path --path /${SSM_PATH} --query 'Parameters[*].Name'" >&2
  exit 1
fi

echo ""
echo "Webhook secret parameter: ${WEBHOOK_PARAM}"
echo ""

# ── Generate new webhook secret ──────────────────────────────────────────────

NEW_WEBHOOK_SECRET=$(openssl rand -hex 32)
echo "Generated new webhook secret (32 bytes, hex-encoded)"

# ── Update SSM ───────────────────────────────────────────────────────────────

echo ""
if [[ "$DRY_RUN" == "true" ]]; then
  echo "[dry-run] Would update SSM parameter: ${WEBHOOK_PARAM}"
else
  echo "Updating SSM parameter: ${WEBHOOK_PARAM}"
  aws ssm put-parameter \
    --name "$WEBHOOK_PARAM" \
    --value "$NEW_WEBHOOK_SECRET" \
    --type "SecureString" \
    --overwrite \
    --no-cli-pager
  echo "SSM parameter updated."
fi

# ── Manual steps ─────────────────────────────────────────────────────────────

APP_ID=$(grep -m1 'github_app_id' "$(dirname "$0")/../terraform/runners/secrets.auto.tfvars" 2>/dev/null \
  | grep -oP '(?<=")[^"]+(?=")' || echo "<your-app-id>")

echo ""
echo "════════════════════════════════════════════════════════════════"
echo " MANUAL STEPS REQUIRED"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "1. UPDATE WEBHOOK SECRET ON GITHUB APP"
echo "   Open: https://github.com/settings/apps/${APP_ID}"
echo "   → Webhook section → set Webhook secret to:"
echo ""
echo "   ${NEW_WEBHOOK_SECRET}"
echo ""
echo "   (This must match the SSM value just written)"
echo ""
echo "2. ROTATE PRIVATE KEY"
echo "   On the same GitHub App settings page:"
echo "   → Private keys section → Generate a new private key"
echo "   → Download the .pem file"
echo "   → Convert to base64: base64 < downloaded.pem | tr -d '\n'"
echo "   → Update terraform/runners/secrets.auto.tfvars:"
echo "       github_app_key_base64 = \"<new-base64-value>\""
echo "   → Delete the old private key from the GitHub App page"
echo "   → Delete the downloaded .pem file"
echo ""
echo "3. APPLY TERRAFORM"
echo "   terraform -chdir=terraform/runners apply"
echo "   (This pushes the new key_base64 value to SSM)"
echo ""
echo "════════════════════════════════════════════════════════════════"
