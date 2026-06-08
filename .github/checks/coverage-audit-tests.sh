#!/usr/bin/env bash
set -euo pipefail

# Surface-map drift auditor unit tests (LS-7850). Exercises the fragment union,
# under-selection / dead-glob detection, cross-run counter state, and report
# rendering used by the nightly audit-coverage job.
echo "Running surface-map drift auditor tests..."
node --test .github/scripts/coverage-audit/__tests__/*.test.mjs
echo "surface-map drift auditor tests passed"
