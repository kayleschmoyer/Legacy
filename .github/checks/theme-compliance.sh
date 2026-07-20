#!/usr/bin/env bash
set -euo pipefail

# Theme-compliance ratchet (LS-8519, epic LS-8518). Counts hardcoded color
# literals and banned $blue*/theme="blue" usages per project and fails if any
# count exceeds scripts/theme-compliance-baseline.json. Decreases must be
# locked in via `make update-theme-baseline` in the same PR.
echo "Checking theme compliance ratchet..."
node scripts/check-theme-compliance.mjs
echo "Theme compliance check passed"
