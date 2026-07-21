#!/usr/bin/env bash
set -euo pipefail

# Animated-component CSS-variable guard (LS-8554, epic LS-8518). Fails when a
# Tamagui component carries both an animation prop and a var(--token) colour:
# the react-native animation driver cannot parse a CSS custom property, so it
# crashes the page at runtime while typecheck/lint/build stay green.
echo "Checking animated components for var(--token) colours..."
node scripts/check-animated-theme-vars.mjs
echo "Animated-theme-var check passed"
