#!/usr/bin/env bash
set -euo pipefail

echo "Running e2e-affected-gate unit tests..."
node --test .github/scripts/__tests__/e2e-affected-gate.test.mjs
echo "e2e-affected-gate tests passed"
