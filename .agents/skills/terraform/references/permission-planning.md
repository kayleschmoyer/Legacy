# Terraform Permission Planning

> Reference for the [`terraform`](../SKILL.md) skill. Load when adding or modifying a Terraform resource or data source — before push. Walks through the predict → diff → patch → local-plan-as-role → push loop and the minimal-permission convention. Pairs with the reactive [`iam-policies.md`](../../infrastructure/references/iam-policies.md) (size limits) and [`local-apply.md`](local-apply.md) (state mechanics).

## Why this exists

The default agent loop for Terraform changes is:

1. Edit `terraform/main/*.tf`
2. `make pc` (Terraform plan passes — plan does **not** validate IAM)
3. Push, merge
4. `Apply Lambda Infrastructure` workflow fails: `AccessDenied: not authorized to perform iam:CreateRole` (or similar)
5. Add one permission, repeat

Every iteration costs a PR, ~5 min of CI, and burns agent context. LS-4466 took 3 PRs to land cleanly because each apply surfaced exactly one more missing action (`sso:ListInstances` → `sso:CreateApplication` → resource-ARN scoping).

This skill flips the loop: **enumerate the permission delta before the first push**, patch the role policies in the same PR as the resource change, and validate locally against the same role CI assumes.

## The CI executor role

| Role                                  | Where it's defined                                           | When it runs                                             |
| ------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| `legacy-sports-dev-github-actions`    | `terraform/main/github-actions-oidc.tf`                      | All terraform apply workflows on main (lambda + runners) |
| `legacy-sports-dev-github-actions-pr` | same file (`aws_iam_role_policy.github_actions_plan_policy`) | PR plans (read-only — `Get*`, `List*`, `Describe*`)      |

Both roles have a permission boundary (`aws_iam_policy.github_actions_boundary`) that prevents privilege escalation outside the `legacy-sports-dev-*` namespace. New permissions go into either the apply role or the plan role — **never edit the boundary** unless you're explicitly granting access to a new resource namespace.

### Four policy attachments on the apply role

| Resource                                         | Type    | AWS limit             | When to edit                                                     |
| ------------------------------------------------ | ------- | --------------------- | ---------------------------------------------------------------- |
| `aws_iam_role_policy.github_actions_additional`  | Inline  | **10,240 bytes**      | Closed for new edits — only remove or fix typos                  |
| `aws_iam_policy.github_actions_supplemental`     | Managed | 6,144 bytes / version | Closed for new edits as of LS-9382 — ~94.8% full                 |
| `aws_iam_policy.github_actions_supplemental_2`   | Managed | 6,144 bytes / version | **Default home for all new apply-time perms** (added on LS-9382) |
| `aws_iam_role_policy.github_actions_plan_policy` | Inline  | 10,240 bytes          | Read-only equivalents needed by `terraform plan` (PR workflow)   |

See [iam-policies.md](../../infrastructure/references/iam-policies.md) for the full size-budget rationale (LS-3839), the per-policy size expectations, and the `-target` bootstrap-list gotcha that applies when adding a brand-new policy resource.

## The five-step loop

### 1. Predict

For every resource and data source you are adding or modifying, enumerate the AWS API actions Terraform will call. Four buckets:

- **Create** — what Terraform invokes on `apply` for a new resource (e.g. `iam:CreateRole`, `iam:PutRolePolicy`)
- **Read / refresh** — what Terraform invokes on every plan and on every apply _before_ the diff (e.g. `iam:GetRole`, `iam:ListRolePolicies`). These need to exist on **both** the apply role AND the plan role.
- **Tag** — many provider-v5+ resources call dedicated tag actions even when tags are inherited from `default_tags` (e.g. `apigateway:TagResource`, `lambda:TagResource`, `sso:TagResource`). Forgetting these is the #1 cause of LS-4466-style cycles.
- **Replace / delete** — if a `terraform plan` shows `must be replaced`, you also need the delete-side actions (`iam:DeleteRole`, `lambda:DeleteFunctionUrlConfig`).

Use the [action-mapping cheatsheet](action-mapping.md) as the starting point. When a resource type isn't listed, check the AWS [Service Authorization Reference](https://docs.aws.amazon.com/service-authorization/latest/reference/reference_policies_actions-resources-contextkeys.html).

