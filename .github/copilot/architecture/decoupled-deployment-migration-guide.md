# Migration Guide: Decoupled Lambda Deployment

## Quick Start (5-Minute Proof of Concept)

Test with **one Lambda** first, then roll out to others.

### Step 1: Deploy Central Terraform Workflow (2 min)

The central workflow already exists at:

```
.github/workflows/lambda-terraform-apply.yml
```

**Action**: Commit and push this file to `main` branch

```powershell
git add .github/workflows/lambda-terraform-apply.yml
git commit -m "feat(ci): add central Lambda Terraform workflow"
git push origin main
```

**Verify**: Check GitHub Actions → Workflows → Should see "Apply Lambda Infrastructure"

---

### Step 2: Convert One Upload Workflow (3 min)

**Choose**: Start with **Stats Lambda** (simplest, well-tested)

**Before** ([deploy-stats.yml](.github/workflows/deploy-stats.yml)):

```yaml
name: Deploy Stats Lambda
concurrency:
  group: terraform-lambda-deployment # ← Blocks other deploys

jobs:
  deploy:
    steps:
      - Build Lambda
      - Upload to S3
      - Update SSM
      - Run Terraform # ← Holds lock
```

**After** ([upload-stats-lambda.yml](.github/workflows/upload-stats-lambda.yml)):

```yaml
name: Upload Stats Lambda
# No concurrency group ← Can run in parallel

jobs:
  upload:
    steps:
      - Build Lambda
      - Upload to S3
      - Update SSM
      # Terraform runs automatically via workflow_run trigger
```

**Actions**:

1. **Create new workflow** (already done):

   ```
   .github/workflows/upload-stats-lambda.yml
   ```

2. **Disable old workflow temporarily**:

   ```yaml
   # .github/workflows/deploy-stats.yml
   on:
     # workflow_dispatch:  # Commented out for migration
     # push: # Commented out for migration
     workflow_dispatch:
       inputs:
         DISABLED:
           description: 'Migrated to upload-stats-lambda.yml'
           required: false
   ```

3. **Commit both**:
   ```powershell
   git add .github/workflows/upload-stats-lambda.yml
   git add .github/workflows/deploy-stats.yml
   git commit -m "feat(ci): migrate Stats Lambda to decoupled deployment"
   git push origin main
   ```

---

### Step 3: Test the Migration (5 min)

#### Test 1: Manual Trigger

1. Go to GitHub Actions
2. Find "Upload Stats Lambda" workflow
3. Click "Run workflow" → Run workflow
4. **Expected**:
   - Upload workflow completes (~3 min)
   - Terraform workflow triggers automatically (~30s debounce)
   - Terraform workflow deploys (~3 min)
   - Total: ~6.5 minutes

**Verify Success**:

```powershell
# Check Lambda was updated
aws lambda get-function --function-name legacy-sports-dev-stats --region us-east-1 --query 'Configuration.LastModified'

# Check SSM parameter
aws ssm get-parameter --name "/legacy-sports/dev/lambda/stats/version" --region us-east-1
```

#### Test 2: Code Change Trigger

1. Make a trivial change to Stats Lambda:

   ```powershell
   # Add a comment to any file
   code lambdas/stats-lambda/src/index.ts
   ```

2. Commit and push:

   ```powershell
   git add lambdas/stats-lambda/src/index.ts
   git commit -m "test: trigger stats lambda deployment"
   git push origin main
   ```

3. **Expected**:
   - Upload workflow auto-starts
   - Terraform workflow auto-triggers after upload completes
   - Both show in GitHub Actions

---

### Step 4: Monitor Performance

Check first deployment metrics:

```powershell
# Get recent workflow runs
gh api repos/bkrupa/legacy-sports/actions/runs `
  --jq '.workflow_runs[] | select(.name | contains("Stats") or contains("Apply Lambda")) | {name: .name, status: .status, conclusion: .conclusion, duration: .run_duration_ms}'
```

**Expected Metrics**:

- Upload Stats Lambda: ~2-3 minutes
- Apply Lambda Infrastructure: ~3-5 minutes
- Total: ~6-8 minutes

**Compare to old metrics**:

- Deploy Stats Lambda (old): ~5-8 minutes (if no queue)
- Deploy Stats Lambda (old): ~15-30 minutes (if queued)

---

## Full Rollout (30 Minutes)

After successful test with Stats Lambda, migrate remaining Lambdas.

### Migration Order

1. ✅ **Stats Lambda** (completed in Step 2)
2. **OAuth Proxy Lambda** (no DB, simple)
3. **Game Selection Lambda** (medium complexity)
4. **Draft Processor Lambda** (medium complexity)
5. **GraphQL Lambda** (most complex, do last)

### For Each Lambda

Use this template:

#### 1. Create Upload Workflow

Copy `.github/workflows/upload-stats-lambda.yml` and modify:

```yaml
name: Upload [LAMBDA-NAME] Lambda

