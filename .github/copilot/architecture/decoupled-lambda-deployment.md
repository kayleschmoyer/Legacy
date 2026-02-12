# Decoupled Lambda Deployment Architecture

## Overview

This document describes the **decoupled deployment architecture** for Lambda functions, which separates code deployment from infrastructure updates to eliminate Terraform lock contention and enable parallel deployments.

## Architecture Pattern

### **Two-Phase Deployment**

#### **Phase 1: Lambda Upload Workflows** (Parallel)

- **Purpose**: Build and upload Lambda code to S3
- **Concurrency**: None - all can run in parallel
- **Duration**: ~2-3 minutes per Lambda
- **No Terraform**: Does not acquire state locks

#### **Phase 2: Central Terraform Workflow** (Orchestrated)

- **Purpose**: Apply infrastructure changes for ALL Lambdas
- **Concurrency**: Single group with `cancel-in-progress: true`
- **Duration**: ~3-5 minutes regardless of number of Lambdas
- **Batching**: Handles multiple Lambda updates in one run

## How It Works

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Code Changes Pushed                       │
└────────────┬─────────────┬──────────────┬───────────────────┘
             │             │              │
     ┌───────▼──────┐ ┌───▼──────┐ ┌────▼─────┐
     │ Upload GQL   │ │ Upload   │ │ Upload   │  Phase 1
     │   Lambda     │ │  Stats   │ │  Draft   │  (Parallel)
     │              │ │  Lambda  │ │ Proc     │
     │ • Build      │ │          │ │          │
     │ • Upload S3  │ │ Same     │ │ Same     │
     │ • Update SSM │ │ steps    │ │ steps    │
     └───────┬──────┘ └───┬──────┘ └────┬─────┘
             │            │             │
             └────────────┼─────────────┘
                   (All complete in parallel)
                          │
                          ▼
              ┌───────────────────────┐
              │  workflow_run trigger │
              └───────────┬───────────┘
                          │
                  ┌───────▼────────┐
                  │  Debounce 30s  │  Wait for other
                  │                │  uploads to finish
                  └───────┬────────┘
                          │
              ┌───────────▼────────────┐
              │ Central Terraform      │  Phase 2
              │ Apply Infrastructure   │  (Single)
              │                        │
              │ • Reads ALL SSM params │
              │ • Detects ALL changes  │
              │ • Applies in one run   │
              │ • Updates ALL Lambdas  │
              └────────────────────────┘
```

### Concurrency Handling

**Upload Workflows**: No concurrency restriction

```yaml
# Can run simultaneously - no conflicts
```

**Terraform Workflow**: Cancel-in-progress batching

```yaml
concurrency:
  group: terraform-lambda-infrastructure
  cancel-in-progress: true # ← Safe because idempotent
```

**Why cancel-in-progress is safe:**

1. SSM parameters are the source of truth
2. Terraform detects changes via data sources
3. Latest run always has most current state
4. Terraform handles partial applies gracefully

## Benefits

### ✅ **Eliminates Lock Contention**

- **Before**: 5 Lambdas = 5 sequential Terraform runs (30+ minutes)
- **After**: 5 Lambdas = 5 parallel uploads + 1 Terraform run (~8 minutes)
- **Improvement**: 75% faster

### ✅ **No More Queue Timeouts**

- Uploads don't wait in queue
- No 10-minute lock timeout issues
- Terraform runs once with all changes

### ✅ **Automatic Batching**

- Multiple Lambda changes in quick succession
- Single Terraform run handles all
- Reduces AWS API calls

### ✅ **Better Resource Utilization**

- GitHub Actions runners work in parallel
- No idle time waiting for locks
- Faster feedback for developers

### ✅ **Simpler Debugging**

- Clear separation: build failures vs. infrastructure failures
- Upload logs show code issues
- Terraform logs show infrastructure issues

## Trade-offs

### ⚠️ **Slight Delay in Deployment**

- **Upload Phase**: Immediate (2-3 min)
- **Debounce**: 30 seconds wait
- **Terraform**: 3-5 minutes
- **Total**: ~6-8 minutes vs. 5 minutes for single Lambda

**Mitigation**: Skip debounce for urgent manual deployments

### ⚠️ **Two Workflows to Monitor**

- Upload workflow shows build status
- Terraform workflow shows deployment status
- Both visible in GitHub Actions UI

**Mitigation**: Clear naming and status reporting

### ⚠️ **Race Condition Window**

If Lambda A uploads at T+0 and Lambda B uploads at T+25 (during debounce):

- Both get included in same Terraform run ✅
- No issue - this is desired behavior

If Lambda B uploads at T+35 (after Terraform starts):

- Lambda A gets deployed in first run
- Lambda B triggers second run (30s later)
- Lambda B gets deployed in second run
- No failures - just two separate deploys

## Implementation

### Migration Steps

#### 1. Create Central Terraform Workflow

Create [.github/workflows/lambda-terraform-apply.yml](.github/workflows/lambda-terraform-apply.yml)

**Features:**

- Triggered by `workflow_run` completion
- 30-second debounce for batching
- Applies all pending Lambda updates
- Auto-cleanup on failures

#### 2. Convert Existing Deploy Workflows to Upload Workflows

For each Lambda (graphql, stats, draft-processor, game-selection, oauth-proxy):

**Remove:**

- Terraform setup and apply steps
- Concurrency groups
- Lock management

**Keep:**

- Build steps
- S3 upload
- SSM parameter update

**Example**: See [upload-stats-lambda.yml](.github/workflows/upload-stats-lambda.yml)

#### 3. Update Workflow Names

Rename to indicate new purpose:

- `deploy-gql.yml` → `upload-gql-lambda.yml`
- `deploy-stats.yml` → `upload-stats-lambda.yml`
- etc.

#### 4. Test Migration

**Test Scenario 1: Single Lambda**

1. Push change to one Lambda
2. Verify upload workflow runs
3. Verify Terraform workflow triggers
4. Verify Lambda gets deployed

**Test Scenario 2: Multiple Lambdas**

1. Push changes to 3 Lambdas simultaneously
2. Verify all 3 upload workflows run in parallel
3. Verify single Terraform workflow applies all changes

**Test Scenario 3: Rapid Updates**

1. Push Lambda A change
2. Push Lambda B change 10 seconds later
3. Verify Terraform workflow cancels first run
4. Verify both get deployed in second run

#### 5. Monitor Performance

Track metrics:

- Upload duration (should be ~2-3 min)
- Terraform duration (should be consistent ~3-5 min)
- Total time (should be ~6-8 min regardless of Lambda count)
- Lock contention events (should be zero)

## Troubleshooting

### Upload Succeeds but Terraform Doesn't Run

**Cause**: `workflow_run` trigger not configured correctly

**Check:**

1. Workflow names match exactly in trigger list
2. Upload workflow completed successfully
3. Branch is `main`

**Fix:**

```yaml
workflow_run:
  workflows:
    - 'Upload Stats Lambda' # Must match workflow name exactly
