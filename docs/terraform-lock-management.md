# Terraform Lock Management

## Overview

This document describes how Terraform state locks are managed in CI/CD pipelines and how to handle stuck locks manually.

## Automatic Lock Cleanup

The `deploy-lambda-infrastructure` GitHub Action automatically handles lock cleanup in the following scenarios:

1. **Workflow Failure**: If Terraform commands fail, the cleanup step releases any locks
2. **Workflow Cancellation**: If the workflow is cancelled, locks are automatically released
3. **Lock Info Capture**: An always-run step captures lock information for troubleshooting

### Implementation Details

The action includes two cleanup steps:

1. **Cleanup on Error/Cancellation** (runs on `failure()` or `cancelled()`)
   - Detects workflow status
   - Runs `terraform force-unlock` if a lock is detected
   - Provides manual cleanup instructions if automatic cleanup fails

2. **Capture Lock Info** (always runs)
   - Checks for any remaining locks
   - Displays current lock status
   - Helps with post-mortem debugging

## Manual Lock Management

### Check Current Lock Status

To check if a lock exists on the Terraform state:

```bash
npm run terraform:check-lock
```

This will show:
- Whether a lock exists
- Lock ID
- Who created the lock
- When it was created
- How to release it

### Release a Stuck Lock

#### Option 1: Release the Latest Lock

```bash
npm run terraform:unlock -- --latest
```

This automatically detects and releases the current lock (if any).

#### Option 2: Release a Specific Lock

If you know the lock ID:

```bash
npm run terraform:unlock -- <lock-id>
```

Example:
```bash
npm run terraform:unlock -- 1884e872-5270-f60b-b378-893dbd5426d5
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

**Solution**: The automatic cleanup should handle this. If not:

```bash
npm run terraform:unlock -- --latest
```

### Multiple Failed Deployments

**Problem**: Several deployments failed, and you're not sure if a lock exists.

**Solution**: Check first, then unlock if needed:

```bash
npm run terraform:check-lock
npm run terraform:unlock -- --latest
```

### Lock from Another Developer

**Problem**: Another developer's workflow left a lock, and you need to deploy.

**Solution**: 
1. Verify with the developer that their workflow is truly stuck/cancelled
2. Get the lock ID from their error message or run `npm run terraform:check-lock`
3. Release the lock: `npm run terraform:unlock -- <lock-id>`

## Preventing Lock Issues

### Best Practices

1. **Don't Cancel Workflows Unless Necessary**: Let them complete or fail naturally
2. **Monitor Workflow Progress**: Check logs to ensure cleanup steps run
3. **Sequential Deployments**: Avoid running multiple deployment workflows simultaneously
4. **Use Branch Protection**: Configure merge queues to prevent concurrent deployments

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
2. Run `npm run terraform:check-lock` to see who has the lock
3. Contact the lock owner if it's another developer
4. Use `npm run terraform:unlock` if the lock is stuck

### Lock ID Not Found

If `force-unlock` says the lock doesn't exist:

1. The lock may have already been released
2. You may be in the wrong workspace/environment
3. Run `npm run terraform:check-lock` to verify current state

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

- **`npm run terraform:unlock`**: Wrapper script for unlock utility
- **`npm run terraform:check-lock`**: Check current lock status

## See Also

- [Terraform State Locking Documentation](https://www.terraform.io/docs/language/state/locking.html)
- [AWS DynamoDB Backend Configuration](https://www.terraform.io/docs/language/settings/backends/s3.html)
- [`deploy-lambda-infrastructure` Action](.github/actions/deploy-lambda-infrastructure/action.yml)
