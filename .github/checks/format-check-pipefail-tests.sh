#!/usr/bin/env bash
set -euo pipefail

# Regression guard for the CI `format` job pipefail bug (LS-8207): the
# existence-filter subshell in the Format Check step must exit 0 even when the
# last-sorted diffed path is missing on disk, while still letting real prettier
# failures surface. See .github/scripts/__tests__/format-check-pipefail.test.mjs.
echo "Running format-check pipefail regression tests..."
node --test .github/scripts/__tests__/format-check-pipefail.test.mjs
echo "format-check pipefail tests passed"
