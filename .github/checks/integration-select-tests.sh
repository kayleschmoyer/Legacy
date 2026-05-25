#!/usr/bin/env bash
set -euo pipefail

echo "Running integration spec-selector unit tests..."
node --test .github/scripts/integration-select/__tests__/select-specs.test.mjs
echo "integration spec-selector tests passed"
