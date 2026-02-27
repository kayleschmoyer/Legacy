-- =============================================================================
-- Legacy Sports — Local PostgreSQL Initialization
-- =============================================================================
-- Runs once when the postgres container is first created.
-- Mirrors the two-schema layout used in production (public + app_internal).
-- Full schema is applied via Drizzle migrations: pnpm run db:migrate
-- =============================================================================

-- Ensure we're working in the correct database
\connect legacy_sports_dev

-- Create the app_internal schema (auth & system tables)
CREATE SCHEMA IF NOT EXISTS app_internal;

-- Grant all privileges on both schemas to the service user
GRANT ALL PRIVILEGES ON DATABASE legacy_sports_dev TO legacy_sports;
GRANT ALL PRIVILEGES ON SCHEMA public TO legacy_sports;
GRANT ALL PRIVILEGES ON SCHEMA app_internal TO legacy_sports;

-- Allow future tables to be accessible by the service user
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON TABLES TO legacy_sports;

ALTER DEFAULT PRIVILEGES IN SCHEMA app_internal
    GRANT ALL PRIVILEGES ON TABLES TO legacy_sports;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON SEQUENCES TO legacy_sports;

ALTER DEFAULT PRIVILEGES IN SCHEMA app_internal
    GRANT ALL PRIVILEGES ON SEQUENCES TO legacy_sports;
