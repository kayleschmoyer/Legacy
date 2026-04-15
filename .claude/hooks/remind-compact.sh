#!/usr/bin/env bash
# PreToolUse hook: remind Claude to run /compact every N tool calls.
#
# A simple counter is written to /tmp so the count survives across tool calls
# within a session. The SessionStart hook (reset-tool-count.sh) zeroes it at
# the start of each new session.
#
# Output goes to stdout — Claude Code injects PreToolUse stdout into the
# agent's context before the tool executes, so Claude sees the reminder.
# Always exits 0: this is advisory only, never blocks the tool.
#
# Concurrent sessions: all sessions share the same counter file. The reminder
# may fire slightly off-cadence when sessions overlap, which is acceptable for
# a soft advisory.

COUNTER_FILE="${TMPDIR:-/tmp}/claude-compact-counter"
THRESHOLD=35

count=0
if [[ -f "$COUNTER_FILE" ]]; then
  raw=$(<"$COUNTER_FILE")
  [[ "$raw" =~ ^[0-9]+$ ]] && count="$raw"
fi

count=$((count + 1))
# Atomic write via temp file + mv to prevent partial reads by concurrent sessions.
tmp=$(mktemp "${COUNTER_FILE}.tmp.XXXXXX" 2>/dev/null || true)
if [[ -n "$tmp" ]]; then
  printf '%s' "$count" > "$tmp" && mv -f "$tmp" "$COUNTER_FILE" 2>/dev/null || rm -f "$tmp" 2>/dev/null || true
else
  printf '%s' "$count" > "$COUNTER_FILE" 2>/dev/null || true
fi

if (( count % THRESHOLD == 0 )); then
  cat <<EOF
[COMPACT REMINDER] $count tool calls this session. Run /compact now to trim context and prevent slowdown, then resume.
EOF
fi

exit 0
