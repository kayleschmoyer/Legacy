import { GraphQLError } from 'graphql';
import { validateBrandingUrl } from './validate-branding-url';

describe('validateBrandingUrl', () => {
  it('returns undefined when the field is omitted (skip, leave unchanged)', () => {
    expect(validateBrandingUrl(undefined, 'avatarUrl')).toBeUndefined();
  });

  it('returns null when the field is explicitly cleared', () => {
    expect(validateBrandingUrl(null, 'avatarUrl')).toBeNull();
    expect(validateBrandingUrl('', 'avatarUrl')).toBeNull();
    expect(validateBrandingUrl('   ', 'avatarUrl')).toBeNull();
  });

  it('returns the trimmed URL when valid', () => {
    expect(
      validateBrandingUrl('  https://example.com/logo.png  ', 'avatarUrl'),
    ).toBe('https://example.com/logo.png');
  });

  // LS-6043: previously the client only checked /^https:\/\//i, which passes
  // URLs the server rejects (e.g. embedded credentials). These cases document
  // the drift the ticket reported, now enforced identically on both sides.
  it('rejects a URL that merely starts with https:// but embeds credentials', () => {
    expect(() =>
      validateBrandingUrl('https://attacker.com:80@evil.com/path', 'avatarUrl'),
    ).toThrow('avatarUrl must not contain credentials');
  });

  it('rejects non-HTTPS protocols', () => {
    expect(() =>
      validateBrandingUrl('http://example.com/logo.png', 'avatarUrl'),
    ).toThrow('avatarUrl must use HTTPS');
  });

  it('rejects malformed URLs', () => {
    expect(() => validateBrandingUrl('not a url', 'avatarUrl')).toThrow(
      'avatarUrl must be a valid URL',
    );
  });

  it('rejects URLs longer than 2048 characters', () => {
    const longUrl = `https://example.com/${'a'.repeat(2048)}`;
    expect(() => validateBrandingUrl(longUrl, 'avatarUrl')).toThrow(
      'avatarUrl URL is too long (max 2048 chars)',
    );
  });

  it.each([
    ['localhost', 'https://localhost/logo.png'],
    ['loopback IPv4', 'https://127.0.0.1/logo.png'],
    ['private 10.x', 'https://10.0.0.5/logo.png'],
    ['private 192.168.x', 'https://192.168.1.1/logo.png'],
    ['AWS metadata service', 'https://169.254.169.254/logo.png'],
    ['IPv6 loopback', 'https://[::1]/logo.png'],
  ])('rejects %s as an SSRF-blocked host', (_label, url) => {
    expect(() => validateBrandingUrl(url, 'avatarUrl')).toThrow(
      'avatarUrl must be a public URL',
    );
  });

  it('rejects bare IPv4 addresses even when public', () => {
    expect(() =>
      validateBrandingUrl('https://8.8.8.8/logo.png', 'avatarUrl'),
    ).toThrow('avatarUrl must use a domain name, not an IP address');
  });

  it('throws a client-facing UserInputError (BAD_USER_INPUT), not a masked internal error', () => {
    try {
      validateBrandingUrl('http://example.com/logo.png', 'avatarUrl');
      throw new Error('expected validateBrandingUrl to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(GraphQLError);
      expect((err as GraphQLError).extensions).toMatchObject({
        code: 'BAD_USER_INPUT',
      });
    }
  });
});
