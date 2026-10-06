import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Add corpus_ingest_readonly database role (LS-10605)
 *
 * Read-only role for the `pfa` source of the Corpus Ingest workflow
 * (.github/workflows/corpus-ingest.yml). `ingest-pfa-football` crosswalks PFA
 * names against the football rows in `players`, so this role can read that
 * one table and nothing else:
 * - CONNECT on the database
 * - USAGE on schema public
 * - SELECT on public.players
 *
 * This migration deliberately sets NO password. Terraform owns the real one
 * (random_password.corpus_ingest_readonly_db_password in
 * terraform/main/secrets.tf), and a migration-time env var can silently fall
 * back to a placeholder and drift from the secret (see
 * .agents/skills/database/references/mcp-role-password-drift.md). Until the
 * password is set, the role cannot authenticate at all. Set it from the secret
 * once, after `terraform apply`:
 *
 *   pnpm --prefix lib/db-client run db:resync-role -- \
 *     --role corpus_ingest_readonly --secret-name <secret name from SSM>
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔒 Creating corpus_ingest_readonly database role...');

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'corpus_ingest_readonly') THEN
        CREATE ROLE corpus_ingest_readonly LOGIN;
        RAISE NOTICE 'Created corpus_ingest_readonly role';
      END IF;
    END
    $$;
  `);

  await db.execute(sql`
    GRANT CONNECT ON DATABASE postgres TO corpus_ingest_readonly;
    GRANT USAGE ON SCHEMA public TO corpus_ingest_readonly;
    GRANT SELECT ON public.players TO corpus_ingest_readonly;
  `);

  console.log(
    '✅ corpus_ingest_readonly created with SELECT on public.players (password not set; run db:resync-role)',
  );
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔓 Removing corpus_ingest_readonly database role...');

  await db.execute(sql`
    REVOKE SELECT ON public.players FROM corpus_ingest_readonly;
    REVOKE USAGE ON SCHEMA public FROM corpus_ingest_readonly;
    REVOKE CONNECT ON DATABASE postgres FROM corpus_ingest_readonly;
  `);

  await db.execute(sql`DROP ROLE IF EXISTS corpus_ingest_readonly;`);

  console.log('✅ corpus_ingest_readonly role removed');
};
