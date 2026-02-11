# Debugging Distributed Systems: Correlating Database Timestamps with CloudWatch Logs

## The Problem

In distributed systems, debugging issues requires correlating events across multiple services:

1. **Database** - Records when something happened (e.g., `last_updated` timestamp)
2. **CloudWatch Logs** - Contains the actual execution logs from Lambda functions
3. **Timing mismatch** - The relevant logs might be hours or days old, but default log queries show recent logs

**Example scenario**: A game's stats show a `last_updated` timestamp of 3 hours ago, but when you check CloudWatch logs with `--since 1h`, you're only seeing recent activity. The logs you need are from 3 hours ago when the update actually happened.

## The Solution: Manual Time Correlation

### Step 1: Query Database for Timestamp

```powershell
.\scripts\db-query.ps1 -Query "SELECT id, last_updated FROM app_internal.game_stats WHERE game_id = 123 ORDER BY last_updated DESC LIMIT 1"
```

**Result**: `2026-02-08 14:35:42` (3 hours ago)

### Step 2: Calculate Time Window

For timestamp `14:35:42`, use a ±5 minute window:

- Start: `14:30:42`
- End: `14:40:42`

Convert to Unix epoch (use https://www.epochconverter.com/):

- Start: `1707405042`
- End: `1707405642`

### Step 3: Query CloudWatch with Exact Times

```powershell
# Set encoding first
$env:AWS_PAGER = ""
$env:PYTHONIOENCODING = "utf-8"

# Query logs with exact time range (epoch in milliseconds)
$startTime = 1707405042000  # Add 000 for milliseconds
$endTime = 1707405642000

aws logs filter-log-events `
  --log-group-name "/aws/lambda/legacy-sports-dev-stats" `
  --start-time $startTime `
  --end-time $endTime `
  --no-cli-pager
```

## Common Timestamp Columns

Check these columns when debugging:

| Column             | Usage                    | Example Query                                                          |
| ------------------ | ------------------------ | ---------------------------------------------------------------------- |
| `last_updated`     | When record last changed | `SELECT last_updated FROM app_internal.game_stats WHERE game_id = 123` |
| `updated_at`       | Generic update time      | `SELECT updated_at FROM app_internal.leagues WHERE id = 16`            |
| `created_at`       | When record created      | `SELECT created_at FROM app_internal.players WHERE id = 456`           |
| `draft_started_at` | League draft start       | `SELECT draft_started_at FROM app_internal.leagues WHERE id = 16`      |
| `occurred_at`      | Event timestamp          | `SELECT occurred_at FROM app_internal.events WHERE id = 789`           |

## Common Debugging Scenarios

### Game Stats Loading Issues

```powershell
# 1. Check when stats were last updated
.\scripts\db-query.ps1 -Query "SELECT game_id, last_updated FROM app_internal.game_stats WHERE game_id = 123 ORDER BY last_updated DESC LIMIT 1"

# 2. Find logs around that time (±5 minutes)
# Convert timestamp to epoch milliseconds (use https://www.epochconverter.com/)
$startTime = 1707405042000  # Example: add 000 for milliseconds
$endTime = 1707405642000

aws logs filter-log-events `
  --log-group-name "/aws/lambda/legacy-sports-dev-stats" `
  --start-time $startTime `
  --end-time $endTime `
  --no-cli-pager
```

### League Draft Issues

```powershell
# 1. Check draft start time
.\scripts\db-query.ps1 -Query "SELECT id, draft_started_at, draft_status FROM app_internal.leagues WHERE id = 16"

# 2. Find draft processor logs (use wider window: -2m to +15m)
$startTime = [DateTimeOffset]::Parse("2026-02-08T14:33:00Z").ToUnixTimeMilliseconds()
$endTime = [DateTimeOffset]::Parse("2026-02-08T14:50:00Z").ToUnixTimeMilliseconds()

aws logs filter-log-events `
  --log-group-name "/aws/lambda/legacy-sports-dev-draft-processor" `
  --start-time $startTime `
  --end-time $endTime `
  --no-cli-pager
```

### Player Updates

```powershell
# 1. Check update time
.\scripts\db-query.ps1 -Query "SELECT id, name, updated_at FROM app_internal.players WHERE id = 456"

# 2. Find GraphQL logs
$startTime = [DateTimeOffset]::Parse("2026-02-08T14:30:00Z").ToUnixTimeMilliseconds()
$endTime = [DateTimeOffset]::Parse("2026-02-08T14:40:00Z").ToUnixTimeMilliseconds()

aws logs filter-log-events `
  --log-group-name "/aws/lambda/legacy-sports-dev-graphql" `
  --start-time $startTime `
  --end-time $endTime `
  --no-cli-pager
```

## Lambda Function Names

| Function        | Log Group                                       |
| --------------- | ----------------------------------------------- |
| Stats           | `/aws/lambda/legacy-sports-dev-stats`           |
| GraphQL         | `/aws/lambda/legacy-sports-dev-graphql`         |
| Draft Processor | `/aws/lambda/legacy-sports-dev-draft-processor` |
| Game Selection  | `/aws/lambda/legacy-sports-dev-game-selection`  |
| WebSocket       | `/aws/lambda/legacy-sports-dev-websocket`       |
| OAuth Proxy     | `/aws/lambda/legacy-sports-dev-oauth-proxy`     |

## Time Window Guidelines

**Quick operations** (API calls, queries): ±2-5 minutes
**Long operations** (drafts, migrations): -5m to +30m  
**Background jobs**: -10m to +60m

Adjust based on expected operation duration.

## Tips

1. **Start narrow**: Use small time windows (±5 minutes) to reduce noise
2. **Check database first**: Always verify the timestamp before searching logs
3. **Use filters**: Add `--filter-pattern "ERROR"` or `--filter-pattern "game_id=123"` to narrow results
4. **Schema prefix**: Remember to use `app_internal.` prefix for table names
5. **Epoch converter**: Bookmark https://www.epochconverter.com/ for quick conversions
6. **PowerShell encoding**: Always set `$env:PYTHONIOENCODING = "utf-8"` before AWS CLI

## Related Documentation

- [Troubleshooting Guide](troubleshooting.md) - General debugging practices
- [Database Schema](../architecture/database-schema.md) - Understanding database structure
- [AWS Infrastructure](../deployment/aws-infrastructure.md) - CloudWatch setup
