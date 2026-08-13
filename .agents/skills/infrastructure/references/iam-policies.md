---
name: iam-policies
description: 'Add IAM permissions to the github-actions deploy role without exceeding AWS policy size limits. New permissions go in github_actions_supplemental_2 — the other two policies are closed for new edits. Read this before adding any new statement to terraform/main/github-actions-oidc.tf.'
---

# Skill: Adding IAM Permissions to the GitHub Actions Deploy Role

## Why this exists

AWS enforces a hard **10,240-byte limit** on inline IAM role policies. We hit it on LS-3839 by adding four new permission blocks to `aws_iam_role_policy.github_actions_additional`. The apply succeeded in `terraform plan` (which only validates HCL) but blew up at apply with:

```
LimitExceeded: Maximum policy size of 10240 bytes exceeded
```

That error doesn't surface until **`terraform apply` runs in CI on `main`** — i.e. after merge. The fix required a follow-up PR (#3298) and another deploy cycle. **Read this file before touching `github-actions-oidc.tf`.**

## The three policies and where to put new permissions

`terraform/main/github-actions-oidc.tf` defines three policies on the same role. All three attach to the same role, so behavior is identical — only the size budget differs.

| Resource                                        | Type    | AWS limit             | Use for                                                                                                                               |
| ----------------------------------------------- | ------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `aws_iam_role_policy.github_actions_additional` | Inline  | **10,240 bytes**      | Permissions that have been here since the role was created. **Closed for new edits** — the LS-9383 trim is safety margin, not budget. |
| `aws_iam_policy.github_actions_supplemental`    | Managed | 6,144 bytes / version | **Also closed for new edits.** Houses CloudTrail and external-secrets overflow. Was the default home until LS-9382; now ~94.8% full.  |
| `aws_iam_policy.github_actions_supplemental_2`  | Managed | 6,144 bytes / version | **Default home for all new permissions** (added on LS-9382). This is the only policy with meaningful headroom.                        |

**Default rule: add new statements to `github_actions_supplemental_2`.** Only edit the other two if you are removing a statement or fixing a typo.

> **Why the default moved (LS-9382).** Both older policies reached their AWS limit at the same time — the inline policy at 10,189/10,240 bytes (99.5%) and `github_actions_supplemental` at 5,822/6,144 (94.8%, ~322 bytes of headroom). `github_actions_supplemental_2` was added because a third policy on the same role was cheaper and lower-risk than trimming unrelated statements out of either. LS-9383 later reclaimed 520 bytes of the inline policy by deleting provably redundant grants (a subsumed `apigateway:PUT` statement, a hardcoded db-creds ARN already covered by the `name_prefix` wildcard, and four `:*` log-group duplicates) — that headroom is a safety margin, **not** a reason to move the default back. **These byte counts are a snapshot (2026-08-12) — always re-run the size check below rather than trusting them.**

`github_actions_supplemental_2` carries the in-file comment marking the current convention:

```hcl
# Second supplemental managed policy — **default home for new permissions.**
```

Note that older comments elsewhere in the file still point at `github_actions_supplemental` — for example the CloudTrail note in the inline policy (`# ... live in the supplemental policy (github_actions_supplemental) ...`). Those describe where existing statements already live, not where new ones go.

## Validation: estimate policy size before pushing

Terraform plan does **not** catch policy-size violations. Run this Python check before `git push` whenever you add or remove statements:

```bash
# From the repo root:
python scripts/check-iam-policy-size.py
```

The script measures **all three** policies and exits non-zero when any of them is within 240 bytes of its limit. As of LS-9383 all three clear that line, so **exit 0 is the baseline and a non-zero exit is your change** — do not wave it through:

| Policy                                    | Target                        | Reality (2026-08-13)                                                                                              |
| ----------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| inline (`github_actions_additional`)      | n/a — closed for new edits    | 9,669 / 10,240 (94.4%) — trimmed on LS-9383. Any growth here means you edited the wrong policy.                   |
| managed (`github_actions_supplemental`)   | n/a — closed for new edits    | 5,822 / 6,144 (94.8%) — will not come back under 5,800 and is not supposed to. Any growth means the wrong policy. |
| managed (`github_actions_supplemental_2`) | under 5,800 bytes per version | 619 / 6,144 (10.1%) — this is the number your change should move.                                                 |

If the check fails, find which policy moved. `github_actions_supplemental_2` past ~5,800 bytes means it is time for a `_3` policy (see the failure-modes table below); either closed policy growing at all means you added the statement to the wrong one — move it to `github_actions_supplemental_2`.

If you don't have the script, do a rough sanity check with `terraform plan -out=tfplan && terraform show -json tfplan | python -c "..."` — but the script is faster and worth committing.

## Four IAM gotchas this codebase has hit

### 1. Some actions don't support resource-level permissions

These actions **must** use `Resource = "*"`. Mixing them into a statement with a resource ARN causes silent `AccessDenied` at runtime:

| Action                           | Resource pattern |
| -------------------------------- | ---------------- |
| `sqs:ListQueues`                 | `Resource = "*"` |
| `logs:DescribeLogGroups`         | `Resource = "*"` |
| `cloudtrail:DescribeTrails`      | `Resource = "*"` |
| `cloudtrail:ListTrails`          | `Resource = "*"` |
| `iam:ListPolicies` / `ListRoles` | `Resource = "*"` |

Pattern: split these into their own statement block. Existing examples live near `logs:DescribeLogGroups` (line ~219 of `github-actions-oidc.tf`).

