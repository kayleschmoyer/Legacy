import {
  LAST_VISITED_LEAGUE_KEY,
  lastVisitedLeaguePath,
  makeLastVisitedLeague,
  parseLastVisitedLeague,
  serializeLastVisitedLeague,
} from './lastVisitedLeague';

describe('lastVisitedLeaguePath', () => {
  it('builds a baseball league route', () => {
    expect(lastVisitedLeaguePath({ leagueId: 42, sport: 'baseball' })).toBe(
      '/baseball/league/42',
    );
  });

  it('builds a football league route', () => {
    expect(lastVisitedLeaguePath({ leagueId: 7, sport: 'football' })).toBe(
      '/football/league/7',
    );
  });
});

describe('makeLastVisitedLeague', () => {
  it('keeps a recognized sport', () => {
    expect(makeLastVisitedLeague(3, 'football')).toEqual({
      leagueId: 3,
      sport: 'football',
    });
  });

  it('defaults an unknown/empty sport to baseball', () => {
    expect(makeLastVisitedLeague(3, null)).toEqual({
      leagueId: 3,
      sport: 'baseball',
    });
    expect(makeLastVisitedLeague(3, undefined)).toEqual({
      leagueId: 3,
      sport: 'baseball',
    });
    expect(makeLastVisitedLeague(3, 'hockey')).toEqual({
      leagueId: 3,
      sport: 'baseball',
    });
  });
});

describe('serializeLastVisitedLeague / parseLastVisitedLeague round-trip', () => {
  it('round-trips a valid value', () => {
    const league = { leagueId: 99, sport: 'football' as const };
    expect(parseLastVisitedLeague(serializeLastVisitedLeague(league))).toEqual(
      league,
    );
  });

  it('normalizes the sport on serialize', () => {
    const serialized = serializeLastVisitedLeague({
      leagueId: 1,
      // intentionally loose to model a corrupted in-memory value
      sport: 'cricket' as unknown as 'baseball',
    });
    expect(parseLastVisitedLeague(serialized)).toEqual({
      leagueId: 1,
      sport: 'baseball',
    });
  });
});

describe('parseLastVisitedLeague rejects malformed input', () => {
  it('returns null for empty / nullish input', () => {
    expect(parseLastVisitedLeague(null)).toBeNull();
    expect(parseLastVisitedLeague(undefined)).toBeNull();
    expect(parseLastVisitedLeague('')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseLastVisitedLeague('{not json')).toBeNull();
  });

  it('returns null for non-object JSON', () => {
    expect(parseLastVisitedLeague('42')).toBeNull();
    expect(parseLastVisitedLeague('"baseball"')).toBeNull();
    expect(parseLastVisitedLeague('null')).toBeNull();
  });

  it('returns null when leagueId is missing or not a positive integer', () => {
    expect(parseLastVisitedLeague('{"sport":"baseball"}')).toBeNull();
    expect(
      parseLastVisitedLeague('{"leagueId":"42","sport":"baseball"}'),
    ).toBeNull();
    expect(
      parseLastVisitedLeague('{"leagueId":0,"sport":"baseball"}'),
    ).toBeNull();
    expect(
      parseLastVisitedLeague('{"leagueId":-5,"sport":"baseball"}'),
    ).toBeNull();
    expect(
      parseLastVisitedLeague('{"leagueId":1.5,"sport":"baseball"}'),
    ).toBeNull();
  });

  it('returns null for an unrecognized sport', () => {
    expect(
      parseLastVisitedLeague('{"leagueId":1,"sport":"hockey"}'),
    ).toBeNull();
    expect(parseLastVisitedLeague('{"leagueId":1}')).toBeNull();
  });
});

describe('LAST_VISITED_LEAGUE_KEY', () => {
  it('is the namespaced storage key', () => {
    expect(LAST_VISITED_LEAGUE_KEY).toBe('ls_last_visited_league');
  });
});
