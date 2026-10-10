#!/usr/bin/env bash
set -euo pipefail

echo "Running test-shard-partition unit tests..."
node --test .github/scripts/__tests__/test-shard-partition.test.mjs
echo "test-shard-partition tests passed"
