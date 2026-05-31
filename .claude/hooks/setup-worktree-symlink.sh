#!/bin/bash
# SessionStart hook: validate and recreate the node_modules + .env.local symlinks
# for ephemeral worktrees (.claude/worktrees/<name>/ or <repo>.worktrees/<name>/),
# then run check-mcp-servers.sh sequentially to surface any precondition failures.
#
# Delegates to scripts/modules-pool/link.mjs — a dependency-free Node script that
# hashes the worktree's pnpm-lock.yaml and links node_modules to the matching
# content-addressable pool slot (<main>/.modules-pool/<hash>/node_modules),
# materialising the slot on a pool miss. Node calls cmd.exe directly via
# execFileSync, so there is no MSYS2 path-mangling issue (LS-3084).
#
# Chained-not-concurrent: check-mcp-servers.sh used to be a sibling SessionStart
# entry that ran in parallel with this hook. That created a race — the check
# tested for node_modules/.bin/tsx and .env.local while setup was still creating
# them, producing false-positive "[MCP WARNING] .env.local not found" output
# (LS-4505). The check now runs at the end of this hook, so its preconditions
# (the symlinks this script creates) are guaranteed to exist.
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
RUN_SETUP=true
case "$WORKTREE" in
  '' | *[\$\`\;\&\|\<\>$'\n']*) RUN_SETUP=false ;;
  /* | [A-Za-z]:[/\\]*) ;;
  *) RUN_SETUP=false ;;
esac
if [ "$RUN_SETUP" = "true" ] && [ ! -d "$WORKTREE" ]; then
  RUN_SETUP=false
fi

# Only act inside known ephemeral worktrees:
#   Pattern A (Claude Code): .../<repo>/.claude/worktrees/<name>
#   Pattern B (Copilot/twig): .../<repo>.worktrees/<name>
if [ "$RUN_SETUP" = "true" ]; then
  PARENT_DIR=$(dirname "$WORKTREE")
  PARENT_NAME=$(basename "$PARENT_DIR")
  if [[ "$WORKTREE" != *"/.claude/worktrees/"* ]] && [[ "$PARENT_NAME" != *.worktrees ]]; then
    RUN_SETUP=false
  fi
fi

# Delegate entirely to the standalone Node.js pool resolver. It is intentionally
# dependency-free (no tsx, no pnpm-for-resolution, no node_modules required) and
# handles all cases: missing symlink, wrong target, NTFS junction, pool hit
# (instant relink) and pool miss (frozen-lockfile install + atomic publish).
# On Windows, node calls cmd.exe via execFileSync — no MSYS2 path mangling.
# Output is captured to a log (see SETUP_LOG below); tsx absence is also surfaced
# at session-start by the chained check-mcp-servers.sh invocation at the bottom
# of this hook.
#
# cd "$WORKTREE" before invoking node so process.cwd() returns the correct
# Windows-format path (e.g. D:\code\...) inside node.exe. Passing a Unix path
# directly via --worktree would give node resolve('/d/code/...') = D:\d\code\...
# because Windows node.exe doesn't understand Git Bash's /d/ drive prefix.
#
# Capture stderr to a log file rather than `|| true` — the hook must never block
# session startup, but we still want the root cause visible when something
# breaks. Stale logs are kept short via tail-truncate below.
if [ "$RUN_SETUP" = "true" ]; then
  SETUP_LOG="${TMPDIR:-/tmp}/claude-setup-worktree-symlink.log"
  {
    echo "--- $(date -u +%Y-%m-%dT%H:%M:%SZ) WORKTREE=$WORKTREE ---"
    (cd "$WORKTREE" && node "scripts/modules-pool/link.mjs")
  } >>"$SETUP_LOG" 2>&1
  # Cap log at 500 lines so it doesn't grow unbounded over many sessions.
  if [ -f "$SETUP_LOG" ]; then
    tail -500 "$SETUP_LOG" > "${SETUP_LOG}.tmp" 2>/dev/null \
      && mv "${SETUP_LOG}.tmp" "$SETUP_LOG" 2>/dev/null || true
  fi
fi

# --- Sequential precondition check ------------------------------------------
# Run the MCP-server precondition check *after* symlink setup completes so it
# sees the post-setup state, not whatever existed before this hook fired.
# Kept as a separate script so it can be invoked ad-hoc for diagnostics.
CHECK_SCRIPT="$(dirname "$0")/check-mcp-servers.sh"
if [ -x "$CHECK_SCRIPT" ]; then
  "$CHECK_SCRIPT"
elif [ -f "$CHECK_SCRIPT" ]; then
  bash "$CHECK_SCRIPT"
fi

exit 0
