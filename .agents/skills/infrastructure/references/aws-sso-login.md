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

## Check Auth Status First (REQUIRED)

**Always check auth status before triggering login.** Never call `aws sso login` unconditionally.

```typescript
// MCP tool (preferred)
aws_sso_status();
```

```powershell
# Shell fallback
aws sts get-caller-identity
```

If either returns a valid identity / `authenticated: true`, **skip login entirely** — the session is still valid.

## Login Command (only when status check shows expired)

```powershell
aws sso login
```

### Login with specific profile

```powershell
aws sso login --profile legacy-sports-dev
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

For every AWS-dependent operation, apply this pattern — substituting the command from the table below:

```typescript
// 1. Check first — MCP tool (preferred)
aws_sso_status();
```

```powershell
# 1. Check first — shell fallback
aws sts get-caller-identity
# 2. Only if expired:
aws sso login
# 3. Run the operation
<command>
```

| Operation            | `<command>`                                             |
| -------------------- | ------------------------------------------------------- |
| Database query       | `pnpm exec nx start cli -- query-db --query "SELECT 1"` |
| Environment sync     | `.\scripts\sync-env.ps1`                                |
| Lambda deployment    | `.\scripts\deploy-lambda.ps1 -FunctionName graphql`     |
| Terraform plan/apply | `terraform -chdir=terraform/main plan`                  |

## Session Duration

- SSO sessions typically last 8-12 hours
- Sessions expire after inactivity
- Re-login required when session expires
- At the start of a work session, **check status first** (`aws_sso_status()`) — do not unconditionally run `aws sso login`

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

- [Sync Environment Variables](../../sync-env/SKILL.md)
- [CLI Usage](../../cli-usage/SKILL.md) - Database operations
- [Deploy Lambda](../deploy-lambda.md)
- [Terraform Apply](../terraform-apply.md)

## Best Practices

1. **Check status first (REQUIRED)**: Always call `aws_sso_status()` (MCP) or `aws sts get-caller-identity` (shell) before any AWS operation — never call `aws sso login` unconditionally. Repeated unconditional logins look like credential abuse to AWS and can trigger security alerts.
2. **Prompt immediately on expiry**: Don't retry commands multiple times before prompting
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
