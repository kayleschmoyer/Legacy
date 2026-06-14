import type { PgDatabase } from 'drizzle-orm/pg-core';

import {
  up,
  down,
} from '../../../migrations/20260614_120000_create_football_team_season_metadata';

describe('Migration — create football_team_season_metadata (LS-8043)', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up creates sos_tier enum idempotently', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    const enumStmt = executedStatements.find((s) => s.includes('sos_tier'));
    expect(enumStmt).toBeDefined();
    expect(enumStmt).toContain("'easy'");
    expect(enumStmt).toContain("'medium'");
    expect(enumStmt).toContain("'hard'");
    expect(enumStmt).toContain('duplicate_object');
  });

  it('up creates the table with correct DDL', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    const createTable = executedStatements.find(
      (s) =>
        s.includes('football_team_season_metadata') &&
        s.includes('CREATE TABLE'),
    );
    expect(createTable).toBeDefined();
    expect(createTable).toContain('IF NOT EXISTS');
    expect(createTable).toContain('"season"');
    expect(createTable).toContain('"team_abbreviation"');
    expect(createTable).toContain('"bye_week"');
    expect(createTable).toContain('"sos_tier"');
    expect(createTable).toContain('PRIMARY KEY');
    expect(createTable).toContain('REFERENCES "public"."nfl_teams"');
  });

  it('up creates a season index', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    const indexStmt = executedStatements.find(
      (s) =>
        s.includes('football_team_season_metadata_season_idx') &&
        s.includes('CREATE INDEX'),
    );
    expect(indexStmt).toBeDefined();
    expect(indexStmt).toContain('IF NOT EXISTS');
  });

  it('up seeds exactly 32 rows for the 2025 season', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    const insertStmt = executedStatements.find((s) => s.includes('INSERT'));
    expect(insertStmt).toBeDefined();
    expect(insertStmt).toContain('2025');
    expect(insertStmt).toContain('ON CONFLICT');

    const seasonRows = (insertStmt ?? '').match(/\(2025,/g);
    expect(seasonRows).toHaveLength(32);
  });

  it('up seed contains all three SoS tiers', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    const insertStmt = executedStatements.find((s) => s.includes('INSERT'));
    expect(insertStmt).toContain("'easy'");
    expect(insertStmt).toContain("'medium'");
    expect(insertStmt).toContain("'hard'");
  });

  it('down drops the table and enum', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await down({ db: mockDb as unknown as PgDatabase<any> });

    expect(
      executedStatements.some(
        (s) =>
          s.includes('football_team_season_metadata') &&
          s.includes('DROP TABLE IF EXISTS'),
      ),
    ).toBe(true);
    expect(
      executedStatements.some(
        (s) => s.includes('sos_tier') && s.includes('DROP TYPE IF EXISTS'),
      ),
    ).toBe(true);
  });
});
