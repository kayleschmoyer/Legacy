import {
  aggregateNflverseSeasonStats,
  buildCombinedReceivingRow,
  buildPfrToGsisCrosswalk,
  computeMultiTeamRepairs,
  computePasserRatingFromTotals,
  multiTeamLabel,
  parseNflverseCsv,
} from './backfill-nflverse-multiteam-seasons';

describe('parseNflverseCsv', () => {
  it('parses headers and rows, honoring quoted fields with embedded commas', () => {
    const csv = 'a,b,c\n1,"hello, world",3\n4,5,6\n';
    expect(parseNflverseCsv(csv)).toEqual([
      { a: '1', b: 'hello, world', c: '3' },
      { a: '4', b: '5', c: '6' },
    ]);
  });

  it('returns an empty array for an empty file', () => {
    expect(parseNflverseCsv('')).toEqual([]);
  });
});

describe('buildPfrToGsisCrosswalk', () => {
  it('maps pfr_id -> gsis_id, skipping rows missing either id', () => {
    const map = buildPfrToGsisCrosswalk([
      { pfr_id: 'SanuMo00', gsis_id: '00-0029600' },
      { pfr_id: '', gsis_id: '00-0000001' },
      { pfr_id: 'NoGsis00', gsis_id: '' },
    ]);
    expect(map).toEqual(new Map([['SanuMo00', '00-0029600']]));
  });
});

describe('aggregateNflverseSeasonStats', () => {
  const RECEIVING_CONFIG = {
    sumFields: ['receptions', 'targets', 'receiving_yards', 'receiving_tds'],
    activityFields: ['targets'],
  };

  it('sums weekly rows into a season aggregate and tracks distinct teams', () => {
    const rows = [
      {
        player_id: '00-0029600',
        season: '2019',
        season_type: 'REG',
        recent_team: 'ATL',
        targets: '3',
        receptions: '2',
        receiving_yards: '20',
        receiving_tds: '0',
      },
      {
        player_id: '00-0029600',
        season: '2019',
        season_type: 'REG',
        recent_team: 'NE',
        targets: '5',
        receptions: '4',
        receiving_yards: '40',
        receiving_tds: '1',
      },
    ];
    const agg = aggregateNflverseSeasonStats(
      rows,
      RECEIVING_CONFIG,
      new Set(['00-0029600']),
    );
    const season = agg.get('00-0029600')?.get(2019);
    expect(season).toMatchObject({
      teams: ['ATL', 'NE'],
      games: 2,
      sums: {
        receptions: 6,
        targets: 8,
        receiving_yards: 60,
        receiving_tds: 1,
      },
    });
  });

  it('does not count a team the player was rostered for but had no activity with', () => {
    const rows = [
      {
        player_id: '00-0029600',
        season: '2019',
        season_type: 'REG',
        recent_team: 'ATL',
        targets: '3',
        receptions: '2',
        receiving_yards: '20',
        receiving_tds: '0',
      },
      // Traded mid-week; on NE's roster but never targeted in this game.
      {
        player_id: '00-0029600',
        season: '2019',
        season_type: 'REG',
        recent_team: 'NE',
        targets: '0',
        receptions: '0',
        receiving_yards: '0',
        receiving_tds: '0',
      },
    ];
    const agg = aggregateNflverseSeasonStats(
      rows,
      RECEIVING_CONFIG,
      new Set(['00-0029600']),
    );
    expect(agg.get('00-0029600')?.get(2019)?.teams).toEqual(['ATL']);
  });

  it('ignores players outside the crosswalked set, other season types, and pre-1999 seasons', () => {
    const rows = [
      {
        player_id: '00-9999999',
        season: '2019',
        season_type: 'REG',
        recent_team: 'ATL',
        targets: '5',
      },
      {
        player_id: '00-0029600',
        season: '2019',
        season_type: 'POST',
        recent_team: 'ATL',
        targets: '5',
      },
      {
        player_id: '00-0029600',
        season: '1998',
        season_type: 'REG',
        recent_team: 'ATL',
        targets: '5',
      },
    ];
    const agg = aggregateNflverseSeasonStats(
      rows,
      RECEIVING_CONFIG,
      new Set(['00-0029600']),
    );
    expect(agg.size).toBe(0);
  });
});