```

### Terraform Runs Multiple Times

**Cause**: Uploads completing after debounce period

**This is normal** - second run will deploy the later uploads

**To reduce:**

- Increase debounce from 30s to 60s
- Coordinate deployments manually

### SSM Parameter Updated but Lambda Not Deployed

**Cause**: Terraform not detecting SSM change

**Check:**

1. SSM parameter name matches Terraform data source
2. Version string is different from previous
3. `source_code_hash` uses SSM parameter value

**Verify Terraform detects change:**

```bash
cd terraform
terraform plan
# Should show Lambda update
```

### Lock Still Showing Contention

**Cause**: Old deployment workflows still enabled

**Fix:**

1. Disable old `deploy-*.yml` workflows in GitHub UI
2. Or delete old workflow files
3. Ensure only upload workflows remain

## Performance Comparison

### Before (Sequential with Locks)

```
Lambda A: Build (3m) → Queue (0m)  → Terraform (5m) = 8m
Lambda B: Build (3m) → Queue (8m)  → Terraform (5m) = 16m
Lambda C: Build (3m) → Queue (16m) → Terraform (5m) = 24m
Total: 24 minutes, 3 locks acquired
```

### After (Parallel with Batching)

```
Lambda A: Build (3m) → Upload (1m) ━┓
Lambda B: Build (3m) → Upload (1m) ━╋━> Terraform (5m) = 9m total
Lambda C: Build (3m) → Upload (1m) ━┛
Total: 9 minutes, 1 lock acquired
```

**Improvement: 62% faster** (24m → 9m)

## Best Practices

### 1. Monitor Debounce Effectiveness

If you frequently see multiple Terraform runs:

- Increase debounce period
- Or coordinate manual deployments

### 2. Use Manual Triggers for Urgent Deploys

Add `skip-debounce` input for critical fixes:

```yaml
workflow_dispatch:
  inputs:
    skip-debounce:
      type: boolean
      default: false
```

### 3. Track SSM Parameter History

Enable SSM parameter versioning:

```bash
aws ssm get-parameter-history \
  --name "/legacy-sports/dev/lambda/stats/version"
```

### 4. Clear Status Reporting

Both workflows should report clearly:

- Upload: "Code uploaded, waiting for deployment"
- Terraform: "Deploying 3 Lambda functions"

## References

### Industry Examples

This pattern is used by:

- **AWS SAM**: `sam build` → `sam deploy` separation
- **Serverless Framework**: Upload artifacts → CloudFormation deploy
- **Terraform Cloud**: VCS trigger → plan → apply workflow
- **Google Cloud Build**: Build → Test → Deploy pipeline separation

### Related Patterns

- **Event-Driven Architecture**: Uploads trigger infrastructure updates
- **Circuit Breaker**: Debounce prevents storm of Terraform runs
- **Idempotent Operations**: Terraform safe to cancel and restart
- **Eventually Consistent**: Small delay between upload and deploy acceptable

### Terraform Best Practices

- [Terraform Workflow](https://www.terraform.io/docs/cloud/run/ui.html)
- [State Locking](https://www.terraform.io/docs/language/state/locking.html)
- [Data Sources](https://www.terraform.io/docs/language/data-sources/index.html)

## Future Enhancements

### Multi-Environment Support

Add environment-specific SSM paths:

```yaml
env:
  SSM_PREFIX: /legacy-sports/${{ inputs.environment }}/lambda
```

### Rollback Capability

Store previous SSM versions for quick rollback:

```bash
# Rollback to previous version
aws ssm put-parameter \
  --name "/legacy-sports/dev/lambda/stats/version" \
  --value "<previous-version>" \
  --overwrite
```

### Deployment Notifications

Add Slack/email notifications:

```yaml
- name: Notify Success
  if: success()
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
      -d "Deployed ${{ steps.check-updates.outputs.total_lambdas }} Lambdas"
```

### Blue/Green Deployments

Use Lambda aliases for zero-downtime:

```hcl
resource "aws_lambda_alias" "live" {
  name             = "live"
  function_name    = aws_lambda_function.graphql.function_name
  function_version = aws_lambda_function.graphql.version
}
```
