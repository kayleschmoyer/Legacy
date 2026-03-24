import { formatDisplayName } from './formatDisplayName';

describe('formatDisplayName', () => {
  it('strips domain from email addresses', () => {
    expect(formatDisplayName('schmoyer21@gmail.com')).toBe('schmoyer21');
    expect(formatDisplayName('user@example.co.uk')).toBe('user');
  });

  it('preserves non-email usernames', () => {
    expect(formatDisplayName('john_doe')).toBe('john_doe');
    expect(formatDisplayName('Manager')).toBe('Manager');
    expect(formatDisplayName('')).toBe('');
  });

  it('preserves usernames with @ but no valid domain', () => {
    expect(formatDisplayName('user@')).toBe('user@');
    expect(formatDisplayName('@domain')).toBe('@domain');
    expect(formatDisplayName('user@nodot')).toBe('user@nodot');
  });
});
