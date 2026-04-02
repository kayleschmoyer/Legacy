# Common Terraform Issues

## Common Issues

### Issue: State lock error (MOST COMMON)

**Symptom**: "Error acquiring the state lock" or "operation error DynamoDB: PutItem"
**Cause**: Previous terraform operation was interrupted or crashed
**Solution**: Use the unlock script (RECOMMENDED)

```powershell
# RECOMMENDED: Use the automated unlock script
node scripts/terraform-unlock.js

# This will:
# 1. Check if state is locked
# 2. Show who/when the lock was created
# 3. Automatically unlock if needed
# 4. Confirm state is available

# Then retry your terraform command:
cd terraform
terraform plan
# or
terraform apply
```

**Manual unlock (if script fails)**:

```powershell
# Get lock info from error message, then:
cd terraform
terraform force-unlock <lock-id-from-error>
```

### Issue: AWS credentials not configured

**Symptom**: "No valid credential sources found"
**Solution**: Configure AWS credentials

```powershell
# Use AWS CLI (preferred — avoids credentials in shell history)
aws configure

# Or use AWS SSO
aws sso login --profile your-profile
```

### Issue: Terraform state drift

**Symptom**: Plan shows unexpected changes
**Solution**: Review changes and refresh state

```powershell
# Refresh state from AWS
terraform refresh

# View diff
terraform plan

# If changes are expected, apply them
terraform apply
```

### Issue: Resource already exists

**Symptom**: "Resource already exists"
**Solution**: Import existing resource to state

```powershell
# Import existing resource
terraform import aws_lambda_function.db legacy-sports-dev-db

# Then apply
terraform apply
```

### Issue: Terraform version mismatch

**Symptom**: "Required version constraint"
**Solution**: Use correct Terraform version

```powershell
# Check version
terraform version

# Install correct version or use tfenv
# See required version in terraform/versions.tf
```

### Issue: Terraform prompts for secrets interactively in a worktree

**Symptom**: `terraform plan/apply` blocks asking for `var.google_oauth_client_secret`, `var.jira_credentials`, etc.
**Cause**: `terraform/secrets.auto.tfvars` is gitignored and lives only in the main repo. It is **not** automatically present in a new worktree unless `make wt-setup` was run (which copies it as of this fix).
**Solution**:

```powershell
# Option A: Re-run wt-setup from the main repo (preferred)
make wt-setup WT=<path-to-worktree>

# Option B: Copy manually
Copy-Item D:\code\legacy-sports\terraform\secrets.auto.tfvars <worktree>\terraform\secrets.auto.tfvars
```

> **Note on `jira_credentials`**: This variable is **not** in `secrets.auto.tfvars` — it is managed via the `TF_VAR_jira_credentials` environment variable (set from GitHub Actions secret `JIRA_CREDENTIALS` in CI). For local apply, fetch it from AWS Secrets Manager:
>
> ```powershell
> $env:TF_VAR_jira_credentials = aws secretsmanager get-secret-value `
>   --secret-id "legacy-sports-dev-jira-credentials" `
>   --query SecretString --output text
> ```

---

### Issue: Piping `terraform apply` output causes orphaned state lock

**Symptom**: Terraform acquires a lock, but after the command exits via a piped `Select-Object -Last N` the lock is **not released**. Subsequent commands fail with "Error acquiring the state lock".
**Cause**: `Select-Object -First/-Last` terminates the pipeline early, sending an interrupt to Terraform before it can release the DynamoDB lock.
**Solution**: **Never pipe `terraform apply` or `terraform plan` through output-truncating filters.** Let Terraform complete fully, or redirect to a file:

```powershell
# BAD — leaves a dangling lock:
terraform apply -auto-approve 2>&1 | Select-Object -Last 20

# GOOD — run to completion:
terraform apply -auto-approve

# GOOD — capture to file, then tail:
terraform apply -auto-approve 2>&1 | Out-File scratch/tf-apply.txt
Get-Content scratch/tf-apply.txt | Select-Object -Last 20
```

If you accidentally orphan a lock, clear it with:

```powershell
node scripts/terraform-unlock.js
```

---

### Issue: Lambda S3 package not found

**Solution**: Verify Lambda package is at expected S3 location

```powershell
# This occurs with db Lambda which Terraform expects at graphql/ prefix
# Check version being deployed
$version = aws ssm get-parameter --name "/legacy-sports/dev/lambda/graphql/version" --query 'Parameter.Value' --output text

# Verify file exists at expected location
aws s3 ls s3://legacy-sports-dev-lambdas-cca20ad9/graphql/ | Select-String $version

# If not found, copy from actual upload location
aws s3 cp `
  s3://legacy-sports-dev-lambdas-cca20ad9/db/db-$version.zip `
  s3://legacy-sports-dev-lambdas-cca20ad9/graphql/graphql-$version.zip

