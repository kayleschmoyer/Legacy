import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Implement Database Role Separation
 *
 * Creates separate database roles for different purposes:
 * - app_user: Read/write access to data (INSERT, UPDATE, DELETE, SELECT on tables)
 * - migration_user: Full schema modification access (CREATE, ALTER, DROP)
 *
 * This prevents accidental schema changes outside of migrations.
 *
 * IMPORTANT: After this migration, update your .env and AWS Secrets Manager with:
 * - DB_USER=app_user (for application runtime)
 * - DB_MIGRATION_USER=migration_user (for running migrations)
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔐 Setting up database role separation...');

  // 1. Create app_user role (for runtime application access)
  await db.execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN PASSWORD '${process.env.DB_APP_PASSWORD || 'CHANGE_ME_IN_PRODUCTION'}';
        RAISE NOTICE 'Created app_user role';
      ELSE
        RAISE NOTICE 'app_user role already exists';
      END IF;
    END
    $$;
  `);

  // 2. Create migration_user role (for schema changes)
  await db.execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'migration_user') THEN
        CREATE ROLE migration_user LOGIN PASSWORD '${process.env.DB_MIGRATION_PASSWORD || 'CHANGE_ME_IN_PRODUCTION'}';
        RAISE NOTICE 'Created migration_user role';
      ELSE
        RAISE NOTICE 'migration_user role already exists';
      END IF;
    END
    $$;
  `);

  // 3. Grant app_user permissions: Data access only (no schema changes)
  await db.execute(`
    -- Grant USAGE on public schema (required to access objects)
    GRANT USAGE ON SCHEMA public TO app_user;
    
    -- Grant SELECT, INSERT, UPDATE, DELETE on all existing tables
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
    
    -- Grant USAGE on all sequences (for SERIAL columns)
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
    
    -- Set default privileges for future tables
    ALTER DEFAULT PRIVILEGES IN SCHEMA public 
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
    
    ALTER DEFAULT PRIVILEGES IN SCHEMA public 
      GRANT USAGE, SELECT ON SEQUENCES TO app_user;
  `);

  // 4. Grant migration_user full schema access
  await db.execute(`
    -- Grant ALL on schema
    GRANT ALL ON SCHEMA public TO migration_user;
    
    -- Grant ALL on all existing tables
    GRANT ALL ON ALL TABLES IN SCHEMA public TO migration_user;
    
    -- Grant ALL on all sequences
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO migration_user;
    
    -- Set default privileges for future objects
    ALTER DEFAULT PRIVILEGES IN SCHEMA public 
      GRANT ALL ON TABLES TO migration_user;
    
    ALTER DEFAULT PRIVILEGES IN SCHEMA public 
      GRANT ALL ON SEQUENCES TO migration_user;
  `);

  // 5. Revoke CREATE on public schema from PUBLIC (prevents arbitrary schema changes)
  await db.execute(`
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  `);

  console.log('✅ Database role separation configured');
  console.log('');
  console.log('⚠️  ACTION REQUIRED:');
  console.log('   1. Update .env with:');
  console.log('      DB_USER=app_user');
  console.log('      DB_PASSWORD=<app_user_password>');
  console.log('      DB_MIGRATION_USER=migration_user');
  console.log('      DB_MIGRATION_PASSWORD=<migration_user_password>');
  console.log('');
  console.log('   2. Update AWS Secrets Manager with app_user credentials');
  console.log('   3. Update migration scripts to use DB_MIGRATION_USER');
  console.log('');
  console.log('   This ensures:');
  console.log('   - Application cannot ALTER/DROP tables or constraints');
  console.log('   - Only migration scripts can modify schema');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔓 Removing database role separation...');

  // Revoke privileges
  await db.execute(`
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_user;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM app_user;
    REVOKE USAGE ON SCHEMA public FROM app_user;
  `);

  await db.execute(`
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM migration_user;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM migration_user;
    REVOKE ALL ON SCHEMA public FROM migration_user;
  `);

  // Re-grant CREATE to PUBLIC
  await db.execute(`
    GRANT CREATE ON SCHEMA public TO PUBLIC;
  `);

  // Drop roles
  await db.execute(`
    DROP ROLE IF EXISTS app_user;
    DROP ROLE IF EXISTS migration_user;
  `);

  console.log('✅ Database role separation removed');
};
