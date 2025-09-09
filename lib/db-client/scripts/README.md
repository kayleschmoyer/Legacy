# Database Migration Scripts

This directory contains scripts for managing database migrations in the Legacy Sports application.

## Scripts

### migrate.ps1 (PowerShell)

Comprehensive migration script for Windows systems with PowerShell.

### migrate.sh (Bash)

Cross-platform migration script for Unix-like systems (Linux, macOS, WSL).

## Usage

### Quick Start

The easiest way to run migrations is using the npm scripts:

```bash
# Run migrations for both schemas with confirmation
npm run migrate

# Show what would be migrated without executing
npm run migrate:dry-run

# Run migrations without confirmation prompts
npm run migrate:force

# Migrate only the public schema
npm run migrate:public-only

# Migrate only the internal schema
npm run migrate:internal-only
```

### Direct Script Usage

#### PowerShell (Windows)

```powershell
# Basic migration with confirmation
.\scripts\migrate.ps1

# Dry run to see what would be migrated
.\scripts\migrate.ps1 -DryRun

# Force migration without confirmation
.\scripts\migrate.ps1 -Force

# Migrate only public schema
.\scripts\migrate.ps1 -PublicOnly

# Migrate only internal schema
.\scripts\migrate.ps1 -InternalOnly

# Show help
.\scripts\migrate.ps1 -Help
```

#### Bash (Linux/macOS/WSL)

```bash
# Basic migration with confirmation
./scripts/migrate.sh

# Dry run to see what would be migrated
./scripts/migrate.sh --dry-run

# Force migration without confirmation
./scripts/migrate.sh --force

# Migrate only public schema
./scripts/migrate.sh --public-only

# Migrate only internal schema
./scripts/migrate.sh --internal-only

# Show help
./scripts/migrate.sh --help
```

## Prerequisites

1. **Environment Variables**: Ensure the `.env` file is properly configured with database credentials:

   ```bash
   # Run this from the project root to sync environment variables
   .\scripts\sync-env.ps1
   ```

2. **Database Access**: The scripts require access to the database specified in the environment variables.

3. **Generated Migrations**: Ensure migrations have been generated:
   ```bash
   npm run generate:migration:public
   npm run generate:migration:internal
   ```

## Schema Structure

The migration system supports two schemas:

- **Public Schema**: Contains the main application tables (leagues, teams, players, statistics, etc.)
- **Internal Schema** (`app_internal`): Contains internal application data (users, authentication, etc.)

## Safety Features

- **Confirmation Prompts**: By default, scripts ask for confirmation before executing migrations
- **Dry Run Mode**: Preview what migrations would be executed without actually running them
- **Environment Validation**: Scripts verify database configuration before proceeding
- **Error Handling**: Proper error reporting and rollback on failure
- **Migration Counting**: Shows how many migrations will be applied to each schema

## Migration Files

Migration files are stored in:

- `src/drizzle/migrations/public/` - Public schema migrations
- `src/drizzle/migrations/internal/` - Internal schema migrations

Each migration file includes:

- SQL DDL statements for creating/modifying tables
- Foreign key constraints
- Indexes and unique constraints
- Enum type definitions

## Troubleshooting

### Common Issues

1. **Environment Variables Not Found**

   ```
   Solution: Run .\scripts\sync-env.ps1 from the project root
   ```

2. **Database Connection Failed**

   ```
   Solution: Verify VPN connection and database credentials
   ```

3. **Migration Already Applied**

   ```
   Solution: This is normal - Drizzle tracks applied migrations automatically
   ```

4. **Permission Denied (Bash)**
   ```bash
   # Make the script executable
   chmod +x scripts/migrate.sh
   ```

### Manual Migration Commands

If you need to run migrations manually:

```bash
# Public schema only
npm run migrate:public

# Internal schema only
npm run migrate:internal
```

### Database Studio

To verify migrations were applied correctly:

```bash
# Open Drizzle Studio for public schema
npm run studio:public

# Open Drizzle Studio for internal schema
npm run studio:internal
```

## Development Workflow

1. **Make Schema Changes**: Modify files in `src/drizzle/public/models/` or `src/drizzle/internal/models/`
2. **Generate Migrations**: `npm run generate:migration:public` and/or `npm run generate:migration:internal`
3. **Review Generated SQL**: Check the generated `.sql` files in the migrations directories
4. **Test Migration**: `npm run migrate:dry-run` to preview changes
5. **Apply Migration**: `npm run migrate` to execute the migration
6. **Verify Results**: Use `npm run studio:public` or `npm run studio:internal` to verify the changes

## Best Practices

- Always use dry-run mode first to preview changes
- Review generated SQL before applying migrations
- Backup important data before running migrations in production
- Test migrations on a development database first
- Keep migration files in version control
- Don't modify existing migration files after they've been applied
