#!/usr/bin/env bash
set -euo pipefail

# Unit tests for scripts/validate-workflows.js — in particular the
# working-directory existence check added in LS-4910.
echo "Running validate-workflows unit tests..."
node --test scripts/__tests__/validate-workflows.test.mjs
echo "validate-workflows tests passed"
