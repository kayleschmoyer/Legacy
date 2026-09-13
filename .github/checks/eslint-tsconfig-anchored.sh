#!/usr/bin/env bash
set -euo pipefail

# Every project's eslint.config.mjs must anchor its parserOptions.project
# globs to that project's own directory (LS-10063, follow-up to LS-8700 /
# LS-10062). parserOptions.tsconfigRootDir is pinned to the workspace root,
# so the bare `tsconfig.*?.json` template that Nx's project generator emits
# resolves against the root tsconfigs instead of the project's own — the
# type-aware rules then run against the wrong TypeScript program and lint
# reports green without checking anything meaningful.
echo "Checking eslint.config.mjs parserOptions.project anchoring..."
node scripts/check-eslint-tsconfig-anchored.mjs
echo "eslint tsconfig anchoring check passed"
