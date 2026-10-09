import { isTrustedAvatarUrl } from './trusted-avatar-url';

describe('isTrustedAvatarUrl', () => {
  it.each([
    'https://legacy-fantasy.com/avatars/a.png',
    'https://app.legacy-fantasy.com/avatars/a.png',
    'https://lh3.googleusercontent.com/a/photo=s96-c',
    `${window.location.origin}/avatars/a.png`,
  ])('accepts %s', (url) => {
    expect(isTrustedAvatarUrl(url)).toBe(true);
  });

  it.each([
    'https://attacker.example.com/p.gif',
    'https://legacy-fantasy.com.attacker.example/p.gif',
    'https://evil-legacy-fantasy.com/p.gif',
    'http://legacy-fantasy.com/a.png',
    'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    'not a url',
    '',
    null,
    undefined,
  ])('rejects %s', (url) => {
    expect(isTrustedAvatarUrl(url)).toBe(false);
  });
});
