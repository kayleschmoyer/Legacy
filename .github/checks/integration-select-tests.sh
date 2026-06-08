#!/usr/bin/env bash
set -euo pipefail

# Spec-selector unit tests + surface-map coverage/presence lint.
# Covers BOTH the integration surface map and the hermetic e2e surface map
# (LS-7846) — they share the same selection engine (select-specs.mjs). The
# coverage tests fail CI if any spec on disk lacks a map entry.
echo "Running spec-selector + surface-map coverage tests..."
node --test .github/scripts/integration-select/__tests__/*.test.mjs
echo "spec-selector + surface-map tests passed"