# Then retry terraform apply
terraform apply -auto-approve
```

**Note**: The db Lambda deployment script uploads to `db/` prefix but Terraform expects `graphql/` prefix. Always verify after deploying db Lambda.

---

### Issue: Lambda reserved environment variable in Terraform config

**Symptom**: `InvalidParameterValueException: Lambda was unable to configure your environment variables because the environment variables you have provided contains reserved keys`
**Cause**: Lambda automatically injects certain variables at runtime. Setting them in the Terraform `environment { variables = {} }` block causes an API error.

**Reserved keys (never set these in Terraform)**:

```
AWS_REGION
AWS_DEFAULT_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_SESSION_TOKEN
AWS_LAMBDA_FUNCTION_NAME
AWS_LAMBDA_FUNCTION_VERSION
AWS_LAMBDA_FUNCTION_MEMORY_SIZE
AWS_LAMBDA_LOG_GROUP_NAME
AWS_LAMBDA_LOG_STREAM_NAME
AWS_LAMBDA_RUNTIME_API
AWS_EXECUTION_ENV
LAMBDA_TASK_ROOT
LAMBDA_RUNTIME_DIR
_HANDLER
_X_AMZN_TRACE_ID
TZ
```

**Fix**: Remove the reserved variable from the `variables` block — Lambda provides it automatically at runtime.

```hcl
# BAD — causes InvalidParameterValueException:
resource "aws_lambda_function" "my_lambda" {
  environment {
    variables = {
      AWS_REGION   = var.aws_region   # reserved — remove this
      MY_CUSTOM_VAR = "value"
    }
  }
}

# GOOD — only set custom variables:
resource "aws_lambda_function" "my_lambda" {
  environment {
    variables = {
      MY_CUSTOM_VAR = "value"
    }
  }
}
```

The full list of reserved keys is documented in the [AWS Lambda docs](https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html#configuration-envvars-runtime).

---

### Issue: AccessDeniedException on CloudWatch log group in same apply as VPC endpoint policy change

**Symptom**:

```
AccessDeniedException: logs:PutRetentionPolicy is not allowed because no VPC endpoint policy allows the action
```

Observed immediately after `aws_vpc_endpoint.logs: Modifications complete after Xs`.

**Cause**: Terraform applies `aws_vpc_endpoint.logs` and `aws_cloudwatch_log_group.*` in parallel by default. The endpoint policy update hasn't propagated to all AZs before the log group API call goes out.

**Solution**: All `aws_cloudwatch_log_group` resources must declare `depends_on = [aws_vpc_endpoint.logs]` to serialize the apply order. If you see this error, it means a new log group was added without the `depends_on` — add it:

```hcl
resource "aws_cloudwatch_log_group" "my_lambda" {
  name              = "/aws/lambda/${aws_lambda_function.my_lambda.function_name}"
  retention_in_days = local.log_retention_days[var.environment]

  tags = local.common_tags
  depends_on = [aws_vpc_endpoint.logs]
}
```

This is a one-time transient failure if `depends_on` is missing — the next apply (with the propagated policy) will succeed, but the `depends_on` prevents recurrence.

---

### Pattern: VPC endpoint policies — use resource scoping, not action allowlists

**Background**: The CW Logs and Secrets Manager VPC endpoints use endpoint policies for cross-account isolation (preventing data exfiltration to external accounts), **not** for API-level access control (IAM role policies handle that).

**Wrong pattern** (action allowlist + wildcard resource): Two separate problems compound here:

1. **`Resource = "*"`** — the more serious issue. Without account-scoped ARNs, the endpoint policy allows access to _any_ account's CloudWatch Logs resources, defeating the cross-account isolation goal.
2. **Action allowlist** — a maintenance problem: every new Lambda API call requires a policy change, causing repeated CI failures.

```hcl
# BAD — wildcard resource defeats cross-account isolation;
#        action allowlist must be updated for every new API call
policy = jsonencode({
  Version = "2012-10-17"
  Statement = [
    {
      Effect    = "Allow"
      Principal = "*"
      Action    = ["logs:CreateLogGroup", "logs:PutLogEvents", "logs:PutRetentionPolicy"]
      Resource  = "*"
    }
  ]
})
```

**Correct pattern** (resource scoping): Wildcard actions scoped to account-namespaced ARNs — new Lambda resources work without policy changes.

```hcl
# GOOD — any logs:* action on this account's CloudWatch Logs resources
policy = jsonencode({
  Version = "2012-10-17"
  Statement = [
    {
      Effect    = "Allow"
      Principal = "*"
      Action    = "logs:*"
      Resource  = "arn:aws:logs:*:${local.account_id}:*"
    }
  ]
})
```

When adding a new Lambda or Terraform resource that writes to CloudWatch Logs or Secrets Manager: verify the relevant VPC endpoint policy uses the resource-scoping pattern. If it uses an action allowlist, recommend converting it to resource scoping instead of extending the allowlist.
