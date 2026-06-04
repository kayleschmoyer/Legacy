import { storeDiscordSessionPreCache } from './session-precache';

/** Build a minimal valid JWT with the given payload. No real signature — tests only. */
function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${body}.fakesig`;
}

describe('storeDiscordSessionPreCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes profile and expiry for a valid JWT with id and email', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const jwt = makeJwt({
      id: 42,
      email: 'user@example.com',
      username: 'testuser',
      accessLevel: 'user',
      exp,
    });

    storeDiscordSessionPreCache(jwt);

    const profile = JSON.parse(
      localStorage.getItem('ls_user_profile') ?? 'null',
    );
    expect(profile).toEqual({
      id: 42,
      email: 'user@example.com',
      username: 'testuser',
      picture: undefined,
      accessLevel: 'user',
    });
    expect(localStorage.getItem('ls_token_expiry')).toBe(String(exp));
  });

  it('falls back to name when username is absent', () => {
    const jwt = makeJwt({ id: 1, email: 'a@b.com', name: 'Full Name' });
    storeDiscordSessionPreCache(jwt);
    const profile = JSON.parse(
      localStorage.getItem('ls_user_profile') ?? 'null',
    );
    expect(profile.username).toBe('Full Name');
  });

  it('does NOT write when id is missing', () => {
    const jwt = makeJwt({ email: 'user@example.com', username: 'ghost' });
    storeDiscordSessionPreCache(jwt);
    expect(localStorage.getItem('ls_user_profile')).toBeNull();
  });

  it('does NOT write when email is missing', () => {
    const jwt = makeJwt({ id: 5, username: 'nomail' });
    storeDiscordSessionPreCache(jwt);
    expect(localStorage.getItem('ls_user_profile')).toBeNull();
  });

  it('does NOT write when id is zero (falsy stub)', () => {
    const jwt = makeJwt({ id: 0, email: 'user@example.com' });
    storeDiscordSessionPreCache(jwt);
    expect(localStorage.getItem('ls_user_profile')).toBeNull();
  });

  it('does NOT write when email is empty string (falsy stub)', () => {
    const jwt = makeJwt({ id: 7, email: '' });
    storeDiscordSessionPreCache(jwt);
    expect(localStorage.getItem('ls_user_profile')).toBeNull();
  });

  it('does not write ls_token_expiry when exp is absent', () => {
    const jwt = makeJwt({ id: 3, email: 'x@y.com' });
    storeDiscordSessionPreCache(jwt);
    expect(localStorage.getItem('ls_token_expiry')).toBeNull();
  });

  it('silently ignores a malformed JWT (wrong segment count)', () => {
    expect(() => storeDiscordSessionPreCache('notajwt')).not.toThrow();
    expect(localStorage.getItem('ls_user_profile')).toBeNull();
  });

  it('silently ignores a JWT with non-JSON payload', () => {
    expect(() =>
      storeDiscordSessionPreCache('header.!!!notbase64!!$.sig'),
    ).not.toThrow();
    expect(localStorage.getItem('ls_user_profile')).toBeNull();
  });
});
