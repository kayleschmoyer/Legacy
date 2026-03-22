---
name: aws-sso-login
description: 'Handle AWS SSO authentication when credentials expire; use when encountering SSO or credential errors before running any AWS-dependent command.'
---

# Skill: AWS SSO Login

## Overview

Handle AWS SSO authentication when credentials expire, prompting for login when SSO-related errors are detected.

> **Local only** — AWS SSO login requires interactive device authorization in a browser and the ability to persist refreshed credentials in the same environment where the agent runs. Most cloud agent environments cannot complete this flow or store the resulting credentials, so cloud agents should inform the user that AWS operations requiring SSO must be performed from a local environment.

## When to Use

- When seeing "SSO session associated with this profile has expired" errors
- Before running AWS CLI commands that require authentication
- When database operations fail due to AWS credential issues
- When Lambda deployment fails with authentication errors
- When sync-env script fails to access Parameter Store

## Detecting SSO Expiration

### Common Error Messages

Look for these error patterns in command output:

```
The SSO session associated with this profile has expired
```

```
CredentialsProviderError: The SSO session associated with this profile has expired
```

```
To refresh this SSO session run aws sso login with the corresponding profile
```

```
Invalid credentials
```

```
Failed to resolve AWS credentials
```

## Command

```powershell
aws sso login
```

## Alternative Commands

### Login with specific profile

```powershell
aws sso login --profile legacy-sports-dev
```

### Check current authentication status

```powershell
aws sts get-caller-identity
```

## Expected Output

**When login is needed:**

```
Attempting to automatically open the SSO authorization page in your default browser.
If the browser does not open or you wish to use a different device to authorize this request, open the following URL:

https://device.sso.us-east-1.amazonaws.com/

Then enter the code: XXXX-XXXX
```

**After successful login:**

```
Successfully logged into Start URL: https://xxxxx.awsapps.com/start
```

## Workflow Pattern

### 1. Detect Error

When you see SSO expiration errors, immediately prompt the user:

```
I see your AWS SSO session has expired. Please run:

aws sso login

Let me know when you're logged in and I'll retry the operation.
```

### 2. After User Confirms Login

Retry the original command that failed.

### 3. Verify Success

Check that the operation completes without authentication errors.

## Common Operations Requiring SSO

### Database Operations

```powershell
# If CLI database commands fail with SSO error
aws sso login
pnpm exec nx start cli -- query-db --query "SELECT 1"
```

### Environment Sync

```powershell
# If sync-env fails
aws sso login
.\scripts\sync-env.ps1
```

### Lambda Deployment

```powershell
# If deploy fails
aws sso login
.\scripts\deploy-lambda.ps1 -FunctionName graphql
```

### Terraform Operations

```powershell
# If terraform fails
aws sso login
cd terraform
terraform plan
```

## Session Duration

- SSO sessions typically last 8-12 hours
- Sessions expire after inactivity
- Re-login required when session expires
- Consider running `aws sso login` at start of work session

## Troubleshooting

### Browser doesn't open automatically

1. Copy the URL from terminal output
2. Open manually in browser
3. Enter the authorization code shown

### Wrong AWS profile

```powershell
# Check current profile
echo $env:AWS_PROFILE

# Set correct profile
$env:AWS_PROFILE = "legacy-sports-dev"

# Then login
aws sso login
```

### Multiple AWS accounts

```powershell
# List available profiles
aws configure list-profiles

# Login to specific profile
aws sso login --profile legacy-sports-dev
```

## Integration with Other Skills

This skill should be checked before:

- [Sync Environment Variables](../sync-env/SKILL.md)
- [CLI Usage](../cli-usage/SKILL.md) - Database operations
- [Deploy Lambda](../deploy-lambda/SKILL.md)
- [Terraform Apply](../terraform-apply/SKILL.md)

## Best Practices

1. **Proactive**: Check authentication at start of work session
2. **Prompt immediately**: Don't retry commands multiple times before prompting
3. **Wait for confirmation**: Let user complete login before retrying
4. **Clear instructions**: Always show the exact command to run
5. **Verify**: Confirm operation succeeds after login

## Detection Pattern for AI Agents

```typescript
// Pseudocode for detection
if (output.includes('SSO session') && output.includes('expired')) {
  promptUser('aws sso login');
  waitForConfirmation();
  retryOriginalCommand();
}
```

## Example Interaction

**Bad:**

```
Agent: Running database query...
[Error: SSO expired]
Agent: Running database query again...
[Error: SSO expired]
Agent: Let me try one more time...
[Error: SSO expired]
```

**Good:**

```
Agent: Running database query...
[Error: SSO expired]
Agent: Your AWS SSO session has expired. Please run:

aws sso login

Let me know when you're logged in and I'll retry the query.

User: Done
Agent: Retrying query...
[Success]
```

## Related Documentation

- [AWS SSO Documentation](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html)
- [Troubleshooting Guide](../../docs/guides/troubleshooting.md#aws-authentication)
- [Development Setup](../../docs/guides/development-setup.md#aws-configuration)
