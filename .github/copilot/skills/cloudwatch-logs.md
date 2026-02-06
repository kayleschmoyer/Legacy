# Skill: Reading CloudWatch Logs

## Overview

Query and stream AWS CloudWatch logs for Lambda functions and other AWS services to debug production issues and monitor application behavior.

## When to Use

- Debugging production errors in Lambda functions
- Investigating API failures or timeouts
- Monitoring application behavior in AWS
- Tracing requests through the system
- Analyzing error patterns or frequency
- Checking deployment success

## 🚀 RECOMMENDED: Use the Wrapper Script (Easiest for AI Agents)

**ALWAYS USE THIS SCRIPT FIRST** - It handles all encoding and pagination issues automatically:

```powershell
# Basic usage - view last hour of logs
.\scripts\aws-logs.ps1 -Function graphql -Since 1h

# View recent logs for specific Lambda
.\scripts\aws-logs.ps1 -Function game-selection -Since 30m

# Search for errors
.\scripts\aws-logs.ps1 -Function db -Since 2h -Filter "ERROR"

# Follow logs in real-time
.\scripts\aws-logs.ps1 -Function stats -Follow

# Production environment
.\scripts\aws-logs.ps1 -Function graphql -Since 1h -Environment prod
```

**Available Functions**: `graphql`, `db`, `oauth-proxy`, `notifications`, `stats`, `game-selection`, `draft-processor`

**Why use this script?**

- ✅ Automatically sets `AWS_PAGER=""` (no pagination issues)
- ✅ Automatically sets `PYTHONIOENCODING=utf-8` (no emoji/Unicode errors)
- ✅ Simpler syntax (no need to remember full log group paths)
- ✅ Built-in validation and helpful error messages
- ✅ Works reliably for AI agents without manual environment setup

## Manual AWS CLI Usage (If Script Not Available)

### Important: Configure AWS CLI for PowerShell (CRITICAL for AI Agents)

### Issue 1: AWS Pager

**CRITICAL**: AWS CLI uses a pager by default which shows `---more---` that AI agents cannot interact with.

**Always set this first**:

```powershell
# Disable pager for current session
$env:AWS_PAGER = ""

# Or use --no-cli-pager flag on each command
aws logs tail /aws/lambda/legacy-sports-dev-graphql --no-cli-pager
```

### Issue 2: Unicode/Emoji Encoding Errors ⚠️

**CRITICAL**: AWS logs may contain Unicode characters (emojis like 🔄) that cause PowerShell encoding errors:

```
'charmap' codec can't encode character '\U0001f504' in position 184: character maps to <undefined>
```

**Solution - Set Python encoding**:

```powershell
# Set UTF-8 encoding for AWS CLI (Python-based)
$env:PYTHONIOENCODING = "utf-8"

# Combined with pager disable
$env:AWS_PAGER = ""
$env:PYTHONIOENCODING = "utf-8"
aws logs tail /aws/lambda/legacy-sports-dev-graphql --no-cli-pager
```

**Add BOTH to PowerShell profile** to make permanent:

```powershell
# Add to: $PROFILE (usually ~\Documents\PowerShell\Microsoft.PowerShell_profile.ps1)
$env:AWS_PAGER = ""
$env:PYTHONIOENCODING = "utf-8"
```

## Commands

### View Recent Logs for Lambda Function

```powershell
# Set encoding and disable pager first!
$env:AWS_PAGER = ""
$env:PYTHONIOENCODING = "utf-8"

# Then tail logs
aws logs tail /aws/lambda/legacy-sports-dev-graphql --follow --no-cli-pager
```

### View Logs for Specific Time Range

```powershell
# Last hour
aws logs tail /aws/lambda/legacy-sports-dev-graphql --since 1h --no-cli-pager

# Last 30 minutes
aws logs tail /aws/lambda/legacy-sports-dev-graphql --since 30m --no-cli-pager

# Specific time range (UTC)
aws logs tail /aws/lambda/legacy-sports-dev-graphql --since "2026-02-05T10:00:00" --until "2026-02-05T11:00:00" --no-cli-pager
```

### Search Logs with Filter Pattern

```powershell
# Search for errors
aws logs tail /aws/lambda/legacy-sports-dev-graphql --filter-pattern "ERROR" --no-cli-pager

# Search for specific text
aws logs tail /aws/lambda/legacy-sports-dev-graphql --filter-pattern "authentication failed" --no-cli-pager

# Multiple terms
aws logs tail /aws/lambda/legacy-sports-dev-graphql --filter-pattern "{ $.level = \"error\" }" --no-cli-pager
```

### List All Log Groups

```powershell
aws logs describe-log-groups --query 'logGroups[?contains(logGroupName, `legacy-sports`)].logGroupName' --output table
```

### Get Logs from Specific Log Stream

