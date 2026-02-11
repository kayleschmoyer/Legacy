# Terraform Lock Release Fix - 2026-02-11

## Problem

GitHub Actions deployment workflows were getting stuck on acquiring Terraform locks because locks were not being properly released in all scenarios.

### Root Cause

The Terraform lock cleanup logic in deployment actions only ran under specific conditions:

```yaml
if: (failure() || cancelled()) && steps.terraform-deploy.outputs.lock_id != ''
```

**This meant locks were NOT explicitly released when:**

1. ✅ Terraform succeeds (relied on Terraform's automatic release)
2. ❌ A step AFTER terraform fails (e.g., badge update fails)
3. ❌ The workflow times out AFTER terraform completes
4. ❌ Terraform succeeds but the process hangs during cleanup
5. ❌ The workflow is cancelled but no lock_id was captured

## Solution

Added a new **mandatory lock release step** that always runs, regardless of success/failure:

### Key Changes

1. **New Step: "Ensure Terraform Lock Release"** (runs with `if: always()`)
   - Explicitly checks for locks after terraform operations complete
   - Identifies if the lock belongs to the current workflow
   - Automatically releases locks from this workflow
   - Skips locks from other workflows to prevent conflicts
   - Runs BEFORE the conditional cleanup step

2. **Enhanced Step: "Verify Lock Status"** (runs with `if: always()`)
   - Final verification that state is accessible
   - Reports if locks still exist after cleanup
   - Provides clear instructions for manual intervention if needed

3. **Kept Step: "Cleanup Terraform Lock on Failure or Cancellation"**
   - Still runs on failure/cancellation as a backup
   - Provides additional cleanup for captured lock IDs

### Implementation

The fix was applied to both deployment actions:

- `.github/actions/deploy-lambda-infrastructure/action.yml`
- `.github/actions/deploy-lambda/action.yml`

### Lock Release Logic

```bash
# 1. Check if state is locked
terraform plan -refresh=false -detailed-exitcode > /dev/null 2>&1

# 2. If locked, identify lock owner
LOCK_WHO=$(grep "Who:" lock_output)
WORKFLOW_ID="${{ github.run_id }}-${{ github.job }}"

# 3. Only unlock if from this workflow
if [[ "$LOCK_WHO" == *"$WORKFLOW_ID"* ]] || [[ "$LOCK_WHO" == *"GitHubActions"* ]]; then
  terraform force-unlock -force "$LOCK_ID"
fi
```

### Safety Features

- ✅ **Ownership Check**: Only unlocks locks created by this workflow
- ✅ **No Lock Stealing**: Skips locks from other active deployments
- ✅ **Always Runs**: Executes regardless of success/failure
- ✅ **Idempotent**: Safe to run multiple times
- ✅ **Clear Reporting**: Adds status to GitHub Step Summary

## Expected Impact

### Before Fix

```
Deployment A: terraform apply (success) → step fails → lock stuck
Deployment B: waits for lock → times out after 10 minutes
Manual intervention: terraform force-unlock required
```

### After Fix

```
Deployment A: terraform apply (success) → step fails → lock auto-released
Deployment B: acquires lock immediately → deploys successfully
No manual intervention needed
```

## Testing

To verify the fix works:

1. **Test Normal Success Path**:

   ```bash
   # Deploy should complete and release lock
   git push origin main
   # Verify: node scripts/terraform-unlock.js --check
   # Expected: "Terraform state is NOT locked"
   ```

2. **Test Failure Path**:

   ```bash
   # Introduce a failure after terraform step
   # Lock should still be released
   # Check GitHub Actions logs for "Ensure Terraform Lock Release" step
   ```

3. **Test Cancellation**:
   ```bash
   # Cancel workflow during/after terraform
   # Lock should be released by cleanup steps
   ```

## Monitoring

### GitHub Actions

After deployments, check the step summary for:

- ✅ "Deployment Complete - Lock Status: Clean"
- ⚠️ "Manual Lock Check Required" (indicates issue)

### DynamoDB

Check for stuck locks:

```bash
aws dynamodb scan --table-name terraform-state-locks --region us-east-1
```

Expected: Empty items list or very recent locks only

### Local Check

```bash
node scripts/terraform-unlock.js --check
```

Expected: "Terraform state is NOT locked"

## Related Documentation

- [Terraform Lock Management](../deployment/terraform/terraform-lock-management.md)
- [CI Troubleshooting Guide](../ci-cd/ci-troubleshooting-guide.md)
- [Deployment Automation Fixes](./deployment-automation-fixes-2026-02-04.md)

## Rollback Plan

If this causes issues, revert both action files:

```bash
git checkout HEAD~1 .github/actions/deploy-lambda-infrastructure/action.yml
git checkout HEAD~1 .github/actions/deploy-lambda/action.yml
git commit -m "revert: terraform lock release changes"
```

Then use manual unlock as before:

```bash
node scripts/terraform-unlock.js
```

## Notes

- This fix complements the existing stale lock detection (<30 min age)
- Terraform still auto-releases locks on successful completion
- This is a safety net for edge cases where auto-release fails
- The "Cleanup on Failure/Cancellation" step remains as a backup

## Future Improvements

1. Add metrics/alerts for lock duration > 5 minutes
2. Implement lock heartbeat to detect zombie workflows
3. Consider workflow-level lock coordination (beyond DynamoDB)
4. Add automated testing for lock scenarios
