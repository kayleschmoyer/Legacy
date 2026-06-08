import type { PgDatabase } from 'drizzle-orm/pg-core';

import {
  up,
  down,
} from '../../../migrations/20260607_120000_add_user_identities_table';

/**
 * Migration test for LS-7822 (Phase 1 — Expand of epic LS-7821).
 *
 * Asserts the SQL emitted by the migration: the enum, the user_identities table
 * with its constraints/index, the canonical_email_source column, the
 * Discord/local backfills, and the public views (with provider_account_id
 * deliberately omitted from the public.user_identities view).
 */
describe('Migration — add user_identities table + identity_provider enum (LS-7822)', () => {
  const capture = async (
    fn: (args: { db: PgDatabase<any> }) => Promise<void>,
  ): Promise<string[]> => {
    const statements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        statements.push(String(stmt));
        return Promise.resolve();
      },
    };
    await fn({ db: mockDb as unknown as PgDatabase<any> });
    return statements;
  };

  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  describe('up', () => {
    it('creates the identity_provider enum with all four providers (AC1)', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain(
        'CREATE TYPE app_internal.identity_provider AS ENUM',
      );
      expect(sql).toContain("'local'");
      expect(sql).toContain("'discord'");
      expect(sql).toContain("'google'");
      expect(sql).toContain("'apple'");
    });

    it('creates user_identities with the full column set and cascade FK (AC2)', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain(
        'CREATE TABLE IF NOT EXISTS app_internal.user_identities',
      );
      expect(sql).toContain(
        'user_id INTEGER NOT NULL REFERENCES app_internal.users(id) ON DELETE CASCADE',
      );
      expect(sql).toContain('provider app_internal.identity_provider NOT NULL');
      expect(sql).toContain('provider_account_id VARCHAR(255)');
      expect(sql).toContain('provider_email VARCHAR(255)');
      expect(sql).toContain(
        'provider_email_verified BOOLEAN NOT NULL DEFAULT false',
      );
      expect(sql).toContain('provider_username VARCHAR(255)');
      expect(sql).toContain('provider_avatar VARCHAR(512)');
      expect(sql).toContain('linked_at TIMESTAMP WITH TIME ZONE');
      expect(sql).toContain('last_login_at TIMESTAMP WITH TIME ZONE');
    });

    it('declares both unique constraints and the user_id index (AC3)', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('UNIQUE (provider, provider_account_id)');
      expect(sql).toContain('UNIQUE (user_id, provider)');
      expect(sql).toContain(
        'CREATE INDEX IF NOT EXISTS user_identities_user_id_idx',
      );
    });

    it('adds the nullable canonical_email_source column to users (AC4)', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('ALTER TABLE app_internal.users');
      expect(sql).toContain(
        'ADD COLUMN IF NOT EXISTS canonical_email_source app_internal.identity_provider',
      );
      // Nullable: no NOT NULL / DEFAULT on the new column.
      expect(sql).not.toContain(
        'canonical_email_source app_internal.identity_provider NOT NULL',
      );
    });

    it('backfills discord identities from users with a discord_id (AC5)', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('INSERT INTO app_internal.user_identities');
      expect(sql).toContain("'discord'::app_internal.identity_provider");
      expect(sql).toContain('u.discord_id');
      expect(sql).toContain('u.discord_username');
      expect(sql).toContain('u.discord_avatar');
      expect(sql).toContain('WHERE u.discord_id IS NOT NULL');
      expect(sql).toContain('ON CONFLICT (user_id, provider) DO NOTHING');
    });

    it('backfills local identities (NULL account id) from users with a password (AC5)', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain("'local'::app_internal.identity_provider");
      expect(sql).toContain('WHERE u.password_hash IS NOT NULL');
    });

    it('creates public.user_identities view WITHOUT provider_account_id (AC6)', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain(
        'CREATE OR REPLACE VIEW "public"."user_identities"',
      );
      expect(sql).toContain('provider::text AS provider');
      // The raw provider account id must never leak through the public view.
      const viewStmt = (await capture(up)).find((s) =>
        s.includes('"public"."user_identities"'),
      );
      expect(viewStmt).toBeDefined();
      expect(viewStmt).not.toContain('provider_account_id');
    });

    it('recreates public.users view exposing canonical_email_source (AC6)', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('CREATE OR REPLACE VIEW "public"."users"');
      expect(sql).toContain(
        'canonical_email_source::text AS canonical_email_source',
      );
    });

    it('does NOT rename users.email or add a bare canonical_email (AC7 — out of scope)', async () => {
      const sql = (await capture(up)).join('\n');
      // No column rename of any kind — email stays the source of truth this phase.
      expect(sql.toLowerCase()).not.toContain('rename');
      // The only canonical_email* token introduced this phase is
      // canonical_email_source; the Phase 2 canonical_email column must not appear.
      const withoutSource = sql.split('canonical_email_source').join('');
      expect(withoutSource).not.toContain('canonical_email');
    });
  });

  describe('down', () => {
    it('drops the view, table, column and enum, and reverts public.users', async () => {
      const sql = (await capture(down)).join('\n');
      expect(sql).toContain('DROP VIEW IF EXISTS "public"."user_identities"');
      expect(sql).toContain(
        'DROP TABLE IF EXISTS app_internal.user_identities',
      );
      expect(sql).toContain('DROP COLUMN IF EXISTS canonical_email_source');
      expect(sql).toContain(
        'DROP TYPE IF EXISTS app_internal.identity_provider',
      );
      // public.users view restored without canonical_email_source.
      expect(sql).toContain('CREATE OR REPLACE VIEW "public"."users"');
    });
  });
});
