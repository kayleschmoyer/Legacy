---
name: iam-policies
description: 'Add IAM permissions to the github-actions deploy role without exceeding AWS policy size limits. Read this before adding any new statement to terraform/main/github-actions-oidc.tf.'
---

# Skill: Adding IAM Permissions to the GitHub Actions Deploy Role

## Why this exists

AWS enforces a hard **10,240-byte limit** on inline IAM role policies. We hit it on LS-3839 by adding four new permission blocks to `aws_iam_role_policy.github_actions_additional`. The apply succeeded in `terraform plan` (which only validates HCL) but blew up at apply with:

```
LimitExceeded: Maximum policy size of 10240 bytes exceeded
```

That error doesn't surface until **`terraform apply` runs in CI on `main`** — i.e. after merge. The fix required a follow-up PR (#3298) and another deploy cycle. **Read this file before touching `github-actions-oidc.tf`.**

## The two policies and where to put new permissions

`terraform/main/github-actions-oidc.tf` defines two policies on the same role:

| Resource                                        | Type    | AWS limit             | Use for                                                                                            |
| ----------------------------------------------- | ------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| `aws_iam_role_policy.github_actions_additional` | Inline  | **10,240 bytes**      | Permissions that have been here since the role was created. Treat as **closed for new edits**.     |
| `aws_iam_policy.github_actions_supplemental`    | Managed | 6,144 bytes / version | **Default home for all new permissions.** Already houses CloudTrail and external-secrets overflow. |

**Default rule: add new statements to `github_actions_supplemental`.** Both policies attach to the same role, so behavior is identical — only the size budget differs. Only edit the inline policy if you are removing a statement or fixing a typo.

The inline policy already carries an in-file comment marking the convention:

```hcl
# CloudTrail log group ARNs + metric filter actions live in the supplemental
# policy (github_actions_supplemental) to keep this inline policy under 10 KB.
```

## Validation: estimate policy size before pushing

Terraform plan does **not** catch policy-size violations. Run this Python check before `git push` whenever you add or remove statements:

```bash
# From the repo root:
python scripts/check-iam-policy-size.py
```

The check should report:

- **inline (`github_actions_additional`)**: under 10,000 bytes (leave headroom)
- **managed (`github_actions_supplemental`)**: under 5,800 bytes per version (leave headroom)

If you don't have the script, do a rough sanity check with `terraform plan -out=tfplan && terraform show -json tfplan | python -c "..."` — but the script is faster and worth committing.

## Three IAM gotchas this codebase has hit

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

## Workflow for adding a new permission

1. Identify the AWS API call(s) that Terraform will make. (Check `terraform plan` output or AWS CloudTrail for the failing apply.)
2. Look up the action(s) in the [Service Authorization Reference](https://docs.aws.amazon.com/service-authorization/latest/reference/reference_policies_actions-resources-contextkeys.html). Note whether each action supports resource-level permissions.
3. Find the right statement block in `github_actions_supplemental` (group with similar service actions when one exists; otherwise add a new block).
4. If any action doesn't support resource-level permissions, **split it into its own statement** with `Resource = "*"`.
5. Add a brief comment explaining what the actions are for (Terraform calls? Specific resource lifecycle?).
6. Run `terraform fmt`.
7. Run the policy-size check (above) — abort if either policy is within 240 bytes of its limit.
8. Run `make pc`, commit, push.
9. Watch the `Apply Lambda Infrastructure` workflow on `main` after merge. **Do not consider the change shipped until apply succeeds**, because terraform plan does not catch size or resource-level violations.

## Common failure modes

| Symptom                                                       | Cause                                                               | Fix                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `LimitExceeded: Maximum policy size of 10240 bytes`           | Added to inline `github_actions_additional`                         | Move to `github_actions_supplemental`                                |
| `LimitExceeded: Cannot exceed quota for PolicySize: 6144`     | Managed policy version is full                                      | Trim/refactor; or rotate by deleting an older managed policy version |
| `AccessDenied` on `sqs:ListQueues` despite policy in HCL      | Action mixed with resource-scoped statement                         | Split into own statement with `Resource = "*"`                       |
| ApiGatewayV2 stage create fails with TagResource AccessDenied | `apigateway:PUT` only — TagResource missing                         | Add `apigateway:TagResource` against `/tags/*`                       |
| Function URL create fails with AccessDenied                   | Permissions cover `lambda:GetFunction` but not `*FunctionUrlConfig` | Add the four `*FunctionUrlConfig` actions                            |

## Related references

- [terraform-apply.md](terraform-apply.md) — Terraform commands, workflows
- [terraform-common-issues.md](terraform-common-issues.md) — State locks, drift
- [github-actions-logs.md](github-actions-logs.md) — Reading apply failures from CI logs
