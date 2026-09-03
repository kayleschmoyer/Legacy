#!/usr/bin/env bash
set -euo pipefail

echo "Running ci-failure-labels unit tests..."
node --test .github/scripts/__tests__/ci-failure-labels.test.mjs
echo "ci-failure-labels tests passed"
