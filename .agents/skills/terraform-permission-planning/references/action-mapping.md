---
name: action-mapping
description: 'Terraform resource → required AWS IAM actions cheatsheet. Use during the predict step to enumerate the permission delta for new or modified resources before patching github_actions_supplemental and github_actions_plan_policy.'
---

# Terraform Resource → AWS Action Mapping

Use this cheatsheet during step 1 (predict) of the [terraform-permission-planning](../SKILL.md) loop. Each row lists the actions Terraform invokes for that resource type, grouped by the lifecycle bucket (create / read / tag / delete). **Read actions go in both the apply role AND the plan role**; everything else goes in apply only.

This is intentionally not exhaustive — it covers the resource types this repo uses today plus the historical gotchas. When you add a resource type not on this list, check the AWS [Service Authorization Reference](https://docs.aws.amazon.com/service-authorization/latest/reference/reference_policies_actions-resources-contextkeys.html) and add a row here in the same PR.

> **Wildcard convention:** `*` in an action name (e.g. `lambda:*FunctionUrlConfig`) means create/get/update/delete variants. Expand it when adding to policy JSON.

## Lambda

### `aws_lambda_function`

| Bucket | Actions                                                                                                                                                                                      | Notes |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Create | `lambda:CreateFunction`, `lambda:PutFunctionConcurrency`, `lambda:PutFunctionEventInvokeConfig`                                                                                              |       |
| Read   | `lambda:GetFunction`, `lambda:GetFunctionConfiguration`, `lambda:GetFunctionCodeSigningConfig`, `lambda:ListVersionsByFunction`, `lambda:GetPolicy`, `lambda:ListFunctionEventInvokeConfigs` |       |
| Tag    | `lambda:TagResource`, `lambda:UntagResource`, `lambda:ListTags`                                                                                                                              |       |
| Update | `lambda:UpdateFunctionCode`, `lambda:UpdateFunctionConfiguration`, `lambda:PublishVersion`                                                                                                   |       |
| Delete | `lambda:DeleteFunction`                                                                                                                                                                      |       |

### `aws_lambda_function_url`

| Bucket | Actions                                                                                                                             | Notes                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| All    | `lambda:CreateFunctionUrlConfig`, `lambda:GetFunctionUrlConfig`, `lambda:UpdateFunctionUrlConfig`, `lambda:DeleteFunctionUrlConfig` | **Distinct from `GetFunction`** — gotcha #3 in iam-policies.md |

### `aws_lambda_permission`

| Bucket | Actions                                                               |
| ------ | --------------------------------------------------------------------- |
| All    | `lambda:AddPermission`, `lambda:RemovePermission`, `lambda:GetPolicy` |

## API Gateway (v2)

### `aws_apigatewayv2_api` / `_stage` / `_route` / `_integration`

| Bucket | Actions                                                                                        | Notes                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| CRUD   | `apigateway:POST`, `apigateway:GET`, `apigateway:PATCH`, `apigateway:DELETE`, `apigateway:PUT` | Resource: `arn:aws:apigateway:${region}::/apis/*`, `.../stages/*`, etc.                                               |
| Tag    | `apigateway:TagResource`, `apigateway:UntagResource`                                           | **Resource: `arn:aws:apigateway:${region}::/tags/*`** — `PUT /tags/*` alone is insufficient for v2 stages (gotcha #2) |

## IAM

### `aws_iam_role` / `_role_policy` / `_role_policy_attachment`

| Bucket           | Actions                                                                                                                       | Notes                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Create           | `iam:CreateRole`, `iam:PutRolePolicy`, `iam:AttachRolePolicy`, `iam:PutRolePermissionsBoundary`                               | Scope to `arn:aws:iam::${account_id}:role/legacy-sports-dev-*`                 |
| Read             | `iam:GetRole`, `iam:GetRolePolicy`, `iam:ListRolePolicies`, `iam:ListAttachedRolePolicies`, `iam:ListInstanceProfilesForRole` |                                                                                |
| Tag              | `iam:TagRole`, `iam:UntagRole`, `iam:ListRoleTags`                                                                            |                                                                                |
| Delete           | `iam:DeleteRole`, `iam:DeleteRolePolicy`, `iam:DetachRolePolicy`                                                              |                                                                                |
| **`*` resource** | `iam:ListPolicies`, `iam:ListRoles`                                                                                           | Do not support resource-level perms — separate statement with `Resource = "*"` |

### `aws_iam_policy`

| Bucket | Actions                                                                                                                                                                                             | Notes                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| All    | `iam:CreatePolicy`, `iam:GetPolicy`, `iam:GetPolicyVersion`, `iam:ListPolicyVersions`, `iam:CreatePolicyVersion`, `iam:DeletePolicyVersion`, `iam:DeletePolicy`, `iam:TagPolicy`, `iam:UntagPolicy` | Scope: `arn:aws:iam::${account_id}:policy/legacy-sports-dev-*` |

## RDS

### `aws_db_instance` / `_db_parameter_group` / `_db_subnet_group`

| Bucket | Actions                                                                                                                                         | Notes                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Create | `rds:CreateDBInstance`, `rds:CreateDBParameterGroup`, `rds:CreateDBSubnetGroup`, `rds:ModifyDBInstance`                                         |                                                  |
| Read   | `rds:DescribeDBInstances`, `rds:DescribeDBParameterGroups`, `rds:DescribeDBParameters`, `rds:DescribeDBSubnetGroups`, `rds:ListTagsForResource` |                                                  |
| Tag    | `rds:AddTagsToResource`, `rds:RemoveTagsFromResource`                                                                                           |                                                  |
| Delete | `rds:DeleteDBInstance`, `rds:DeleteDBParameterGroup`, `rds:DeleteDBSubnetGroup`                                                                 | Destructive — verify deletion protection in plan |

## Secrets Manager

### `aws_secretsmanager_secret` / `_secret_version`

| Bucket | Actions                                                                                                                                                                                                                                                      | Notes                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| All    | `secretsmanager:CreateSecret`, `secretsmanager:DescribeSecret`, `secretsmanager:GetSecretValue`, `secretsmanager:PutSecretValue`, `secretsmanager:UpdateSecret`, `secretsmanager:TagResource`, `secretsmanager:UntagResource`, `secretsmanager:DeleteSecret` | Scope: `arn:aws:secretsmanager:${region}:${account_id}:secret:legacy-sports-dev-*` |

## SQS

### `aws_sqs_queue`

| Bucket           | Actions                                                          | Notes                                    |
| ---------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| Create           | `sqs:CreateQueue`, `sqs:SetQueueAttributes`                      |                                          |
| Read             | `sqs:GetQueueAttributes`, `sqs:GetQueueUrl`, `sqs:ListQueueTags` |                                          |
| Tag              | `sqs:TagQueue`, `sqs:UntagQueue`                                 |                                          |
| Delete           | `sqs:DeleteQueue`                                                |                                          |
| **`*` resource** | `sqs:ListQueues`                                                 | Separate statement with `Resource = "*"` |

## DynamoDB

### `aws_dynamodb_table`

| Bucket | Actions                                                                                                                                                                                                                                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All    | `dynamodb:CreateTable`, `dynamodb:DescribeTable`, `dynamodb:DescribeContinuousBackups`, `dynamodb:DescribeTimeToLive`, `dynamodb:UpdateTable`, `dynamodb:UpdateTimeToLive`, `dynamodb:UpdateContinuousBackups`, `dynamodb:TagResource`, `dynamodb:UntagResource`, `dynamodb:ListTagsOfResource`, `dynamodb:DeleteTable` |

## CloudWatch

### `aws_cloudwatch_log_group`

| Bucket           | Actions                                                                                                                                                                  | Notes                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| All              | `logs:CreateLogGroup`, `logs:DeleteLogGroup`, `logs:PutRetentionPolicy`, `logs:DeleteRetentionPolicy`, `logs:TagLogGroup`, `logs:UntagLogGroup`, `logs:ListTagsLogGroup` |                                       |
| **`*` resource** | `logs:DescribeLogGroups`                                                                                                                                                 | Does not support resource-level perms |

### `aws_cloudwatch_metric_alarm`

| Bucket | Actions                                                                                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All    | `cloudwatch:PutMetricAlarm`, `cloudwatch:DescribeAlarms`, `cloudwatch:DeleteAlarms`, `cloudwatch:TagResource`, `cloudwatch:UntagResource`, `cloudwatch:ListTagsForResource` |

## SSO (Identity Center)

### `data.aws_ssoadmin_instances` + `aws_ssoadmin_application`

| Bucket | Actions                                                                                                                                        | Notes                                                                                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read   | `sso:ListInstances`, `sso:DescribeApplication`, `sso:ListApplicationAccessScopes`, `sso:GetApplicationAccessScope`                             | `sso:ListInstances` is `Resource = "*"`                                                                                                                         |
| Write  | `sso:CreateApplication`, `sso:UpdateApplication`, `sso:DeleteApplication`, `sso:PutApplicationAccessScope`, `sso:DeleteApplicationAccessScope` | Scope: `arn:aws:sso::${account_id}:application/${local.sso_instance_id}/*` — extract instance ID via `regex()` from `data.aws_ssoadmin_instances` (see LS-4466) |
| Tag    | `sso:TagResource`, `sso:UntagResource`                                                                                                         | Scope: `arn:aws:sso::*:application/${local.sso_instance_id}/*` — AWS evaluates create-time tags with account `*`                                                |

## S3

### `aws_s3_bucket` / `_bucket_*` sub-resources

| Bucket           | Actions                                                                                                                                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create           | `s3:CreateBucket`, `s3:PutBucketTagging`, `s3:PutBucketVersioning`, `s3:PutBucketEncryption`, `s3:PutBucketPolicy`, `s3:PutBucketPublicAccessBlock`, `s3:PutBucketLifecycleConfiguration`                                                                        |
| Read             | `s3:GetBucketTagging`, `s3:GetBucketVersioning`, `s3:GetBucketEncryption`, `s3:GetBucketPolicy`, `s3:GetBucketPublicAccessBlock`, `s3:GetBucketLifecycleConfiguration`, `s3:GetBucketLocation`, `s3:GetBucketCORS`, `s3:GetBucketLogging`, `s3:GetBucketWebsite` |
| Tag              | `s3:PutBucketTagging`, `s3:GetBucketTagging`                                                                                                                                                                                                                     |
| Delete           | `s3:DeleteBucket`, `s3:DeleteBucketPolicy`                                                                                                                                                                                                                       |
| **`*` resource** | `s3:ListAllMyBuckets`                                                                                                                                                                                                                                            |

## Actions that do not support resource-level permissions

These **must** be in their own statement with `Resource = "*"`. Mixing them with resource-scoped statements causes silent `AccessDenied` at runtime.

| Action                      |
| --------------------------- |
| `sqs:ListQueues`            |
| `logs:DescribeLogGroups`    |
| `cloudtrail:DescribeTrails` |
| `cloudtrail:ListTrails`     |
| `iam:ListPolicies`          |
| `iam:ListRoles`             |
| `sso:ListInstances`         |
| `s3:ListAllMyBuckets`       |
| `ec2:Describe*` (most)      |

When in doubt, check the AWS Service Authorization Reference — if the table shows no resource types for an action, it requires `"*"`.

## Adding a new row

When you discover a resource type missing from this list:

1. Add the row in the same PR as the resource itself.
2. Note any quirks (separate-statement requirements, ARN extraction, version-specific behavior).
3. If the resource hit a CI failure first, link the failing run + the fix commit in the row notes for future agents.
