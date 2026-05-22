import {
  buildClearOauthStateCookie,
  buildOauthStateCookie,
  decodeOauthState,
  encodeOauthState,
  generateOauthState,
  OAUTH_STATE_COOKIE,
  parseOauthStateFromCookies,
  verifyOauthState,
} from './oauth-state';

describe('oauth-state', () => {
  describe('generateOauthState', () => {
    it('returns a 64-character hex string (32 bytes)', () => {
      const token = generateOauthState();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns unique values on consecutive calls', () => {
      const a = generateOauthState();
      const b = generateOauthState();
      expect(a).not.toBe(b);
    });
  });

  describe('encode/decodeOauthState', () => {
    it('round-trips a CSRF token alone', () => {
      const csrf = 'abc123';
      const encoded = encodeOauthState(csrf);
      expect(encoded).toBe('abc123');
      expect(decodeOauthState(encoded)).toEqual({
        csrfToken: 'abc123',
        deviceCode: '',
      });
    });

    it('round-trips a CSRF token plus a device code', () => {
      const csrf = 'abc123';
      const device = 'device-xyz';
      const encoded = encodeOauthState(csrf, device);
      expect(encoded).toBe('abc123.device-xyz');
      expect(decodeOauthState(encoded)).toEqual({
        csrfToken: 'abc123',
        deviceCode: 'device-xyz',
      });
    });

    it('preserves separator characters in the device code (only splits on the first dot)', () => {
      const encoded = encodeOauthState('csrf', 'dev.ice.code');
      expect(decodeOauthState(encoded)).toEqual({
        csrfToken: 'csrf',
        deviceCode: 'dev.ice.code',
      });
    });

    it('returns empty CSRF + empty device code for falsy input', () => {
      expect(decodeOauthState(undefined)).toEqual({
        csrfToken: '',
        deviceCode: '',
      });
      expect(decodeOauthState(null)).toEqual({ csrfToken: '', deviceCode: '' });
      expect(decodeOauthState('')).toEqual({ csrfToken: '', deviceCode: '' });
    });

    it('treats an empty device code argument as absent', () => {
      expect(encodeOauthState('csrf', '')).toBe('csrf');
    });
  });

  describe('buildOauthStateCookie', () => {
    const originalEnv = { ...process.env };
    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('sets HttpOnly + Secure + SameSite=Lax + 10-minute Max-Age in non-local env', () => {
      delete process.env['IS_LOCAL'];
      process.env['NODE_ENV'] = 'production';
      const cookie = buildOauthStateCookie('abc');
      expect(cookie).toContain(`${OAUTH_STATE_COOKIE}=abc`);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Max-Age=600');
    });

    it('omits Secure and downgrades attrs in local dev', () => {
      process.env['IS_LOCAL'] = 'true';
      const cookie = buildOauthStateCookie('abc');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).not.toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
    });
  });

  describe('buildClearOauthStateCookie', () => {
    it('emits Max-Age=0 with the same attributes', () => {
      const cleared = buildClearOauthStateCookie();
      expect(cleared).toContain(`${OAUTH_STATE_COOKIE}=`);
      expect(cleared).toContain('HttpOnly');
      expect(cleared).toContain('Max-Age=0');
    });
  });

  describe('parseOauthStateFromCookies', () => {
    it('returns null when no cookie header', () => {
      expect(parseOauthStateFromCookies(undefined)).toBeNull();
      expect(parseOauthStateFromCookies('')).toBeNull();
    });

    it('returns null when state cookie is absent', () => {
      expect(
        parseOauthStateFromCookies('other_cookie=foo; ls_csrf=bar'),
      ).toBeNull();
    });

    it('extracts the state value from a single-cookie header', () => {
      expect(parseOauthStateFromCookies('ls_oauth_state=abc123')).toBe(
        'abc123',
      );
    });

    it('extracts the state value when other cookies are present', () => {
      const header = 'foo=bar; ls_oauth_state=tok; baz=qux';
      expect(parseOauthStateFromCookies(header)).toBe('tok');
    });

    it('returns null for an empty cookie value', () => {
      expect(parseOauthStateFromCookies('ls_oauth_state=')).toBeNull();
    });
  });

  describe('verifyOauthState', () => {
    const cookieFor = (value: string) => `ls_oauth_state=${value}`;

    it('returns false when received token is missing', () => {
      expect(verifyOauthState(undefined, cookieFor('abc'))).toBe(false);
      expect(verifyOauthState(null, cookieFor('abc'))).toBe(false);
      expect(verifyOauthState('', cookieFor('abc'))).toBe(false);
    });

    it('returns false when cookie is missing', () => {
      expect(verifyOauthState('abc', undefined)).toBe(false);
      expect(verifyOauthState('abc', '')).toBe(false);
      expect(verifyOauthState('abc', 'other=cookie')).toBe(false);
    });

    it('returns false when token does not match cookie', () => {
      expect(verifyOauthState('abc', cookieFor('xyz'))).toBe(false);
    });

    it('returns false when lengths differ (timing-safe path)', () => {
      expect(verifyOauthState('abc', cookieFor('abcd'))).toBe(false);
    });

    it('returns true when token matches cookie', () => {
      expect(verifyOauthState('abc123', cookieFor('abc123'))).toBe(true);
    });
  });
});
