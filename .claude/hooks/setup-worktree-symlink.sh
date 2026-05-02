#!/bin/bash
# SessionStart hook: validate and recreate the node_modules symlink for
# ephemeral worktrees (.claude/worktrees/<name>/ or <repo>.worktrees/<name>/).
#
# Delegates to scripts/setup-worktree-node-modules.mjs — a dependency-free Node
# script that handles detection, stale-link cleanup, symlink creation, and
# virtualStoreDir validation. Node calls cmd.exe directly via execFileSync, so
# there is no MSYS2 path-mangling issue (LS-3084). Node startup (~400ms) is
# ~7x faster than PowerShell (~3s), which matters because Claude Code runs all
# SessionStart hooks concurrently — the faster this hook finishes, the sooner
# tsx exists for the concurrent check-mcp-servers hook to find.
#
# Why symlinks (not junctions):
#   Directory symlinks (mklink /D) are NOT followed by recursive-delete tools.
#   When a worktree directory is deleted, only the link is removed — the target
#   node_modules in the main repo stays intact. Requires Windows Developer Mode.
#
# The Stop hook (cleanup-worktree-symlink.sh) removes the symlink on clean exit.

# Prefer CLAUDE_PROJECT_DIR over pwd — Claude Code may invoke hooks with the
# main repo as the process cwd even for worktree sessions, while CLAUDE_PROJECT_DIR
# is the stable per-session project root (set to the worktree path by the launcher).
WORKTREE="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Diagnostic: opt-in logging gated on CLAUDE_HOOK_DEBUG=1.
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

# Defensive input validation: WORKTREE arrives from CLAUDE_PROJECT_DIR or pwd.
# Even though `cd "$WORKTREE"` is safe (double-quoted vars don't shell-evaluate),
# we still reject malformed values up front so a typo or stray env var produces
# a silent no-op instead of a confusing partial run.
#
# 1. Must be a non-empty absolute path (Unix /... or Windows X:/... or X:\...).
# 2. Must exist as a directory on disk.
# 3. Must NOT contain shell metacharacters that would surprise downstream
#    consumers (the node script, log output) — these can never reach a shell
#    interpreter from here, but rejecting them keeps the contract simple.
case "$WORKTREE" in
  '' | *[\$\`\;\&\|\<\>$'\n']*) exit 0 ;;
  /* | [A-Za-z]:[/\\]*) ;;
  *) exit 0 ;;
esac
if [ ! -d "$WORKTREE" ]; then
  exit 0
fi

# Only act inside known ephemeral worktrees:
#   Pattern A (Claude Code): .../<repo>/.claude/worktrees/<name>
#   Pattern B (Copilot/twig): .../<repo>.worktrees/<name>
PARENT_DIR=$(dirname "$WORKTREE")
PARENT_NAME=$(basename "$PARENT_DIR")

if [[ "$WORKTREE" != *"/.claude/worktrees/"* ]] && [[ "$PARENT_NAME" != *.worktrees ]]; then
  exit 0
fi

# Delegate entirely to the standalone Node.js setup script. It is intentionally
# dependency-free (no tsx, no pnpm, no node_modules required) and handles all
# cases: missing symlink, wrong target, NTFS junction, stale virtualStoreDir.
# On Windows, node calls cmd.exe via execFileSync — no MSYS2 path mangling.
# Output is captured to a log (see SETUP_LOG below); tsx absence is also surfaced
# at session-start by check-mcp-servers.sh after a brief poll.
#
# cd "$WORKTREE" before invoking node so process.cwd() returns the correct
# Windows-format path (e.g. D:\code\...) inside node.exe. Passing a Unix path
# directly via --worktree would give node resolve('/d/code/...') = D:\d\code\...
# because Windows node.exe doesn't understand Git Bash's /d/ drive prefix.
#
# Capture stderr to a log file rather than `|| true` — the hook must never block
# session startup, but we still want the root cause visible when something
# breaks. Stale logs are kept short via tail-truncate below.
SETUP_LOG="${TMPDIR:-/tmp}/claude-setup-worktree-symlink.log"
{
  echo "--- $(date -u +%Y-%m-%dT%H:%M:%SZ) WORKTREE=$WORKTREE ---"
  (cd "$WORKTREE" && node "scripts/setup-worktree-node-modules.mjs")
} >>"$SETUP_LOG" 2>&1
# Cap log at 500 lines so it doesn't grow unbounded over many sessions.
if [ -f "$SETUP_LOG" ]; then
  tail -500 "$SETUP_LOG" > "${SETUP_LOG}.tmp" 2>/dev/null \
    && mv "${SETUP_LOG}.tmp" "$SETUP_LOG" 2>/dev/null || true
fi

exit 0
