# Skill: CLI Usage

## Overview

Use the Legacy Sports CLI tool to perform database operations, data loading, user management, authentication, debugging, and administrative tasks.

## When to Use

- Testing database connectivity and configuration
- Loading player data and statistics
- Managing users and authentication
- Creating and managing matchups and drafts
- Debugging database and application issues
- Running database migrations
- Executing GraphQL queries
- Investigating data inconsistencies

## Command Structure

All CLI commands follow this pattern:

```powershell
# Using npm script shortcuts
pnpm run cli:<command-name>

# Using Nx directly
pnpm exec nx <command-name> cli

# Direct execution with arguments
pnpm exec nx start cli -- <command-name> [options]
```

## Command Categories

### Database Connectivity & Testing

#### Test Database Connection

```powershell
# Test standard connection
pnpm run cli:test-connection

# Test raw PostgreSQL connection
pnpm run cli:test-raw-connection

# Basic connectivity test
pnpm run cli:test-db
```

**When to use**: Before other operations to verify database access and credentials.

#### Inspect Database Schema

```powershell
# View current database state and migration status
pnpm run cli:inspect-database
```

**Output**: Lists all tables, schemas, and migration status.

#### Execute SQL Queries

```powershell
# Run SQL queries with wrapper script (recommended)
.\scripts\db-query.ps1 -Query "SELECT * FROM players LIMIT 5"

# With JSON output
.\scripts\db-query.ps1 -Query "SELECT COUNT(*) FROM leagues" -Format json

# Using CLI directly (alternative)
pnpm exec nx start cli -- query-db --query "SELECT * FROM players LIMIT 5"
```

**Use case**: Quick database queries without opening psql.
**Recommended**: Use `db-query.ps1` script for simplicity.

### Data Loading & Management

#### Load Player Data

```powershell
# Load all players from external sources
pnpm run cli:load-players

# List loaded players
pnpm run cli:list-players
```

**When to use**: Initial data population or updating player roster.

#### Load Statistics

```powershell
# Load career statistics for all players
pnpm run cli:load-career-stats

# Load stats for specific player
pnpm exec nx start cli -- load-single-player-stats --player-id 123

# Check statistics loading status
pnpm exec nx start cli -- check-stats-status
```

**When to use**: After loading players or when updating season statistics.

### User Management

#### Add User

```powershell
# Add new user (required for OAuth)
pnpm exec nx start cli -- add-user \
  --email "user@example.com" \
  --username "username" \
  --name "Full Name"
```

**Required for**: Enabling OAuth authentication for new users.

#### List Users

```powershell
# List all users (direct database query)
pnpm exec nx start cli -- list-users

# List users via authenticated GraphQL API
pnpm exec nx start cli -- list-users-auth
```

#### Set User Access Level

```powershell
# Set user as admin
pnpm exec nx start cli -- set-user-type \
  --email "user@example.com" \
  --access-level admin

# Set user as regular user
pnpm exec nx start cli -- set-user-type \
  --email "user@example.com" \
  --access-level none
```

**Access levels**: `admin`, `none`

### Authentication (CLI)

#### Authenticate CLI

```powershell
# Login to CLI
pnpm exec nx start cli -- auth login

# Check authentication status
pnpm exec nx start cli -- auth status

# List saved environments
pnpm exec nx start cli -- auth list

# Switch environment
pnpm exec nx start cli -- auth switch

# Logout
pnpm exec nx start cli -- auth logout
```

**Use case**: Required before using authenticated GraphQL commands.

#### JWT Management

```powershell
# Generate JWT for testing
pnpm exec nx start cli -- generate-jwt --user-id 1

# Decode and analyze JWT token
pnpm run cli:decode-jwt --token "eyJhbGc..."
```

**When to use**: Development and debugging authentication issues.

### Matchup & Draft Management

#### Create Matchup

```powershell
# Create matchup records
pnpm run cli:create-matchup --matchup-id 1
```

#### Start Draft

```powershell
# Start draft for a league
pnpm run cli:start-draft --league-id 1 --draft-id 1
```

#### Inspect Draft Queue

```powershell
# Inspect SQS draft queue
pnpm exec nx start cli -- inspect-sqs-queue

# Or use shortcuts
pnpm run sqs:inspect
pnpm run draft:inspect
```

**Use case**: Monitor draft processing and debug queue issues.

### Debugging & Investigation

#### Investigate Matchup Issues

```powershell
# Investigate specific matchup
pnpm exec nx start cli -- investigate-matchup 7

# Find matchup from player ID
pnpm exec nx start cli -- find-matchup-from-player 123
```

#### Get Available Seasons

```powershell
# Get seasons with stats for a league
pnpm exec nx start cli -- get-league-seasons 1
```

#### Investigate Data Issues

```powershell
# Investigate league 13 stats issue
pnpm exec nx start cli -- investigate-league-13
```

