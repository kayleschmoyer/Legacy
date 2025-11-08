# Drizzle Rollback Migration System

This document describes the enhanced Drizzle migration system that adds rollback capabilities to the Legacy Sports project.

## 🎯 Overview

We've integrated `@drepkovsky/drizzle-migrations` to add proper up/down migration support with rollback capabilities to our existing Drizzle setup.

### Key Features

- ✅ **Up/Down migrations** - Each migration has both up() and down() functions
- ✅ **Rollback support** - Can rollback individual or all migrations
- ✅ **Batch tracking** - Groups migrations into batches for easier management
- ✅ **AWS integration** - Works with existing AWS Secrets Manager setup
- ✅ **TypeScript support** - Full type safety for migration functions

## 📦 Installation

The system is already configured. If setting up from scratch:

```bash
cd lib/db-client
pnpm add @drepkovsky/drizzle-migrations postgres
```

## 🚀 Usage

### Generate Migration

Generate a new migration with up/down functions:

```bash
pnpm run db:generate --name migration_name
```

This creates a migration file like:

```typescript
import { sql } from 'drizzle-orm';
import type { MigrationArgs } from '@drepkovsky/drizzle-migrations';

export async function up({ db }: MigrationArgs<'postgresql'>): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "example" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" varchar(255)
    );
  `);
}

export async function down({ db }: MigrationArgs<'postgresql'>): Promise<void> {
  await db.execute(sql`
    DROP TABLE "example";
  `);
}
```

### Apply Migrations

Run pending migrations:

```bash
pnpm run db:up
```

### Rollback Migrations

Rollback the last migration:

```bash
pnpm run db:down
```

Rollback to specific batch:

```bash
pnpm run db:down --batch 5
```

### Check Status

View migration status:

```bash
pnpm run db:status
```

### Fresh Start

Rollback all migrations:

```bash
pnpm run db:fresh
```

### Refresh Database

Rollback all and reapply:

```bash
pnpm run db:refresh
```

## 🔧 Configuration

### Drizzle Config (`drizzle.config.ts`)

```typescript
import { defineConfig } from '@drepkovsky/drizzle-migrations';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export default defineConfig({
  schema: [
    './src/drizzle/public/schema.ts',
    './src/drizzle/internal/schema.ts',
  ],
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Environment-based credentials
  },
  schemaFilter: ['public', 'app_internal'],

  // Rollback configuration
  migrations: {
    schema: 'drizzle',
    table: '__drizzle_migrations',
  },

  getMigrator: async () => {
    // Handles AWS credentials via getDatabaseConfig()
  },
});
```

### Package Scripts

```json
{
  "scripts": {
    "db:generate": "drizzle-migrations generate",
    "db:up": "tsx src/scripts/rollback-migrations.ts up",
    "db:down": "tsx src/scripts/rollback-migrations.ts down",
    "db:status": "tsx src/scripts/rollback-migrations.ts status",
    "db:fresh": "tsx src/scripts/rollback-migrations.ts fresh",
    "db:refresh": "tsx src/scripts/rollback-migrations.ts refresh"
  }
}
```

## 🛡️ Safety Features

### AWS Credentials Integration

The system uses our existing AWS Secrets Manager integration via `getDatabaseConfig()`, ensuring secure credential handling in all environments.

### Migration Validation

Before applying migrations, the system:

- Validates database connection
- Checks migration file integrity
- Ensures proper ordering
- Tracks batch numbers for rollback safety

### Error Handling

- Comprehensive error messages
- Automatic rollback on failure
- Connection cleanup
- Logging integration with `@legacy-sports/logging`

## 🔄 Migration Workflow

### Development Process

1. **Generate Migration**:

   ```bash
   pnpm run db:generate --name add_user_profiles
   ```

2. **Edit Migration** - Add both up() and down() logic

3. **Test Locally**:

   ```bash
   pnpm run db:up      # Apply
   pnpm run db:status  # Verify
   pnpm run db:down    # Test rollback
   pnpm run db:up      # Reapply
   ```

4. **Commit & Deploy**

### Production Deployment

In production, migrations are applied via:

```bash
pnpm run db:up --production
```

### Emergency Rollback

If a migration causes issues:

```bash
# Rollback last migration
pnpm run db:down --production

# Or rollback to specific batch
pnpm run db:down --batch 5 --production
```

## 📊 Migration Tracking

### Dual Tracking System

The system maintains compatibility with existing Drizzle migrations while adding rollback capabilities:

- **Legacy**: `drizzle.__drizzle_migrations` (existing migrations)
- **Rollback**: `drizzle.__drizzle_migrations` (enhanced with batch tracking)

### Migration States

- **Pending** - Migration file exists but not applied
- **Applied** - Migration executed successfully
- **Failed** - Migration encountered errors
- **Rolled Back** - Migration was reversed

## 🚨 Troubleshooting

### Common Issues

**Connection Errors**:

- Ensure AWS credentials are configured
- Check VPN connection for RDS access
- Verify environment variables

**Migration Conflicts**:

- Use `pnpm run db:status` to check current state
- Resolve conflicts with `pnpm run db:fresh` + reapply
- Check migration file syntax

**Rollback Failures**:

- Verify down() function logic
- Check for data dependencies
- Use manual SQL if needed

### Recovery Procedures

**Stuck Migration**:

```bash
# Check status
pnpm run db:status

# Manual rollback via SQL
pnpm run db:query -- "DELETE FROM drizzle.__drizzle_migrations WHERE name = 'problematic_migration';"

# Fresh start
pnpm run db:fresh
pnpm run db:up
```

## 🔗 Integration Points

### CLI Commands

The rollback system integrates with existing CLI commands:

- `npm run db:migrate` - Legacy migration runner (still works)
- `npm run db:up` - New rollback-capable runner

### GraphQL Schema

After migrations, regenerate GraphQL types:

```bash
pnpm exec nx run api:codegen
```

### Testing

Migration tests should cover both directions:

```typescript
describe('Migration: add_user_profiles', () => {
  it('should apply successfully', async () => {
    await up({ db });
    // Test schema changes
  });

  it('should rollback successfully', async () => {
    await down({ db });
    // Test schema restoration
  });
});
```

## 📚 Best Practices

### Migration Design

- **Atomic Operations** - Each migration should be a single logical change
- **Reversible Logic** - Always provide meaningful down() functions
- **Data Preservation** - Backup data before destructive operations
- **Idempotent** - Migrations should be safe to run multiple times

### Rollback Strategy

- **Test Rollbacks** - Always test down() functions locally
- **Data Migration** - Handle data changes carefully in reversals
- **Dependencies** - Consider foreign key constraints in rollback order
- **Communication** - Coordinate rollbacks with team

### File Organization

```
migrations/
├── 20251108_082912_add_user_profiles.ts
├── 20251108_083015_create_teams_table.ts
└── 20251108_083145_add_matchup_scoring.ts
```

---

## 🎉 Benefits

✅ **Rollback Safety** - Can undo problematic migrations quickly  
✅ **Development Speed** - Faster iteration with easy reversals  
✅ **Production Confidence** - Emergency rollback capabilities  
✅ **Team Collaboration** - Clear migration states and tracking  
✅ **AWS Integration** - Seamless credential management

The system provides enterprise-grade migration management while maintaining compatibility with existing Drizzle workflows.
