import type { PgDatabase } from 'drizzle-orm/pg-core';

import {
  up,
  down,
} from '../../../migrations/20260820_034000_backfill_players_nfl_team';

/**
 * The 32 current franchise abbreviations held in public.nfl_teams. The
 * migration's CASE arms must land on one of these or the JOIN drops the row and
 * the player silently stays unassigned — the exact failure mode LS-9477 fixes.
 */
const CURRENT_NFL_ABBREVIATIONS = new Set([
  // AFC
  'BAL',
  'BUF',
  'CIN',
  'CLE',
  'DEN',
  'HOU',
  'IND',
  'JAX',
  'KC',
  'LAC',
  'LV',
  'MIA',
  'NE',
  'NYJ',
  'PIT',
  'TEN',
  // NFC
  'ARI',
  'ATL',
  'CAR',
  'CHI',
  'DAL',
  'DET',
  'GB',
  'LAR',
  'MIN',
  'NO',
  'NYG',
  'PHI',
  'SEA',
  'SF',
  'TB',
  'WAS',
]);

/**
 * Every stat-feed code that does not already match a current abbreviation,
 * with the franchise it must resolve to. Two groups:
 *  - Pro-Football-Reference spellings of active clubs (NOR/SFO/GNB/KAN/NWE/
 *    TAM/LVR) — these cover essentially every active player, so a missing arm
 *    empties the pool rather than trimming it.
 *  - Moves and renames, mapped to the successor club.
 */
const EXPECTED_TEAM_MAPPING: Record<string, string> = {
  NOR: 'NO',
  SFO: 'SF',
  GNB: 'GB',
  KAN: 'KC',
  NWE: 'NE',
  TAM: 'TB',
  LVR: 'LV',
  OAK: 'LV',
  RAI: 'LV',
  SDG: 'LAC',
  STL: 'LAR',
  RAM: 'LAR',
  PHO: 'ARI',
  BOS: 'NE',
  NYT: 'NYJ',
  DTX: 'KC',
};

async function captureStatements(
  migration: (args: { db: PgDatabase<any> }) => Promise<void>,
): Promise<string[]> {
  const executedStatements: string[] = [];
  const mockDb = {
    execute: (stmt: unknown) => {
      executedStatements.push(String(stmt));
      return Promise.resolve();
    },
  };
  await migration({ db: mockDb as unknown as PgDatabase<any> });
  return executedStatements;
}

/** Pull the `WHEN 'XXX' THEN 'YYY'` pairs out of the migration's CASE block. */
function parseCaseMapping(sqlText: string): Record<string, string> {
  const mapping: Record<string, string> = {};
  const pattern = /WHEN\s+'([A-Z]+)'\s+THEN\s+'([A-Z]+)'/g;
  let match = pattern.exec(sqlText);
  while (match !== null) {
    mapping[match[1]] = match[2];
    match = pattern.exec(sqlText);
  }
  return mapping;
}

describe('Migration — backfill players.nfl_team (LS-9477)', () => {
  it('exports up and down functions', () => {
    expect(typeof up).toBe('function');
    expect(typeof down).toBe('function');
  });

  it('up issues a single UPDATE scoped to football players', async () => {
    const statements = await captureStatements(up);

    expect(statements).toHaveLength(1);
    const [sqlText] = statements;
    expect(sqlText).toContain('UPDATE public.players');
    expect(sqlText).toContain('SET nfl_team = m.abbreviation');
    expect(sqlText).toContain("p.sport = 'football'");
  });

  it('up translates every legacy code to its current franchise', async () => {
    const [sqlText] = await captureStatements(up);

    // Assert the mapping EXACTLY, not merely that known pairs are present —
    // an extra or altered arm writes the wrong franchise for real players.
    expect(parseCaseMapping(sqlText)).toEqual(EXPECTED_TEAM_MAPPING);
  });

  it('never maps a code onto an abbreviation nfl_teams does not hold', async () => {
    const [sqlText] = await captureStatements(up);
    const targets = Object.values(parseCaseMapping(sqlText));

    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(CURRENT_NFL_ABBREVIATIONS.has(target)).toBe(true);
    }
  });

  it('joins nfl_teams so an unmapped code can never be written', async () => {
    const [sqlText] = await captureStatements(up);

    // Without this join an unrecognised feed code (e.g. a future 'GNB'-style
    // spelling) would be written verbatim into nfl_team, where the AFC/NFC
    // EXISTS predicate silently never matches it.
    expect(sqlText).toContain(
      'JOIN public.nfl_teams t ON t.abbreviation = m.abbreviation',
    );
  });

  it('reads the team from the players latest season row', async () => {
    const [sqlText] = await captureStatements(up);

    expect(sqlText).toContain('DISTINCT ON (player_id)');
    expect(sqlText).toContain('ORDER BY player_id, season DESC');
  });

  it('sources every football season stat table that carries a team', async () => {
    const [sqlText] = await captureStatements(up);

    // Omitting one silently strands the players whose only rows live there —
    // defense_idp alone covers the IDP population.
    for (const table of [
      'football_season_passing',
      'football_season_rushing',
      'football_season_receiving',
      'football_season_kicking',
      'football_season_defense',
      'football_season_defense_idp',
    ]) {
      expect(sqlText).toContain(`public.${table}`);
    }
  });

  it('down clears nfl_team for football players only', async () => {
    const statements = await captureStatements(down);

    expect(statements).toHaveLength(1);
    const [sqlText] = statements;
    expect(sqlText).toContain('SET nfl_team = NULL');
    expect(sqlText).toContain("sport = 'football'");
    // Baseball rows must not be swept up in the rollback.
    expect(sqlText).not.toContain("sport = 'baseball'");
  });
});
