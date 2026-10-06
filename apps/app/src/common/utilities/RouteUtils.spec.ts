import {
  closeToHomeTab,
  HOME_TAB_HREF,
  navigateFromModal,
  sanitizeSearchParam,
  tabHrefFor,
  toIntId,
} from './RouteUtils';

// LS-8823 — cancel handlers used to push a concrete home path (`/baseball`,
// `/football`), which dropped the user on a standalone copy of the sport home
// outside the tab shell.
describe('closeToHomeTab', () => {
  const makeRouter = (canGoBack: boolean) => ({
    canGoBack: jest.fn(() => canGoBack),
    back: jest.fn(),
    dismissTo: jest.fn(),
    navigate: jest.fn(),
  });

  it('pops back to the screen the user came from when there is history', () => {
    const router = makeRouter(true);

    closeToHomeTab(router);

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('falls back to the Home tab when there is nothing to pop', () => {
    const router = makeRouter(false);

    closeToHomeTab(router);

    // Group-qualified so the root Stack pops to the one tab shell instead of
    // stacking a second copy of it (LS-10614).
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/(home)/home');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('never routes to a standalone sport home', () => {
    const router = makeRouter(false);

    closeToHomeTab(router);

    expect(router.navigate).not.toHaveBeenCalledWith('/baseball');
    expect(router.navigate).not.toHaveBeenCalledWith('/football');
  });
});

// LS-10614 — drill-down routes live in every tab's stack; leaving a root-stack
// modal must target one tab explicitly.
describe('tabHrefFor', () => {
  it.each([
    ['/home', '/(tabs)/(home)/home'],
    ['/leagues', '/(tabs)/(leagues)/leagues'],
    ['/you', '/(tabs)/(you)/you'],
    ['/', '/(tabs)/(home)/home'],
    ['/baseball', '/(tabs)/(home)/home?sport=baseball'],
    ['/football', '/(tabs)/(home)/home?sport=football'],
    ['/football/league/42', '/(tabs)/(leagues)/football/league/42'],
    [
      '/baseball/league/7?tab=chat',
      '/(tabs)/(leagues)/baseball/league/7?tab=chat',
    ],
    ['/baseball/team/3', '/(tabs)/(leagues)/baseball/team/3'],
    ['/football/matchup', '/(tabs)/(leagues)/football/matchup'],
    ['/FreeAgents', '/(tabs)/(leagues)/FreeAgents'],
    ['/football/players/12', '/(tabs)/(players)/football/players/12'],
    ['/PlayerDetail?id=5', '/(tabs)/(players)/PlayerDetail?id=5'],
    ['/season-draft', '/(tabs)/(games)/season-draft'],
    ['/notifications', '/(tabs)/(you)/notifications'],
    ['/mock-drafts', '/(tabs)/(home)/mock-drafts'],
  ])('routes %s into its host tab', (href, expected) => {
    expect(tabHrefFor(href)).toBe(expected);
  });

  it.each([
    '/football/league/create',
    '/baseball/league/join',
    '/league/create',
    '/join',
    '/mock-draft/9',
    '/season-draft/abc',
    '/DraftBoardPage',
    '/subscription-settings',
  ])('leaves root-stack route %s alone', (href) => {
    expect(tabHrefFor(href)).toBeNull();
  });
});

describe('navigateFromModal', () => {
  const makeRouter = () => ({ dismissTo: jest.fn(), navigate: jest.fn() });

  it('dismisses to the host tab for a tab-hosted destination', () => {
    const router = makeRouter();

    navigateFromModal(router, '/football/league/42');

    expect(router.dismissTo).toHaveBeenCalledWith(
      '/(tabs)/(leagues)/football/league/42',
    );
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('navigates normally to another root-stack route', () => {
    const router = makeRouter();

    navigateFromModal(router, '/mock-draft/9');

    expect(router.navigate).toHaveBeenCalledWith('/mock-draft/9');
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});

describe('HOME_TAB_HREF', () => {
  it('points at the Home tab, not the `/` redirect', () => {
    expect(HOME_TAB_HREF).toBe('/home');
  });
});

describe('toIntId', () => {
  it('returns a positive integer for a numeric string', () => {
    expect(toIntId('42')).toBe(42);
  });

  it('returns 1 for "1"', () => {
    expect(toIntId('1')).toBe(1);
  });

  it('returns null for undefined', () => {
    expect(toIntId(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(toIntId(null)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(toIntId('')).toBeNull();
  });

  it('returns null for a non-numeric string (e.g. "abc")', () => {
    expect(toIntId('abc')).toBeNull();
  });

  it('returns null for a query-string fragment (e.g. "?playerId=abc")', () => {
    expect(toIntId('?playerId=abc')).toBeNull();
  });

  it('returns the first element parsed as int when given an array', () => {
    expect(toIntId(['7', '99'])).toBe(7);
  });

  it('returns null when the first array element is non-numeric', () => {
    expect(toIntId(['abc', '99'])).toBeNull();
  });

  it('returns null for a number value (not a string)', () => {
    expect(toIntId(42)).toBeNull();
  });

  it('returns null for an object', () => {
    expect(toIntId({})).toBeNull();
  });

  it('truncates a decimal string to its integer part', () => {
    expect(toIntId('3.14')).toBe(3);
  });
});

// Relocated from PlayerStats.tsx (LS-8832) so screens that need only this
// pure utility — not PlayerStats.tsx's full subscription/GraphQL transitive
// graph — can import it directly. PlayerStats.spec.tsx keeps its own
// coverage via the re-export; this is the canonical-source coverage.
describe('sanitizeSearchParam', () => {
  it('returns null for null input', () => {
    expect(sanitizeSearchParam(null)).toBeNull();
  });

  it('strips control characters and returns null when nothing remains', () => {
    expect(sanitizeSearchParam('\t\n')).toBeNull();
  });

  it('caps the value at 64 characters', () => {
    expect(sanitizeSearchParam('a'.repeat(100))).toHaveLength(64);
  });

  it('passes a normal value through unchanged', () => {
    expect(sanitizeSearchParam('Bonds')).toBe('Bonds');
  });
});
