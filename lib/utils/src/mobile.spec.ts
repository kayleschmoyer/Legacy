import {
  cleanDescription,
  DEFAULT_BASEBALL_ROSTER_POSITIONS,
  DEFAULT_FOOTBALL_ROSTER_POSITIONS,
  extractPlayerNameFromDescription,
  formatDraftDate,
  getSeasonDraftNameError,
  SEASON_DRAFT_NAME_MAX_LENGTH,
  stripDiacritics,
} from './mobile';

/**
 * Metro resolves '@legacy-sports/utils' to mobile.ts via the package
 * "react-native" field. OnThisDayFeed (shared-components) imports these three
 * string helpers from the package root; when they were missing from this
 * barrel they resolved to `undefined` on Android and the widget crashed the
 * Home screen with "undefined is not a function" (LS-7953). These assertions
 * guard the mobile entry point so the helpers stay reachable on Hermes.
 */
describe('mobile entry point (LS-7953)', () => {
  it('re-exports cleanDescription as a callable function', () => {
    expect(typeof cleanDescription).toBe('function');
    expect(cleanDescription('Signed by the Red Sox, and.')).toBe(
      'Signed by the Red Sox.',
    );
  });

  it('re-exports extractPlayerNameFromDescription as a callable function', () => {
    expect(typeof extractPlayerNameFromDescription).toBe('function');
    expect(
      extractPlayerNameFromDescription(
        'Yankees signed free agent RHP Gerrit Cole.',
      ),
    ).toBe('Gerrit Cole');
  });

  it('re-exports stripDiacritics as a callable function', () => {
    expect(typeof stripDiacritics).toBe('function');
    expect(stripDiacritics('José Ramírez')).toBe('Jose Ramirez');
  });
});

/**
 * Same barrel-drift failure mode, re-hit on the Home dashboard. `LeagueListRow`
 * (shared-components HomeScreen) calls `formatDraftDate` during render for any
 * league with a scheduled draft. It was defined inline in `index.ts` only, so
 * Metro resolved it to `undefined` on device and the call threw
 * "TypeError: undefined is not a function" straight into the screen error
 * boundary — note the throw happens at the *call site*, so a try/catch inside
 * `formatDraftDate` cannot catch it; only reaching this barrel fixes it.
 */
describe('mobile entry point (LS-8755)', () => {
  it('re-exports formatDraftDate as a callable function', () => {
    expect(typeof formatDraftDate).toBe('function');
    expect(formatDraftDate('2026-04-20T20:00:00.000Z')).toMatch(/Apr 20/);
  });

  it('returns an empty string for missing input rather than throwing', () => {
    expect(formatDraftDate(null)).toBe('');
    expect(formatDraftDate(undefined)).toBe('');
  });

  it('re-exports the sport roster defaults as populated arrays', () => {
    // shared-components' config/sports.ts spreads these into
    // DEFAULT_LINEUP_BY_SPORT at module-evaluation time; when missing from this
    // barrel they are silently `undefined` on device instead of throwing.
    expect(Array.isArray(DEFAULT_BASEBALL_ROSTER_POSITIONS)).toBe(true);
    expect(DEFAULT_BASEBALL_ROSTER_POSITIONS.length).toBeGreaterThan(0);
    expect(Array.isArray(DEFAULT_FOOTBALL_ROSTER_POSITIONS)).toBe(true);
    expect(DEFAULT_FOOTBALL_ROSTER_POSITIONS.length).toBeGreaterThan(0);
  });
});

/**
 * `SeasonDraftGameCreate` (shared-components) calls `getSeasonDraftNameError`
 * during render to cap the game name (LS-10675). Missing from this barrel it
 * would be `undefined` on device and crash the mobile create screen.
 */
describe('mobile entry point (LS-10675)', () => {
  it('re-exports the Season Draft name rule', () => {
    expect(typeof getSeasonDraftNameError).toBe('function');
    expect(getSeasonDraftNameError('HR Challenge')).toBeNull();
    expect(SEASON_DRAFT_NAME_MAX_LENGTH).toBe(60);
  });
});