When in doubt, check the AWS [Service Authorization Reference](https://docs.aws.amazon.com/service-authorization/latest/reference/reference_policies_actions-resources-contextkeys.html) — actions with no resource type listed require `"*"`.

### 2. `apigateway:TagResource` is required for ApiGatewayV2 stages

Terraform-provider-aws calls **explicit IAM tagging actions** when creating ApiGatewayV2 stages — `apigateway:TagResource` and `apigateway:UntagResource` against `arn:aws:apigateway:<region>::/tags/*`. **`PUT /tags/*` alone is insufficient** for the v2 API, even though the v1 API accepted it.

```hcl
{
  Effect = "Allow"
  Action = [
    "apigateway:TagResource",
    "apigateway:UntagResource"
  ]
  Resource = [
    "arn:aws:apigateway:${local.region}::/tags/*"
  ]
}
```

### 3. Lambda Function URL lifecycle is its own action set

Function URLs (used by `mcp-jira` and any Lambda exposed via `aws_lambda_function_url`) require their own actions — `Get/Update/DeleteFunction` is **not** sufficient:

```hcl
"lambda:CreateFunctionUrlConfig",
"lambda:GetFunctionUrlConfig",
"lambda:UpdateFunctionUrlConfig",
"lambda:DeleteFunctionUrlConfig"
```

### 4. A NEW policy resource must be added to the apply workflow's `-target` bootstrap list

This only applies when you add a **new policy resource** (as LS-9382 did), not when you add a statement to an existing one.

`.github/workflows/lambda-terraform-apply.yml` runs a targeted `terraform apply` — the "Bootstrapping IAM policy changes" step — **before** the main plan/apply, to grant the role any new permissions it will need to apply the rest of the config. That step uses a **hardcoded `-target` list**:

```yaml
terraform apply \
-input=false -auto-approve -refresh=false -lock-timeout=5m \
-target=aws_iam_role_policy.github_actions_additional \
-target=aws_iam_role_policy.github_actions_plan_policy \
-target=aws_iam_policy.github_actions_supplemental \
-target=aws_iam_role_policy_attachment.github_actions_supplemental \
-target=aws_iam_policy.github_actions_supplemental_2 \
-target=aws_iam_role_policy_attachment.github_actions_supplemental_2
```

A new policy that is **not** in this list is skipped by the targeted pass. It then gets created during the main apply, which has **no ordering guarantee** against the resources that need those permissions — so the apply can fail with `AccessDenied` on a resource whose grant exists in the same plan.

Add **two** entries per new policy — the `aws_iam_policy` **and** its `aws_iam_role_policy_attachment`. The policy alone grants nothing until it is attached to the role.

## Workflow for adding a new permission

1. Identify the AWS API call(s) that Terraform will make. (Check `terraform plan` output or AWS CloudTrail for the failing apply.)
2. Look up the action(s) in the [Service Authorization Reference](https://docs.aws.amazon.com/service-authorization/latest/reference/reference_policies_actions-resources-contextkeys.html). Note whether each action supports resource-level permissions.
3. Find the right statement block in `github_actions_supplemental_2` (group with similar service actions when one exists; otherwise add a new block). Do not add to `github_actions_additional` or `github_actions_supplemental` — both are closed for new edits.
4. If any action doesn't support resource-level permissions, **split it into its own statement** with `Resource = "*"`.
5. Add a brief comment explaining what the actions are for (Terraform calls? Specific resource lifecycle?).
6. Run `terraform fmt`.
7. Run the policy-size check (above) — it must exit 0. Abort if `github_actions_supplemental_2` is within 240 bytes of its limit, or if either closed policy grew.
   - If you added a **new policy resource**, also add it plus its role attachment to the `-target` list in `.github/workflows/lambda-terraform-apply.yml` (gotcha #4).
8. Run `make pc`, commit, push.
9. Watch the `Apply Lambda Infrastructure` workflow on `main` after merge. **Do not consider the change shipped until apply succeeds**, because terraform plan does not catch size or resource-level violations.

## Common failure modes

| Symptom                                                       | Cause                                                                                                   | Fix                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LimitExceeded: Maximum policy size of 10240 bytes`           | Added to inline `github_actions_additional`                                                             | Move to `github_actions_supplemental_2`                                                                                                                                                                                                                                                              |
| `LimitExceeded: Cannot exceed quota for PolicySize: 6144`     | A managed policy version is full — usually `github_actions_supplemental`, which is closed for new edits | Move the statement to `github_actions_supplemental_2`. If **that** is also full, add a further supplemental policy (`_3`) on the same role — AWS allows 10 managed policies per role, and this is the pattern LS-9382 established. Do not trim unrelated statements or delete older policy versions. |
| New policy created but apply still fails `AccessDenied`       | New policy resource missing from the `-target` bootstrap list in `lambda-terraform-apply.yml`           | Add the `aws_iam_policy` **and** its `aws_iam_role_policy_attachment` to that list (gotcha #4)                                                                                                                                                                                                       |
| `AccessDenied` on `sqs:ListQueues` despite policy in HCL      | Action mixed with resource-scoped statement                                                             | Split into own statement with `Resource = "*"`                                                                                                                                                                                                                                                       |
| ApiGatewayV2 stage create fails with TagResource AccessDenied | `apigateway:PUT` only — TagResource missing                                                             | Add `apigateway:TagResource` against `/tags/*`                                                                                                                                                                                                                                                       |
| Function URL create fails with AccessDenied                   | Permissions cover `lambda:GetFunction` but not `*FunctionUrlConfig`                                     | Add the four `*FunctionUrlConfig` actions                                                                                                                                                                                                                                                            |

## Related references

- [terraform-apply.md](terraform-apply.md) — Terraform commands, workflows
- [terraform-common-issues.md](terraform-common-issues.md) — State locks, drift
- [github-actions-logs.md](github-actions-logs.md) — Reading apply failures from CI logs
