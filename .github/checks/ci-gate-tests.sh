#!/usr/bin/env bash
set -euo pipefail

echo "Running ci-gate unit tests..."
node --test .github/scripts/__tests__/ci-gate.test.mjs
echo "ci-gate tests passed"
