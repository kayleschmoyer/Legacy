#!/bin/bash
# SessionStart hook: validate and recreate the node_modules symlink for
# ephemeral worktrees (.claude/worktrees/<name>/).
#
# Responsibilities:
#   1. Validate the symlink: check that .bin is non-empty (empty .bin is the
#      most common symptom of a stale or broken link on Windows/pnpm).
#   2. If missing or invalid, recreate via PowerShell bridge to cmd mklink /D.
#
# Why symlinks:
#   Directory symlinks (mklink /D) are NOT followed by recursive-delete tools
#   (PowerShell Remove-Item, Node.js fs.rmSync, git worktree remove). When
#   Claude Code's archive deletes the worktree directory, it removes the link
#   itself, leaving the target intact. Requires Windows Developer Mode
#   (one-time setting).
#
# Windows notes:
#   - Runs in git-bash (ships with Git for Windows); cygpath is available.
#   - `cmd //c "mklink /D ..."` from bash/MSYS2 SILENTLY FAILS because MSYS2
#     path translation mangles the mklink arguments (LS-3084). The fix is to
#     call cmd.exe *from PowerShell* which invokes it natively without mangling.
#   - Path conversion: cygpath -w is the primary method; the sed fallback
#     uses the repo-specific /d/ prefix that matches this machine's layout.
#   - The Stop hook (cleanup-worktree-symlink.sh) removes the symlink
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
    echo "--- setup-worktree-symlink $(date -u +%Y-%m-%dT%H:%M:%SZ) ---"
    echo "  pwd:                 $(pwd)"
    echo "  CLAUDE_PROJECT_DIR:  ${CLAUDE_PROJECT_DIR:-unset}"
    echo "  WORKTREE (resolved): $WORKTREE"
  } >> /tmp/claude-hook-debug.log 2>&1
  if [ -f /tmp/claude-hook-debug.log ]; then
    tail -200 /tmp/claude-hook-debug.log > /tmp/claude-hook-debug.log.tmp 2>/dev/null \
      && mv /tmp/claude-hook-debug.log.tmp /tmp/claude-hook-debug.log 2>/dev/null || true
  fi
fi

# Only act inside known ephemeral worktrees:
#   Pattern A (Claude Code): .../<repo>/.claude/worktrees/<name>
#   Pattern B (Copilot/twig): .../<repo>.worktrees/<name>
PARENT_DIR=$(dirname "$WORKTREE")
PARENT_NAME=$(basename "$PARENT_DIR")

MAIN_REPO=""
if [[ "$WORKTREE" == *"/.claude/worktrees/"* ]]; then
  # Pattern A: strip /.claude/worktrees/<name>
  MAIN_REPO=$(echo "$WORKTREE" | sed 's|/.claude/worktrees/[^/]*$||')
elif [[ "$PARENT_NAME" == *.worktrees ]]; then
  # Pattern B: <root>/<reponame>.worktrees/<name> → main repo is <root>/<reponame>
  ROOT_DIR=$(dirname "$PARENT_DIR")
  MAIN_REPO_NAME="${PARENT_NAME%.worktrees}"
  MAIN_REPO="$ROOT_DIR/$MAIN_REPO_NAME"
else
  exit 0
fi

# --- 1. Determine paths ------------------------------------------------------
NM="$WORKTREE/node_modules"
BIN="$NM/.bin"

MAIN_NM="$MAIN_REPO/node_modules"

# If main repo node_modules doesn't exist there's nothing we can do here.
# The agent will surface the issue when it runs its first make/pnpm command.
if [ ! -d "$MAIN_NM" ]; then
  exit 0
fi

# --- 2. Decide if symlink needs creation/repair ------------------------------
needs_recreate=false

if [ ! -e "$NM" ] && [ ! -L "$NM" ]; then
  # Symlink is entirely absent
  needs_recreate=true
elif [ ! -d "$BIN" ] || [ -z "$(ls -A "$BIN" 2>/dev/null | head -c1)" ]; then
  # .bin is missing or empty — symlink is broken or stale
  needs_recreate=true
fi

# Also recreate if the existing link is an NTFS junction (LS-3084).
# `git worktree remove` follows junctions and recursively deletes the target,
# which would destroy the main repo's node_modules. Symlinks are safe.
if [ "$needs_recreate" = "false" ] && [ -e "$NM" ] && command -v cygpath &>/dev/null; then
  WIN_NM_CHECK=$(cygpath -w "$NM" 2>/dev/null || echo "$NM" | sed 's|/d/|D:\\|; s|/|\\|g')
  LINK_TYPE=$(powershell -NoProfile -NonInteractive -Command \
    "(Get-Item -LiteralPath '$WIN_NM_CHECK' -Force -ErrorAction SilentlyContinue).LinkType" 2>/dev/null || true)
  if [ "$LINK_TYPE" = "Junction" ]; then
    needs_recreate=true
  fi
fi

if [ "$needs_recreate" = "false" ]; then
  exit 0
fi

# --- 3. Remove stale link + recreate ----------------------------------------
if command -v cygpath &>/dev/null; then
  # Windows (git-bash): delegate to PowerShell script.
  # IMPORTANT: `cmd //c "mklink /D ..."` from bash/MSYS2 silently fails because
  # MSYS2 path translation mangles the mklink arguments (LS-3084). Inline
  # PowerShell -Command strings also break due to bash/PS escaping conflicts
  # (`$null` gets eaten). The fix: delegate to scripts/mklink-symlink.ps1 which
  # runs entirely in PowerShell with no cross-shell quoting.
  WIN_NM=$(cygpath -w "$NM" 2>/dev/null || echo "$NM" | sed 's|/d/|D:\\|; s|/|\\|g')
  WIN_MAIN_NM=$(cygpath -w "$MAIN_NM" 2>/dev/null || echo "$MAIN_NM" | sed 's|/d/|D:\\|; s|/|\\|g')
  WIN_WORKTREE=$(cygpath -w "$WORKTREE" 2>/dev/null || echo "$WORKTREE" | sed 's|/d/|D:\\|; s|/|\\|g')

  MKLINK_SCRIPT="$WIN_WORKTREE\\scripts\\mklink-symlink.ps1"
  powershell -NoProfile -NonInteractive -File "$MKLINK_SCRIPT" \
    -Link "$WIN_NM" -Target "$WIN_MAIN_NM" -Force \
    >/dev/null 2>&1 || true

  if [ ! -d "$NM" ]; then
    echo "WARNING: Failed to create node_modules symlink in worktree." >&2
    echo "  Directory symlinks require Windows Developer Mode to be enabled." >&2
    echo "  Enable it: Settings > System > For Developers > Developer Mode" >&2
  fi
else
  # Linux / macOS: standard rm + ln -s
  if [ -e "$NM" ] || [ -L "$NM" ]; then
    rm -rf "$NM"
  fi
  ln -s "$MAIN_NM" "$NM"
fi

exit 0
