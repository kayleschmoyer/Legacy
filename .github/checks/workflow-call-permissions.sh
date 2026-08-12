#!/usr/bin/env bash
set -euo pipefail

# Reusable-workflow permission compatibility check (LS-9381).
#
# A called workflow cannot request a permission scope its calling job withholds.
# GitHub enforces this only at run start, and it fails the WHOLE run with
# startup_failure and zero jobs — see LS-9380, where adding `statuses: read` to
# upload-lambdas.yml without adding it to deploy.yml took down every
# main-branch deploy. Neither existing gate can see that class of break:
# validate-workflows checks each file against its schema independently (the
# change was schema-valid), and PR CI never starts deploy.yml at all (it
# triggers on push to main only).
#
# ROLLOUT: the check runs in ADVISORY mode — violations are reported as
# warnings and do not fail the build. The unit tests below ARE blocking. A
# false positive from the permission-inheritance rules would block every PR in
# the repo, so the check is promoted to blocking (drop `--advisory`) only after
# it has been observed clean against the real workflow set on main.

echo "Running workflow-call-permissions unit tests..."
node --test .github/scripts/__tests__/workflow-call-permissions.test.mjs
echo "workflow-call-permissions tests passed"

echo "Checking reusable-workflow permission compatibility (advisory)..."
node .github/scripts/workflow-call-permissions.mjs --advisory
