#!/usr/bin/env bash
set -euo pipefail

# Case-only path collision check (LS-10207). Linux CI is case-sensitive, so
# tracked paths (or extensionless import specifiers) that differ only by case
# stay green here while breaking Windows/macOS checkouts — LS-10163 shipped
# DraftPickInspector.tsx next to draftPickInspector.ts and every local Windows
# pc-* chunk went red.
echo "Checking for case-only path collisions..."
node scripts/check-case-collisions.mjs
echo "Case-only path collision check passed"
