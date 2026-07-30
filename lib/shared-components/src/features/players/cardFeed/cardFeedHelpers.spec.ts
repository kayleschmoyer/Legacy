import {
  BASEBALL_CARD_POSITIONS,
  cardPositionsForSport,
  FOOTBALL_CARD_POSITIONS,
  formatBaseballCardSubStats,
  formatDecimalNoLeadingZero,
  formatFootballCardSubStats,
  playersCardFeedTopPadding,
  positionFilterParam,
} from './cardFeedHelpers';

describe('cardPositionsForSport', () => {
  test('returns the baseball chip set for baseball', () => {
    expect(cardPositionsForSport('baseball')).toBe(BASEBALL_CARD_POSITIONS);
  });

  test('returns the football chip set for football', () => {
    expect(cardPositionsForSport('football')).toBe(FOOTBALL_CARD_POSITIONS);
  });

  test('baseball chip set matches the design handoff exactly', () => {
    expect(BASEBALL_CARD_POSITIONS).toEqual([
      'ALL',
      'C',
      '1B',
      '2B',
      '3B',
      'SS',
      'OF',
      'DH',
      'SP',
      'RP',
    ]);
  });

  test('football chip set extends the handoff illustration with K/DST', () => {
    expect(FOOTBALL_CARD_POSITIONS).toEqual([
      'ALL',
      'QB',
      'RB',
      'WR',
      'TE',
      'K',
      'DST',
    ]);
  });
});

describe('positionFilterParam', () => {
  test('ALL clears the filter', () => {
    expect(positionFilterParam('ALL')).toBeUndefined();
  });

  test('a concrete position passes through unchanged', () => {
    expect(positionFilterParam('SS')).toBe('SS');
  });
});

describe('playersCardFeedTopPadding (LS-8834)', () => {
  test('adds the safe-area inset to the header gutter', () => {
    expect(playersCardFeedTopPadding(44)).toBe(60);
  });

  test('falls back to just the gutter when there is no inset', () => {
    expect(playersCardFeedTopPadding(0)).toBe(16);
  });

  test('ignores a negative inset', () => {
    expect(playersCardFeedTopPadding(-20)).toBe(16);
  });

  test('ignores a non-finite inset', () => {
    expect(playersCardFeedTopPadding(Number.NaN)).toBe(16);
  });
});

describe('formatDecimalNoLeadingZero', () => {
  test('strips the leading zero, matching the grid formatter', () => {
    expect(formatDecimalNoLeadingZero(0.298)).toBe('.298');
  });

  test('handles zero', () => {
    expect(formatDecimalNoLeadingZero(0)).toBe('.000');
  });
});

describe('formatBaseballCardSubStats', () => {
  test('formats HR/RBI/AVG with thousands separators, matching the spec example', () => {
    expect(
      formatBaseballCardSubStats({
        homeRuns: 762,
        rbi: 1996,
        battingAverage: 0.298,
      }),
    ).toBe('HR 762 · RBI 1,996 · AVG .298');
  });
});

describe('formatFootballCardSubStats', () => {
  test('QB: team + passing YDS/TD, matching the spec example', () => {
    expect(
      formatFootballCardSubStats({
        position: 'QB',
        nflTeam: 'BUF',
        isDst: false,
        careerStats: { passing: { yds: 4587, td: 42 } },
      }),
    ).toBe('BUF · YDS 4,587 · TD 42');
  });

  test('RB: team + rushing YDS/TD', () => {
    expect(
      formatFootballCardSubStats({
        position: 'RB',
        nflTeam: 'PHI',
        isDst: false,
        careerStats: { rushing: { yds: 2283, td: 15 } },
      }),
    ).toBe('PHI · YDS 2,283 · TD 15');
  });

  test('WR/TE: team + receiving YDS/TD', () => {
    expect(
      formatFootballCardSubStats({
        position: 'WR',
        nflTeam: 'CIN',
        isDst: false,
        careerStats: { receiving: { yds: 1708, td: 17 } },
      }),
    ).toBe('CIN · YDS 1,708 · TD 17');
  });

  test('K: team + FG made/attempted', () => {
    expect(
      formatFootballCardSubStats({
        position: 'K',
        nflTeam: 'KC',
        isDst: false,
        careerStats: { kicking: { fgm: 30, fga: 33 } },
      }),
    ).toBe('KC · FG 30/33');
  });

  test('DST: team + sacks/interceptions from the defense category', () => {
    expect(
      formatFootballCardSubStats({
        position: 'DST',
        nflTeam: 'SF',
        isDst: true,
        careerStats: { defense: { sacks: 48, int: 15 } },
      }),
    ).toBe('SF · SACKS 48 · INT 15');
  });

  test('IDP (DL/LB/DB): team + combined tackles/sacks', () => {
    expect(
      formatFootballCardSubStats({
        position: 'LB',
        nflTeam: 'BAL',
        isDst: false,
        careerStats: { idp: { soloTkl: 80, astTkl: 20, sacks: 4 } },
      }),
    ).toBe('BAL · TKL 100 · SACKS 4');
  });

  test('falls back to just the team when no matching category is present', () => {
    expect(
      formatFootballCardSubStats({
        position: 'QB',
        nflTeam: 'NYJ',
        isDst: false,
        careerStats: null,
      }),
    ).toBe('NYJ');
  });

  test('handles a missing team gracefully', () => {
    expect(
      formatFootballCardSubStats({
        position: 'QB',
        nflTeam: null,
        isDst: false,
        careerStats: { passing: { yds: 100, td: 1 } },
      }),
    ).toBe('YDS 100 · TD 1');
  });
});
