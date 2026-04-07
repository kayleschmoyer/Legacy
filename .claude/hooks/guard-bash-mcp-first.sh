#!/bin/bash
# PreToolUse hook: block Bash commands that have direct MCP tool replacements
# (ls/find/cat/head/tail/grep/rg) so agents stay on the MCP-first path. The
# AGENTS.md "Concrete substitutions" table is the authoritative list — this
# hook enforces it as a backstop because doc-only reminders have repeatedly
# failed in long sessions.
#
# Receives JSON on stdin with tool_name and tool_input.command.
# Exit 0 = allow, exit 2 = block.
# Fails open: if jq is missing or input is invalid, allows the operation.
#
# To bypass (genuine fallback case): rephrase the command so it doesn't start
# with a banned binary, or set ALLOW_BASH_FALLBACK=1 in the environment.

INPUT=$(cat 2>/dev/null || true)

# Fail open if input is empty or jq is not available
if [ -z "$INPUT" ] || ! command -v jq &>/dev/null; then
  exit 0
fi

# Per-session escape hatch
if [ "${ALLOW_BASH_FALLBACK:-}" = "1" ]; then
  exit 0
fi

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)
if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
if [ -z "$COMMAND" ]; then
  exit 0
fi

# Strip leading whitespace and capture the first token
TRIMMED=$(echo "$COMMAND" | sed -E 's/^[[:space:]]+//')
FIRST_WORD=$(echo "$TRIMMED" | awk '{print $1}')

# Normalize FIRST_WORD to its basename so absolute-path invocations like
# /bin/head, /usr/bin/rg, etc. match the same cases as bare names.
FIRST_WORD=$(basename "$FIRST_WORD")

# Pattern: first word is one of the banned binaries, optionally with a path
# prefix. We match the bare binary name only — `aws ls` and friends are not
# affected because they start with `aws`.
case "$FIRST_WORD" in
  ls)
    REPLACEMENT="Glob (e.g. Glob({ pattern: \"**/*.ts\", path: \"<dir>\" }))"
    BAD="ls"
    ;;
  find)
    REPLACEMENT="Glob for file discovery (Glob({ pattern: \"**/*.ts\" })) or Grep for content search (Grep({ pattern: \"foo\", glob: \"**/*.ts\" }))"
    BAD="find"
    ;;
  cat)
    # Allow:
    #   - heredocs:        cat <<EOF
    #   - true pipelines:  cat file | ...   (single |, not ||)
    #   - no file args:    cat              (stdin passthrough)
    #   - redirect forms:  cat > file  /  cat >> file  /  cat file > out
    # Block: cat <file(s)> with no redirect or pipeline (plain file read)
    REST=$(echo "$TRIMMED" | sed -E 's/^[^[:space:]]+[[:space:]]*//')
    # Heredoc
    if echo "$TRIMMED" | grep -qE '<<'; then
      exit 0
    fi
    # True pipeline: single | not part of ||
    if echo "$TRIMMED" | grep -qP '(?<!\|)\|(?!\|)'; then
      exit 0
    fi
    # No arguments at all (stdin passthrough)
    if [ -z "$REST" ]; then
      exit 0
    fi
    # Redirect forms: > or >> anywhere in the arguments
    if echo "$REST" | grep -qE '>>|>'; then
      exit 0
    fi
    REPLACEMENT="Read (Read({ file_path: \"<absolute path>\" }))"
    BAD="cat"
    ;;
  head)
    REPLACEMENT="Read with limit (Read({ file_path: \"...\", limit: N }))"
    BAD="head"
    ;;
  tail)
    REPLACEMENT="Read with offset (first read total_lines, then Read({ file_path: \"...\", offset: total - N, limit: N }))"
    BAD="tail"
    ;;
  grep|rg)
    REPLACEMENT="Grep (Grep({ pattern: \"foo\", path: \"<dir>\", glob: \"**/*.ts\", output_mode: \"content\" }))"
    BAD="$FIRST_WORD"
    ;;
  *)
    exit 0
    ;;
esac

cat >&2 <<EOF
BLOCKED: Bash command starts with \`$BAD\`, which has a direct built-in replacement. Use $REPLACEMENT instead — see the "Concrete substitutions" table in AGENTS.md.

Original command:
  $TRIMMED

If this is a genuine fallback case (e.g. \`cat file | python -c ...\`, \`find ... -exec ...\` with no built-in equivalent), prefix the command differently or set ALLOW_BASH_FALLBACK=1 in the environment to bypass this hook for the current shell session.
EOF
exit 2
