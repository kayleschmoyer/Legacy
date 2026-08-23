import type { PgDatabase } from 'drizzle-orm/pg-core';

import {
  up,
  down,
} from '../../../migrations/20260823_120000_add_league_message_reports_table';

/**
 * Migration test for LS-6297: league_message_reports table.
 *
 * league_messages needs a moderation report table analogous to
 * matchup_message_reports, but the existing table's message_id FK is bound
 * to matchup_messages — this migration creates a parallel table FK'd to
 * league_messages instead.
 */
describe('Migration — add league_message_reports table (LS-6297)', () => {
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
    it('creates league_message_reports with the full column set', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('CREATE TABLE league_message_reports');
      expect(sql).toContain('message_id integer NOT NULL');
      expect(sql).toContain('reported_by integer NOT NULL');
      expect(sql).toContain('reason text NOT NULL');
      expect(sql).toContain(
        "status matchup_message_report_status DEFAULT 'pending' NOT NULL",
      );
      expect(sql).toContain('resolved_at timestamp');
      expect(sql).toContain('reviewed_by integer');
      expect(sql).toContain('moderator_notes text');
      expect(sql).toContain('resolution text');
    });

    it('FKs message_id to league_messages, not matchup_messages', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('league_message_reports_message_fk');
      expect(sql).toContain('REFERENCES league_messages(id)');
      expect(sql).not.toContain('REFERENCES matchup_messages');
    });

    it('FKs reported_by and reviewed_by to app_internal.users', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain('league_message_reports_reporter_fk');
      expect(sql).toContain('league_message_reports_reviewer_fk');
      expect(sql).toContain('ON DELETE SET NULL');
    });

    it('creates indexes on message_id, status, and reported_by', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain(
        'CREATE INDEX league_message_reports_message_idx ON league_message_reports(message_id);',
      );
      expect(sql).toContain(
        'CREATE INDEX league_message_reports_status_idx ON league_message_reports(status);',
      );
      expect(sql).toContain(
        'CREATE INDEX league_message_reports_reported_by_idx ON league_message_reports(reported_by);',
      );
    });

    it('reuses the existing matchup_message_report_status enum rather than creating a new one', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).not.toContain('CREATE TYPE');
    });
  });

  describe('down', () => {
    it('drops the indexes and table', async () => {
      const sql = (await capture(down)).join('\n');
      expect(sql).toContain(
        'DROP INDEX IF EXISTS league_message_reports_reported_by_idx;',
      );
      expect(sql).toContain(
        'DROP INDEX IF EXISTS league_message_reports_status_idx;',
      );
      expect(sql).toContain(
        'DROP INDEX IF EXISTS league_message_reports_message_idx;',
      );
      expect(sql).toContain('DROP TABLE IF EXISTS league_message_reports;');
    });
  });
});
