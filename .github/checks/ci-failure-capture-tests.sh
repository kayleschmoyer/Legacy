#!/usr/bin/env bash
set -euo pipefail

echo "Running ci-failure-capture unit tests..."
node --test .github/scripts/ci-failure-capture/__tests__/*.test.mjs
echo "ci-failure-capture tests passed"