on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - 'lambdas/[LAMBDA-PATH]/**'
      - '.github/workflows/upload-[LAMBDA-NAME]-lambda.yml'

env:
  AWS_SERVICE_NAME: legacy-sports-[LAMBDA-NAME]

# ... rest is similar, just change paths and names
```

#### 2. Update Central Terraform Workflow

Add new workflow to trigger list:

```yaml
# .github/workflows/lambda-terraform-apply.yml
on:
  workflow_run:
    workflows:
      - 'Upload GraphQL Lambda'
      - 'Upload Stats Lambda'
      - 'Upload Draft Processor Lambda'
      - 'Upload Game Selection Lambda'
      - 'Upload OAuth Proxy Lambda'
      # Add new ones here
```

#### 3. Disable Old Deploy Workflow

Comment out triggers in old workflow, add migration notice.

#### 4. Test

Run manual test for that Lambda.

---

## Batch Migration (Advanced)

**For experienced users**: Migrate all at once

### Commands

```powershell
# Create all upload workflows
$lambdas = @('graphql', 'draft-processor', 'game-selection', 'oauth-proxy')

foreach ($lambda in $lambdas) {
    # Copy template
    $source = '.github/workflows/upload-stats-lambda.yml'
    $dest = ".github/workflows/upload-$lambda-lambda.yml"

    # Copy and modify (manual editing needed)
    Copy-Item $source $dest
    code $dest  # Edit to replace stats with $lambda
}

# Disable old workflows
$oldWorkflows = @(
    'deploy-gql.yml',
    'deploy-draft-processor.yml',
    'deploy-game-selection.yml',
    'deploy-oauth-proxy.yml'
)

foreach ($workflow in $oldWorkflows) {
    # Add disabled notice (manual editing)
    code ".github/workflows/$workflow"
}

