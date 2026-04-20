#!/usr/bin/env bash
# setup-jira-webhook.sh — One-time setup for the Jira → GitHub webhook bridge.
#
# Prerequisites:
#   1. PR merged + `terraform apply` completed (creates the Secrets Manager
#      secret for jira_webhook_secret; the Review Bot app key is synced
#      automatically by the lambda-terraform-apply workflow from the
#      REVIEW_BOT_APP_PRIVATE_KEY GitHub Actions secret)
#   2. AWS SSO authenticated: aws sso login --profile default
#
# Usage:
#   bash scripts/setup-jira-webhook.sh [prod|staging|dev]
#
# ─────────────────────────────────────────────────────────────────────────────
# NOTE: Review Bot app key (agent_author_app_private_key in Secrets Manager)
# is populated automatically by the lambda-terraform-apply GitHub Actions
# workflow from the REVIEW_BOT_APP_PRIVATE_KEY repository secret.
# You do NOT need to handle it here unless running a one-off manual setup
# outside of GitHub Actions (e.g. a local dry-run or a new environment that
# hasn't been through CI yet).
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ENVIRONMENT="${1:-prod}"
REGION="us-east-1"
PROJECT="legacy-sports"
NAME_PREFIX="${PROJECT}-${ENVIRONMENT}"

echo "==> Setting up Jira webhook bridge for environment: $ENVIRONMENT"
echo ""

# ── Validate inputs ───────────────────────────────────────────────────────────

# Sanity-check AWS auth
if ! aws sts get-caller-identity --region "$REGION" > /dev/null 2>&1; then
  echo "ERROR: AWS credentials not configured. Run: aws sso login --profile default"
  exit 1
fi

# ── Look up secret names (dynamic suffix from Terraform name_prefix) ──────────
# SSM is preferred: Terraform stores the exact name in a known parameter path so
# we do not need secretsmanager:ListSecrets (a *-resource action). Falls back to
# list-secrets for environments where the SSM parameter hasn't been created yet.

echo "==> Looking up Secrets Manager secret names..."

SSM_EXIT=0
SSM_OUTPUT=$(aws ssm get-parameter \
  --region "$REGION" \
  --name "/legacy-sports/${ENVIRONMENT}/lambda/github-webhook/jira-webhook-secret-name" \
  --query "Parameter.Value" \
  --output text 2>&1) || SSM_EXIT=$?

if [[ $SSM_EXIT -eq 0 ]]; then
  JIRA_SECRET_NAME="$SSM_OUTPUT"
elif echo "$SSM_OUTPUT" | grep -q "ParameterNotFound"; then
  echo "  SSM param not yet created — falling back to secretsmanager:ListSecrets..."
  JIRA_SECRET_NAME=$(aws secretsmanager list-secrets \
    --region "$REGION" \
    --filter Key=name,Values="${NAME_PREFIX}-jira-webhook-secret-" \
    --query "reverse(sort_by(SecretList, &CreatedDate))[0].Name" \
    --output text 2>/dev/null) || JIRA_SECRET_NAME=""
else
  echo "ERROR: SSM lookup failed (exit $SSM_EXIT): $SSM_OUTPUT"
  exit 1
fi

if [[ "$JIRA_SECRET_NAME" == "None" || -z "$JIRA_SECRET_NAME" ]]; then
  echo "ERROR: Could not find ${NAME_PREFIX}-jira-webhook-secret-* in Secrets Manager."
  echo "  Ensure terraform apply has run after merging this PR."
  exit 1
fi

echo "  Jira secret: $JIRA_SECRET_NAME"
echo ""

# ── Generate and store the Jira webhook secret ────────────────────────────────

echo "==> Generating Jira webhook secret..."
JIRA_WEBHOOK_SECRET=$(openssl rand -hex 32)

aws secretsmanager put-secret-value \
  --region "$REGION" \
  --secret-id "$JIRA_SECRET_NAME" \
  --secret-string "$JIRA_WEBHOOK_SECRET"

echo "  Stored in Secrets Manager: $JIRA_SECRET_NAME"
echo ""

# ── Derive the webhook endpoint URL from the environment ─────────────────────
# Matches the Terraform local: api_base_url_custom = "https://api.${var.domain_name}"
# Try terraform output first (most accurate); fall back to known domain pattern.

WEBHOOK_URL=""

# Attempt to read from Terraform output if terraform is available and initialised
TF_DIR="$(cd "$(dirname "$0")/.." && pwd)/terraform/main"
if command -v terraform &> /dev/null && [[ -d "$TF_DIR/.terraform" ]]; then
  TF_URL=$(terraform -chdir="$TF_DIR" output -raw jira_webhook_url 2>/dev/null || true)
  if [[ -n "$TF_URL" ]]; then
    WEBHOOK_URL="$TF_URL"
    echo "==> Webhook URL from Terraform output: $WEBHOOK_URL"
  fi
fi

if [[ -z "$WEBHOOK_URL" ]]; then
  case "$ENVIRONMENT" in
    prod)    WEBHOOK_URL="https://api.legacy-fantasy.com/github-webhook/jira" ;;
    staging) WEBHOOK_URL="https://api.staging.legacy-fantasy.com/github-webhook/jira" ;;
    dev)     WEBHOOK_URL="https://api.dev.legacy-fantasy.com/github-webhook/jira" ;;
    *)
      echo "ERROR: Unsupported environment '$ENVIRONMENT'. Expected: prod, staging, dev."
      exit 1
      ;;
  esac
  echo "==> Webhook URL (derived from environment): $WEBHOOK_URL"
fi
echo ""

# ── Compute test HMAC for the smoke-test curl command ────────────────────────

TEST_BODY='{"webhookEvent":"jira:issue_updated","issue":{"key":"LS-1234"},"changelog":{"items":[{"field":"status","fromString":"To Do","toString":"In Progress"}]}}'
TEST_SIG="sha256=$(printf '%s' "$TEST_BODY" | openssl dgst -sha256 -hmac "$JIRA_WEBHOOK_SECRET" | awk '{print $2}')"

# ── Print Jira webhook configuration ─────────────────────────────────────────

cat <<INSTRUCTIONS

═══════════════════════════════════════════════════════════════
  ✅ AWS secrets stored. Now configure the Jira system webhook:
═══════════════════════════════════════════════════════════════

  1. Open Jira admin:
       https://<your-workspace>.atlassian.net/plugins/servlet/webhooks

  2. Click "Create a WebHook"

  3. Fill in the form:
       Name:   GitHub Status Audit
       Status: Enabled
       URL:    ${WEBHOOK_URL}

  4. In the "Secret" field, paste:
       ${JIRA_WEBHOOK_SECRET}
     (Jira signs each request body with HMAC-SHA256 using this secret and
      sends the digest in the X-Hub-Signature header — no custom headers needed)

  5. Under "Issue" events, check only:
       ✅ Issue: updated

  6. Under JQL (optional, recommended to reduce noise):
       project = LS AND issuetype != Epic

  7. Click "Create"

═══════════════════════════════════════════════════════════════
  🧪 To test the webhook manually:
═══════════════════════════════════════════════════════════════

  curl -X POST ${WEBHOOK_URL} \\
    -H "Content-Type: application/json" \\
    -H "X-Hub-Signature: ${TEST_SIG}" \\
    -d '${TEST_BODY}'

  Expected response: {"status":"ok","result":"Dispatched jira-issue-updated for LS-1234 (To Do → In Progress)"}
  Then check Actions tab: https://github.com/bkrupa/legacy-sports/actions/workflows/jira-status-audit.yml

INSTRUCTIONS

echo "==> Setup complete."
