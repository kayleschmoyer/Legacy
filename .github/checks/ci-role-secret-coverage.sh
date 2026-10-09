#!/usr/bin/env bash
set -euo pipefail

# CI deploy role must be able to manage every fixed-name secret Terraform owns.
#
# Secrets named "${local.name_prefix}-..." are covered by one wildcard on the
# github-actions deploy role. Secrets named "${var.environment}/<name>" are
# not: each needs its own ARN in a Secrets Manager write statement in
# terraform/main/github-actions-oidc.tf. Forgetting one is invisible to
# `terraform plan` and only fails `terraform apply` on main, after merge, with
# AccessDeniedException on CreateSecret. That blocks Apply Lambda
# Infrastructure (and every deploy behind it) until someone adds the grant.
# It happened with ${var.environment}/discord-mcp-bot-token (#8457).
#
# This check lists every aws_secretsmanager_secret whose name starts with
# "${var.environment}/" and fails unless github-actions-oidc.tf grants
# "secret:${var.environment}/<name>*".

TF_DIR="terraform/main"
POLICY_FILE="$TF_DIR/github-actions-oidc.tf"

echo "Checking the CI deploy role covers every \${var.environment}/ secret..."

if [ ! -f "$POLICY_FILE" ]; then
  echo "::error::$POLICY_FILE not found; cannot verify secret coverage."
  exit 1
fi

# Names of aws_secretsmanager_secret resources with a "${var.environment}/..."
# name. Only the first `name =` inside each such resource block counts.
names=$(awk '
  /^resource "aws_secretsmanager_secret" / { in_secret = 1; next }
  in_secret && /^}/ { in_secret = 0; next }
  in_secret && /^[[:space:]]*name[[:space:]]*=/ {
    if (match($0, /"\$\{var\.environment\}\/[^"]+"/)) {
      n = substr($0, RSTART + 20, RLENGTH - 21)
      print n
    }
    in_secret = 0
  }
' "$TF_DIR"/*.tf | sort -u)

if [ -z "$names" ]; then
  echo "::error::Found no \${var.environment}/ secrets in $TF_DIR; the parser is probably out of date."
  exit 1
fi

missing=()
while IFS= read -r name; do
  if ! grep -qF "secret:\${var.environment}/${name}*" "$POLICY_FILE"; then
    missing+=("$name")
  fi
done <<< "$names"

if [ ${#missing[@]} -gt 0 ]; then
  for name in "${missing[@]}"; do
    echo "::error file=$POLICY_FILE::No Secrets Manager write grant for \${var.environment}/${name}. Add \"arn:aws:secretsmanager:\${local.region}:\${local.account_id}:secret:\${var.environment}/${name}*\" to a secretsmanager:CreateSecret statement, or terraform apply will fail on main."
  done
  exit 1
fi

echo "All $(wc -l <<< "$names" | tr -d ' ') \${var.environment}/ secrets are covered."
