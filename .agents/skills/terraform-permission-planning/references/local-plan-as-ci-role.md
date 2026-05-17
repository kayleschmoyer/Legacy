---
name: local-plan-as-ci-role
description: 'Validate Terraform IAM permission changes against the CI roles BEFORE merging to main, using a draft PR to exercise the github_actions_plan_policy and a targeted post-merge watch to catch any apply-only perm gaps. Use during step 4 of the terraform-permission-planning loop.'
---

# Validate IAM perms against the CI roles

## Why

Your local SSO admin profile has effectively all permissions. Running `terraform plan` locally with that profile **does not** prove the CI apply will succeed — the agent commonly observes a clean local plan, pushes, and then watches CI fail on `AccessDenied`.

The fix is to exercise the same roles CI uses **before** the change merges. This document covers the two roles and the safe procedure for each.

## The two roles

| Role                                  | Trust                            | Used by                                                                                 |
| ------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| `legacy-sports-dev-github-actions-pr` | OIDC, `pull_request` events      | The `Plan` job on every PR — exercises `github_actions_plan_policy`                     |
| `legacy-sports-dev-github-actions`    | OIDC, `ref:refs/heads/main` only | The `Apply Lambda Infrastructure` job after merge — exercises supplemental + additional |

> **⚠ Do not widen either trust policy for local development.** The trust policies are intentionally scoped to OIDC + a specific repo + a specific ref. Adding an IAM user ARN to enable local `sts:AssumeRole` is a privilege escalation risk: a forgotten or mis-removed statement leaves the production CI role assumable by a long-lived IAM principal. If you're tempted to do it anyway, push to a throwaway branch first — the draft PR path below covers ~95% of the cases.

## Validate plan-time perms (the safe, default path)

This catches missing `Get*` / `List*` / `Describe*` actions in `github_actions_plan_policy` **before** anything merges.

1. Commit your terraform change + your predicted plan-policy patch.
2. Push the branch and open a **draft PR**.
3. The `Plan` job runs on every push. Wait for it (Claude Code surfaces CI completion as a push notification — no polling).
4. If the job fails on `AccessDenied`, the GHA log shows exactly which action is missing on which resource ARN.
5. Add the missing action to `github_actions_plan_policy` (and mirror to `github_actions_supplemental` if the resource will also be applied — see [SKILL.md step 3](../SKILL.md#3-patch--minimal-scope-right-policy)).
6. Force-push and repeat until the `Plan` job succeeds.

> Reading the failure from the CI log: see [github-actions-logs.md](../../infrastructure/references/github-actions-logs.md).

## Validate apply-time perms

The apply role only assumes on `refs/heads/main` — there is no way to exercise it pre-merge without widening the trust policy, which this skill explicitly forbids. Instead:

1. **Pre-merge:** make the permission patch as complete as possible using the [predict step](../SKILL.md#1-predict) + [action-mapping.md](action-mapping.md). The cheatsheet exists specifically so apply-time perms can be patched without ever running an apply locally.
2. **At merge time:** mark the PR ready and merge. The `Apply Lambda Infrastructure` workflow runs immediately.
3. **Watch the apply job.** If it fails with `AccessDenied`:
   - Read the action + ARN from the log
   - Open a follow-up PR with the additional perm
   - **Do not bundle unrelated changes** — the follow-up should be permission-only so it lands in minutes
4. **Update [action-mapping.md](action-mapping.md)** in the same follow-up PR so the next agent doesn't hit the same gap.

This is intentionally accepting one possible follow-up PR per resource type the cheatsheet doesn't yet cover, in exchange for keeping the CI role's trust policy locked to OIDC. The cheatsheet's job is to drive that number toward zero over time.

## What about an SSO admin sanity plan?

Running `terraform plan` from your admin profile is still useful for catching **HCL** errors (typos, invalid attribute names, cycle detection, schema mismatches) before push. It won't catch IAM gaps, but it's free and fast — keep doing it as part of `make pc`.

## Summary

| Check                                       | Method                              | Catches                                            |
| ------------------------------------------- | ----------------------------------- | -------------------------------------------------- |
| HCL syntax / schema                         | local `terraform plan` (admin SSO)  | typos, invalid attributes, cycles                  |
| **Plan-policy IAM gaps (pre-merge)**        | Draft PR → wait for `Plan` job      | missing `Get*` / `List*` / `Describe*`             |
| **Apply-policy IAM gaps (post-merge only)** | Watch `Apply Lambda Infrastructure` | missing `Create*` / `Update*` / `Delete*` / `Tag*` |

The pre-merge plan check + a thorough predict step is the supported workflow. Local assume-role of the apply role is **not** supported.
