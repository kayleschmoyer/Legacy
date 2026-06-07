/**
 * LGN-037 — post-login destination resolution for the mobile app.
 */
import { resolvePostLoginDestination } from './postLoginDestination';

describe('resolvePostLoginDestination', () => {
  it('preserves a deep-linked route', () => {
    expect(resolvePostLoginDestination('/baseball/league/123')).toBe(
      '/baseball/league/123',
    );
  });

  it('preserves a deep link with query params', () => {
    expect(resolvePostLoginDestination('/baseball/league/123?tab=roster')).toBe(
      '/baseball/league/123?tab=roster',
    );
  });

  it.each([null, undefined, '', '/'])(
    'falls back to home for empty/root pathname %p',
    (pathname) => {
      expect(resolvePostLoginDestination(pathname)).toBe('/');
    },
  );

  it.each(['/login', '/signup'])(
    'falls back to home for the auth entry point %s',
    (pathname) => {
      expect(resolvePostLoginDestination(pathname)).toBe('/');
    },
  );

  it('falls back to home for an auth entry point with a query string', () => {
    expect(resolvePostLoginDestination('/login?foo=bar')).toBe('/');
  });

  it('does not treat a route merely prefixed by "login" as an entry point', () => {
    expect(resolvePostLoginDestination('/login-help')).toBe('/login-help');
  });
});