```powershell
# List streams (most recent first)
aws logs describe-log-streams --log-group-name /aws/lambda/legacy-sports-dev-graphql --order-by LastEventTime --descending --max-items 5

# Get events from specific stream
aws logs get-log-events --log-group-name /aws/lambda/legacy-sports-dev-graphql --log-stream-name "2026/02/05/[$LATEST]abc123"
```

## Lambda Function Log Groups

### Available Log Groups (dev environment)

- `/aws/lambda/legacy-sports-dev-graphql` - GraphQL API
- `/aws/lambda/legacy-sports-dev-db` - Database Lambda
- `/aws/lambda/legacy-sports-dev-oauth-proxy` - OAuth authentication
- `/aws/lambda/legacy-sports-dev-notifications` - Notification service
- `/aws/lambda/legacy-sports-dev-stats-lambda` - Statistics processing
- `/aws/lambda/legacy-sports-dev-game-selection` - Game selection logic
- `/aws/lambda/legacy-sports-dev-draft-processor` - Draft processing

### Production Log Groups

Replace `-dev-` with `-prod-` for production logs:

- `/aws/lambda/legacy-sports-prod-graphql`
- `/aws/lambda/legacy-sports-prod-db`
- etc.

## Expected Output

### Success

```
2026-02-05T10:30:15.123Z START RequestId: abc-123 Version: $LATEST
2026-02-05T10:30:15.234Z [INFO] Processing GraphQL request
2026-02-05T10:30:15.345Z [INFO] Query executed successfully
2026-02-05T10:30:15.456Z END RequestId: abc-123
2026-02-05T10:30:15.567Z REPORT RequestId: abc-123 Duration: 344ms Billed Duration: 400ms Memory Size: 512MB Max Memory Used: 128MB
```

### Log Entry Structure

- **Timestamp**: UTC timezone (ISO 8601 format)
- **Level**: `[INFO]`, `[WARN]`, `[ERROR]`, etc.
- **Message**: Log message content
- **Context**: Request ID, function version, etc.
- **Metrics**: Duration, memory usage, billed duration

## Advanced Usage

### Query Logs with Insights

```powershell
# Count errors in last hour
aws logs start-query --log-group-name /aws/lambda/legacy-sports-dev-graphql --start-time $(Get-Date).AddHours(-1).ToUniversalTime().ToString("yyyyMMddHHmmss") --end-time $(Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss") --query-string "fields @timestamp, @message | filter @message like /ERROR/ | stats count() by bin(5m)"

# Get query results (use query-id from start-query)
aws logs get-query-results --query-id "abc-123"
```

### Download Logs to File

```powershell
# Tail and save to file
aws logs tail /aws/lambda/legacy-sports-dev-graphql --since 1h > lambda-logs-$(Get-Date -Format "yyyyMMdd-HHmmss").txt

# Get events and save
aws logs get-log-events --log-group-name /aws/lambda/legacy-sports-dev-graphql --log-stream-name "2026/02/05/[$LATEST]abc123" --output json > log-events.json
```

### Watch Logs in Real-Time

```powershell
# Follow logs continuously (Ctrl+C to stop)
aws logs tail /aws/lambda/legacy-sports-dev-graphql --follow --format short
```

## Common Issues

### Issue: AWS credentials not configured

**Solution**:

```powershell
# Verify AWS credentials
aws sts get-caller-identity

# If not configured, sync environment
.\scripts\sync-env.ps1
```

### Issue: Log group not found

**Solution**:

- Verify Lambda function has been deployed
- Check log group name matches exactly
- Ensure you're in the correct AWS region
- List available log groups:
  ```powershell
  aws logs describe-log-groups --query 'logGroups[].logGroupName'
  ```

### Issue: No logs appearing

**Possible causes**:

- Lambda hasn't been invoked recently
- Time range doesn't match when function was called
- Logs are in different region
- Function hasn't finished executing (check Lambda console)

**Solution**:

```powershell
# Check last 15 minutes
aws logs tail /aws/lambda/legacy-sports-dev-graphql --since 15m

# Verify Lambda was invoked
aws lambda get-function --function-name legacy-sports-dev-graphql
```

### Issue: Too many log entries

**Solution**:

- Use filter patterns to narrow results
- Specify shorter time ranges
- Use CloudWatch Insights for complex queries
- Limit output with `--max-items`

### Issue: Output shows `---more---` and stops

**Cause**: AWS CLI pager is active (uses `less` or `more` for pagination)

**Solution**:

```powershell
# Set environment variable to disable pager
$env:AWS_PAGER = ""

# Or use --no-cli-pager flag
aws logs tail /aws/lambda/legacy-sports-dev-graphql --no-cli-pager

# Make permanent by adding to PowerShell profile
echo '$env:AWS_PAGER = ""' >> $PROFILE
```

**Why this matters for AI**: AI agents cannot interact with pager prompts (press Space, q, etc.)

