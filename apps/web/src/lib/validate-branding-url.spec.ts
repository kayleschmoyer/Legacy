import { validateBrandingUrl } from './validate-branding-url';

describe('validateBrandingUrl', () => {
  it('returns null for a valid HTTPS URL', () => {
    expect(
      validateBrandingUrl('https://example.com/logo.png', 'Avatar'),
    ).toBeNull();
  });

  // LS-6043: the old client check was `/^https:\/\//i.test(...)`, which
  // passes this URL even though the server rejects it (embedded
  // credentials — a classic host-confusion vector). The client must now
  // reject anything the server would reject, with the same reason.
  it('rejects a URL that merely starts with https:// but embeds credentials', () => {
    expect(
      validateBrandingUrl('https://attacker.com:80@evil.com/path', 'Avatar'),
    ).toBe('Avatar URL must not contain credentials');
  });

  it('rejects non-HTTPS protocols', () => {
    expect(validateBrandingUrl('http://example.com/logo.png', 'Avatar')).toBe(
      'Avatar URL must use HTTPS',
    );
  });

  it('rejects malformed URLs', () => {
    expect(validateBrandingUrl('not a url', 'Banner')).toBe(
      'Banner URL must be a valid URL',
    );
  });

  it('rejects URLs longer than 2048 characters', () => {
    const longUrl = `https://example.com/${'a'.repeat(2048)}`;
    expect(validateBrandingUrl(longUrl, 'Avatar')).toBe(
      'Avatar URL is too long (max 2048 characters)',
    );
  });

  it.each([
    ['localhost', 'https://localhost/logo.png'],
    ['loopback IPv4', 'https://127.0.0.1/logo.png'],
    ['private 10.x', 'https://10.0.0.5/logo.png'],
    ['private 192.168.x', 'https://192.168.1.1/logo.png'],
    ['AWS metadata service', 'https://169.254.169.254/logo.png'],
  ])('rejects %s as an SSRF-blocked host', (_label, url) => {
    expect(validateBrandingUrl(url, 'Avatar')).toBe(
      'Avatar URL must be a public URL',
    );
  });

  it('rejects bare IPv4 addresses even when public', () => {
    expect(validateBrandingUrl('https://8.8.8.8/logo.png', 'Avatar')).toBe(
      'Avatar URL must use a domain name, not an IP address',
    );
  });
});
