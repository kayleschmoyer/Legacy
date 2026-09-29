import { validateAvatarUrl } from './validate-avatar-url';

describe('validateAvatarUrl', () => {
  afterEach(() => {
    delete process.env['AVATAR_URL_ALLOWED_HOSTS'];
  });

  it('clears the avatar for null / undefined / blank', () => {
    expect(validateAvatarUrl(null)).toBeNull();
    expect(validateAvatarUrl(undefined)).toBeNull();
    expect(validateAvatarUrl('  ')).toBeNull();
  });

  it('accepts preset URLs on the app origin and its subdomains', () => {
    expect(
      validateAvatarUrl('https://legacy-fantasy.com/presets/avatar-ninja.png'),
    ).toBe('https://legacy-fantasy.com/presets/avatar-ninja.png');
    expect(
      validateAvatarUrl('https://dev.legacy-fantasy.com/presets/a.png'),
    ).toBe('https://dev.legacy-fantasy.com/presets/a.png');
  });

  it('rejects hosts that are not on the allowlist (tracking pixel)', () => {
    expect(() =>
      validateAvatarUrl('https://attacker.example.com/track.gif?u=1'),
    ).toThrow('avatarUrl host is not allowed');
  });

  it('rejects look-alike hosts', () => {
    expect(() =>
      validateAvatarUrl('https://notlegacy-fantasy.com/a.png'),
    ).toThrow('avatarUrl host is not allowed');
    expect(() =>
      validateAvatarUrl('https://legacy-fantasy.com.evil.com/a.png'),
    ).toThrow('avatarUrl host is not allowed');
  });

  it('rejects data:, javascript:, and http: URLs', () => {
    expect(() => validateAvatarUrl('data:image/png;base64,AAAA')).toThrow(
      'avatarUrl must use HTTPS',
    );
    expect(() => validateAvatarUrl('javascript:alert(1)')).toThrow(
      'avatarUrl must use HTTPS',
    );
    expect(() => validateAvatarUrl('http://legacy-fantasy.com/a.png')).toThrow(
      'avatarUrl must use HTTPS',
    );
  });

  it('rejects embedded credentials and over-long URLs', () => {
    expect(() =>
      validateAvatarUrl('https://legacy-fantasy.com@evil.com/a.png'),
    ).toThrow('avatarUrl must not contain credentials');
    expect(() =>
      validateAvatarUrl(`https://legacy-fantasy.com/${'a'.repeat(2048)}`),
    ).toThrow('too long');
  });

  it('honors extra hosts from AVATAR_URL_ALLOWED_HOSTS', () => {
    process.env['AVATAR_URL_ALLOWED_HOSTS'] = 'cdn.example.net, other.org';
    expect(validateAvatarUrl('https://cdn.example.net/a.png')).toBe(
      'https://cdn.example.net/a.png',
    );
    expect(validateAvatarUrl('https://x.other.org/a.png')).toBe(
      'https://x.other.org/a.png',
    );
  });
});
