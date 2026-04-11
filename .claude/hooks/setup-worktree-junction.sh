#!/bin/bash
# SessionStart hook: validate and recreate the node_modules junction for
# ephemeral worktrees (.claude/worktrees/<name>/).
#
# Responsibilities:
#   1. Validate the junction: check that .bin is non-empty (empty .bin is the
#      most common symptom of a stale or broken junction on Windows/pnpm).
#   2. If missing or invalid, recreate via cmd mklink /J (preferred) or
#      PowerShell New-Item -ItemType Junction as fallback.
#
# Windows notes:
#   - Runs in git-bash (ships with Git for Windows); cygpath is available.
#   - `cmd //c` is required — git-bash interprets a single /c as a path.
#   - Path conversion: cygpath -w is the primary method; the sed fallback
#     uses the repo-specific /d/ prefix that matches this machine's layout.
#   - The Stop hook (cleanup-worktree-junction.sh) removes the junction
#     when the session ends cleanly.

# Prefer CLAUDE_PROJECT_DIR over pwd — Claude Code may invoke hooks with the
# main repo as the process cwd even for worktree sessions, while CLAUDE_PROJECT_DIR
# is the stable per-session project root (set to the worktree path by the launcher).
WORKTREE="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Diagnostic: opt-in logging gated on CLAUDE_HOOK_DEBUG=1.
# Runs before the guard so failures (wrong CLAUDE_PROJECT_DIR) are visible.
# Log is capped at 200 lines to prevent unbounded growth.
if [[ "${CLAUDE_HOOK_DEBUG:-}" == "1" ]]; then
  {
    echo "--- setup-worktree-junction $(date -u +%Y-%m-%dT%H:%M:%SZ) ---"
    echo "  pwd:                 $(pwd)"
    echo "  CLAUDE_PROJECT_DIR:  ${CLAUDE_PROJECT_DIR:-unset}"
    echo "  WORKTREE (resolved): $WORKTREE"
  } >> /tmp/claude-hook-debug.log 2>&1
  if [ -f /tmp/claude-hook-debug.log ]; then
    tail -200 /tmp/claude-hook-debug.log > /tmp/claude-hook-debug.log.tmp 2>/dev/null \
      && mv /tmp/claude-hook-debug.log.tmp /tmp/claude-hook-debug.log 2>/dev/null || true
  fi
fi

# Only act inside Claude Code ephemeral worktrees
if [[ "$WORKTREE" != *"/.claude/worktrees/"* ]]; then
  exit 0
fi

# --- 1. Determine paths ------------------------------------------------------
NM="$WORKTREE/node_modules"
BIN="$NM/.bin"

# Strip /.claude/worktrees/<name> to get main repo root
MAIN_REPO=$(echo "$WORKTREE" | sed 's|/.claude/worktrees/[^/]*$||')
MAIN_NM="$MAIN_REPO/node_modules"

# If main repo node_modules doesn't exist there's nothing we can do here.
# The agent will surface the issue when it runs its first make/pnpm command.
if [ ! -d "$MAIN_NM" ]; then
  exit 0
fi

# --- 2. Decide if junction needs creation/repair -----------------------------
needs_recreate=false

if [ ! -e "$NM" ] && [ ! -L "$NM" ]; then
  # Junction is entirely absent
  needs_recreate=true
elif [ ! -d "$BIN" ] || [ -z "$(ls -A "$BIN" 2>/dev/null | head -c1)" ]; then
  # .bin is missing or empty — junction is broken or stale
  needs_recreate=true
fi

if [ "$needs_recreate" = "false" ]; then
  exit 0
fi

# --- 3. Remove any existing stale/broken junction (non-recursive, safe) ------
WIN_NM=$(cygpath -w "$NM" 2>/dev/null || echo "$NM" | sed 's|/d/|D:\\|; s|/|\\|g')
cmd //c "rmdir \"$WIN_NM\"" >/dev/null 2>&1

# --- 4. Recreate junction via cmd mklink /J ----------------------------------
WIN_MAIN_NM=$(cygpath -w "$MAIN_NM" 2>/dev/null || echo "$MAIN_NM" | sed 's|/d/|D:\\|; s|/|\\|g')
cmd //c "mklink /J \"$WIN_NM\" \"$WIN_MAIN_NM\"" >/dev/null 2>&1

# Verify; fall back to PowerShell if cmd mklink failed
if [ ! -d "$NM" ]; then
  powershell -NoProfile -NonInteractive -Command \
    "New-Item -ItemType Junction -Path '$WIN_NM' -Target '$WIN_MAIN_NM'" \
    >/dev/null 2>&1
fi

exit 0