# Commit all
git add .github/workflows/
git commit -m "feat(ci): migrate all Lambdas to decoupled deployment"
git push origin main
```

---

## Testing Multi-Lambda Scenario

After all Lambdas migrated, test the key benefit: parallel deployment

### Test: Simultaneous Updates

1. **Create change in multiple Lambdas**:

   ```powershell
   # Touch 3 different Lambdas
   "// Test comment $(Get-Date)" | Out-File -Append lambdas/stats-lambda/src/index.ts
   "// Test comment $(Get-Date)" | Out-File -Append lambdas/db/src/index.ts
   "// Test comment $(Get-Date)" | Out-File -Append lambdas/draft-processor/src/index.ts

   git add lambdas/
   git commit -m "test: simultaneous Lambda deployments"
   git push origin main
   ```

2. **Watch GitHub Actions**:
   - Should see 3 upload workflows start simultaneously
   - All 3 should complete in ~3 minutes (parallel)
   - Should see 1 Terraform workflow trigger after debounce
   - Terraform should deploy all 3 changes

3. **Expected Timeline**:

   ```
   T+0:00  → 3 upload workflows start
   T+0:03  → 3 upload workflows complete
   T+0:33  → Terraform workflow starts (30s debounce)
   T+0:38  → Terraform deploys all 3 Lambdas
   Total: ~8 minutes
   ```

4. **Compare to Old System**:

   ```
   Old sequential approach:
   Lambda 1: 5 min
   Lambda 2: 5 min (waiting) + 5 min = 10 min
   Lambda 3: 10 min (waiting) + 5 min = 15 min
   Total: ~15-20 minutes

   Improvement: 50% faster!
   ```

---

## Rollback Plan

If issues occur during migration:

### Quick Rollback

1. **Re-enable old workflow**:

   ```yaml
   # .github/workflows/deploy-stats.yml
   on:
     workflow_dispatch:
     push:
       branches: [main]
       paths:
         - 'lambdas/stats-lambda/**'
   ```

2. **Disable new workflow**:

   ```yaml
   # .github/workflows/upload-stats-lambda.yml
   on:
     workflow_dispatch:
       inputs:
         DISABLED:
           description: 'Temporarily disabled'
   ```

3. **Commit**:
   ```powershell
   git add .github/workflows/
   git commit -m "revert: rollback to old deployment workflow"
   git push origin main
   ```

### Partial Rollback

Keep successfully migrated Lambdas on new system, roll back only problematic ones.

---

## Validation Checklist

After migration, verify:

- [ ] **All upload workflows listed** in `lambda-terraform-apply.yml` triggers
- [ ] **Old deploy workflows disabled** (no concurrent triggers)
- [ ] **SSM parameters exist** for all Lambdas at `/legacy-sports/dev/lambda/*/version`
- [ ] **S3 bucket accessible** by all workflows
- [ ] **Terraform data sources** match SSM parameter names
- [ ] **Manual trigger works** for each upload workflow
- [ ] **Automatic trigger works** (push code changes)
- [ ] **Terraform workflow triggers** after uploads complete
- [ ] **Multiple simultaneous** uploads work correctly
- [ ] **Lock contention eliminated** (check DynamoDB table)

---

## Performance Monitoring

### Dashboard Queries

**Average deployment time**:

```powershell
gh api repos/bkrupa/legacy-sports/actions/runs `
  --jq '.workflow_runs[] |
    select(.name == "Apply Lambda Infrastructure") |
    select(.created_at >= "2026-02-12") |
    {created: .created_at, duration_min: (.run_duration_ms / 1000 / 60)}' |
  ConvertFrom-Json |
  Measure-Object -Property duration_min -Average
```

**Terraform lock usage**:

```powershell
# Should be minimal/zero
aws dynamodb scan `
  --table-name terraform-state-locks `
  --region us-east-1 `
  --query 'Items[].{LockID:LockID.S,Who:Who.S,Created:Created.S}'
```

**Upload success rate**:

```powershell
gh api repos/bkrupa/legacy-sports/actions/runs `
  --jq '.workflow_runs[] |
    select(.name | contains("Upload") and contains("Lambda")) |
    select(.created_at >= "2026-02-12") |
    {name: .name, conclusion: .conclusion}'
```

---

## Troubleshooting

### Issue: Terraform Workflow Doesn't Trigger

**Symptoms**: Upload completes, but Terraform doesn't start

**Checks**:

1. Workflow name in `workflow_run` matches exactly
2. Upload workflow shows "success" (not "failure")
3. Branch is `main`

**Fix**:

```yaml
# .github/workflows/lambda-terraform-apply.yml
workflow_run:
  workflows:
    - 'Upload Stats Lambda' # ← Must match EXACTLY
  types: [completed] # ← Triggers on success OR failure
  branches: [main] # ← Only main branch
```

**Filter for success only**:

```yaml
jobs:
  apply-infrastructure:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
```

### Issue: Terraform Deploys Old Version

**Symptoms**: Upload succeeds, but Lambda doesn't update

**Cause**: Terraform not detecting SSM change

**Debug**:

```powershell
# Check SSM parameter value
aws ssm get-parameter --name "/legacy-sports/dev/lambda/stats/version" --region us-east-1

# Check what Terraform sees
cd terraform
terraform refresh
terraform plan
# Should show Lambda update
```

**Fix**: Ensure `source_code_hash` uses SSM parameter:

```hcl
resource "aws_lambda_function" "stats" {
  source_code_hash = data.aws_ssm_parameter.stats_lambda_version.value
}
```

### Issue: Multiple Terraform Runs

**Symptoms**: Terraform workflow runs 2-3 times for one upload

**Cause**: Uploads completing after debounce + terraform start

**This is normal** if uploads are spread out. Each run is safe and deploys latest.

**To reduce**:

- Increase debounce from 30s to 60s
- Coordinate manual deployments

### Issue: Upload Works but Deploy Fails

**Symptoms**: Upload workflow succeeds, Terraform fails

**Debug**: Check Terraform workflow logs for specific error

**Common causes**:

1. **Invalid Terraform config**: Fix in terraform/\*.tf files
2. **AWS permissions**: Check IAM role permissions
3. **State lock held**: Check DynamoDB (though should auto-clear)

**Quick fix**: Run manually

```powershell
cd terraform
node ../scripts/terraform-unlock.js  # Clear any stale locks
terraform plan
terraform apply
```

---

## Success Criteria

Migration is successful when:

✅ **All Lambdas deploy via new workflows**
✅ **No manual interventions needed for locks**
✅ **Deployment time reduced by >50%** for multiple Lambdas
✅ **No errors in Terraform workflow** for 1 week
✅ **Old deploy workflows can be deleted**

---

## Cleanup (After 1 Week Success)

Once confident new system works:

```powershell
# Delete old deployment workflows
rm .github/workflows/deploy-gql.yml
rm .github/workflows/deploy-stats.yml
rm .github/workflows/deploy-draft-processor.yml
rm .github/workflows/deploy-game-selection.yml
rm .github/workflows/deploy-oauth-proxy.yml

# Commit
git add .github/workflows/
git commit -m "chore(ci): remove legacy deployment workflows"
git push origin main
```

**Keep for reference**:

- `.github/actions/deploy-lambda-infrastructure/` (might be useful)
- Documentation about old system
- GitHub Actions history (automatically retained)

---

## Next Steps

After successful migration:

1. **Add monitoring** (Datadog, CloudWatch)
2. **Implement blue/green** deployments with aliases
3. **Add automated rollback** on error thresholds
4. **Multi-environment support** (dev, staging, prod)
5. **Canary deployments** (gradual traffic shift)
