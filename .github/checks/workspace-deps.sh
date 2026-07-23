#!/usr/bin/env bash
set -euo pipefail

# Undeclared workspace dependency check (LS-8622). Every @legacy-sports/*
# import in a package under apps/ or lib/ must be declared in that package's
# package.json — TypeScript resolves via tsconfig paths so PR gates stay
# green, but Metro resolves via node_modules and fails only post-merge
# (LS-8617: main's Android build was red for ~3 days).
echo "Checking workspace dependency declarations..."
node scripts/check-workspace-deps.mjs
echo "Workspace dependency check passed"