describe('computeMultiTeamRepairs', () => {
  it('flags a single existing DB row for a season nflverse shows as multi-team', () => {
    const nflAgg = new Map([
      [
        '00-0029600',
        new Map([
          [
            2019,
            {
              teams: ['ATL', 'NE'],
              games: 15,
              sums: { receiving_yards: 520 },
              maxes: {},
            },
          ],
        ]),
      ],
    ]);
    const repairs = computeMultiTeamRepairs(
      nflAgg,
      [{ playerId: 1, season: 2019, team: 'NWE' }],
      new Map([['00-0029600', { playerId: 1, pfrId: 'SanuMo00' }]]),
    );
    expect(repairs).toHaveLength(1);
    expect(repairs[0]).toMatchObject({
      playerId: 1,
      season: 2019,
      previousTeam: 'NWE',
      nflverseTeams: ['ATL', 'NE'],
    });
  });

  it('leaves single-team seasons alone', () => {
    const nflAgg = new Map([
      [
        '00-1',
        new Map([[2020, { teams: ['ATL'], games: 16, sums: {}, maxes: {} }]]),
      ],
    ]);
    const repairs = computeMultiTeamRepairs(
      nflAgg,
      [{ playerId: 1, season: 2020, team: 'ATL' }],
      new Map([['00-1', { playerId: 1, pfrId: 'X' }]]),
    );
    expect(repairs).toHaveLength(0);
  });

  it('skips seasons with no existing DB row (nothing to repair)', () => {
    const nflAgg = new Map([
      [
        '00-1',
        new Map([
          [2020, { teams: ['ATL', 'NYJ'], games: 16, sums: {}, maxes: {} }],
        ]),
      ],
    ]);
    const repairs = computeMultiTeamRepairs(
      nflAgg,
      [],
      new Map([['00-1', { playerId: 1, pfrId: 'X' }]]),
    );
    expect(repairs).toHaveLength(0);
  });

  it('skips a row already labeled as an aggregate (already repaired)', () => {
    const nflAgg = new Map([
      [
        '00-1',
        new Map([
          [2020, { teams: ['ATL', 'NYJ'], games: 16, sums: {}, maxes: {} }],
        ]),
      ],
    ]);
    const repairs = computeMultiTeamRepairs(
      nflAgg,
      [{ playerId: 1, season: 2020, team: '2TM' }],
      new Map([['00-1', { playerId: 1, pfrId: 'X' }]]),
    );
    expect(repairs).toHaveLength(0);
  });
});

describe('multiTeamLabel', () => {
  it('matches PFR convention', () => {
    expect(multiTeamLabel(2)).toBe('2TM');
    expect(multiTeamLabel(3)).toBe('3TM');
  });
});

describe('computePasserRatingFromTotals', () => {
  it('returns null with no attempts', () => {
    expect(computePasserRatingFromTotals(0, 0, 0, 0, 0)).toBeNull();
  });

  it('matches the passer rating formula used elsewhere in this repo', () => {
    // Same inputs/output as CareerStats.ts's computePasserRating — this
    // function duplicates that formula for nflverse's already-summed totals.
    const rating = computePasserRatingFromTotals(500, 300, 3500, 25, 10);
    expect(rating).toBeCloseTo(58.3, 1);
  });
});

describe('buildCombinedReceivingRow', () => {
  it('produces the Mohamed Sanu 2019 combined line (LS-9919 spot check)', () => {
    const row = buildCombinedReceivingRow({
      playerId: 1,
      pfrId: 'SanuMo00',
      season: 2019,
      previousTeam: 'NWE',
      nflverseTeams: ['ATL', 'NE'],
      agg: {
        teams: ['ATL', 'NE'],
        games: 15,
        sums: {
          receptions: 59,
          targets: 90,
          receiving_yards: 520,
          receiving_tds: 1,
        },
        maxes: {},
      },
    });
    expect(row).toMatchObject({
      playerId: 1,
      season: 2019,
      team: '2TM',
      g: 15,
      rec: 59,
      tgt: 90,
      yds: 520,
      td: 1,
      ydsPerRec: 8.8,
    });
  });
});
