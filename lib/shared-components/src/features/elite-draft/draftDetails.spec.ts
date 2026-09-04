/**
 * LS-9857 — Draft Details row derivation.
 *
 * Guards the two things the ticket is specific about: the six mock rows in
 * order, and sport-awareness (football's own round count, era range and
 * min-games threshold).
 */
import {
  buildDraftDetailRows,
  DRAFT_DETAIL_UNKNOWN,
  type DraftDetailsSettings,
  formatDraftOrderSource,
  formatFormat,
  formatPickClock,
  formatPlayerPool,
} from './draftDetails';

const baseball: DraftDetailsSettings = {
  sport: 'baseball',
  draftOrder: 'snake',
  maxRosterSize: 23,
  pickTimeLimitSeconds: 90,
  autoPickDisabled: false,
  eraFilter: 'all',
  minCareerGames: 500,
};

const football: DraftDetailsSettings = {
  sport: 'football',
  draftOrder: 'snake',
  maxRosterSize: 16,
  pickTimeLimitSeconds: 90,
  autoPickDisabled: false,
  eraFilter: 'all',
  minCareerGames: 64,
};

const valueOf = (settings: DraftDetailsSettings, key: string): string =>
  buildDraftDetailRows(settings).find((r) => r.key === key)?.value ?? '';

describe('buildDraftDetailRows', () => {
  it('emits the mock six rows in order', () => {
    expect(buildDraftDetailRows(baseball).map((r) => r.label)).toEqual([
      'Format',
      'Pick clock',
      'Player pool',
      'Min. career games',
      'Auto-pick',
      'Draft order',
    ]);
  });

  it('renders the baseball board values from the mock', () => {
    expect(buildDraftDetailRows(baseball).map((r) => r.value)).toEqual([
      'Snake · 23 rounds',
      '90 seconds',
      'All eras · 1871–present',
      '500',
      'Enabled',
      'Custom',
    ]);
  });

  it('is sport-aware: football gets its own rounds, era floor and min games', () => {
    expect(valueOf(football, 'format')).toBe('Snake · 16 rounds');
    expect(valueOf(football, 'player-pool')).toBe('All eras · 1920–present');
    expect(valueOf(football, 'min-career-games')).toBe('64');
  });

  it('reports a commissioner-disabled auto-pick', () => {
    expect(valueOf({ ...baseball, autoPickDisabled: true }, 'auto-pick')).toBe(
      'Disabled',
    );
  });

  it('falls back to a placeholder while settings are unresolved', () => {
    const rows = buildDraftDetailRows({ sport: 'baseball' });
    expect(valueOf({ sport: 'baseball' }, 'format')).toBe(DRAFT_DETAIL_UNKNOWN);
    expect(rows).toHaveLength(6);
    expect(valueOf({ sport: 'baseball' }, 'min-career-games')).toBe(
      DRAFT_DETAIL_UNKNOWN,
    );
    expect(valueOf({ sport: 'baseball' }, 'auto-pick')).toBe(
      DRAFT_DETAIL_UNKNOWN,
    );
  });
});

describe('formatFormat', () => {
  it('labels linear and reverse-standings orders', () => {
    expect(formatFormat({ ...baseball, draftOrder: 'linear' })).toBe(
      'Linear · 23 rounds',
    );
    expect(formatFormat({ ...baseball, draftOrder: 'reverse_standings' })).toBe(
      'Reverse Standings · 23 rounds',
    );
  });

  it('drops the round count when the roster size is unknown', () => {
    expect(formatFormat({ ...baseball, maxRosterSize: null })).toBe('Snake');
    expect(formatFormat({ ...baseball, maxRosterSize: 0 })).toBe('Snake');
  });

  it('singularizes a one-round draft', () => {
    expect(formatFormat({ ...baseball, maxRosterSize: 1 })).toBe(
      'Snake · 1 round',
    );
  });
});

describe('formatPickClock', () => {
  it.each([
    [30, '30 seconds'],
    [1, '1 second'],
    [90, '90 seconds'],
    [120, '2 minutes'],
    [60, '1 minute'],
    [3600, '1 hour'],
    [86400, '24 hours'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatPickClock(seconds)).toBe(expected);
  });

  it('reports an untimed draft (offline mock drafts, LS-9144)', () => {
    expect(formatPickClock(0)).toBe('Untimed');
  });

  it('placeholders an unresolved clock', () => {
    expect(formatPickClock(null)).toBe(DRAFT_DETAIL_UNKNOWN);
    expect(formatPickClock(undefined)).toBe(DRAFT_DETAIL_UNKNOWN);
  });
});

describe('formatPlayerPool', () => {
  it('names a predefined era and its year range', () => {
    expect(formatPlayerPool({ ...baseball, eraFilter: 'golden_age' })).toBe(
      'Golden Age · 1920–1960',
    );
  });

  it('renders the open-ended current era as "present"', () => {
    expect(formatPlayerPool({ ...baseball, eraFilter: 'modern' })).toBe(
      'Modern Era · 2006–present',
    );
    expect(formatPlayerPool({ ...football, eraFilter: 'spread_offense' })).toBe(
      'Spread Offense Era · 2011–present',
    );
  });

  it('renders a commissioner-defined custom era', () => {
    expect(
      formatPlayerPool({
        ...baseball,
        eraFilter: 'custom',
        customEraStartYear: 1995,
        customEraEndYear: 2004,
      }),
    ).toBe('Custom era · 1995–2004');
  });

  it('treats a missing custom end year as open-ended', () => {
    expect(
      formatPlayerPool({
        ...baseball,
        eraFilter: 'custom',
        customEraStartYear: 1995,
        customEraEndYear: null,
      }),
    ).toBe('Custom era · 1995–present');
  });

  it('flags a Hall-of-Fame-only pool', () => {
    expect(formatPlayerPool({ ...baseball, baseballHofOnly: true })).toBe(
      'All eras · 1871–present · HOF only',
    );
  });

  it('falls back to the full range for an unrecognized era key', () => {
    expect(formatPlayerPool({ ...baseball, eraFilter: 'not_an_era' })).toBe(
      'All eras · 1871–present',
    );
  });
});

describe('formatDraftOrderSource', () => {
  it('distinguishes a standings-derived order from a league-defined one', () => {
    expect(formatDraftOrderSource('reverse_standings')).toBe(
      'Reverse standings',
    );
    expect(formatDraftOrderSource('snake')).toBe('Custom');
    expect(formatDraftOrderSource('linear')).toBe('Custom');
    expect(formatDraftOrderSource(null)).toBe(DRAFT_DETAIL_UNKNOWN);
  });
});

describe('formatPlayerPool sport gating', () => {
  it('never shows the HOF suffix on a football board', () => {
    expect(formatPlayerPool({ ...football, baseballHofOnly: true })).toBe(
      'All eras · 1920–present',
    );
  });
});