### 2. Diff against current policies

```powershell
# Dump the union of current apply-role perms
terraform -chdir=terraform/main state show aws_iam_role_policy.github_actions_additional | grep -oE '"[a-z0-9]+:[A-Za-z*]+"' | sort -u > current-additional.txt
terraform -chdir=terraform/main state show aws_iam_policy.github_actions_supplemental    | grep -oE '"[a-z0-9]+:[A-Za-z*]+"' | sort -u > current-supplemental.txt
terraform -chdir=terraform/main state show aws_iam_policy.github_actions_supplemental_2  | grep -oE '"[a-z0-9]+:[A-Za-z*]+"' | sort -u > current-supplemental-2.txt
terraform -chdir=terraform/main state show aws_iam_role_policy.github_actions_plan_policy | grep -oE '"[a-z0-9]+:[A-Za-z*]+"' | sort -u > current-plan.txt
```

Compare your predicted action list against the union of the four files. The difference is your patch.

> Wildcard caveat: a current entry like `sso:*` covers any `sso:` action — manual diff alone is not enough; if a wildcard exists for the service prefix, treat the action as already granted.

### 3. Patch — minimal scope, right policy

Default rule: **new apply-time actions go in `github_actions_supplemental_2`. New plan-time read actions go in `github_actions_plan_policy`.**

Scope every action to the narrowest resource ARN it supports:

- For account-scoped resources Terraform will create: use the predictable ARN pattern (`arn:aws:lambda:${region}:${account_id}:function:legacy-sports-dev-*`).
- For service instance IDs (SSO, EventBridge bus): extract from a `data` source into `locals` and template into the ARN. See `terraform/main/lambda-mcp-api-gateway.tf` for the `local.sso_instance_id` extraction pattern (LS-4466).
- For actions that **do not support resource-level permissions** (`sqs:ListQueues`, `logs:DescribeLogGroups`, `cloudtrail:DescribeTrails`, `iam:ListPolicies`, `iam:ListRoles`, most `*List*` actions), split into a separate statement with `Resource = "*"`. Mixing them into a resource-scoped statement causes silent `AccessDenied` at runtime — see [iam-policies.md gotcha #1](../../infrastructure/references/iam-policies.md#1-some-actions-dont-support-resource-level-permissions).

Group new statements with existing ones for the same service when possible to conserve policy bytes.

### 4. Validate against the CI roles via draft PR

Don't rely on your laptop's SSO admin credentials — they'll happily run any plan. Push the change as a **draft PR**: the `Plan` job assumes the same `github_actions_plan_policy` CI uses and surfaces any missing `Get*` / `List*` / `Describe*` action as `AccessDenied` before merge.

Apply-only perms (`Create*`, `Update*`, `Delete*`, `Tag*`) cannot be validated pre-merge — the apply role's trust policy is OIDC-locked to `refs/heads/main` and **must not** be widened for local development. The pre-merge mitigation is a thorough [predict step](#1-predict) using the [action-mapping cheatsheet](action-mapping.md); the post-merge mitigation is watching the apply job and shipping a permission-only follow-up if anything was missed. See [local-plan-as-ci-role.md](local-plan-as-ci-role.md) for the full procedure and the rationale for not assuming the apply role locally.

### 5. Size-budget gate before push

```powershell
python scripts/check-iam-policy-size.py
```

The script measures the three policies attached to the apply role (not `github_actions_plan_policy`). All three clear the 240-byte headroom line as of LS-9383, so **exit 0 is the baseline and a non-zero exit is your change** — see the per-policy expectations table in [iam-policies.md § Validation](../../infrastructure/references/iam-policies.md#validation-estimate-policy-size-before-pushing). Abort the push if `github_actions_supplemental_2` is within **240 bytes** of its limit, or if either closed policy (`github_actions_additional`, `github_actions_supplemental` — both still closed for new edits) grew at all.

If `github_actions_supplemental_2` fills up, consolidate wildcards where no scoping is lost (e.g. merge `sso:CreateApplication`, `sso:UpdateApplication`, `sso:DeleteApplication` into `sso:*Application*`), or add a further supplemental policy (`_3`) attached to the same role — AWS allows 10 managed policies per role. A new policy resource must also be added to the `-target` bootstrap list in `.github/workflows/lambda-terraform-apply.yml`.

## Quick decision tree

```
Did you add or modify any terraform/**/*.tf?
├── No  → skill not needed
└── Yes → did you add/modify a resource or data source (not just locals/vars)?
    ├── No  → skip permission planning
    └── Yes → for each new/modified resource:
        ├── Is it a new resource type for the project? → predict + diff (follow loop above)
        ├── Is it an existing type with a new attribute? → usually safe, but check if attribute triggers a new action (e.g. tags_all, replication_configuration)
        └── Is it a data source? → only needs Get/List/Describe in plan policy
```

## Common antipatterns

| Antipattern                                                                                                            | Why it bites                                                                                                        | Fix                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Adding apply-time perms only — forgetting the plan role needs `Get*`/`Describe*` too                                   | PR plan in CI fails with AccessDenied during refresh; merge blocks                                                  | Mirror every new `Get*`/`Describe*`/`List*` into `github_actions_plan_policy`                    |
| Using `Resource = "*"` for everything because it "just works"                                                          | Trips the permission boundary on namespace-scoped actions (e.g. `iam:*` outside `legacy-sports-dev-*`)              | Scope to predictable resource ARNs; use `"*"` only for actions that genuinely don't support ARNs |
| Granting `service:*` to skip enumeration                                                                               | Bypasses minimal-permission principle; harder to audit; may exceed boundary                                         | Enumerate; only use service wildcards when you'll genuinely use ≥5 actions in that service       |
| Splitting one resource's perms across multiple PRs to "fix one CI failure at a time"                                   | Each cycle is 5+ min of CI + 1 PR + bot review                                                                      | Patch all four buckets (create/read/tag/delete) in the same PR as the resource                   |
| Editing `github_actions_additional` or `github_actions_supplemental` because that's "where similar perms already live" | Both are at their limits; a new statement pushes them over and apply fails **after merge** — plan does not catch it | Put new statements in `github_actions_supplemental_2` regardless of where peers live             |

## Worked example: adding a new SQS queue

```hcl
# In terraform/main/sqs-new-queue.tf
resource "aws_sqs_queue" "ingest" {
  name = "legacy-sports-dev-ingest"
  tags = local.common_tags
}
```

Predicted action set:

| Bucket           | Actions                                                                      | Policy                |
| ---------------- | ---------------------------------------------------------------------------- | --------------------- |
| Create           | `sqs:CreateQueue`, `sqs:SetQueueAttributes`, `sqs:TagQueue`                  | supplemental_2        |
| Read             | `sqs:GetQueueAttributes`, `sqs:GetQueueUrl`, `sqs:ListQueueTags`             | supplemental_2 + plan |
| Tag              | `sqs:TagQueue`, `sqs:UntagQueue`, `sqs:ListQueueTags`                        | supplemental_2        |
| Delete           | `sqs:DeleteQueue`                                                            | supplemental_2        |
| **`*` resource** | `sqs:ListQueues` — does not support resource-level perms; separate statement | supplemental_2        |

Resource ARN for the scoped statement: `arn:aws:sqs:${local.region}:${local.account_id}:legacy-sports-dev-*`.

## Diagrams

- [Permission planning flow](../diagrams/permission-flow.svg) — agent's step-by-step loop
- [Policy decision tree](../diagrams/decision-tree.svg) — which policy to edit, when to use `Resource = "*"`

## Related references

- [iam-policies.md](../../infrastructure/references/iam-policies.md) — Size limits, the three historical gotchas, what to do after CI fails
- [action-mapping.md](action-mapping.md) — Terraform resource → required AWS actions cheatsheet
- [local-plan-as-ci-role.md](local-plan-as-ci-role.md) — Assume the CI role locally to catch AccessDenied before push
- [local-apply.md](local-apply.md) — Two-state architecture, state locks, secrets.auto.tfvars
- [github-actions-logs.md](../../infrastructure/references/github-actions-logs.md) — Read apply failures from CI logs
