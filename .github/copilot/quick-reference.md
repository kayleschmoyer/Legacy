# Quick Reference Guide

## 🚨 Critical Rules

1. **NEVER commit to main** - Always create feature branch first
2. **Choose correct parent** - Use `-p main` for new work, `-p current` for dependent tickets
3. **Always use `pnpm exec nx`** - Never use direct npm/pnpm commands
4. **Validation order** - typecheck → lint → test → build
5. **PowerShell syntax** - Use `;` for chaining, `$env:` for variables

## Essential Commands

### Validation (Run in Order)

```powershell
pnpm exec nx affected -t typecheck   # 1. Type checking
pnpm exec nx affected -t lint --fix  # 2. Linting with auto-fix
pnpm exec nx affected -t test        # 3. Testing
pnpm exec nx affected -t build       # 4. Building

# Shortcuts
make quick-check  # typecheck + lint only
make pre-commit   # All 4 validation steps
```

### Branch & Workflow

```powershell
# Create branch (NEW independent ticket from main)
git checkout main; git pull
twig switch LS-1234 -p main

# Create branch (dependent/follow-up from current)
twig switch LS-1234 -p current

# View branch tree
twig tree

# Rebase tree
make rebase-tree
```

### Jira Integration

```powershell
# View ticket
acli jira workitem view LS-1234

# Update status
acli jira workitem transition --key LS-1234 --status "In Progress"
acli jira workitem transition --key LS-1234 --status "In Review"
acli jira workitem transition --key LS-1234 --status "Done"

# If acli not found
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

### Git Operations

```powershell
# Commit
git add .
git commit -m "feat(scope): description"
git push origin HEAD

# Create PR
twig github pr create-pr
```

### Database Queries

```powershell
# Run SQL query
.\scripts\db-query.ps1 -Query "SELECT * FROM leagues WHERE id = 8"

# With JSON output
.\scripts\db-query.ps1 -Query "SELECT * FROM teams" -Format json

# Interactive psql (for multiple queries)
pnpm run db:psql
```

### Database Migrations

**⚠️ CRITICAL: All new tables MUST include timestamps + triggers**

```powershell
# Run migrations
pnpm run db:migrate

# Create new migration (see .github/copilot/skills/db-migration-write.md)
# 1. Add timestamps to table definition:
#    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
#    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
# 2. Create trigger for auto-updates:
#    CREATE TRIGGER table_updated_at_trigger
#    BEFORE UPDATE ON table FOR EACH ROW
#    EXECUTE FUNCTION update_updated_at_column();
# 3. Add to Drizzle schema with timestamp columns

# See: docs/database/automatic-timestamps.md for full details
```

### Game Selection & Data Scraping

```powershell
# Trigger game selection (calls remote Lambda)
pnpm run cli trigger-game-selection --matchup-id 71
pnpm run cli trigger-game-selection  # All pending matchups

# Test game selection locally (requires dev server running)
# Terminal 1:
pnpm exec nx run game-selection:dev  # Starts on port 5003

# Terminal 2:
$env:GAME_SELECTION_ENDPOINT = "http://localhost:5003"
pnpm run cli trigger-game-selection --matchup-id 71

# Load game stats from Baseball-Reference
pnpm run cli load-game-stats --player-id 8698 --season 1907

# CRITICAL: Baseball-Reference HTML uses data-stat="date" (not "date_game")
# Game identifiers extracted from boxscore hrefs: /boxes/BSN/BSN190704200.shtml
# If game_identifier is empty, check lib/bref-client parser for correct attribute
```

## Common Issues & Fixes

| Problem                    | Solution                                           |
| -------------------------- | -------------------------------------------------- |
| `acli not found`           | Refresh PATH (see Jira section above)              |
| Module not found           | `pnpm run build:libs`                              |
| Type errors                | `pnpm exec nx affected -t typecheck` then fix      |
| DB connection fails        | `pnpm run sync-env`                                |
| Port in use                | `pnpm dlx kill-port 3000`                          |
| Nx cache issues            | `pnpm exec nx reset`                               |
| **AWS CLI encoding error** | **`$env:PYTHONIOENCODING = "utf-8"`** ⚠️           |
| **Terraform state locked** | **`node scripts/terraform-unlock.js`** ⚠️          |
| **Wrong deploy parameter** | **Use `-FunctionName` not `-LambdaName`** ⚠️       |
| Deploy fails               | 1. Clear locks 2. Terraform apply 3. Deploy Lambda |

### AWS CLI Setup (For Viewing Logs)

```powershell
# Required for viewing CloudWatch logs without errors
$env:AWS_PAGER = ""                # Disable pagination
$env:PYTHONIOENCODING = "utf-8"    # Fix Unicode/emoji encoding

