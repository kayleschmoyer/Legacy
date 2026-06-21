#!/bin/bash
# PreToolUse hook: warn when the monolithic `make pc` / make_run(target:"pc")
# is called instead of the 7-chunk form required in cloud sessions.
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
# Always exits 0 (warning, not block) so local sessions are never trapped.
# Add `# pc-ok` to a Bash command to suppress this warning in local sessions.

INPUT=$(cat 2>/dev/null || true)
if [ -z "$INPUT" ] || ! command -v jq &>/dev/null; then
  exit 0
fi

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)

emit_warning() {
  local context="$1"
  local suppress_hint="$2"
  cat <<EOF
[VALIDATION WARNING] $context runs the full pre-commit suite as a monolith (~3-10 min).
In cloud sessions this exceeds the ~60s MCP transport timeout — the container is reaped mid-run.

Use the 7 pc-* chunks IN ORDER instead (each finishes inside the transport window):
  Sequence: pc-db-prep → pc-typecheck → pc-format → pc-lint → pc-workflows → pc-test → pc-build

  Bash (one per call, never chained):  make pc-db-prep   make pc-typecheck  ...  make pc-build
  MCP:  make_run({ target: "pc-db-prep" })  ...  make_run({ target: "pc-build" })

Before pc-format: commit all staged changes so the working tree is clean.
The formatter auto-amends ambient drift into your last commit rather than exiting 1.

$suppress_hint
EOF
}

case "$TOOL_NAME" in
  mcp__legacy-sports-make__make_run)
    TARGET=$(echo "$INPUT" | jq -r '.tool_input.target // empty' 2>/dev/null || true)
    if [ "$TARGET" = "pc" ]; then
      emit_warning 'make_run({ target: "pc" })' 'Use make_run({ target: "pc-db-prep" }) ... make_run({ target: "pc-build" }) in cloud sessions.'
    fi
    ;;
  Bash)
    COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
    [ -z "$COMMAND" ] && exit 0
    # Detect bare `make pc` — not `make pc-typecheck` etc. (suffix starting with `-` is excluded)
    if echo "$COMMAND" | grep -qE '(^|[[:space:];|&])make[[:space:]]+pc([[:space:]]|$|;|&|\|)'; then
      if echo "$COMMAND" | grep -qE '(^|[[:space:]])#[[:space:]]*pc-ok'; then
        exit 0
      fi
      emit_warning '`make pc`' 'Local non-timeout-prone session? Add `# pc-ok` to the command to suppress this warning.'
    fi
    ;;
esac

exit 0
