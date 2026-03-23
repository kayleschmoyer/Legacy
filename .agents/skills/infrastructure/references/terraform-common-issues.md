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
# Set environment variables
$env:AWS_ACCESS_KEY_ID = "your-key"
$env:AWS_SECRET_ACCESS_KEY = "your-secret"
$env:AWS_REGION = "us-east-1"

# Or use AWS CLI
aws configure
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
