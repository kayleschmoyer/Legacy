---
name: db-query
description: 'Execute SQL queries against the Legacy Sports PostgreSQL database using scripts/db-query.ps1 for debugging, data verification, and analysis.'
---

# Database Query Skill

> **MCP alternative**: Prefer the `db_query` MCP tool (see `skills/mcp-db/SKILL.md`) for ad-hoc queries — it returns structured JSON, enforces read-only by default, and requires no AWS credentials. Fall back to `scripts/db-query.ps1` when the MCP server is unavailable or you need direct RDS access.

## Quick Start

```powershell
# Always run from repository root
cd D:\code\legacy-sports

# Simple query
powershell -File .\scripts\db-query.ps1 -Query "SELECT * FROM matchups WHERE id = 120"

# JSON output
powershell -File .\scripts\db-query.ps1 -Query "SELECT * FROM matchups LIMIT 1" -Format json
```

## Purpose

Execute SQL queries against PostgreSQL database for debugging and verification during development.

## Prerequisites

1. **Working Directory**: Must be in repository root (`D:\code\legacy-sports`)
2. **AWS Credentials**: Valid AWS SSO session (`aws sso login` if needed)
3. **Network**: Direct RDS endpoint must be accessible (port 5432)

## Architecture

### Database Endpoints

- **Direct RDS** (`legacy-sports-dev-postgres.cep4b6aynyet.us-east-1.rds.amazonaws.com`)
  - Used by: CLI tools, local development
  - Access: Public (security group allows external connections)
- **RDS Proxy** (`legacy-sports-dev-gql-proxy.proxy-cep4b6aynyet.us-east-1.rds.amazonaws.com`)
  - Used by: Lambda functions
  - Access: VPC-only (private subnets)

The CLI uses the **direct endpoint** for simpler setup and faster queries.

## Common Queries

### Check Matchup Status

```powershell
powershell -File .\scripts\db-query.ps1 -Query "SELECT id, league_id, week_number, status, stats_loading_status FROM matchups WHERE id = 120"
```

### Count Per-Player Seasons

```powershell
powershell -File .\scripts\db-query.ps1 -Query "SELECT COUNT(*) as count FROM league_week_player_seasons WHERE league_id = 25 AND week_number = 1"
```

### List Player Season Assignments

```powershell
powershell -File .\scripts\db-query.ps1 -Query "SELECT player_id, season FROM league_week_player_seasons WHERE league_id = 25 AND week_number = 1 LIMIT 20"
```

### Check for Failed Matchups

```powershell
powershell -File .\scripts\db-query.ps1 -Query "SELECT id, league_id, stats_loading_status FROM matchups WHERE stats_loading_status = 'failed'"
```

## Output Formats

- **table** (default): Pipe-separated columns, readable in terminal
- **json**: Valid JSON array for scripting/piping

## Troubleshooting

**Connection refused**: Check `aws sts get-caller-identity` and run `aws sso login` if expired

**Permission denied**: Verify security group allows your IP on port 5432

**SSL errors**: Ensure `certs/us-east-1-bundle.pem` exists

## Related

- Script: [`scripts/db-query.ps1`](../../../scripts/db-query.ps1)
- Implementation: [`apps/cli/src/commands/queryDb.ts`](../../../apps/cli/src/commands/queryDb.ts)
- Nx target: `pnpm exec nx run cli:query-db`
