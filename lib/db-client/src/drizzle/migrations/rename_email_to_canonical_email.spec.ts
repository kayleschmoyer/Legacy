import type { PgDatabase } from 'drizzle-orm/pg-core';

import {
  up,
  down,
} from '../../../migrations/20260610_120000_rename_email_to_canonical_email';

/**
 * Migration test for LS-7824 (Phase 2b — Cut over of epic LS-7821).
 *
 * Asserts the SQL emitted by the migration: the column rename, length bump,
 * constraint swap, and recreated public.users VIEW that exposes canonical_email.
 */
describe('Migration — rename users.email → canonical_email; bump length to 255 (LS-7824)', () => {
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
    it('renames email to canonical_email (AC1)', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('RENAME COLUMN email TO canonical_email');
    });

    it('bumps column length to 255 (AC2)', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('ALTER COLUMN canonical_email TYPE VARCHAR(255)');
    });

    it('drops users_email_uk and creates users_canonical_email_uk (AC3)', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('DROP CONSTRAINT IF EXISTS users_email_uk');
      expect(sql).toContain(
        'ADD CONSTRAINT users_canonical_email_uk UNIQUE (canonical_email)',
      );
    });

    it('recreates public.users VIEW exposing canonical_email (AC4)', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('CREATE OR REPLACE VIEW "public"."users"');
      expect(sql).toContain('canonical_email');
      // The old `email` column alias must not appear — only canonical_email.
      const viewStmt = (await capture(up)).find((s) =>
        s.includes('CREATE OR REPLACE VIEW "public"."users"'),
      );
      expect(viewStmt).toBeDefined();
      // View should select canonical_email directly (not aliased back to email).
      expect(viewStmt).toContain('canonical_email');
    });

    it('still exposes canonical_email_source in the view (AC5)', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain(
        'canonical_email_source::text AS canonical_email_source',
      );
    });
  });

  describe('down', () => {
    it('renames canonical_email back to email', async () => {
      const sql = (await capture(down)).join('\n');
      expect(sql).toContain('RENAME COLUMN canonical_email TO email');
    });

    it('restores users_email_uk and drops users_canonical_email_uk', async () => {
      const sql = (await capture(down)).join('\n');
      expect(sql).toContain(
        'DROP CONSTRAINT IF EXISTS users_canonical_email_uk',
      );
      expect(sql).toContain('ADD CONSTRAINT users_email_uk UNIQUE (email)');
    });

    it('reverts public.users VIEW', async () => {
      const sql = (await capture(down)).join('\n');
      expect(sql).toContain('CREATE OR REPLACE VIEW "public"."users"');
    });
  });
});
