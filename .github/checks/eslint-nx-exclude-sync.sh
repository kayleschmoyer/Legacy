#!/usr/bin/env bash
set -euo pipefail

# Drift check between eslint.config.mjs's tools/ ignore list and nx.json's
# @nx/eslint/plugin exclude array (LS-9322). The two lists must name the
# same tools/mcp/* and tools/* projects, or `nx run <project>:lint` can
# silently have no target for a project that eslint.config.mjs already
# considers lint-clean.
echo "Checking eslint.config.mjs / nx.json exclude-list sync..."
node scripts/check-eslint-nx-exclude-sync.mjs
echo "eslint/nx exclude-list sync check passed"
