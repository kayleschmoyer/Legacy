# Terraform State Management Solution

## The Problem

Your Terraform workflows in GitHub Actions were trying to re-apply all infrastructure on every run because:

**No backend configuration = No state tracking**

Without a backend, Terraform stores state locally. In GitHub Actions:

1. Fresh container starts → No `terraform.tfstate` file
2. Terraform scans AWS → Finds existing resources
3. Compares to config → Thinks everything needs to be created
4. Generates plan to recreate all resources ❌

## The Solution

Configure a **remote backend** using S3 and DynamoDB to persistently store Terraform state.

### What Was Changed

#### 1. **Backend Configuration** (`terraform/main.tf`)

```hcl
backend "s3" {
  bucket         = "legacy-sports-terraform-state"
  key            = "legacy-sports/terraform.tfstate"
  region         = "us-east-1"
  encrypt        = true
  dynamodb_table = "terraform-state-locks"
}
```

#### 2. **Backend Infrastructure** (`terraform/backend-setup.tf`)

- S3 bucket for state storage (encrypted, versioned, private)
- DynamoDB table for state locking (prevents concurrent runs)
- SSM parameters to track backend configuration

#### 3. **IAM Permissions** (`terraform/github-actions-oidc.tf`)

Updated GitHub Actions role to access:

- S3 bucket (read/write state files)
- DynamoDB table (acquire/release locks)

## How Lambda Deployments Work Now

Your existing workflow pattern is **perfect** and requires no changes:

### 1. **Build & Upload Lambda Code**

```yaml
- name: Build GraphQL Lambda
  run: pnpm exec nx build db

- name: Package and Upload
  run: |
    VERSION="${TIMESTAMP}-${COMMIT_SHA}"
    zip -r "graphql-${VERSION}.zip" dist/
    aws s3 cp "graphql-${VERSION}.zip" "s3://${S3_BUCKET}/graphql/"
```

### 2. **Update Version in SSM**

```yaml
aws ssm put-parameter \
--name "/legacy-sports/dev/lambda/graphql/version" \
--value "$VERSION" \
--overwrite
```

### 3. **Terraform Detects Change via SSM**

```yaml
- name: Deploy Infrastructure
  run: |
    terraform plan -target=aws_lambda_function.graphql
    terraform apply -target=aws_lambda_function.graphql -auto-approve
```

**Key Configuration** (`terraform/lambda-graphql.tf`):

```hcl
data "aws_ssm_parameter" "graphql_lambda_version" {
  name = "/legacy-sports/dev/lambda/graphql/version"
}

resource "aws_lambda_function" "graphql" {
  s3_bucket        = aws_s3_bucket.lambda_deployments.bucket
  s3_key           = "graphql/graphql-${data.aws_ssm_parameter.graphql_lambda_version.value}.zip"
  source_code_hash = data.aws_ssm_parameter.graphql_lambda_version.value  # ✅ Triggers update
  # ... rest of config
}
```

### Why This Works

1. **No Terraform code changes needed** - Lambda config stays in source control
2. **SSM parameter drives updates** - When version changes, Terraform sees it
3. **Targeted apply** - Only Lambda function updates, nothing else
4. **State tracks reality** - Terraform knows what's already deployed

## Setup Instructions

Follow the step-by-step guide in: [`docs/terraform-backend-setup.md`](./terraform-backend-setup.md)

**Quick summary:**

1. Comment out backend block temporarily
2. Run `terraform apply -target=aws_s3_bucket.terraform_state -target=aws_dynamodb_table.terraform_locks`
3. Uncomment backend block
4. Run `terraform init -migrate-state` to move state to S3
5. Done! ✅

## Benefits

✅ **GitHub Actions works correctly**

- No more "re-apply everything" issues
- Terraform only applies actual changes

✅ **Lambda deployments stay simple**

- Build → Upload → Update SSM → Terraform sees change
- No Terraform code edits needed

✅ **Infrastructure in source control**

- All Lambda configs, IAM roles, VPCs, etc. tracked in Git
- Review changes via PR process

✅ **Team collaboration**

- Shared state prevents conflicts
- State locking prevents concurrent runs
- Anyone can deploy without issues

✅ **Version history**

- S3 versioning keeps old state files
- Can rollback if needed
- Audit trail of changes

## Example: Deploying a Lambda Code Update

```bash
# 1. Code change merged to main
git push origin main

# 2. GitHub Actions workflow triggers automatically

# 3. Workflow steps:
#    a. Build Lambda:        pnpm exec nx build db
#    b. Create zip:          graphql-20251013-abc123.zip
#    c. Upload to S3:        s3://bucket/graphql/graphql-20251013-abc123.zip
#    d. Update SSM:          /legacy-sports/dev/lambda/graphql/version = "20251013-abc123"
#    e. Terraform init:      Downloads state from S3
#    f. Terraform plan:      Sees SSM changed, plans Lambda update only
#    g. Terraform apply:     Updates Lambda function code
#    h. Upload state:        Saves new state to S3

# Result: Lambda updated, nothing else touched! ✅
```

## Troubleshooting

### "Error acquiring the state lock"

Someone else is running Terraform. Wait for completion or:

```bash
terraform force-unlock <LOCK_ID>
```

### "Backend configuration changed"

Run:

```bash
terraform init -reconfigure
```

### "Resource already exists"

Import existing resource into state:

```bash
terraform import aws_lambda_function.graphql legacy-sports-dev-graphql
```

## Files Modified

- ✅ `terraform/main.tf` - Added backend configuration
- ✅ `terraform/backend-setup.tf` - Created backend infrastructure
- ✅ `terraform/github-actions-oidc.tf` - Added state access permissions
- ✅ `docs/terraform-backend-setup.md` - Setup guide
- ✅ `docs/terraform-state-solution.md` - This file

## Next Steps

1. **Run the bootstrap process** (see `docs/terraform-backend-setup.md`)
2. **Test a Lambda deployment** to verify it only updates the Lambda
3. **Update team documentation** so everyone knows about the backend

## Questions?

- **Q: Do I need to change my GitHub Actions workflows?**
  - A: No! They'll work exactly as-is.

- **Q: What if I make infrastructure changes (add new Lambda, modify IAM)?**
  - A: Edit Terraform files, commit, run `terraform apply`. State tracking works!

- **Q: Can I deploy Lambda code without touching Terraform files?**
  - A: Yes! That's the whole point. Build → Upload → SSM update → Terraform sees change.

- **Q: Is this secure?**
  - A: Yes. S3 encrypted, DynamoDB locked, OIDC authentication, no long-lived credentials.