## Filtering Best Practices

### Common Filter Patterns

```powershell
# Errors only
--filter-pattern "ERROR"

# Specific error type
--filter-pattern "DatabaseError"

# Duration over threshold (e.g., > 3000ms)
--filter-pattern "Duration: [value>3000]"

# Specific request ID
--filter-pattern "RequestId: abc-123"

# JSON logs with level field
--filter-pattern "{ $.level = \"error\" }"

# Multiple conditions
--filter-pattern "[time, request_id, level = ERROR*, msg]"
```

### Time Range Tips

- Use relative times (`1h`, `30m`, `2d`) for recent logs
- Use absolute times (ISO 8601) for historical analysis
- All times are in UTC
- Include buffer time before/after issue occurred

## Related Skills

- [Sync Environment](.github/copilot/skills/sync-env.md) - AWS authentication setup
- [Lambda Deploy](.github/copilot/skills/deploy-lambda.md) - Deploying Lambda functions
- [Dev DB Lambda](.github/copilot/skills/dev-db-lambda.md) - Local Lambda testing

## Useful Scripts

### PowerShell Helper Function

Add to your PowerShell profile for easier log access:

```powershell
function Get-LambdaLogs {
    param(
        [Parameter(Mandatory=$true)]
        [ValidateSet('graphql', 'db', 'oauth-proxy', 'notifications', 'stats-lambda', 'game-selection', 'draft-processor')]
        [string]$Function,

        [string]$Since = "1h",

        [string]$Filter,

        [switch]$Follow,

        [ValidateSet('dev', 'prod')]
        [string]$Environment = 'dev'
    )

    $logGroup = "/aws/lambda/legacy-sports-$Environment-$Function"

    $cmd = "aws logs tail `"$logGroup`" --since $Since"

    if ($Filter) {
        $cmd += " --filter-pattern `"$Filter`""
    }

    if ($Follow) {
        $cmd += " --follow"
    }

    Invoke-Expression $cmd
}

# Usage examples:
# Get-LambdaLogs -Function graphql
# Get-LambdaLogs -Function db -Since 30m -Filter "ERROR"
# Get-LambdaLogs -Function oauth-proxy -Follow
# Get-LambdaLogs -Function graphql -Environment prod -Since 2h
```

## Quick Reference

### 🎯 PREFERRED: Wrapper Script (Use This!)

```powershell
# View recent logs
.\scripts\aws-logs.ps1 -Function graphql -Since 1h
.\scripts\aws-logs.ps1 -Function game-selection -Since 30m

# Search for errors or specific text
.\scripts\aws-logs.ps1 -Function db -Since 2h -Filter "ERROR"
.\scripts\aws-logs.ps1 -Function stats -Since 1h -Filter "campbem01"

# Follow in real-time
.\scripts\aws-logs.ps1 -Function graphql -Follow

# Production
.\scripts\aws-logs.ps1 -Function graphql -Since 1h -Environment prod
```

### Manual AWS CLI (If Needed)

```powershell
# FIRST: Set environment variables to prevent errors
$env:AWS_PAGER = ""                # Disable pager to avoid ---more--- pagination
$env:PYTHONIOENCODING = "utf-8"    # Fix Unicode/emoji encoding errors

# Most common commands (all include --no-cli-pager for AI compatibility)
aws logs tail /aws/lambda/legacy-sports-dev-graphql --follow --no-cli-pager           # Real-time logs
aws logs tail /aws/lambda/legacy-sports-dev-graphql --since 1h --no-cli-pager         # Last hour
aws logs tail /aws/lambda/legacy-sports-dev-graphql --filter-pattern "ERROR" --no-cli-pager  # Errors only
aws logs describe-log-groups --query 'logGroups[?contains(logGroupName, `legacy-sports`)].logGroupName' --no-cli-pager  # List all
```

## Notes

- **AI Agent Compatibility**:
  - Always use `$env:AWS_PAGER = ""` or `--no-cli-pager` to prevent `---more---` pagination
  - Always use `$env:PYTHONIOENCODING = "utf-8"` to handle Unicode characters and emojis in logs
  - Set both environment variables before running any AWS logs commands
  - **IMPORTANT**: Piping to `Select-Object` in PowerShell may still cause encoding errors. Instead:
    - Use `--filter-pattern` for filtering
    - Redirect to file: `aws logs tail ... > logs.txt`
    - Use the wrapper script: `scripts\aws-logs.ps1`
- All timestamps in CloudWatch are UTC
- Logs are retained for 30 days by default (check log group retention settings)
- Use `--output json` for programmatic processing
- Large log queries may take time to complete
- Rate limits apply to CloudWatch API calls
- Consider using CloudWatch Insights for complex analysis
- The `--no-cli-pager` flag works for all AWS CLI commands, not just CloudWatch
