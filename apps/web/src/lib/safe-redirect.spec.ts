import { getSafeRedirectTarget } from './safe-redirect';

const ORIGIN = 'https://app.legacy-fantasy.com';

describe('getSafeRedirectTarget', () => {
  describe('safe same-origin relative paths (preserves legitimate baseUrl)', () => {
    it('returns the app root for "/"', () => {
      expect(getSafeRedirectTarget('/', ORIGIN)).toBe('/');
    });

    it('preserves a PR-preview style base path', () => {
      expect(getSafeRedirectTarget('/pr-preview/1234/', ORIGIN)).toBe(
        '/pr-preview/1234/',
      );
    });

    it('keeps query string and hash on same-origin targets', () => {
      expect(getSafeRedirectTarget('/dashboard?tab=1#top', ORIGIN)).toBe(
        '/dashboard?tab=1#top',
      );
    });

    it('normalizes a same-origin absolute URL to a path-only target', () => {
      expect(
        getSafeRedirectTarget('https://app.legacy-fantasy.com/leagues', ORIGIN),
      ).toBe('/leagues');
    });
  });

  describe('allowlisted absolute URLs', () => {
    it('allows the apex allowlisted host', () => {
      expect(getSafeRedirectTarget('https://legacy-fantasy.com/', ORIGIN)).toBe(
        'https://legacy-fantasy.com/',
      );
    });

    it('allows a subdomain of the allowlisted host', () => {
      expect(
        getSafeRedirectTarget('https://www.legacy-fantasy.com/x', ORIGIN),
      ).toBe('https://www.legacy-fantasy.com/x');
    });

    it('matches the allowlisted host case-insensitively', () => {
      expect(
        getSafeRedirectTarget('https://WWW.LEGACY-FANTASY.COM/x', ORIGIN),
      ).toBe('https://www.legacy-fantasy.com/x');
    });
  });

  describe('rejects untrusted targets (falls back to app root)', () => {
    it('rejects a cross-origin host', () => {
      expect(getSafeRedirectTarget('https://evil.com/', ORIGIN)).toBe('/');
    });

    it('rejects a look-alike host that merely contains the allowed host', () => {
      expect(
        getSafeRedirectTarget('https://legacy-fantasy.com.evil.com/', ORIGIN),
      ).toBe('/');
    });

    it('rejects a host that ends with the allowed host without a dot boundary', () => {
      expect(
        getSafeRedirectTarget('https://notlegacy-fantasy.com/', ORIGIN),
      ).toBe('/');
    });

    it('rejects a protocol-relative target', () => {
      expect(getSafeRedirectTarget('//evil.com/', ORIGIN)).toBe('/');
    });

    it('rejects a backslash-obfuscated protocol-relative target', () => {
      expect(getSafeRedirectTarget('/\\evil.com', ORIGIN)).toBe('/');
    });

    it('rejects the javascript: scheme', () => {
      expect(getSafeRedirectTarget('javascript:alert(1)', ORIGIN)).toBe('/');
    });

    it('rejects the data: scheme', () => {
      expect(
        getSafeRedirectTarget('data:text/html,<script>1</script>', ORIGIN),
      ).toBe('/');
    });
  });

  describe('empty / invalid input', () => {
    it('returns the app root for an empty string', () => {
      expect(getSafeRedirectTarget('', ORIGIN)).toBe('/');
    });

    it('returns the app root for null', () => {
      expect(getSafeRedirectTarget(null, ORIGIN)).toBe('/');
    });

    it('returns the app root for undefined', () => {
      expect(getSafeRedirectTarget(undefined, ORIGIN)).toBe('/');
    });
  });
});
