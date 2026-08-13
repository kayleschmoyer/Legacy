#!/usr/bin/env bash
# Deliberately NOT `set -e`: this script inspects the Python checker's exit
# code to tell a size failure (1) apart from a parse failure (2), so it must
# survive a non-zero child and decide what to report itself.
set -uo pipefail

# IAM policy size gate (LS-9412).
#
# scripts/check-iam-policy-size.py measures the three IAM policies attached to
# the github-actions deploy role against the AWS serialized-JSON limits
# (10,240 bytes for the inline role policy, 6,144 bytes per managed policy
# version) and fails when any of them is over its limit or inside the 240-byte
# headroom window.
#
# Why this is a CI gate and not just a documented pre-push step: `terraform
# plan` does NOT catch policy-size violations. They surface only at `terraform
# apply`, which runs on main AFTER merge, as "LimitExceeded: Maximum policy
# size of 10240 bytes exceeded". That has already cost the repo one broken
# deploy plus a follow-up PR (LS-3839 / PR #3298). This check is the only
# pre-merge signal that exists. It was documented as a mandatory pre-push step
# in .agents/skills/infrastructure/references/iam-policies.md long before
# anything enforced it, so in practice it ran only when someone remembered.
#
# It became enforceable on LS-9383, which trimmed the inline policy from
# 10,189 to 9,669 bytes. Before that the checker was permanently red by design
# and could not be wired to a gate.
#
# This runs unconditionally rather than behind a path filter. The checker is
# pure-stdlib Python over a single file and finishes in ~0.15s wall clock,
# interpreter startup included — far below the noise floor of the custom-checks
# job, so a PR that does not touch the Terraform file pays nothing meaningful.
# Running it always is also strictly stronger than a path filter: it catches
# drift that reaches main by any route other than a PR that edited the file
# (a merge-queue override, a revert, a change to the checker's own LOCAL_SUBS
# substitutions). Every other script in this directory runs unconditionally for
# the same reason.

echo "Checking IAM policy sizes against AWS limits..."

PYTHON=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PYTHON="$candidate"
    break
  fi
done

if [ -z "$PYTHON" ]; then
  echo "::error::IAM policy size gate could not run — neither python3 nor python is on PATH."
  echo "This gate must never silently pass. Install Python on the runner image or fix PATH."
  echo "The runner AMI (terraform/runners/packer/runner-ami.pkr.hcl) is Ubuntu-based and ships python3."
  exit 1
fi

# Guard the checker's own existence before running it. CPython also exits 2 when
# it cannot open the script file, which would otherwise be reported below as a
# Terraform parse failure and send the reader looking at the wrong file.
if [ ! -f scripts/check-iam-policy-size.py ]; then
  echo "::error::scripts/check-iam-policy-size.py is missing, so the IAM policy size gate cannot run."
  echo "This gate must never silently pass. Restore the script or remove this check deliberately."
  exit 1
fi

"$PYTHON" scripts/check-iam-policy-size.py
status=$?

case "$status" in
  0)
    echo "IAM policy size check passed"
    ;;
  1)
    echo "::error::IAM policy SIZE check failed (exit 1) — a policy is over its AWS limit or within the 240-byte headroom window."
    echo "This is a SIZE failure, not a parse failure. Check which policy the table above flagged:"
    echo "  - github_actions_supplemental_2 -> the default home for new permissions. Past ~5,800 bytes it is"
    echo "    time for a _3 policy; see 'Common failure modes' in the reference below."
    echo "  - github_actions_additional or github_actions_supplemental -> both are closed for new edits, so a"
    echo "    flag here means the statement went into the wrong policy. Move it to github_actions_supplemental_2."
    echo "Convention: .agents/skills/infrastructure/references/iam-policies.md"
    exit 1
    ;;
  2)
    echo "::error::IAM policy size check could not PARSE terraform/main/github-actions-oidc.tf (exit 2)."
    echo "This is a PARSE failure, not a size failure — the Terraform file changed shape, so no size"
    echo "measurement was produced at all and the policies are currently UNCHECKED."
    echo "Update scripts/check-iam-policy-size.py to handle the new shape before trusting any size estimate."
    exit 2
    ;;
  *)
    echo "::error::scripts/check-iam-policy-size.py exited with unexpected status ${status} (expected 0, 1, or 2)."
    echo "Treating this as a failure — the policies are UNCHECKED."
    exit "$status"
    ;;
esac
