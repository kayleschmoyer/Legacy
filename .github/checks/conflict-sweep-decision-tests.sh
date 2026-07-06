#!/usr/bin/env bash
set -euo pipefail

# Runs the unit tests for the base-push conflict sweep's write decision
# (check-conflicts-sweep.yml). These pin the false-green regression: a conflict
# introduced by main advancing must re-POST the "No Merge Conflicts" required
# check as a failure rather than leave a stale completed:success in place.
echo "Running conflict-sweep-decision unit tests..."
node --test .github/scripts/__tests__/conflict-sweep-decision.test.mjs
echo "conflict-sweep-decision tests passed"
