import type { PgDatabase } from 'drizzle-orm/pg-core';

import {
  up,
  down,
} from '../../../migrations/20260524_000000_create_football_game_stats_tables';

describe('Migration — create football game stats tables (LS-248)', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up creates all 5 tables with correct DDL', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    const tables = [
      'game_football_passing',
      'game_football_rushing',
      'game_football_receiving',
      'game_football_kicking',
      'game_football_defense',
    ];

    for (const table of tables) {
      expect(executedStatements.some((s) => s.includes(table))).toBe(true);
    }
  });

  it('up creates passing table with interceptions column (not reserved keyword "int")', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    const passingCreate = executedStatements.find(
      (s) => s.includes('game_football_passing') && s.includes('CREATE TABLE'),
    );
    expect(passingCreate).toBeDefined();
    expect(passingCreate).toContain('"interceptions"');
    expect(passingCreate).not.toContain('"int"');
  });

  it('up creates defense table with interceptions and sacks columns', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    const defenseCreate = executedStatements.find(
      (s) => s.includes('game_football_defense') && s.includes('CREATE TABLE'),
    );
    expect(defenseCreate).toBeDefined();
    expect(defenseCreate).toContain('"interceptions"');
    expect(defenseCreate).toContain('"pts_allowed"');
    expect(defenseCreate).toContain('"sacks"');
    // sacks is initially integer; 20260525_000000_fix_football_defense_sacks_double_precision
    // alters it to double precision in a follow-up migration
  });

  it('up creates defense table with pts_allowed for DST banded scoring input', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    const defenseCreate = executedStatements.find(
      (s) => s.includes('game_football_defense') && s.includes('CREATE TABLE'),
    );
    expect(defenseCreate).toContain('"pts_allowed"');
    expect(defenseCreate).toContain('"yds_allowed"');
    expect(defenseCreate).toContain('"pass_yds_allowed"');
    expect(defenseCreate).toContain('"rush_yds_allowed"');
  });

  it('up creates kicking table with range-split FG columns and xp columns', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    const kickingCreate = executedStatements.find(
      (s) => s.includes('game_football_kicking') && s.includes('CREATE TABLE'),
    );
    expect(kickingCreate).toBeDefined();
    expect(kickingCreate).toContain('"fg_0_19m"');
    expect(kickingCreate).toContain('"fg_0_19a"');
    expect(kickingCreate).toContain('"fg_50m"');
    expect(kickingCreate).toContain('"fg_50a"');
    expect(kickingCreate).toContain('"xpm"');
    expect(kickingCreate).toContain('"xpa"');
  });

  it('up creates all tables with idempotent CREATE TABLE IF NOT EXISTS', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    const createStatements = executedStatements.filter((s) =>
      s.includes('CREATE TABLE'),
    );
    for (const stmt of createStatements) {
      expect(stmt).toContain('IF NOT EXISTS');
    }
  });

  it('up wires CASCADE FK to players on all tables', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await up({ db: mockDb as unknown as PgDatabase<any> });

    const createStatements = executedStatements.filter((s) =>
      s.includes('CREATE TABLE'),
    );
    expect(createStatements).toHaveLength(5);
    for (const stmt of createStatements) {
      expect(stmt).toContain('REFERENCES "public"."players"');
      expect(stmt).toContain('ON DELETE CASCADE');
    }
  });

  it('down drops all 5 tables', async () => {
    const executedStatements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        executedStatements.push(String(stmt));
        return Promise.resolve();
      },
    };

    await down({ db: mockDb as unknown as PgDatabase<any> });

    expect(executedStatements).toHaveLength(5);
    const tables = [
      'game_football_passing',
      'game_football_rushing',
      'game_football_receiving',
      'game_football_kicking',
      'game_football_defense',
    ];
    for (const table of tables) {
      expect(executedStatements.some((s) => s.includes(table))).toBe(true);
    }
    for (const stmt of executedStatements) {
      expect(stmt).toContain('DROP TABLE IF EXISTS');
    }
  });
});
