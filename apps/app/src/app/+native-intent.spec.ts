import { redirectSystemPath } from './+native-intent';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// Typing error as jest.Mock (not the original method) sidesteps
// @typescript-eslint/unbound-method; requireMock returns the live mock instance.
const { LOGGER } = jest.requireMock<{ LOGGER: { error: jest.Mock } }>(
  '@legacy-sports/logging',
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('redirectSystemPath', () => {
  it('rewrites the web-style invite path to the native route + query param', () => {
    expect(
      redirectSystemPath({
        path: '/games/season-draft/join/ABC123',
        initial: true,
      }),
    ).toBe('/season-draft/join?inviteCode=ABC123');
  });

  it('rewrites the native-style invite path to the query param form', () => {
    expect(
      redirectSystemPath({ path: '/season-draft/join/XYZ789', initial: false }),
    ).toBe('/season-draft/join?inviteCode=XYZ789');
  });

  it('ignores a trailing slash and existing query/hash on the path', () => {
    expect(
      redirectSystemPath({
        path: '/games/season-draft/join/ABC123/?ref=email#top',
        initial: true,
      }),
    ).toBe('/season-draft/join?inviteCode=ABC123');
  });

  it('encodes invite codes containing special characters', () => {
    expect(
      redirectSystemPath({ path: '/season-draft/join/a b&c', initial: true }),
    ).toBe('/season-draft/join?inviteCode=a%20b%26c');
  });

  it('passes through unrelated paths unchanged', () => {
    expect(
      redirectSystemPath({ path: '/season-draft/42', initial: true }),
    ).toBe('/season-draft/42');
    expect(
      redirectSystemPath({ path: '/season-draft/join', initial: true }),
    ).toBe('/season-draft/join');
  });

  it('rewrites baseball league trades path to flat route with initialTab query param', () => {
    expect(
      redirectSystemPath({
        path: '/baseball/league/123/trades',
        initial: true,
      }),
    ).toBe('/baseball/league/123?initialTab=trades');
  });

  it('rewrites football league trades path to flat route with initialTab query param', () => {
    expect(
      redirectSystemPath({
        path: '/football/league/456/trades',
        initial: false,
      }),
    ).toBe('/football/league/456?initialTab=trades');
  });

  it('rewrites league trades path with a trailing slash', () => {
    expect(
      redirectSystemPath({
        path: '/baseball/league/789/trades/',
        initial: false,
      }),
    ).toBe('/baseball/league/789?initialTab=trades');
  });

  it('preserves existing query params when rewriting trade paths', () => {
    expect(
      redirectSystemPath({
        path: '/baseball/league/123/trades?ref=push',
        initial: true,
      }),
    ).toBe('/baseball/league/123?ref=push&initialTab=trades');
  });

  it('passes through non-trades league sub-paths unchanged', () => {
    expect(
      redirectSystemPath({
        path: '/baseball/league/123/roster',
        initial: false,
      }),
    ).toBe('/baseball/league/123/roster');
    expect(
      redirectSystemPath({ path: '/baseball/league/123', initial: false }),
    ).toBe('/baseball/league/123');
  });

  it('passes through football player detail paths unchanged', () => {
    expect(
      redirectSystemPath({ path: '/football/players/42', initial: true }),
    ).toBe('/football/players/42');
    expect(
      redirectSystemPath({ path: '/football/players/999', initial: false }),
    ).toBe('/football/players/999');
  });

  it('passes through baseball player detail paths unchanged', () => {
    expect(redirectSystemPath({ path: '/players/123', initial: true })).toBe(
      '/players/123',
    );
  });

  it('rewrites trade-center deep links, passing leagueId and tradeOfferId through', () => {
    expect(
      redirectSystemPath({
        path: '/trade-center?leagueId=123&tradeOfferId=456',
        initial: true,
      }),
    ).toBe('/TradeCenterPage?leagueId=123&tradeOfferId=456');
  });

  it('rewrites a bare trade-center path with no query params', () => {
    expect(redirectSystemPath({ path: '/trade-center', initial: false })).toBe(
      '/TradeCenterPage',
    );
  });

  it('rewrites a trade-center path with a trailing slash', () => {
    expect(
      redirectSystemPath({
        path: '/trade-center/?leagueId=123&tradeOfferId=456',
        initial: true,
      }),
    ).toBe('/TradeCenterPage?leagueId=123&tradeOfferId=456');
  });

  it('passes through non-trade-center paths that merely start with the prefix', () => {
    expect(
      redirectSystemPath({ path: '/trade-center-history', initial: true }),
    ).toBe('/trade-center-history');
  });

  // On native, `redirectSystemPath` receives the raw deep-link URL, so the
  // Stripe return links arrive as `legacysports://subscription/<status>` with
  // `subscription` as the URL host. Expo Router resolves that to the route path
  // `subscription/success`, which matches no file route — the unmatched-route
  // screen the buyer used to land on after paying.
  it('rewrites the raw scheme checkout success URL to subscription settings', () => {
    expect(
      redirectSystemPath({
        path: 'legacysports://subscription/success',
        initial: true,
      }),
    ).toBe('/subscription-settings?checkout=success');
  });

  it('normalizes the cancel return to checkout=canceled, matching web', () => {
    expect(
      redirectSystemPath({
        path: 'legacysports://subscription/cancel',
        initial: false,
      }),
    ).toBe('/subscription-settings?checkout=canceled');
  });

  it('rewrites the billing portal return URL', () => {
    expect(
      redirectSystemPath({
        path: 'legacysports://subscription/portal-return',
        initial: false,
      }),
    ).toBe('/subscription-settings?checkout=portal-return');
  });

  it('rewrites the path form of the checkout return, with a trailing slash', () => {
    expect(
      redirectSystemPath({ path: '/subscription/success/', initial: true }),
    ).toBe('/subscription-settings?checkout=success');
  });

  it('preserves existing query params on a checkout return', () => {
    expect(
      redirectSystemPath({
        path: 'legacysports://subscription/success?session_id=cs_test_123',
        initial: true,
      }),
    ).toBe('/subscription-settings?session_id=cs_test_123&checkout=success');
  });

  it('passes through unrelated subscription paths unchanged', () => {
    expect(
      redirectSystemPath({ path: '/subscription-settings', initial: true }),
    ).toBe('/subscription-settings');
    expect(
      redirectSystemPath({ path: '/subscription/unknown', initial: true }),
    ).toBe('/subscription/unknown');
    // The segment must be exactly `subscription`, not merely end with it.
    expect(
      redirectSystemPath({
        path: '/legacy-subscription/success',
        initial: true,
      }),
    ).toBe('/legacy-subscription/success');
  });

  it('returns the original path and logs when rewriting throws', () => {
    // A malformed percent-encoding makes decodeURIComponent throw, exercising
    // the try/catch fallback: the original path is returned and the error logged.
    const path = '/season-draft/join/%E0%A4%A';
    expect(redirectSystemPath({ path, initial: true })).toBe(path);
    expect(LOGGER.error).toHaveBeenCalledTimes(1);
  });
});