### Database Administration

#### Run Migrations

```powershell
# Run all pending migrations
pnpm exec nx start cli -- run-migrations
```

**When to use**: After pulling schema changes or deploying.

#### Reset Database (DESTRUCTIVE)

```powershell
# Drop all tables and schemas
pnpm exec nx start cli -- reset-database
```

**⚠️ WARNING**: This destroys all data. Development only!

#### Fix Users Table

```powershell
# Create missing app_internal.users table
pnpm run cli:fix-users-table
```

**Use case**: Recovering from schema corruption.

### GraphQL Operations

#### Test GraphQL Queries

```powershell
# Execute arbitrary GraphQL query
pnpm exec nx start cli -- graphql-test \
  --query "query { players { nodes { id firstName lastName } } }"
```

**Requires**: CLI authentication (`auth login` first).

#### Compute Scoring

```powershell
# Compute matchup scoring
pnpm exec nx start cli -- compute-scoring --matchup-id 1
```

## Common Workflows

### Initial Setup Workflow

```powershell
# 1. Test connection
pnpm run cli:test-connection

# 2. Inspect database
pnpm run cli:inspect-database

# 3. Run migrations
pnpm exec nx start cli -- run-migrations

# 4. Load players
pnpm run cli:load-players

# 5. Load statistics
pnpm run cli:load-career-stats
```

### User Onboarding Workflow

```powershell
# 1. Add user
pnpm exec nx start cli -- add-user \
  --email "new@example.com" \
  --username "newuser" \
  --name "New User"

# 2. Set access level (if admin needed)
pnpm exec nx start cli -- set-user-type \
  --email "new@example.com" \
  --access-level admin

# 3. Verify user exists
pnpm exec nx start cli -- list-users
```

### Debugging Workflow

```powershell
# 1. Check authentication
pnpm exec nx start cli -- auth status

# 2. Test database connection
pnpm run cli:test-connection

# 3. Inspect database state
pnpm run cli:inspect-database

# 4. Query data directly
pnpm exec nx start cli -- query-db --query "SELECT * FROM players LIMIT 5"

# 5. Check specific issue
pnpm exec nx start cli -- investigate-matchup 7
```

## Common Issues

### Issue: "Module not found" or import errors

**Solution**: Build the CLI project first

```powershell
pnpm exec nx build cli
```

### Issue: Database connection fails

**Solutions**:

```powershell
# 1. Check for AWS SSO expiration
# If you see "SSO session associated with this profile has expired"
aws sso login

# 2. Sync environment variables
pnpm run sync-env

# 3. Test connection
pnpm run cli:test-connection

# 4. Check credentials
pnpm run db:credentials
```

### Issue: "Command not found"

**Solution**: Use full Nx command

```powershell
# Instead of:
pnpm run cli:some-command

# Use:
pnpm exec nx start cli -- some-command
```

### Issue: Authentication required errors

**Solution**: Authenticate the CLI first

```powershell
pnpm exec nx start cli -- auth login
```

### Issue: Permission denied errors

**Solution**: Check user access level

```powershell
# List users and check access_level
pnpm exec nx start cli -- list-users

# Set admin if needed
pnpm exec nx start cli -- set-user-type --email "user@example.com" --access-level admin
```

## Best Practices

1. **Always test connection first**: Run `cli:test-connection` before data operations
2. **Build before running**: Ensure CLI is built: `pnpm exec nx build cli`
3. **Use shortcuts**: Prefer `pnpm run cli:*` shortcuts for common commands
4. **Check status first**: Use inspect/list commands before modifications
5. **Authenticate when needed**: Some commands require `auth login` first
6. **Be careful with destructive commands**: `reset-database` destroys all data

## Environment Variables

The CLI respects these environment variables:

```bash
# Database connection
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# GraphQL endpoint (for authenticated commands)
VITE_GRAPHQL_HOST=http://localhost:5000/graphql

# JWT secret (for token generation)
JWT_SECRET=your-secret-key

# AWS (for SQS queue operations)
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012
```

## Exit Codes

- **0**: Command succeeded
- **1**: Command failed (check error message)

## Performance Notes

- Database operations can take several minutes for large datasets
- Use `--limit` flags when available to speed up operations
- Consider running data loading operations during off-peak hours

## Related Skills

- [AWS SSO Login](aws-sso-login.md) - Handling AWS authentication issues
- [Database Migration](db-migrate.md) - Running database migrations
- [Database Connection](db-connect.md) - Testing database connectivity
- [Sync Environment](sync-env.md) - Environment variable management
- [GraphQL Codegen](codegen.md) - Regenerating GraphQL types

## Additional Resources

- CLI source code: `apps/cli/src/`
- Command definitions: `apps/cli/src/commands/`
- Project configuration: `apps/cli/project.json`

---

**Tip**: Run `pnpm exec nx start cli -- --help` to see all available commands and options.
