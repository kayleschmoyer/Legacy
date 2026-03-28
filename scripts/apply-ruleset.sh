#!/usr/bin/env bash
# apply-ruleset.sh — Idempotently apply the branch protection ruleset to the repository.
#
# Usage:
#   ./scripts/apply-ruleset.sh                # apply ruleset
#   DRYRUN=1 ./scripts/apply-ruleset.sh       # dry-run: show what would be sent without applying
#
# Requires: gh CLI authenticated with admin permissions on the repository.

set -euo pipefail

# --- Dependency checks ---
for cmd in jq gh; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' is required but not found in PATH." >&2
    exit 1
  fi
done

if ! gh auth status &>/dev/null; then
  echo "ERROR: 'gh' is not authenticated. Run 'gh auth login' first." >&2
  exit 1
fi

# --- Repository resolution ---
if [[ -z "${REPO:-}" ]]; then
  if REPO_FROM_GH=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null); then
    REPO="$REPO_FROM_GH"
  else
    echo "ERROR: REPO is not set and could not be determined via 'gh repo view'." >&2
    exit 1
  fi
fi
RULESET_FILE="${RULESET_FILE:-.github/ruleset.json}"
RULESET_NAME="main-branch-protection"

if [[ ! -f "$RULESET_FILE" ]]; then
  echo "ERROR: Ruleset file not found: $RULESET_FILE" >&2
  exit 1
fi

# Strip _comment keys — the GitHub API does not accept them.
payload=$(jq 'del(."$schema") | walk(if type == "object" then del(._comment) | (if .integration_id == null then del(.integration_id) else . end) else . end)' "$RULESET_FILE")

echo "==> Looking for existing ruleset named '$RULESET_NAME'..."
existing_id=$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$RULESET_NAME\") | .id" || true)

if [[ "${DRYRUN:-}" == "1" ]]; then
  echo "==> DRY RUN — payload that would be sent:"
  echo "$payload" | jq .
  if [[ -n "$existing_id" ]]; then
    echo "==> Would UPDATE existing ruleset (id: $existing_id)"
  else
    echo "==> Would CREATE new ruleset"
  fi
  exit 0
fi

if [[ -n "$existing_id" ]]; then
  echo "==> Updating existing ruleset (id: $existing_id)..."
  echo "$payload" | gh api "repos/$REPO/rulesets/$existing_id" \
    --method PUT \
    --input - \
    --silent
  echo "==> Ruleset updated successfully."
else
  echo "==> Creating new ruleset..."
  echo "$payload" | gh api "repos/$REPO/rulesets" \
    --method POST \
    --input - \
    --silent
  echo "==> Ruleset created successfully."
fi

echo "==> Done. Verify at: https://github.com/$REPO/settings/rules"
