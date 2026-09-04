#!/usr/bin/env bash
set -euo pipefail

# LS-9887. Validates .github/labels.yml (the single source of truth for labels,
# applied by .github/workflows/label-sync.yml) before it can merge.
#
# WHY PRE-MERGE: label-sync.yml only fires on a push to main that touches
# labels.yml, so a label GitHub refuses to create is invisible until long
# after the change lands — and the live label meanwhile keeps whatever
# defaults GitHub auto-created for it when `issues.setLabels` first applied
# it: grey `ededed` with a null description. That is how `CI: Custom Checks`
# ended up looking like a non-failure scope label sitting among its red
# `e11d48` siblings: its description was 194 characters and GitHub caps them
# at 100, so every sync attempt 422'd.
#
# Degrades to a skip rather than a failure when python3/PyYAML is unavailable.
# This whole ticket exists because CI asserted failures it could not justify;
# reddening a required check over a missing interpreter would repeat that.
# The validation still runs everywhere the interpreter exists, and label-sync
# itself re-validates before touching the repo.
echo "Validating .github/labels.yml..."

if ! command -v python3 > /dev/null 2>&1; then
  echo "SKIP: python3 not available on this runner"
  exit 0
fi
if ! python3 -c "import yaml" > /dev/null 2>&1; then
  echo "SKIP: PyYAML not installed for python3 on this runner"
  exit 0
fi

python3 .github/scripts/sync-labels.py --check .github/labels.yml
echo "Labels config check passed"
