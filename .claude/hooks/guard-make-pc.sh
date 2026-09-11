#!/bin/bash
# PreToolUse hook: block the monolithic `make pc` / make_run(target:"pc")
# in favor of the 7-chunk form required in cloud sessions.
#
# In cloud sessions, `make pc` / make_run(target:"pc") runs for ~3-10 min and
# exceeds the ~60s MCP transport timeout — the container is reaped mid-run.
# The 7-chunk form (pc-db-prep → pc-typecheck → pc-format → pc-lint →
# pc-workflows → pc-test → pc-build) keeps each call inside the window and
# lets you checkpoint after each step (LS-7906).
#
# Registered under two matchers:
#   - "^Bash$"                              — detects bare `make pc`
#   - "^mcp__legacy-sports-make__make_run$" — detects target: "pc"
#
# A warn-only version of this hook let agents run `make pc` anyway (observed
# stalling recovery sessions twice in a row — the printed warning was simply
# ignored). Exits 2 to actually block the tool call; only stderr is shown to
# the agent on a blocked PreToolUse call (stdout is discarded), so the
# message doubles as the block reason.
# Add `# pc-ok` to a Bash command to bypass -- reserve this for a run you are
# watching live in the foreground of a real terminal, never a backgrounded
# one. LS-8797: a backgrounded monolithic `make pc` in an ordinary local
# Windows session (never previously flagged timeout-prone) hung 40+ minutes
# with zero output and no child process under `make.exe` at all -- a
# Windows/Git-Bash stdout-pipe deadlock hazard, not merely a timeout risk.
# "Non-timeout-prone" is not a safety property of the monolithic path; only
# "foreground and human-watched" is.

INPUT=$(cat 2>/dev/null || true)
if [ -z "$INPUT" ] || ! command -v jq &>/dev/null; then
  exit 0
fi

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)

emit_block() {
  local context="$1"
  local suppress_hint="$2"
  cat <<EOF
[BLOCKED] $context runs the full pre-commit suite as a monolith (~3-10 min).
In cloud sessions this exceeds the ~60s MCP transport timeout — the container is reaped mid-run.

Use the 7 pc-* chunks IN ORDER instead, one per call:
  Sequence: pc-db-prep → pc-typecheck → pc-format → pc-lint → pc-workflows → pc-test → pc-build

  Preferred (whenever the nx MCP server is loaded):
    nx_run_pc_chunk({ chunk: "pc-db-prep" })  ...  nx_run_pc_chunk({ chunk: "pc-build" })
  nx MCP server not loaded (degraded CC web, OR a local session where the stdio
  servers failed to start — see .agents/skills/mcp-first/references/diagnostics.md
  Check 1 before assuming this is cloud-only; recurring in local Windows
  launcher-worktree sessions per LS-8774/LS-9743):
    Bash make pc-<chunk> with run_in_background: true — foreground make pc-* is
    blocked by .agents/hooks/enforce-background.mjs; wait for each background
    completion before starting the next chunk.

Before pc-format: commit all your changes so the working tree is clean.
With a clean tree the formatter commits its rewrites as a new commit (never
amends your tip commit — it's always already pushed by this point); with a
dirty tree it exits 1.

See .agents/skills/cloud-agent-mode/SKILL.md → "Validation binding".

$suppress_hint
EOF
}

case "$TOOL_NAME" in
  mcp__legacy-sports-make__make_run)
    TARGET=$(echo "$INPUT" | jq -r '.tool_input.target // empty' 2>/dev/null || true)
    if [ "$TARGET" = "pc" ]; then
      emit_block 'make_run({ target: "pc" })' 'Prefer nx_run_pc_chunk({ chunk: "pc-db-prep" }) ... nx_run_pc_chunk({ chunk: "pc-build" }); make_run({ target: "pc-<chunk>" }) per chunk is the fallback when the nx server is not loaded.'
      exit 2
    fi
    ;;
  Bash)
    COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
    [ -z "$COMMAND" ] && exit 0
    # Detect bare `make pc`, including the AGENTS.md-mandated `make -C <dir> pc`
    # flag form — not `make pc-typecheck` etc. (suffix starting with `-` is excluded)
    if echo "$COMMAND" | grep -qE '(^|[[:space:];|&])make([[:space:]]+-C[[:space:]]*[^[:space:]]+)?[[:space:]]+pc([[:space:]]|$|;|&|\|)'; then
      if echo "$COMMAND" | grep -qE '(^|[[:space:]])#[[:space:]]*pc-ok'; then
        exit 0
      fi
      emit_block '`make pc`' 'Watching this run live in the foreground of a real terminal (never backgrounded -- LS-8797 found the backgrounded monolithic path can silently deadlock even in an ordinary local Windows session)? Add `# pc-ok` to the command to bypass this block.'
      exit 2
    fi
    ;;
esac

exit 0
