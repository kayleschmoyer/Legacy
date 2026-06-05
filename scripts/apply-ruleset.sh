#!/usr/bin/env bash
# apply-ruleset.sh — Idempotently apply the branch protection ruleset to the repository.
#
# Usage (Windows PowerShell: prefix with `bash`, no `.\` — `.\scripts\apply-ruleset.sh`
# makes Windows open the file by association instead of executing it):
#   bash scripts/apply-ruleset.sh             # apply ruleset
#   DRYRUN=1 bash scripts/apply-ruleset.sh    # dry-run: show what would be sent without applying
#
# Requires: gh CLI authenticated with admin permissions on the repository.
#
# WHY THIS EXISTS / WHEN TO RUN IT
#   The live "Protect Main" ruleset can drift from this committed config (e.g. a
#   GitHub-UI edit re-adds `integration_id` on the CI Pipeline required checks —
#   the LS-4345/LS-4925 regression). When that happens, PRs with fully-green
#   checks fail to merge with a 405 "N of 8 required status checks are expected",
#   because GitHub's merge-time evaluator can't match integration-bound contexts.
#   Re-running this script re-syncs the live ruleset to `.github/ruleset.json`
#   (which has no integration_id) and clears the condition for NEW PRs. Already-
#   stuck PRs additionally need a fresh check event (add the `ci:run` label) to
#   bust GitHub's cached per-commit merge verdict. Full runbook:
#   docs/ci-cd/ci-troubleshooting-guide.md → "Merge blocked: N of 8 ... expected".
#
# IDEMPOTENCY (safe to run repeatedly / on a schedule)
#   - Matches the ruleset by name ("Protect Main") and PUTs in place — never
#     creates a duplicate; the ruleset id (1524440) is stable across re-applies.
#   - `.github/ruleset.json` has no `_staged` rules, so the staged-merge below
#     appends nothing and cannot accumulate rules on repeat runs.
#   - Payload generation is deterministic; once the live ruleset matches the
#     committed config, a re-apply is a no-op.

set -euo pipefail

# On Windows, winget installs tools into a Links directory that Git Bash does not
# include in PATH by default. Prepend it so jq is discoverable without a manual
# PATH export. $LOCALAPPDATA is a Windows-style path; cygpath converts it for bash.
if ! command -v jq &>/dev/null && command -v cygpath &>/dev/null && [[ -n "${LOCALAPPDATA:-}" ]]; then
  _winget_links="$(cygpath -u "$LOCALAPPDATA")/Microsoft/WinGet/Links"
  [[ -d "$_winget_links" ]] && export PATH="$_winget_links:$PATH"
fi

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
RULESET_NAME="Protect Main"

if [[ ! -f "$RULESET_FILE" ]]; then
  echo "ERROR: Ruleset file not found: $RULESET_FILE" >&2
  exit 1
fi

# Strip UTF-8 BOM (if present) before piping to jq, then:
# - Filter out rules marked _staged:true — these contain checks not yet active in CI
#   and must not be applied prematurely.
# - Remove $schema (not accepted by API)
# - Strip internal metadata keys: _comment, _staged, _commitStatus, _calledWorkflow
# - Strip null integration_id entries
payload=$(sed '1s/^\xEF\xBB\xBF//' "$RULESET_FILE" | jq '
  .rules |= map(select(._staged != true))
  | del(."$schema")
  | walk(if type == "object" then del(._comment) | del(._staged) | del(._commitStatus) | del(._calledWorkflow) | (if .integration_id == null then del(.integration_id) else . end) else . end)
')

echo "==> Looking for existing ruleset named '$RULESET_NAME'..."
existing_id=$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$RULESET_NAME\") | .id" || true)

if [[ "${DRYRUN:-}" == "1" ]]; then
  echo "==> DRY RUN — payload that would be sent:"
  echo "$payload" | jq .
  if [[ -n "$existing_id" ]]; then
    echo "==> Would UPDATE existing ruleset (id: $existing_id) — staged rules from live state would be preserved"
  else
    echo "==> Would CREATE new ruleset"
  fi
  exit 0
fi

if [[ -n "$existing_id" ]]; then
  echo "==> Fetching live state of ruleset (id: $existing_id)..."
  live=$(gh api "repos/$REPO/rulesets/$existing_id")

  # Determine which rule types appear ONLY in staged rules (not in any active rule).
  # Types that have both a staged and an active entry are fully managed by the config
  # payload and must not be re-appended from the live state (prevents duplicates on
  # idempotent re-runs). Fall back to '[]' so --argjson never receives an empty string.
  staged_types=$(sed '1s/^\xEF\xBB\xBF//' "$RULESET_FILE" | jq -c '
    (.rules // []) as $rules |
    ([$rules[] | select(._staged == true) | .type] | unique) as $staged |
    ([$rules[] | select(._staged != true) | .type] | unique) as $active |
    ($staged - $active)
  ' 2>/dev/null || echo '[]')

  # Merge: use config metadata + config (non-staged) rules, then append any live
  # rules whose type was staged in the config (so they are preserved, not deleted).
  # Use any(. == $t) for membership — avoids type errors if staged_types is empty.
  merged=$(echo "$payload" | jq \
    --argjson live "$live" \
    --argjson staged_types "$staged_types" '
    . as $config |
    ($live.rules | map(select(.type as $t | ($staged_types | map(. == $t) | any)))) as $live_staged |
    $config | .rules = ($config.rules + $live_staged)
  ')

  echo "==> Updating existing ruleset (id: $existing_id)..."
  echo "$merged" | gh api "repos/$REPO/rulesets/$existing_id" \
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