# View recent logs
.\scripts\aws-logs.ps1 -Function stats -Since 5m

# CRITICAL: Use database timestamps when debugging (not just recent logs!)
# Example: Game stats show last_updated = 3 hours ago
# 1. Query database for timestamp
.\scripts\db-query.ps1 -Query "SELECT id, last_updated FROM app_internal.game_stats WHERE game_id = 123 ORDER BY last_updated DESC LIMIT 1"
# Result: 2026-02-08 14:35:42

# 2. Calculate time range (±5 minutes around 14:35:42 = 14:30 to 14:40)

# 3. View logs from that time period
aws logs tail /aws/lambda/legacy-sports-dev-stats --start-time 1707405000 --end-time 1707405600 --no-cli-pager

# Common timestamp columns to check:
# - last_updated, updated_at (when record changed)
# - created_at (when record created)
# - draft_started_at (league drafts)
# - occurred_at (events)

# Tip: Use https://www.epochconverter.com/ to convert timestamps to epoch

# NOTE: Piping to Select-Object may cause encoding errors
# If you need to limit output, use --filter-pattern or redirect to file:
aws logs tail /aws/lambda/legacy-sports-dev-stats --since 5m --no-cli-pager > logs.txt
```

## Deployment Workflow ⚠️ CRITICAL

**Always follow this order** when deploying:

```powershell
# 1. Clear any terraform locks FIRST
node scripts/terraform-unlock.js

# 2. Apply infrastructure changes (if any)
cd terraform
terraform plan      # Check what will change
terraform apply     # Apply changes
cd ..

# 3. Deploy Lambda code (use -FunctionName, NOT -LambdaName!)
.\scripts\deploy-lambda.ps1 -FunctionName graphql

# 4. Verify
pnpm exec nx run web:build
```

## Complete Workflow (5 Steps)

```powershell
# 1. Create branch & update Jira
git checkout main; git pull
twig switch LS-1234
acli jira workitem transition --key LS-1234 --status "In Progress"

# 2. Make changes (edit files)

# 3. Validate
pnpm exec nx affected -t typecheck
pnpm exec nx affected -t lint --fix
pnpm exec nx affected -t test
pnpm exec nx affected -t build

# 4. Commit & push
git add .
git commit -m "feat(scope): description"
git push origin HEAD

# 5. Create PR & update Jira
twig github pr create-pr
acli jira workitem transition --key LS-1234 --status "In Review"
```

## Nx Patterns

```powershell
# Run on affected projects only (recommended)
pnpm exec nx affected -t <target>

# Run on specific project
pnpm exec nx run <project>:<target>

# Run on project groups
pnpm exec nx run-many -t <target> --projects=tag:scope:lib

# View dependency graph
pnpm exec nx graph
```

## Build System Architecture

**Libraries (lib/\*)**: TypeScript source only - NO build targets

- ✅ Have: `typecheck`, `lint`, `test` targets
- ❌ Don't have: `build` target
- Compiled by consuming apps/lambdas during their build process

**Applications & Lambdas (apps/\*, lambdas/\*)**: Include build targets

- ✅ Have: `typecheck`, `lint`, `test`, `build` targets
- Compile their own code + all imported library code

**Build Command**: `pnpm exec nx affected -t build` only builds apps/lambdas, not libraries

## Environment

- **Platform**: Windows PowerShell
- **Monorepo**: Nx workspace
- **Package Manager**: pnpm (v9.12.1)
- **Jira Project**: LS
- **Branch Tool**: Twig

## When You Need More Detail

Load these files on-demand based on your task:

| Task                    | Load File                                             |
| ----------------------- | ----------------------------------------------------- |
| Common patterns         | `docs/agents/quick-patterns.yml`                      |
| Type errors             | `docs/agents/type-fixes.yml`                          |
| Linting issues          | `docs/agents/lint-fixes.yml`                          |
| Full workflow           | `.github/copilot/skills/workflow-ticket-to-pr.md`     |
| Branch management       | `docs/guides/branch-tree-management.md`               |
| **Database migrations** | **`.github/copilot/skills/db-migration-write.md`** ⭐ |
| **Database timestamps** | **`docs/database/automatic-timestamps.md`** ⭐        |
| Database work           | `docs/architecture/database-schema.md` (excerpt)      |
| Architecture questions  | `docs/architecture/` (specific file)                  |
| Troubleshooting         | `docs/guides/troubleshooting.md`                      |
