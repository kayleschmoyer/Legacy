import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add GDPR compliance tables
 *
 * Purpose:
 * - Track user consent for data processing (GDPR Art. 6-7)
 * - Support data export requests (GDPR Art. 15 - Right of Access)
 * - Support data deletion requests (GDPR Art. 17 - Right to Erasure)
 * - Add privacy_policy_accepted_at to users table (GDPR Art. 7)
 *
 * Changes:
 * - Creates consent_type enum
 * - Creates consent_status enum
 * - Creates data_request_type enum
 * - Creates data_request_status enum
 * - Creates app_internal.user_consents table
 * - Creates app_internal.data_requests table
 * - Adds privacy_policy_accepted_at column to app_internal.users
 * - Adds updated_at triggers
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Create enums in app_internal schema
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE app_internal.consent_type AS ENUM (
        'data_processing',
        'marketing_emails',
        'analytics',
        'third_party_sharing'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE app_internal.consent_status AS ENUM (
        'granted',
        'revoked'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE app_internal.data_request_type AS ENUM (
        'export',
        'deletion'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE app_internal.data_request_status AS ENUM (
        'pending',
        'processing',
        'completed',
        'failed',
        'cancelled'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // 2. Create user_consents table in app_internal schema
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_internal.user_consents (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES app_internal.users(id) ON DELETE CASCADE,
      consent_type app_internal.consent_type NOT NULL,
      status app_internal.consent_status NOT NULL DEFAULT 'granted',
      ip_address VARCHAR(45),
      user_agent TEXT,
      granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      revoked_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      UNIQUE(user_id, consent_type)
    );
  `);

  // 3. Create data_requests table in app_internal schema
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_internal.data_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES app_internal.users(id) ON DELETE CASCADE,
      request_type app_internal.data_request_type NOT NULL,
      status app_internal.data_request_status NOT NULL DEFAULT 'pending',
      requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      processed_at TIMESTAMP WITH TIME ZONE,
      completed_at TIMESTAMP WITH TIME ZONE,
      export_url TEXT,
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  // 4. Add privacy_policy_accepted_at column to users
  await db.execute(`
    ALTER TABLE app_internal.users
    ADD COLUMN IF NOT EXISTS privacy_policy_accepted_at TIMESTAMP WITH TIME ZONE;
  `);

  // 5. Create indexes
  await db.execute(`
    CREATE INDEX IF NOT EXISTS user_consents_user_id_idx
      ON app_internal.user_consents(user_id);
    CREATE INDEX IF NOT EXISTS user_consents_type_idx
      ON app_internal.user_consents(consent_type);
    CREATE INDEX IF NOT EXISTS user_consents_status_idx
      ON app_internal.user_consents(status);

    CREATE INDEX IF NOT EXISTS data_requests_user_id_idx
      ON app_internal.data_requests(user_id);
    CREATE INDEX IF NOT EXISTS data_requests_status_idx
      ON app_internal.data_requests(status);
    CREATE INDEX IF NOT EXISTS data_requests_type_idx
      ON app_internal.data_requests(request_type);
    CREATE INDEX IF NOT EXISTS data_requests_pending_idx
      ON app_internal.data_requests(status, requested_at)
      WHERE status = 'pending';
  `);

  // 6. Create triggers to auto-update updated_at
  await db.execute(`
    DROP TRIGGER IF EXISTS user_consents_updated_at_trigger ON app_internal.user_consents;
    CREATE TRIGGER user_consents_updated_at_trigger
    BEFORE UPDATE ON app_internal.user_consents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  await db.execute(`
    DROP TRIGGER IF EXISTS data_requests_updated_at_trigger ON app_internal.data_requests;
    CREATE TRIGGER data_requests_updated_at_trigger
    BEFORE UPDATE ON app_internal.data_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Drop triggers
  await db.execute(`
    DROP TRIGGER IF EXISTS user_consents_updated_at_trigger ON app_internal.user_consents;
    DROP TRIGGER IF EXISTS data_requests_updated_at_trigger ON app_internal.data_requests;
  `);

  // Drop tables
  await db.execute(`
    DROP TABLE IF EXISTS app_internal.data_requests;
    DROP TABLE IF EXISTS app_internal.user_consents;
  `);

  // Remove column from users
  await db.execute(`
    ALTER TABLE app_internal.users
    DROP COLUMN IF EXISTS privacy_policy_accepted_at;
  `);

  // Drop enums
  await db.execute(`
    DROP TYPE IF EXISTS app_internal.data_request_status;
    DROP TYPE IF EXISTS app_internal.data_request_type;
    DROP TYPE IF EXISTS app_internal.consent_status;
    DROP TYPE IF EXISTS app_internal.consent_type;
  `);
};
