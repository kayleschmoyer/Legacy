# Terraform Lock Management

## Overview

This document describes how Terraform state locks are managed in CI/CD pipelines and how to handle stuck locks manually.

## 🎉 Recent Improvements (2026-02-04)

**Major Fixes to Prevent Recurring Deployment Issues:**

1. ✅ **Auto-Detection Fixed**: Lock detection now works correctly (was using `-lock=false` which bypassed checks)
2. ✅ **Auto-Unlock by Default**: Scripts now automatically unlock without requiring lock ID
3. ✅ **Stale Lock Clearing**: CI automatically clears locks older than 30 minutes before deployment
4. ✅ **Improved CI Cleanup**: Better lock detection and cleanup in deployment workflows
5. ✅ **Complete Documentation**: Updated all deployment docs with correct workflow

**Result**: Should eliminate most manual deployment requirements due to lock issues!

## Automatic Lock Cleanup

### CI/CD Auto-Cleanup (GitHub Actions)

The `deploy-lambda-infrastructure` action now includes **three-stage** lock management:

#### Stage 1: Pre-Deployment Stale Lock Clearing (NEW!)

- **When**: Before any terraform commands run
- **What**: Detects locks older than 30 minutes and auto-clears them
- **Why**: Prevents stuck locks from previous failed/cancelled runs
- **How**:
  ```bash
  # CI automatically runs this before deployment
  terraform plan -refresh=false -detailed-exitcode  # Detect lock
  terraform force-unlock -force <LOCK_ID>            # Clear if >30min old
  ```

#### Stage 2: Active Deployment with Retry

- **Lock Timeout**: 10 minutes for active locks
- **Retry Logic**: 20 attempts with 30-second delays
- **Concurrency**: GitHub Actions concurrency groups prevent multiple simultaneous deploys

#### Stage 3: Post-Deployment Cleanup

1. **On Failure/Cancellation** - Automatically releases locks from this workflow
2. **Final Check** - Verifies no locks remain after deployment

### Implementation Details

The action includes multiple cleanup steps:

1. **Clear Stale Locks** (runs BEFORE deployment starts)
   - Detects existing locks without bypassing them
   - Checks lock age (>30 minutes = stale)
   - Force-unlocks stale locks
   - Waits for active locks to clear

2. **Cleanup on Error/Cancellation** (runs on `failure()` or `cancelled()`)
   - Detects workflow status
   - Runs `terraform force-unlock` if lock detected
   - Provides manual cleanup instructions if automatic cleanup fails

3. **Capture Lock Info** (always runs)
   - Checks for any remaining locks (WITHOUT using `-lock=false`)
   - Displays current lock status
   - Helps with post-mortem debugging

## Manual Lock Management

### Quick Lock Cleanup (Recommended)

**NEW Auto-Unlock Feature** - No lock ID needed:

```bash
# Automatically detects and unlocks current lock
node scripts/terraform-unlock.js

# PowerShell shorthand
make terraform-unlock
```

The script will:

1. ✅ Detect if a lock exists
2. ✅ Show lock details (ID, who, when)
3. ✅ Automatically unlock it
4. ✅ Exit cleanly if no lock exists

### Check Current Lock Status

To check if a lock exists WITHOUT unlocking:

```bash
node scripts/terraform-unlock.js --check
```

This will show:

- Whether a lock exists
- Lock ID
- Who created the lock
- When it was created
- How to release it

### Release a Stuck Lock

#### Option 1: Auto-Unlock (Recommended)

```bash
node scripts/terraform-unlock.js
```

This automatically detects and releases the current lock (if any).

#### Option 2: Release Specific Lock (Legacy)

If you know the lock ID:

```bash
node scripts/terraform-unlock.js <lock-id>
```

Example:

```bash
node scripts/terraform-unlock.js 1884e872-5270-f60b-b378-893dbd5426d5
```

### Direct Terraform Commands

You can also use Terraform directly:

```bash
cd terraform
terraform force-unlock <lock-id>
```

## Common Scenarios

### Cancelled GitHub Actions Workflow

**Problem**: A workflow was cancelled mid-execution, leaving a lock behind.

**Solution (2026+)**: The automatic pre-deployment cleanup handles this! If >30 minutes old, the next CI run will clear it automatically.

