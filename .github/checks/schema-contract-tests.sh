#!/usr/bin/env bash
set -euo pipefail

echo "Running schema contract-gate unit tests..."
node --test .github/scripts/schema-contract/__tests__/check-contract.test.mjs
echo "schema contract-gate tests passed"
