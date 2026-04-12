#!/bin/bash
# preToolUse hook: block edit/create operations targeting the main repo
# when worktrees exist. Forces agents to use the worktree path.
#
# Input JSON:  { toolName, toolArgs (stringified JSON with .path) }
# Deny output: { "permissionDecision": "deny", "permissionDecisionReason": "..." }
# Exit 0 with no output = allow.
# Fails open: if jq is missing or input is invalid, allows the operation.
#
# Claude equivalent: .claude/hooks/guard-main-repo.sh

set -euo pipefail

INPUT=$(cat 2>/dev/null || true)

# Fail open if input is empty or jq is not available
if [ -z "$INPUT" ] || ! command -v jq &>/dev/null; then
  exit 0
fi

TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName // empty' 2>/dev/null || true)

# Only guard file-writing tools
case "$TOOL_NAME" in
  edit|create|write) ;;
  *) exit 0 ;;
esac

# toolArgs is a stringified JSON — parse it to extract the file path
TOOL_ARGS=$(echo "$INPUT" | jq -r '.toolArgs // empty' 2>/dev/null || true)
if [ -z "$TOOL_ARGS" ]; then
  exit 0
fi

FILE_PATH=$(echo "$TOOL_ARGS" | jq -r '.path // .file_path // empty' 2>/dev/null || true)
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Normalise to forward slashes for comparison
FILE_PATH=$(echo "$FILE_PATH" | sed 's|\\|/|g')

# Main repo path (normalised)
MAIN_REPO="D:/code/legacy-sports"

# Allow if not in main repo
if [[ "$FILE_PATH" != "$MAIN_REPO"/* ]]; then
  exit 0
fi

# Allow edits to .github/ (Copilot config, hooks, instructions)
if [[ "$FILE_PATH" == "$MAIN_REPO/.github/"* ]]; then
  exit 0
fi

# Allow edits to MCP server source files (development tooling)
if [[ "$FILE_PATH" == "$MAIN_REPO/tools/mcp/"* ]]; then
  exit 0
fi

# Allow edits to workspace file
if [[ "$FILE_PATH" == *"legacy-sports.code-workspace" ]]; then
  exit 0
fi

# Check if any worktrees exist
WORKTREE_COUNT=$(git -C "$MAIN_REPO" worktree list --porcelain 2>/dev/null | grep -c "^worktree " || true)
WORKTREE_COUNT=$((WORKTREE_COUNT - 1))  # Subtract the main repo entry itself

if [ "$WORKTREE_COUNT" -le 0 ]; then
  exit 0  # No worktrees — allow main repo edits
fi

# Deny: file is in main repo and worktrees exist
REASON="Editing files in the main repo ($MAIN_REPO) is blocked while $WORKTREE_COUNT worktree(s) exist. Edit the file in the worktree path instead (D:/code/legacy-sports.worktrees/...)."
jq -n --arg reason "$REASON" '{"permissionDecision":"deny","permissionDecisionReason":$reason}'

exit 0
