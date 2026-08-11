#!/usr/bin/env bash
set -euo pipefail

# LS-7795: forbid an unconditional `command -v <binary> || exit <nonzero>`
# hard-fail on an optional binary in the pre-push git hook. This is the
# anti-pattern that used to hard-block every cloud-agent push when the
# `git-lfs` binary was absent from PATH (removed in LS-8204) — cloud
# containers ship the hook but never the binary, so any reintroduced
# unconditional guard on an optional tool silently blocks every agent push.
#
# The legitimate pattern (terraform validate, pre-push:90) soft-skips with
# `command -v terraform >/dev/null 2>&1 && ...` — it only runs the check when
# the binary is present and never hard-fails on its absence. That pattern is
# intentionally NOT matched below; only `||`-gated `exit <nonzero>` is.
HOOK=".github/hooks/pre-push"
echo "Checking $HOOK for unconditional hard-fail on an optional binary..."

VIOLATIONS=$(grep -nE 'command -v .*\|\|.*exit [1-9]' "$HOOK" || true)

if [ -n "$VIOLATIONS" ]; then
  echo "Found an unconditional 'command -v <binary> || ... exit <nonzero>' guard in $HOOK:"
  echo "$VIOLATIONS"
  echo ""
  echo "An optional binary being absent must not hard-fail the push (see LS-7795,"
  echo "LS-8204). Use a soft-skip instead: 'command -v <binary> >/dev/null 2>&1 && ...'"
  exit 1
fi

echo "No unconditional hard-fail guard on an optional binary found in $HOOK"
