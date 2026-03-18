# Manual CLI Usage and Troubleshooting

## Configure AWS CLI for PowerShell (CRITICAL for AI Agents)

### Issue 1: AWS Pager

**CRITICAL**: AWS CLI uses a pager by default which shows `---more---` that AI agents cannot interact with.

**Always set this first**:

```powershell
# Disable pager for current session
$env:AWS_PAGER = ""

# Or use --no-cli-pager flag on each command
aws logs tail /aws/lambda/legacy-sports-dev-graphql --no-cli-pager
```

### Issue 2: Unicode/Emoji Encoding Errors

**CRITICAL**: AWS logs may contain Unicode characters (emojis like 🔄) that cause PowerShell encoding errors:

```
'charmap' codec can't encode character '\U0001f504' in position 184: character maps to <undefined>
```

**Solution - Set Python encoding**:

```powershell
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

## Manual CLI Commands

### View Recent Logs

```powershell
$env:AWS_PAGER = ""
$env:PYTHONIOENCODING = "utf-8"
aws logs tail /aws/lambda/legacy-sports-dev-graphql --follow --no-cli-pager
```

### View Logs for Specific Time Range

```powershell
aws logs tail /aws/lambda/legacy-sports-dev-graphql --since 1h --no-cli-pager
aws logs tail /aws/lambda/legacy-sports-dev-graphql --since 30m --no-cli-pager
aws logs tail /aws/lambda/legacy-sports-dev-graphql --since "2026-02-05T10:00:00" --until "2026-02-05T11:00:00" --no-cli-pager
```

### Search Logs with Filter Pattern

```powershell
aws logs tail /aws/lambda/legacy-sports-dev-graphql --filter-pattern "ERROR" --no-cli-pager
aws logs tail /aws/lambda/legacy-sports-dev-graphql --filter-pattern "authentication failed" --no-cli-pager
aws logs tail /aws/lambda/legacy-sports-dev-graphql --filter-pattern "{ $.level = \"error\" }" --no-cli-pager
```

### List All Log Groups

```powershell
aws logs describe-log-groups --query 'logGroups[?contains(logGroupName, `legacy-sports`)].logGroupName' --output table
```

### Get Logs from Specific Log Stream

```powershell
aws logs describe-log-streams --log-group-name /aws/lambda/legacy-sports-dev-graphql --order-by LastEventTime --descending --max-items 5
aws logs get-log-events --log-group-name /aws/lambda/legacy-sports-dev-graphql --log-stream-name "2026/02/05/[$LATEST]abc123"
```

## Advanced Usage

### Query Logs with Insights

```powershell
aws logs start-query --log-group-name /aws/lambda/legacy-sports-dev-graphql --start-time $(Get-Date).AddHours(-1).ToUniversalTime().ToString("yyyyMMddHHmmss") --end-time $(Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss") --query-string "fields @timestamp, @message | filter @message like /ERROR/ | stats count() by bin(5m)"

# Get query results (use query-id from start-query)
aws logs get-query-results --query-id "abc-123"
```

### Download Logs to File

```powershell
aws logs tail /aws/lambda/legacy-sports-dev-graphql --since 1h > lambda-logs-$(Get-Date -Format "yyyyMMdd-HHmmss").txt
aws logs get-log-events --log-group-name /aws/lambda/legacy-sports-dev-graphql --log-stream-name "2026/02/05/[$LATEST]abc123" --output json > log-events.json
```

### Watch Logs in Real-Time

```powershell
aws logs tail /aws/lambda/legacy-sports-dev-graphql --follow --format short
```

## Common Issues

### AWS credentials not configured

```powershell
aws sts get-caller-identity
.\scripts\sync-env.ps1
```

### Log group not found

- Verify Lambda function has been deployed
- Check log group name matches exactly
- Ensure you're in the correct AWS region
- List available: `aws logs describe-log-groups --query 'logGroups[].logGroupName'`

### No logs appearing

- Lambda hasn't been invoked recently
- Time range doesn't match when function was called
- Logs are in different region
- Try: `aws logs tail /aws/lambda/legacy-sports-dev-graphql --since 15m`

### Too many log entries

- Use filter patterns to narrow results
- Specify shorter time ranges
- Use CloudWatch Insights for complex queries
- Limit output with `--max-items`

### Output shows `---more---` and stops

```powershell
$env:AWS_PAGER = ""
# Or: aws logs tail ... --no-cli-pager
```

## Filtering Best Practices

### Common Filter Patterns

```powershell
--filter-pattern "ERROR"                                    # Errors only
--filter-pattern "DatabaseError"                            # Specific error type
--filter-pattern "Duration: [value>3000]"                   # Duration over threshold
--filter-pattern "RequestId: abc-123"                       # Specific request ID
--filter-pattern "{ $.level = \"error\" }"                  # JSON logs with level field
--filter-pattern "[time, request_id, level = ERROR*, msg]"  # Multiple conditions
```

### Time Range Tips

- Use relative times (`1h`, `30m`, `2d`) for recent logs
- Use absolute times (ISO 8601) for historical analysis
- All times are in UTC
- Include buffer time before/after issue occurred

## PowerShell Helper Function

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
    if ($Filter) { $cmd += " --filter-pattern `"$Filter`"" }
    if ($Follow) { $cmd += " --follow" }
    Invoke-Expression $cmd
}
```

## Notes

- **AI Agent Compatibility**: Always use `$env:AWS_PAGER = ""` and `$env:PYTHONIOENCODING = "utf-8"` before any AWS logs commands
- Piping to `Select-Object` in PowerShell may still cause encoding errors — use `--filter-pattern` or redirect to file instead
- All timestamps in CloudWatch are UTC
- Logs are retained for 30 days by default
- Rate limits apply to CloudWatch API calls
