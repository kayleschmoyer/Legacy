#!/usr/bin/env bash
# SessionStart hook: reset the per-session tool-call counter used by
# remind-compact.sh. Writes 0 to the shared counter file so the compact
# reminder fires relative to the start of this session, not a prior one.

printf '0' > "${TMPDIR:-/tmp}/claude-compact-counter" 2>/dev/null || true
# Note: claude-stop-block-counter is NOT reset here — it uses a 1-hour staleness
# check inside check-incomplete-work.sh so it survives re-prompts within a session
# but resets naturally between separate sessions.
