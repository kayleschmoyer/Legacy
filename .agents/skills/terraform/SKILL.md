---
name: terraform
description: 'Working on AWS infrastructure under terraform/. Load when adding or modifying any Terraform resource, running plan/apply locally against AWS dev, or adding a new secret or environment variable that needs Terraform plumbing (variables.tf / secrets.tf / Secrets Manager / Lambda env / GitHub Actions TF_VAR_*). Covers IAM permission planning for the CI roles (predict → diff → patch → local-plan-as-role), the two-state architecture (terraform/main/ for Lambda app, terraform/runners/ for runners), state lock clearance, and the full secret-or-env-var checklist. Distinct from `secrets-handling`, which covers safely transiting an existing secret VALUE in tool calls — this skill is about wiring NEW secrets/env vars through the infrastructure.'
---

# Skill: Terraform

Single entrypoint for any work that touches `terraform/`. The detailed playbooks live in `references/`.

## When to load which reference

| Reference                                                                                              | Load when                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`references/permission-planning.md`](references/permission-planning.md)                               | Adding or modifying a Terraform resource or data source — **BEFORE** push. Plans the IAM delta against `github_actions_supplemental` / `github_actions_plan_policy` so CI apply doesn't fail on `AccessDenied`. |
| [`references/local-apply.md`](references/local-apply.md)                                               | Running `terraform plan`, `apply`, `destroy`, `import`, or any state operation locally. Covers the two-state architecture, SSO check, lock clearance, and the `terraform_state_*` MCP tools.                    |
| [`references/add-secret-or-env-var.md`](references/add-secret-or-env-var.md)                           | Adding a NEW secret or environment variable. Walks the 11-location checklist (`.env` → variables.tf → secrets.auto.tfvars → AWS Secrets Manager → Lambda IAM + env → GitHub Actions + `TF_VAR_*`).              |
| [`references/action-mapping.md`](references/action-mapping.md)                                         | During the predict step of `permission-planning.md`. Terraform resource type → required AWS IAM actions cheatsheet.                                                                                             |
| [`references/local-plan-as-ci-role.md`](references/local-plan-as-ci-role.md)                           | During step 4 of `permission-planning.md`. Procedure for validating plan-policy gaps via a draft PR and apply-policy gaps via a post-merge watch.                                                               |
| [`references/add-secret-or-env-var-step-by-step.md`](references/add-secret-or-env-var-step-by-step.md) | Companion code examples for `add-secret-or-env-var.md` (one section per checklist step).                                                                                                                        |

## Routing — distinguishing from `secrets-handling`

`secrets-handling` covers the **safety of secret VALUES in transit through tool calls** — never echoing values into `Edit`/`Write`/`Bash` arguments, using `valueFile` / `secret_sync_to_github`, etc. Load it whenever you have a value in hand and need to move it.

This skill (`terraform`) covers **wiring a NEW secret or env var through the infrastructure** — variable declarations, AWS Secrets Manager resources, Lambda IAM, CI workflow `TF_VAR_*` mappings. Load `references/add-secret-or-env-var.md` here whenever the task is "add a new secret/env var" regardless of whether you currently hold the value.

The two skills are complementary: `add-secret-or-env-var.md` references `secrets-handling` for the value-population step (`Pattern 1` file-copy, `Pattern 2` `secret_sync_to_github`); `secrets-handling` references this skill for the full plumbing checklist.

## Critical rules

- **Never widen the CI role trust policies for local development.** They are OIDC-locked to specific refs by design — see [`references/local-plan-as-ci-role.md`](references/local-plan-as-ci-role.md).
- **Never edit the permission boundary** (`aws_iam_policy.github_actions_boundary`) unless explicitly granting access to a new resource namespace.
- **New apply-time actions go in `github_actions_supplemental`. New plan-time read actions go in `github_actions_plan_policy`.** The inline `github_actions_additional` policy is closed for new edits (10K byte limit).
- **Never pipe `terraform apply` through output-truncating filters** — interrupts Terraform before it releases the DynamoDB state lock.
- **Never commit `secrets.auto.tfvars`** — gitignored on purpose.

## Related skills

- [`secrets-handling`](../secrets-handling/SKILL.md) — Safely transit secret values through tool calls
- [`infrastructure`](../infrastructure/SKILL.md) — AWS operations, Lambda deployment, post-failure recovery; IAM policy size budgets live in its [`references/iam-policies.md`](../infrastructure/references/iam-policies.md)
- [`credentials`](../credentials/SKILL.md) — AWS/Jira/GitHub auth status checks before workflows
