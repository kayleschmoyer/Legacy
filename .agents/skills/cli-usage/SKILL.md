---
name: cli-usage
description: 'Use the Legacy Sports CLI for database operations, data loading, user management, and admin tasks. Load when running CLI commands or performing operations that the CLI supports.'
---

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

| Category        | Key Commands                                                  |
| --------------- | ------------------------------------------------------------- |
| DB Connectivity | `cli:test-connection`, `cli:inspect-database`, `db-query.ps1` |
| Data Loading    | `cli:load-players`, `cli:load-career-stats`                   |
| User Management | `add-user`, `list-users`, `set-user-type`                     |
| Authentication  | `auth login/status/list/switch/logout`, `generate-jwt`        |
| Matchup & Draft | `cli:create-matchup`, `cli:start-draft`, `sqs:inspect`        |
| Debugging       | `investigate-matchup`, `find-matchup-from-player`             |
| DB Admin        | `run-migrations`, `reset-database` (**destructive**)          |
| GraphQL         | `graphql-test`, `compute-scoring`                             |

> Full command syntax and examples: [references/command-reference.md](references/command-reference.md)

## Common Workflows

1. **Initial Setup**: test-connection → inspect-database → run-migrations → load-players → load-career-stats
2. **User Onboarding**: add-user → set-user-type → list-users (verify)
3. **Debugging**: auth status → test-connection → inspect-database → query-db → investigate-matchup

## Related Skills

- [AWS SSO Login](../aws-sso-login/SKILL.md) - Handling AWS authentication issues
- [Database Migration](../db-migrate/SKILL.md) - Running database migrations
- [Database Connection](../db-connect/SKILL.md) - Testing database connectivity
- [Sync Environment](../sync-env/SKILL.md) - Environment variable management

## Additional Resources

- CLI source code: `apps/cli/src/`
- Command definitions: `apps/cli/src/commands/`
- Run `pnpm exec nx start cli -- --help` for all available commands
