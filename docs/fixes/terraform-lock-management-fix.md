# Terraform Lock Management Fix

**Date:** February 14, 2026  
**Issue:** GitHub Actions deployment failures left Terraform state locks in place

## Root Cause Analysis

The [lambda-terraform-apply.yml](.github/workflows/lambda-terraform-apply.yml) workflow had insufficient lock cleanup logic:

### Problems Identified

1. **Incomplete cleanup condition**
   - Used `if: failure() || cancelled()` but didn't handle job timeouts
   - Workflow timeout is 20 minutes - if exceeded, cleanup wouldn't run

2. **Flawed lock detection logic**
   - Attempted to detect locks by running `terraform plan -refresh=false`
   - This command itself tries to acquire a lock, creating a circular problem
   - If a lock already exists, the detection step would fail

3. **Fragile parsing**
   - Used `grep | awk` to extract lock IDs from error messages
   - Unreliable and could easily fail

## Solution Implemented

### 1. Direct DynamoDB Lock Management

Replaced terraform-based lock detection with direct DynamoDB queries:

```bash
# Query for locks
aws dynamodb scan \
  --table-name terraform-state-locks \
  --filter-expression "begins_with(LockID, :prefix)" \
  --expression-attribute-values '{":prefix":{"S":"legacy-sports-terraform-state/legacy-sports/terraform.tfstate"}}' \
  --region us-east-1

# Remove lock
aws dynamodb delete-item \
  --table-name terraform-state-locks \
  --key '{"LockID":{"S":"<lock-id>"}}' \
  --region us-east-1
```

### 2. Multiple Cleanup Points

Added lock cleanup at multiple failure points:

- **After Plan Failure**: `steps.plan.outcome == 'failure'`
- **After Apply Failure**: `steps.apply.outcome == 'failure'`
- **Final Cleanup**: `always() && (failure() || cancelled())`

This ensures locks are released regardless of where the workflow fails.

### 3. Improved Conditions

Changed from:

```yaml
if: failure() || cancelled()
```

To:

```yaml
if: always() && steps.X.outcome == 'failure'  # For specific steps
if: always() && (failure() || cancelled())    # For final cleanup
```

This catches:

- Explicit failures
- Cancellations
- Timeouts (which register as failures)
- Any other non-success terminal states

## Files Modified

- [`.github/workflows/lambda-terraform-apply.yml`](.github/workflows/lambda-terraform-apply.yml)
  - Added `Release Lock on Plan Failure` step
  - Added `Release Lock on Apply Failure` step
  - Rewrote `Cleanup on Failure` step with direct DynamoDB access

## New Utility Script

Created [`scripts/terraform-lock-manager.ps1`](scripts/terraform-lock-manager.ps1) for manual lock management:

```powershell
# Check for locks
.\scripts\terraform-lock-manager.ps1 -Action check

# Clear locks (with confirmation)
.\scripts\terraform-lock-manager.ps1 -Action clear

# Force clear without confirmation (use with caution)
.\scripts\terraform-lock-manager.ps1 -Action force-clear
```

## Immediate Action Taken

Cleared the stale lock that was left from the failed deployment:

```powershell
aws dynamodb delete-item \
  --table-name terraform-state-locks \
  --key '{"LockID":{"S":"legacy-sports-terraform-state/legacy-sports/terraform.tfstate-md5"}}' \
  --region us-east-1
```

## Prevention

The workflow now:

1. ✅ Releases locks immediately after any step failure
2. ✅ Uses direct DynamoDB access (no terraform commands)
3. ✅ Catches all failure scenarios including timeouts
4. ✅ Provides clear logging of lock operations

## Testing Recommendations

To verify the fix works:

1. **Simulate a plan failure**: Temporarily introduce a syntax error in a `.tf` file
2. **Simulate an apply failure**: Introduce a resource that will fail to create
3. **Simulate a timeout**: Reduce `timeout-minutes` and add a long sleep
4. After each test, verify no locks remain:
   ```powershell
   .\scripts\terraform-lock-manager.ps1 -Action check
   ```

## Related Files

- **Backend Config**: [`terraform/backend-setup.tf`](terraform/backend-setup.tf)
- **Main Config**: [`terraform/main.tf`](terraform/main.tf)
- **DynamoDB Table**: `terraform-state-locks` (us-east-1)
- **S3 Bucket**: `legacy-sports-terraform-state`

## References

- [Terraform S3 Backend Docs](https://developer.hashicorp.com/terraform/language/settings/backends/s3)
- [DynamoDB State Locking](https://developer.hashicorp.com/terraform/language/settings/backends/s3#dynamodb-table-permissions)
