#!/usr/bin/env bash
set -euo pipefail

# Graph-derived e2e spec-selection tests (LS-9661).
# Covers the derive-surface-map.mjs generator (import-graph reachability,
# route anchoring, barrel narrowing) and the shadow-compare.mjs diff tool.
# Includes a real-repo presence test: every hermetic spec on disk must be
# mapped by the generator (this repoints the old hand-map presence lint at
# the generator) and derivation must finish inside the 60s AC1 budget.
echo "Running e2e-graph generator + shadow-compare tests..."
node --test .github/scripts/e2e-graph/__tests__/*.test.mjs
echo "e2e-graph tests passed"
