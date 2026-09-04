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
# ROLLOUT: promoted to BLOCKING in LS-9385. The check ran in ADVISORY mode
# (violations reported as warnings, build never failed) from LS-9381's merge
# on 2026-08-12 through 2026-09-04 — a 23-day soak spanning 7+ merged PRs to
# main, well past the >=1 week / >=20 PR bar. Zero `::warning::` occurrences
# from workflow-call-permissions were found in any custom-checks log still
# retrievable in that window (GitHub retains raw job logs for ~9 days; the
# two most recent main runs, both re-dispatches of the same commit, were
# grep-verified clean — "Scanned 59 workflow file(s); 6 local reusable-workflow
# call site(s) verified" with no violations). Older runs in the window show an
# unbroken `custom-checks` success streak but their raw logs have since
# expired, so they could not be grepped directly. The unit tests below ARE
# blocking, as they always have been.
#
# `--advisory` remains a supported flag on the script itself (see
# workflow-call-permissions.mjs) for local dry-runs; only this wrapper stops
# passing it.

echo "Running workflow-call-permissions unit tests..."
node --test .github/scripts/__tests__/workflow-call-permissions.test.mjs
echo "workflow-call-permissions tests passed"

echo "Checking reusable-workflow permission compatibility..."
node .github/scripts/workflow-call-permissions.mjs
