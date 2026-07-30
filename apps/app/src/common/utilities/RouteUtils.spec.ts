import {
  closeToHomeTab,
  HOME_TAB_HREF,
  sanitizeSearchParam,
  toIntId,
} from './RouteUtils';

// LS-8823 — cancel handlers used to push a concrete home path (`/baseball`,
// `/football`), which dropped the user on a standalone copy of the sport home
// outside the tab shell.
describe('closeToHomeTab', () => {
  const makeRouter = (canGoBack: boolean) => ({
    canGoBack: jest.fn(() => canGoBack),
    back: jest.fn(),
    navigate: jest.fn(),
  });

  it('pops back to the screen the user came from when there is history', () => {
    const router = makeRouter(true);

    closeToHomeTab(router);

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('falls back to the Home tab when there is nothing to pop', () => {
    const router = makeRouter(false);

    closeToHomeTab(router);

    expect(router.navigate).toHaveBeenCalledWith('/home');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('never routes to a standalone sport home', () => {
    const router = makeRouter(false);

    closeToHomeTab(router);

    expect(router.navigate).not.toHaveBeenCalledWith('/baseball');
    expect(router.navigate).not.toHaveBeenCalledWith('/football');
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
