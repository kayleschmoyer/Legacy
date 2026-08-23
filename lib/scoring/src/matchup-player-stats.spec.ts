import {
  type MatchupPlayerGameStatRow,
  partitionMatchupPlayerGameStats,
  toPlayerGameStats,
} from './matchup-player-stats';

function row(
  overrides: Partial<MatchupPlayerGameStatRow> = {},
): MatchupPlayerGameStatRow {
  return {
    playerId: 1,
    teamId: 10,
    season: 2024,
    gameNum: 7,
    battingStats: null,
    pitchingStats: null,
    fieldingStats: null,
    ...overrides,
  };
}

describe('toPlayerGameStats', () => {
  it('projects each stat group onto the scoring engine shape', () => {
    const mapped = toPlayerGameStats(
      row({
        battingStats: { h: 2, hr: 1, sf: '0' },
        pitchingStats: { outsRecorded: 18, so: 7, er: 2 },
        fieldingStats: { eDef: 1, dpDef: 2, po: 3 },
      }),
    );

    expect(mapped.playerId).toBe(1);
    expect(mapped.season).toBe(2024);
    expect(mapped.gameNum).toBe(7);
    expect(mapped.batting).toMatchObject({ h: 2, hr: 1, sf: '0' });
    expect(mapped.pitching).toMatchObject({ outsRecorded: 18, so: 7, er: 2 });
    expect(mapped.fielding).toMatchObject({ eDef: 1, dpDef: 2, po: 3 });
  });

  it('leaves absent stat groups undefined', () => {
    const mapped = toPlayerGameStats(row());

    expect(mapped.batting).toBeUndefined();
    expect(mapped.pitching).toBeUndefined();
    expect(mapped.fielding).toBeUndefined();
  });

  it('does not carry row-level columns into the stat groups', () => {
    // The source rows are Drizzle rows carrying extra numeric columns.
    // aggregatePlayerStats sums every numeric key it is handed, so anything
    // that is not a stat must not leak into a group.
    const drizzleRow = {
      ...row(),
      battingStats: { h: 1, season: 2024, gameIdentifier: 'X' },
    } as unknown as MatchupPlayerGameStatRow;

    const mapped = toPlayerGameStats(drizzleRow);

    expect(Object.keys(mapped.batting ?? {})).not.toContain('season');
    expect(Object.keys(mapped.batting ?? {})).not.toContain('gameIdentifier');
  });
});

describe('partitionMatchupPlayerGameStats', () => {
  it('buckets rows by team and groups repeats under one player key', () => {
    const { team1PlayerStats, team2PlayerStats } =
      partitionMatchupPlayerGameStats(
        [
          row({ playerId: 1, teamId: 10, gameNum: 1 }),
          row({ playerId: 1, teamId: 10, gameNum: 2 }),
          row({ playerId: 2, teamId: 20, gameNum: 3 }),
        ],
        10,
        20,
      );

    expect(team1PlayerStats.get(1)).toHaveLength(2);
    expect(team1PlayerStats.get(1)?.map((s) => s.gameNum)).toEqual([1, 2]);
    expect(team2PlayerStats.get(2)).toHaveLength(1);
    expect(team2PlayerStats.has(1)).toBe(false);
  });

  it('drops rows belonging to neither team', () => {
    const { team1PlayerStats, team2PlayerStats } =
      partitionMatchupPlayerGameStats(
        [row({ playerId: 3, teamId: 99 }), row({ playerId: 4, teamId: null })],
        10,
        20,
      );

    expect(team1PlayerStats.size).toBe(0);
    expect(team2PlayerStats.size).toBe(0);
  });

  it('returns empty maps for no rows', () => {
    const { team1PlayerStats, team2PlayerStats } =
      partitionMatchupPlayerGameStats([], 10, 20);

    expect(team1PlayerStats.size).toBe(0);
    expect(team2PlayerStats.size).toBe(0);
  });
});
