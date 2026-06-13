#!/usr/bin/env bash
set -euo pipefail

# Runs the LS-7992 base-push sweep idempotency unit tests. The sweep reuses an
# existing "No Merge Conflicts" check-run id per head SHA instead of creating a
# duplicate on every base push; these tests guard that selection logic.
echo "Running resolve-conflict-check-run unit tests..."
node --test .github/scripts/__tests__/resolve-conflict-check-run.test.mjs
echo "resolve-conflict-check-run tests passed"
