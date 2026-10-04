import {
  buildClearOauthStateCookie,
  buildLinkStateCookieValue,
  buildOauthStateCookie,
  decodeOauthState,
  encodeOauthState,
  generateOauthState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_COOKIE_LINK,
  OAUTH_STATE_COOKIE_LOGIN,
  parseOauthStateFromCookies,
  verifyLinkState,
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

  // LS-6661: the Discord sign-in and account-link flows share one authorize
  // endpoint but must bind to separate state cookies so concurrent tabs don't
  // clobber each other. The helpers accept a flow-specific cookie name.
  describe('flow-specific cookie names (LS-6661)', () => {
    it('exposes distinct login and link cookie names', () => {
      expect(OAUTH_STATE_COOKIE_LOGIN).toBe('ls_oauth_state_login');
      expect(OAUTH_STATE_COOKIE_LINK).toBe('ls_oauth_state_link');
      expect(OAUTH_STATE_COOKIE_LOGIN).not.toBe(OAUTH_STATE_COOKIE_LINK);
    });

    it('buildOauthStateCookie uses the provided cookie name', () => {
      expect(buildOauthStateCookie('tok', OAUTH_STATE_COOKIE_LINK)).toContain(
        'ls_oauth_state_link=tok',
      );
      expect(buildOauthStateCookie('tok', OAUTH_STATE_COOKIE_LOGIN)).toContain(
        'ls_oauth_state_login=tok',
      );
    });

    it('buildClearOauthStateCookie clears the named cookie only', () => {
      const cleared = buildClearOauthStateCookie(OAUTH_STATE_COOKIE_LINK);
      expect(cleared).toContain('ls_oauth_state_link=');
      expect(cleared).toContain('Max-Age=0');
    });

    it('parseOauthStateFromCookies reads the named cookie, ignoring the other flow', () => {
      const header =
        'ls_oauth_state_login=logintok; ls_oauth_state_link=linktok';
      expect(parseOauthStateFromCookies(header, OAUTH_STATE_COOKIE_LOGIN)).toBe(
        'logintok',
      );
      expect(parseOauthStateFromCookies(header, OAUTH_STATE_COOKIE_LINK)).toBe(
        'linktok',
      );
      // The legacy shared name is absent in this header.
      expect(parseOauthStateFromCookies(header, OAUTH_STATE_COOKIE)).toBeNull();
    });

    it('verifyOauthState matches against the named cookie only (no cross-flow match)', () => {
      const header =
        'ls_oauth_state_login=logintok; ls_oauth_state_link=linktok';
      expect(
        verifyOauthState('logintok', header, OAUTH_STATE_COOKIE_LOGIN),
      ).toBe(true);
      expect(verifyOauthState('linktok', header, OAUTH_STATE_COOKIE_LINK)).toBe(
        true,
      );
      // A login token must not validate against the link cookie and vice versa.
      expect(
        verifyOauthState('logintok', header, OAUTH_STATE_COOKIE_LINK),
      ).toBe(false);
      expect(
        verifyOauthState('linktok', header, OAUTH_STATE_COOKIE_LOGIN),
      ).toBe(false);
    });
  });

  // LS-7214: the account-link state cookie is signed and bound to the LS user
  // who started the flow, so the callback can fail closed if the session
  // changed (or the cookie was planted) mid-flow.
  describe('link state bound to the initiating user (LS-7214)', () => {
    const SECRET = 'test-secret';
    const nonce = 'a'.repeat(64);
    const cookieName = OAUTH_STATE_COOKIE_LINK;
    const header = (value: string) => `${cookieName}=${value}`;

    it('encodes the nonce and user id with a MAC, and round-trips for the same user', () => {
      const value = buildLinkStateCookieValue(nonce, 42, SECRET);
      const [n, uid, mac] = value.split('.');
      expect(n).toBe(nonce);
      expect(uid).toBe('42');
      expect(mac).toMatch(/^[0-9a-f]{64}$/);

      expect(
        verifyLinkState(nonce, header(value), cookieName, 42, SECRET),
      ).toEqual({ ok: true });
    });

    it('rejects a callback completed by a different user as user_mismatch', () => {
      const value = buildLinkStateCookieValue(nonce, 42, SECRET);
      expect(
        verifyLinkState(nonce, header(value), cookieName, 7, SECRET),
      ).toEqual({ ok: false, reason: 'user_mismatch' });
    });

    it('rejects a cookie whose user id was tampered with', () => {
      const [n, , mac] = buildLinkStateCookieValue(nonce, 42, SECRET).split(
        '.',
      );
      const forged = `${n}.7.${mac}`;
      expect(
        verifyLinkState(nonce, header(forged), cookieName, 7, SECRET),
      ).toEqual({ ok: false, reason: 'invalid_state' });
    });

    it('rejects a cookie signed with a different secret', () => {
      const value = buildLinkStateCookieValue(nonce, 7, 'attacker-secret');
      expect(
        verifyLinkState(nonce, header(value), cookieName, 7, SECRET),
      ).toEqual({ ok: false, reason: 'invalid_state' });
    });

    it('rejects when the received state does not match the cookie nonce', () => {
      const value = buildLinkStateCookieValue(nonce, 42, SECRET);
      expect(
        verifyLinkState('b'.repeat(64), header(value), cookieName, 42, SECRET),
      ).toEqual({ ok: false, reason: 'invalid_state' });
    });

    it('rejects a missing state, missing cookie, or a legacy unsigned cookie', () => {
      const value = buildLinkStateCookieValue(nonce, 42, SECRET);
      expect(
        verifyLinkState(undefined, header(value), cookieName, 42, SECRET),
      ).toEqual({ ok: false, reason: 'invalid_state' });
      expect(verifyLinkState(nonce, undefined, cookieName, 42, SECRET)).toEqual(
        { ok: false, reason: 'invalid_state' },
      );
      // Pre-LS-7214 cookie: bare nonce, no user binding.
      expect(
        verifyLinkState(nonce, header(nonce), cookieName, 42, SECRET),
      ).toEqual({ ok: false, reason: 'invalid_state' });
    });

    it('only reads the link-flow cookie', () => {
      const value = buildLinkStateCookieValue(nonce, 42, SECRET);
      expect(
        verifyLinkState(
          nonce,
          `${OAUTH_STATE_COOKIE_LOGIN}=${value}`,
          cookieName,
          42,
          SECRET,
        ),
      ).toEqual({ ok: false, reason: 'invalid_state' });
    });
  });
});
