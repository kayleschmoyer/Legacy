# Common Migration Patterns

## Always Add Timestamps to New Tables

All new tables MUST include `created_at` and `updated_at` columns with automatic triggers:

```typescript
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE my_new_table (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(`
    CREATE TRIGGER my_new_table_updated_at_trigger
    BEFORE UPDATE ON public.my_new_table
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TRIGGER IF EXISTS my_new_table_updated_at_trigger ON public.my_new_table;
    DROP TABLE IF EXISTS my_new_table;
  `);
};
```

The `update_updated_at_column()` function exists database-wide. See `docs/database/automatic-timestamps.md` for details.

## Add Enum Value

```typescript
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TYPE enum_name ADD VALUE IF NOT EXISTS 'new_value' BEFORE 'existing_value';
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  throw new Error(
    'Cannot rollback enum value addition without recreating enum',
  );
};
```

## Add Column

```typescript
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE table_name
    ADD COLUMN column_name column_type NOT NULL DEFAULT 'default_value';
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE table_name
    DROP COLUMN column_name;
  `);
};
```

## Add Index

```typescript
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX idx_table_column ON table_name(column_name);
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS idx_table_column;
  `);
};
```

## Create SQL Function

```typescript
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Use $fn$ as the function body delimiter to avoid escaping issues
  await db.execute(`
    CREATE OR REPLACE FUNCTION public.my_function(p_arg INTEGER DEFAULT NULL)
    RETURNS TABLE (
        col1 INTEGER,
        col2 NUMERIC
    )
    LANGUAGE sql STABLE
    AS $fn$
      SELECT id, value FROM my_table WHERE arg = p_arg;
    $fn$;
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP FUNCTION IF EXISTS public.my_function(INTEGER);
  `);
};
```

> **Note**: Use `db.execute(\`...\`)`with a plain template string, NOT`db.execute(sql\`...\`)`. The tagged `sql`template from Drizzle wraps the statement, which can cause issues with complex function bodies using`$fn$` delimiters.

## Alter Foreign Key Constraint (e.g. change ON DELETE behavior)

PostgreSQL does not support `ALTER CONSTRAINT` for FK actions — you must drop and re-create. Always use `DROP CONSTRAINT IF EXISTS` so the migration is safe to retry.

```typescript
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Drop the existing constraint, then re-add with the desired ON DELETE action.
  await db.execute(`
    ALTER TABLE child_table
      DROP CONSTRAINT IF EXISTS child_table_parent_id_fk
  `);

  await db.execute(`
    ALTER TABLE child_table
      ADD CONSTRAINT child_table_parent_id_fk
        FOREIGN KEY (parent_id) REFERENCES parent_table (id)
        ON DELETE SET NULL   -- or CASCADE / RESTRICT / NO ACTION
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE child_table
      DROP CONSTRAINT IF EXISTS child_table_parent_id_fk
  `);

  await db.execute(`
    ALTER TABLE child_table
      ADD CONSTRAINT child_table_parent_id_fk
        FOREIGN KEY (parent_id) REFERENCES parent_table (id)
        -- restore original ON DELETE action (omit = NO ACTION default)
  `);
};
```

**Self-referential FKs** (a table referencing itself, e.g. `leagues.previous_league_id → leagues.id`) follow the same pattern. Use `ON DELETE SET NULL` when deleting the referenced row should sever the link rather than cascade-delete the referencing row.

> **Remember**: also update the Drizzle schema model to add `.onDelete('set null')` (or `'cascade'`, etc.) to the matching `foreignKey()` definition so the ORM reflects the DB constraint accurately.

## Migration Best Practices

### Do's

- Use `IF NOT EXISTS` / `IF EXISTS` for idempotent operations
- Add detailed comments explaining purpose
- Run `pnpm run db:up` locally and confirm it succeeds before committing
- Verify schema changes with `pnpm run db:psql` after applying
- Provide rollback (`down`) when possible
- Use transactions implicitly (each migration runs in transaction)
- Include data migrations with schema changes

### Don'ts

- Don't commit a migration without first successfully running it locally
- Don't run migrations directly in production without testing
- Don't delete data without backup strategy
- Don't modify applied migrations (create new one instead)
- Don't make breaking changes without coordination
- Don't forget to update corresponding ORM models

## Common Issues

### "Cannot find module" when testing

Make sure you're in `lib/db-client` directory or use full path.

### "enum label already exists"

Migration is idempotent -- uses `IF NOT EXISTS`. This is expected if run multiple times.

### "Cannot rollback enum value"

PostgreSQL doesn't support removing enum values. Need to recreate entire enum type.

### Migration applied but schema model not updated

Update Drizzle models in `lib/db-client/src/drizzle/public/models/`.

## Running Migrations

> **MCP alternative**: Prefer `db_migration_status` and `db_migrate` MCP tools (see mcp-db skill) -- they return structured results and work from any directory.

```powershell
cd lib/db-client
pnpm run db:status    # Check status
pnpm run db:up        # Apply pending
pnpm run db:down      # Rollback last (dev only, may cause data loss)
pnpm run db:refresh   # Rollback all and reapply
pnpm run db:fresh     # Rollback all
```
