#!/usr/bin/env bash
set -euo pipefail

# jira-link marker unit + self-repair integration tests. Covers the marker
# parser/repairer shared by the Jira Link Check workflow (LS-9463): the forms
# agents write by hand, the read-modify-write body edits that drop the marker
# entirely, and the cases repair must refuse rather than guess at.
echo "Running jira-link marker tests..."
# Named explicitly, not globbed: every other file in this directory is already
# run by its own check script (one script per suite is the convention here).
node --test \
  .github/scripts/__tests__/jira-link-marker.test.mjs \
  .github/scripts/__tests__/jira-link-check.test.mjs
echo "jira-link marker tests passed"
