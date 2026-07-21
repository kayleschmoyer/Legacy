#!/usr/bin/env bash
set -uo pipefail
# scripts/link-pr-session.sh <PR#> — stamp the current agent session onto a PR (LS-8570)
#
# Appends one marker line to the PR body via `gh pr edit --body-file`:
#
#   <!-- agent-session: <CLAUDE_CODE_SESSION_ID> (<YYYY-MM-DD>) -->
#
# Run it whenever a session picks up an existing PR it did not create
# (drive-pr Step 4, fix-pr, respond-to-review). Two effects:
#  - The `gh pr edit` is a harness-visible PR interaction, which is what
#    Claude Code Desktop parses to link a session to a PR on a branch other
#    than the session's own — restoring the PR status bar and native event
#    routing for pickup sessions. MCP connector calls never establish this
#    linkage (the harness cannot see them).
#  - The marker itself is durable provenance: one line per agent session that
#    worked the PR, accumulating in the body across the PR's life.
#
# Idempotent per session: re-running for a session already stamped is a no-op.
# Marker format is documented in .agents/skills/pr-lifecycle/SKILL.md — keep
# the two in sync.

PR_NUMBER="${1:?usage: link-pr-session.sh <PR#>}"
if ! [[ "$PR_NUMBER" =~ ^[0-9]+$ ]]; then
  echo "link-pr-session: PR number must be a positive integer (got: ${PR_NUMBER})" >&2
  exit 1
fi

SESSION_ID="${CLAUDE_CODE_SESSION_ID:-}"
if [ -z "$SESSION_ID" ]; then
  echo "link-pr-session: CLAUDE_CODE_SESSION_ID is not set — not running inside a Claude Code session; nothing to stamp" >&2
  exit 1
fi

command -v gh >/dev/null 2>&1 || {
  echo "link-pr-session: gh CLI not available — cannot stamp PR #${PR_NUMBER}; desktop linkage will not be established" >&2
  exit 1
}

BODY_FILE=$(mktemp "${TMPDIR:-/tmp}/link-pr-session-${PR_NUMBER}.XXXXXX") || exit 1
trap 'rm -f "$BODY_FILE"' EXIT

if ! gh pr view "$PR_NUMBER" --json body -q .body > "$BODY_FILE"; then
  echo "link-pr-session: failed to read PR #${PR_NUMBER} body (gh pr view) — check PR number and gh auth" >&2
  exit 1
fi

if grep -q "agent-session: ${SESSION_ID}" "$BODY_FILE"; then
  echo "link-pr-session: PR #${PR_NUMBER} already stamped for session ${SESSION_ID} — no-op"
  exit 0
fi

printf '\n<!-- agent-session: %s (%s) -->\n' "$SESSION_ID" "$(date -u +%Y-%m-%d)" >> "$BODY_FILE"

if ! gh pr edit "$PR_NUMBER" --body-file "$BODY_FILE" >/dev/null; then
  echo "link-pr-session: failed to update PR #${PR_NUMBER} body (gh pr edit) — marker not applied" >&2
  exit 1
fi

echo "link-pr-session: stamped PR #${PR_NUMBER} with session ${SESSION_ID}"
