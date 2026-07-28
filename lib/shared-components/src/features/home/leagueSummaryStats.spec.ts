import { formatDraftDayShort, formatEraName } from './homeSummaryFormatters';
import {
  aggregateActiveRecord,
  deriveHomeUserStats,
  type HomeLeagueSummary,
  isLiveMatchup,
  isPreDraft,
  recordOf,
  safeScore,
  sortByUrgency,
  urgencyKey,
} from './leagueSummaryStats';

const active: HomeLeagueSummary = {
  leagueId: 1,
  leaguePhase: 'active',
  wins: 6,
  losses: 2,
};

describe('urgencyKey / sortByUrgency', () => {
  it('ranks a live draft above active, pre-draft, and everything else', () => {
    expect(urgencyKey({ draftStatus: 'in-progress' })).toBe(0);
    expect(urgencyKey({ leaguePhase: 'active' })).toBe(1);
    expect(urgencyKey({ leaguePhase: 'pre-draft' })).toBe(2);
    expect(urgencyKey({ leaguePhase: 'completed' })).toBe(3);
  });

  it('sorts by urgency without mutating the input array', () => {
    const input: HomeLeagueSummary[] = [
      { leagueId: 1, leaguePhase: 'pre-draft' },
      { leagueId: 2, leaguePhase: 'completed' },
      { leagueId: 3, draftStatus: 'in-progress' },
      { leagueId: 4, leaguePhase: 'active' },
    ];
    expect(sortByUrgency(input).map((s) => s.leagueId)).toEqual([3, 4, 1, 2]);
    expect(input.map((s) => s.leagueId)).toEqual([1, 2, 3, 4]);
  });
});

describe('phase predicates', () => {
  it('treats a league as live only when a matchup is in progress', () => {
    expect(isLiveMatchup({ matchupId: 5, matchupStatus: 'in_progress' })).toBe(
      true,
    );
    expect(isLiveMatchup({ matchupId: 5, matchupStatus: 'complete' })).toBe(
      false,
    );
    expect(isLiveMatchup({ matchupStatus: 'in_progress' })).toBe(false);
    expect(isLiveMatchup({})).toBe(false);
  });

  it('detects the pre-draft phase', () => {
    expect(isPreDraft({ leaguePhase: 'pre-draft' })).toBe(true);
    expect(isPreDraft({ leaguePhase: 'active' })).toBe(false);
    expect(isPreDraft({})).toBe(false);
  });
});

describe('recordOf', () => {
  it('formats wins and losses, defaulting missing values to zero', () => {
    expect(recordOf({ wins: 6, losses: 2 })).toBe('6-2');
    expect(recordOf({})).toBe('0-0');
  });

  it('includes ties only when there are any', () => {
    expect(recordOf({ wins: 6, losses: 2, ties: 1 })).toBe('6-2-1');
    expect(recordOf({ wins: 6, losses: 2, ties: 0 })).toBe('6-2');
  });
});

describe('safeScore', () => {
  it('passes finite numbers through and coerces numeric strings', () => {
    expect(safeScore(84.2)).toBe(84.2);
    expect(safeScore('12.5' as unknown as number)).toBe(12.5);
  });

  it('falls back to zero for null, undefined, and non-numeric values', () => {
    expect(safeScore(null)).toBe(0);
    expect(safeScore(undefined)).toBe(0);
    expect(safeScore(NaN)).toBe(0);
    expect(safeScore('abc' as unknown as number)).toBe(0);
  });
});

describe('aggregateActiveRecord', () => {
  it('sums only active leagues', () => {
    expect(
      aggregateActiveRecord([
        active,
        { leaguePhase: 'active', wins: 8, losses: 7 },
        { leaguePhase: 'pre-draft', wins: 99, losses: 99 },
        { leaguePhase: 'completed', wins: 50, losses: 1 },
      ]),
    ).toBe('14-9');
  });

  it('includes ties when any active league has them', () => {
    expect(
      aggregateActiveRecord([active, { leaguePhase: 'active', ties: 3 }]),
    ).toBe('6-2-3');
  });

  it('returns null when no league is active', () => {
    expect(aggregateActiveRecord([])).toBeNull();
    expect(aggregateActiveRecord([{ leaguePhase: 'pre-draft' }])).toBeNull();
  });
});

describe('deriveHomeUserStats', () => {
  it('counts every league but aggregates only active records', () => {
    expect(
      deriveHomeUserStats([
        active,
        { leaguePhase: 'pre-draft' },
        { leaguePhase: 'active', wins: 1, losses: 1, rank: 1 },
      ]),
    ).toEqual({
      leagueCount: 3,
      aggregateRecord: '7-3',
      firstPlaceCount: 1,
    });
  });

  it('reports a null record and zero firsts for a user with no leagues', () => {
    expect(deriveHomeUserStats([])).toEqual({
      leagueCount: 0,
      aggregateRecord: null,
      firstPlaceCount: 0,
    });
  });
});

describe('formatEraName', () => {
  it('drops the year range from a known era label', () => {
    expect(formatEraName({ eraFilter: 'dead_ball' })).toBe('Dead Ball era');
    expect(formatEraName({ eraFilter: 'super_bowl_era' })).toBe(
      'Super Bowl Era',
    );
  });

  it('falls back to the year range for a custom era', () => {
    expect(
      formatEraName({
        eraFilter: 'custom',
        customEraStartYear: 1994,
        customEraEndYear: 2004,
      }),
    ).toBe('1994–2004');
  });

  it('returns null when no meaningful era is set', () => {
    expect(formatEraName({ eraFilter: 'all' })).toBeNull();
    expect(formatEraName({ eraFilter: null })).toBeNull();
    expect(formatEraName({ eraFilter: 'not-a-real-era' })).toBeNull();
    expect(formatEraName({ eraFilter: 'custom' })).toBeNull();
  });
});

describe('formatDraftDayShort', () => {
  it('formats a timestamp as a month-and-day string with no time', () => {
    const formatted = formatDraftDayShort('2026-08-02T19:00:00.000Z');
    // Locale-dependent, so assert the shape rather than an exact string: a
    // short month name and a day, and crucially no time component.
    expect(formatted).toMatch(/^[A-Za-z]{3,}\.? ?\d{1,2}$|^\d{1,2} [A-Za-z]/);
    expect(formatted).not.toMatch(/:/);
  });

  it('returns an empty string for missing or unparseable input', () => {
    expect(formatDraftDayShort(null)).toBe('');
    expect(formatDraftDayShort(undefined)).toBe('');
    expect(formatDraftDayShort('not-a-date')).toBe('');
  });
});
