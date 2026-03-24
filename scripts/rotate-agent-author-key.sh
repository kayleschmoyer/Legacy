#!/bin/bash
# =============================================================================
# Rotate the Agent Author GitHub App private key
# =============================================================================
# Usage:
#   ./scripts/rotate-agent-author-key.sh /path/to/new-private-key.pem
#
# This updates the AGENT_AUTHOR_APP_PRIVATE_KEY GitHub Actions secret.
# You must ALSO manually update the Claude Code cloud environment variable
# (claude.ai/code → Environment → Settings → AGENT_AUTHOR_APP_PRIVATE_KEY).
#
# Steps:
#   1. Generate a new key: GitHub → Settings → Developer settings →
#      GitHub Apps → legacy-sports-code-bot → Generate a new private key
#   2. Run this script with the downloaded .pem file
#   3. Update Claude Code cloud env var (paste the \n-escaped PEM)
#   4. Delete the old key from the GitHub App settings
# =============================================================================

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <path-to-new-private-key.pem>"
  exit 1
fi

PEM_FILE="$1"

if [ ! -f "$PEM_FILE" ]; then
  echo "ERROR: File not found: $PEM_FILE"
  exit 1
fi

if ! openssl pkey -in "$PEM_FILE" -noout 2>/dev/null; then
  echo "ERROR: $PEM_FILE is not a valid PEM private key (openssl validation failed)"
  exit 1
fi

# Ensure PEM is deleted on any exit (including early failures)
trap 'rm -f "$PEM_FILE"' EXIT

echo "Updating GitHub Actions secret: AGENT_AUTHOR_APP_PRIVATE_KEY"
gh secret set AGENT_AUTHOR_APP_PRIVATE_KEY < "$PEM_FILE"
echo "GitHub secret updated."

# LS-1670: Also base64-encode and set the Terraform runner secret
echo "Updating GitHub Actions secret: RUNNER_GITHUB_APP_KEY_BASE64"
base64 < "$PEM_FILE" | tr -d '\n' | gh secret set RUNNER_GITHUB_APP_KEY_BASE64
echo "Terraform runner secret updated."

# Optionally write the \n-escaped PEM to a temp file for easy copy-paste
read -r -p "Write escaped PEM to a temp file for copy-paste? [y/N] " write_env
if [[ ! "$write_env" =~ ^[Yy]$ ]]; then
  echo ""
  echo "=== Manual step required ==="
  echo "Update the Claude Code cloud environment variable:"
  echo "  1. Go to claude.ai/code → Environment → Settings"
  echo "  2. Set AGENT_AUTHOR_APP_PRIVATE_KEY to the \\n-escaped PEM contents"
  echo "  3. Delete the old key from GitHub App settings:"
  echo "     GitHub → Settings → Developer settings → GitHub Apps → legacy-sports-code-bot"
  echo ""
  echo "🗑️  Deleting local PEM file: $PEM_FILE"
  rm -f "$PEM_FILE"
  echo "✅ PEM file deleted. The key now exists only in GitHub Secrets."
  exit 0
fi

ENV_FILE=$(mktemp --suffix=.env)
# Resolve to Windows path if running in Git Bash / MSYS2
if command -v cygpath &>/dev/null; then
  ENV_FILE=$(cygpath -w "$ENV_FILE")
fi
printf 'AGENT_AUTHOR_APP_PRIVATE_KEY=' > "$ENV_FILE"
awk 'NR>1{printf "\\n"}{printf "%s", $0}' "$PEM_FILE" >> "$ENV_FILE"
echo "" >> "$ENV_FILE"

echo ""
echo "=== Manual step required ==="
echo "Update the Claude Code cloud environment variable:"
echo "  1. Go to claude.ai/code → Environment → Settings"
echo "  2. Copy the contents of: $ENV_FILE"
echo "  3. Paste as the AGENT_AUTHOR_APP_PRIVATE_KEY env var value"
echo "  4. Delete the old key from GitHub App settings:"
echo "     GitHub → Settings → Developer settings → GitHub Apps → legacy-sports-code-bot"
echo ""
echo "The env file will be cleaned up on next reboot, or delete manually:"
echo "  rm $ENV_FILE"

# LS-1670: Delete the original PEM file to prevent credential leakage
echo ""
echo "🗑️  Deleting local PEM file: $PEM_FILE"
rm -f "$PEM_FILE"
echo "✅ PEM file deleted. The key now exists only in GitHub Secrets."
