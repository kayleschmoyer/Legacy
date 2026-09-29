import { getAvatarInitial } from './ProfileSettingsPage';

// LS-7231: an empty username (signup / partial load) with a failed avatar image
// rendered an invisible avatar. The fallback chain is username → email → '?'.
describe('getAvatarInitial', () => {
  it('uses the uppercased first letter of the username', () => {
    expect(getAvatarInitial('brad', 'x@example.com')).toBe('B');
  });

  it('falls back to the email initial when the username is empty', () => {
    expect(getAvatarInitial('', 'zed@example.com')).toBe('Z');
  });

  it('treats a whitespace-only username as empty', () => {
    expect(getAvatarInitial('   ', 'zed@example.com')).toBe('Z');
  });

  it('falls back to "?" when both username and email are empty', () => {
    expect(getAvatarInitial('', '')).toBe('?');
    expect(getAvatarInitial('  ', '  ')).toBe('?');
  });
});