**Manual Fix** (if needed immediately):

```bash
node scripts/terraform-unlock.js
```

### Multiple Failed Deployments

**Problem**: Several deployments failed, and you're not sure if a lock exists.

**Solution**: Just run the unlock script - it's safe and idempotent:

```bash
node scripts/terraform-unlock.js
# Will show "NOT locked" if no lock exists, or auto-unlock if found
```

### Lock from Another Developer

**Problem**: Another developer's workflow left a lock, and you need to deploy.

**Solution**:

1. Verify with the developer that their workflow is truly stuck/cancelled
2. Run auto-unlock (no need to find lock ID):
   ```bash
   node scripts/terraform-unlock.js
   ```
3. Proceed with deployment

### Recurring Deployment Failures

**Problem**: Keep having to manually deploy because CI deployments fail with lock errors.

**Solution (FIXED as of 2026-02-04)**:

- ✅ Lock detection bug fixed in both CI and local scripts
- ✅ CI now auto-clears stale locks before deploying
- ✅ Improved retry logic and cleanup steps
- ✅ Should rarely need manual intervention anymore!

If still occurring, check:

```bash
# View lock details in DynamoDB
aws dynamodb scan --table-name terraform-state-locks --region us-east-1

# Check deployment versions
aws ssm get-parameters-by-path --path "/legacy-sports/dev/lambda" --recursive
```

## Preventing Lock Issues

### Best Practices

1. **Don't Cancel Workflows Unless Necessary**: Let them complete or fail naturally (cleanup happens automatically)
2. **Monitor Workflow Progress**: Check logs to ensure cleanup steps run
3. **Sequential Deployments**: Concurrency groups already prevent simultaneous deployments
4. **Use Branch Protection**: Merge queues prevent concurrent deployments to main
5. **Let CI Self-Heal**: Stale locks (>30min) are now cleared automatically on next deployment

### GitHub Actions Configuration

The repository uses the following settings to minimize lock conflicts:

- Concurrency groups prevent multiple deployments to the same environment
- Automatic cleanup on workflow cancellation
- Lock info capture for debugging

## Troubleshooting

### Lock Persists After Cleanup

If automatic cleanup fails:

1. Check AWS credentials are valid
2. Verify you have permissions for the DynamoDB table
3. Check the lock ID in the error message
4. Use the manual unlock command

### Unable to Acquire Lock

If you see "Error acquiring the state lock":

1. Check if another workflow is running
2. Run `pnpm run terraform:check-lock` to see who has the lock
3. Contact the lock owner if it's another developer
4. Use `pnpm run terraform:unlock` if the lock is stuck

### Lock ID Not Found

If `force-unlock` says the lock doesn't exist:

1. The lock may have already been released
2. You may be in the wrong workspace/environment
3. Run `pnpm run terraform:check-lock` to verify current state

## Technical Details

### State Backend Configuration

Terraform state is stored in AWS with DynamoDB locking:

- **State Bucket**: `legacy-sports-terraform-state`
- **State Key**: `legacy-sports-infrastructure.tfstate`
- **Lock Table**: `legacy-sports-terraform-state-lock`
- **Region**: `us-east-1`

### Lock Lifecycle

1. **Acquisition**: Terraform creates a lock record in DynamoDB before modifying state
2. **Operations**: Lock prevents concurrent modifications
3. **Release**: Lock is removed from DynamoDB after operations complete
4. **Force Unlock**: Manually removes lock record (use with caution)

### Scripts

- **`scripts/terraform-unlock.js`**: Node.js utility for lock management
  - Parses Terraform output to detect locks
  - Executes `force-unlock` commands
  - Provides user-friendly CLI interface

- **`pnpm run terraform:unlock`**: Wrapper script for unlock utility
- **`pnpm run terraform:check-lock`**: Check current lock status

## See Also

- [Terraform State Locking Documentation](https://www.terraform.io/docs/language/state/locking.html)
- [AWS DynamoDB Backend Configuration](https://www.terraform.io/docs/language/settings/backends/s3.html)
- [`deploy-lambda-infrastructure` Action](.github/actions/deploy-lambda-infrastructure/action.yml)
