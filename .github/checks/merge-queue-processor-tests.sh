#!/usr/bin/env bash
set -euo pipefail

echo "Running merge-queue-processor unit tests..."
node --test .github/scripts/__tests__/merge-queue-processor.test.mjs
echo "merge-queue-processor tests passed"
