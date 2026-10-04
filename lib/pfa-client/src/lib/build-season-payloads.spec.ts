import {
  accumulateBoxScore,
  accumulatedPlayerSeasons,
  accumulateKickerGameLog,
  createAccumulator,
} from './build-season-payloads';
import type {
  PfaBoxScore,
  PfaKickerGameLogRow,
  PfaPlayerBoxScoreStats,
} from './types';

function player(
  overrides: Partial<PfaPlayerBoxScoreStats> &
    Pick<PfaPlayerBoxScoreStats, 'pfaId' | 'name'>,
): PfaPlayerBoxScoreStats {
  return {
    rushing: null,
    passing: null,
    receiving: null,
    interceptions: null,
    punting: null,
    puntReturns: null,
    kickoffReturns: null,
    ...overrides,
  };
}

function boxScore(overrides: Partial<PfaBoxScore>): PfaBoxScore {
  return {
    gameIdentifier: '1960nfl001',
    season: 1960,
    players: [],
    scoringPlays: [],
    quarterScores: null,
    ...overrides,
  };
}

describe('accumulateBoxScore', () => {
  it('stages passing/rushing/receiving with fumbles always null, never a fabricated value', () => {
    const acc = createAccumulator();
    accumulateBoxScore(
      acc,
      boxScore({
        players: [
          player({
            pfaId: 'hamm00400',
            name: 'Mal Hammack',
            rushing: {
              att: 13,
              yds: 65,
              avg: 5.0,
              lng: 13,
              lngTd: false,
              td: 0,
            },
          }),
        ],
      }),
    );

    const rows = acc.rushing.get('hamm00400')?.get(1960);
    expect(rows).toEqual([
      {
        season: 1960,
        gameNum: 1,
        gameIdentifier: '1960nfl001',
        att: 13,
        yds: 65,
        td: 0,
        lng: 13,
        fumbles: null,
      },
    ]);
  });

  it('never stages a defense/defense-idp row — those categories have no accumulator at all', () => {
    const acc = createAccumulator();
    expect(acc).not.toHaveProperty('defenseIdp');
    expect(acc).not.toHaveProperty('defense');
  });

  it('assigns per-category gameNum independently and only to games with real activity in that category', () => {
    const acc = createAccumulator();
    // Game 1: player only rushes.
    accumulateBoxScore(
      acc,
      boxScore({
        gameIdentifier: 'g1',
        players: [
          player({
            pfaId: 'p1',
            name: 'Player One',
            rushing: { att: 5, yds: 20, avg: 4, lng: 8, lngTd: false, td: 0 },
          }),
        ],
      }),
    );
    // Game 2: player rushes AND receives.
    accumulateBoxScore(
      acc,
      boxScore({
        gameIdentifier: 'g2',
        players: [
          player({
            pfaId: 'p1',
            name: 'Player One',
            rushing: { att: 3, yds: 10, avg: 3.3, lng: 6, lngTd: false, td: 0 },
            receiving: {
              no: 2,
              yds: 15,
              avg: 7.5,
              lng: 10,
              lngTd: false,
              td: 0,
            },
          }),
        ],
      }),
    );

    const rushing = acc.rushing.get('p1')?.get(1960);
    const receiving = acc.receiving.get('p1')?.get(1960);
    expect(rushing?.map((r) => r.gameNum)).toEqual([1, 2]);
    // Receiving is the player's FIRST receiving game even though it's the
    // season's 2nd game overall — numbering is per-category.
    expect(receiving?.map((r) => r.gameNum)).toEqual([1]);
    expect(receiving?.[0].gameIdentifier).toBe('g2');
  });
});

describe('accumulateKickerGameLog', () => {
  function kickerRow(
    overrides: Partial<PfaKickerGameLogRow>,
  ): PfaKickerGameLogRow {
    return {
      date: '9/9/1967',
      gameIdentifier: '1967afl003',
      season: 1967,
      team: 'KC',
      homeAway: 'A',
      opponent: 'HOU',
      score: '25-20',
      result: 'W',
      td: 0,
      xpMade: 2,
      xpAtt: 2,
      twoPtMade: 0,
      twoPtAtt: 0,
      fgMade: 1,
      fgAtt: 2,
      safeties: 0,
      points: 5,
      ...overrides,
    };
  }

  it('stages only rows passing the season filter', () => {
    const acc = createAccumulator();
    accumulateKickerGameLog(
      acc,
      'sten00200',
      [
        kickerRow({ season: 1967 }),
        kickerRow({ season: 1985, gameIdentifier: '1985nfl219' }),
      ],
      (season) => season === 1967,
    );

    expect(acc.kicking.get('sten00200')?.get(1967)).toHaveLength(1);
    expect(acc.kicking.get('sten00200')?.has(1985)).toBe(false);
  });

  it('maps FG/XP fields and leaves distance-band fields null (not carried by the SCORING table)', () => {
    const acc = createAccumulator();
    accumulateKickerGameLog(acc, 'sten00200', [kickerRow({})], () => true);
    const row = acc.kicking.get('sten00200')?.get(1967)?.[0];
    expect(row).toMatchObject({ fgm: 1, fga: 2, xpm: 2, xpa: 2 });
    expect(row?.fg019m).toBeNull();
    expect(row?.lng).toBeNull();
  });
});

describe('accumulatedPlayerSeasons', () => {
  it('lists every distinct (pfaId, season) with at least one row, across all categories', () => {
    const acc = createAccumulator();
    accumulateBoxScore(
      acc,
      boxScore({
        players: [
          player({
            pfaId: 'p1',
            name: 'Player One',
            passing: {
              att: 1,
              com: 1,
              pct: 100,
              int: 0,
              yds: 10,
              avg: 10,
              lng: 10,
              lngTd: false,
              td: 0,
              ts: null,
              yl: null,
              rtg: 100,
            },
          }),
        ],
      }),
    );
    accumulateKickerGameLog(
      acc,
      'p2',
      [
        {
          date: '9/9/1960',
          gameIdentifier: 'g',
          season: 1960,
          team: 'X',
          homeAway: 'A',
          opponent: 'Y',
          score: '1-0',
          result: 'W',
          td: null,
          xpMade: 1,
          xpAtt: 1,
          twoPtMade: null,
          twoPtAtt: null,
          fgMade: null,
          fgAtt: null,
          safeties: null,
          points: 1,
        },
      ],
      () => true,
    );

    const result = accumulatedPlayerSeasons(acc);
    expect(result).toEqual(
      expect.arrayContaining([
        { pfaId: 'p1', season: 1960 },
        { pfaId: 'p2', season: 1960 },
      ]),
    );
    expect(result).toHaveLength(2);
  });
});
