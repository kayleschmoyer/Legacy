# CLI Command Reference

## Database Connectivity & Testing

### Test Database Connection

```powershell
pnpm run cli:test-connection      # Standard connection
pnpm run cli:test-raw-connection  # Raw PostgreSQL connection
pnpm run cli:test-db              # Basic connectivity test
```

### Inspect Database Schema

```powershell
pnpm run cli:inspect-database     # Lists all tables, schemas, migration status
```

### Execute SQL Queries

```powershell
.\scripts\db-query.ps1 -Query "SELECT * FROM players LIMIT 5"
.\scripts\db-query.ps1 -Query "SELECT COUNT(*) FROM leagues" -Format json
pnpm exec nx start cli -- query-db --query "SELECT * FROM players LIMIT 5"
```

## Data Loading & Management

### Load Player Data

```powershell
pnpm run cli:load-players         # Load all players from external sources
pnpm run cli:list-players         # List loaded players
```

### Load Statistics

```powershell
pnpm run cli:load-career-stats                                    # Load career stats for all players
pnpm exec nx start cli -- load-single-player-stats --player-id 123  # Specific player
pnpm exec nx start cli -- check-stats-status                       # Check loading status
```

## User Management

### Add User

```powershell
pnpm exec nx start cli -- add-user --email "user@example.com" --username "username" --name "Full Name"
```

### List Users

```powershell
pnpm exec nx start cli -- list-users        # Direct database query
pnpm exec nx start cli -- list-users-auth   # Via authenticated GraphQL
```

### Set User Access Level

```powershell
pnpm exec nx start cli -- set-user-type --email "user@example.com" --access-level admin
pnpm exec nx start cli -- set-user-type --email "user@example.com" --access-level none
```

## Authentication (CLI)

```powershell
pnpm exec nx start cli -- auth login    # Login
pnpm exec nx start cli -- auth status   # Check status
pnpm exec nx start cli -- auth list     # List environments
pnpm exec nx start cli -- auth switch   # Switch environment
pnpm exec nx start cli -- auth logout   # Logout
```

### JWT Management

```powershell
pnpm exec nx start cli -- generate-jwt --user-id 1
pnpm run cli:decode-jwt --token "eyJhbGc..."
```

## Matchup & Draft Management

```powershell
pnpm run cli:create-matchup --matchup-id 1
pnpm run cli:start-draft --league-id 1 --draft-id 1
pnpm exec nx start cli -- inspect-sqs-queue   # Inspect draft queue
pnpm run sqs:inspect                            # Shortcut
pnpm run draft:inspect                          # Shortcut
```

## Debugging & Investigation

```powershell
pnpm exec nx start cli -- investigate-matchup 7
pnpm exec nx start cli -- find-matchup-from-player 123
pnpm exec nx start cli -- get-league-seasons 1
pnpm exec nx start cli -- investigate-league-13
```

## Database Administration

```powershell
pnpm exec nx start cli -- run-migrations    # Run pending migrations
pnpm exec nx start cli -- reset-database    # ⚠️ DESTRUCTIVE: Drop all tables (dev only)
pnpm run cli:fix-users-table                # Create missing app_internal.users table
```

## GraphQL Operations

```powershell
pnpm exec nx start cli -- graphql-test --query "query { players { nodes { id firstName lastName } } }"
pnpm exec nx start cli -- compute-scoring --matchup-id 1
```

Requires CLI authentication (`auth login` first).

## Environment Variables

```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
VITE_GRAPHQL_HOST=http://localhost:5000/graphql
JWT_SECRET=your-secret-key
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012
```

## Common Issues

### "Module not found" or import errors

Build the CLI project first: `pnpm exec nx build cli`

### Database connection fails

```powershell
aws sso login                    # Check for SSO expiration
pnpm run sync-env                # Sync environment variables
pnpm run cli:test-connection     # Test connection
pnpm run db:credentials          # Check credentials
```

### "Command not found"

Use full Nx command: `pnpm exec nx start cli -- some-command`

### Authentication required errors

Authenticate first: `pnpm exec nx start cli -- auth login`

### Permission denied errors

Check access level: `pnpm exec nx start cli -- list-users`
Set admin if needed: `pnpm exec nx start cli -- set-user-type --email "user@example.com" --access-level admin`
