#!/usr/bin/env bash
set -euo pipefail

# LS-9707: MCP tool responses must never be pretty-printed JSON.
#
# For list-shaped payloads, `JSON.stringify(x, null, 2)` repeats every field
# name on every row and spends 10-40% of the response on indentation and
# structural punctuation that carries no meaning. The standard
# (.agents/skills/create/references/mcp-response-format.md) is: prune with
# pickFields, truncate long blobs, then markdownTable for flat uniform lists
# and minifiedJson for everything else — all via @legacy-sports/mcp-format.
#
# This was review pattern #45, enforced manually. It was missed on
# worktree-server and ci-server for the entire LS-8018 migration, and both
# tickets closed Done with 30 pretty-printed response sites still in place.
# Manual enforcement is what failed, so this is the automated replacement.
#
# Why a check script rather than an ESLint rule: several MCP servers
# (mcp-jira-server, mcp-ci-server) define no lint target and get none inferred,
# so `nx affected -t lint` skips them entirely — they are precisely the servers
# that regressed. A repo-wide grep in custom-checks covers every server
# regardless of its nx configuration.
#
# Exemption: writing JSON to disk (token caches, lock files). Pretty printing a
# file on disk costs no tokens and aids humans reading it, so lines containing
# writeFile/writeFileSync are allowed.

echo "Checking MCP tool responses for pretty-printed JSON..."

matches=$(grep -rn --include='*.ts' -E 'JSON\.stringify\([^)]*,[[:space:]]*null,[[:space:]]*2\)' tools/mcp \
  | grep -v '\.spec\.ts:' \
  | grep -vE 'writeFile|writeFileSync' \
  || true)

if [ -n "$matches" ]; then
  echo ""
  echo "✖ Pretty-printed JSON found in MCP tool response(s):"
  echo ""
  echo "$matches" | sed 's/^/    /'
  echo ""
  echo "  Use @legacy-sports/mcp-format instead:"
  echo "    - markdownTable(rows, { columns }) for flat, uniform lists"
  echo "    - minifiedJson(value)              for single objects / nested data"
  echo "    - pickFields(rows, keys) / truncate(str, n) first — field selection"
  echo "      is the first-order lever; format is second-order."
  echo ""
  echo "  Standard: .agents/skills/create/references/mcp-response-format.md"
  echo "  Review pattern #45."
  echo ""
  echo "  Writing JSON to a file on disk is exempt (writeFile/writeFileSync)."
  exit 1
fi

echo "MCP response-format check passed"
