import {
  generateResetToken,
  hashResetToken,
  RESET_TOKEN_TTL_MS,
  resetTokenExpiry,
} from './password-reset';

describe('password-reset token helpers', () => {
  it('hashes a raw token to a 64-char hex SHA-256 digest', () => {
    const hash = hashResetToken('some-raw-token');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes deterministically', () => {
    expect(hashResetToken('abc')).toBe(hashResetToken('abc'));
    expect(hashResetToken('abc')).not.toBe(hashResetToken('abd'));
  });

  it('generates a unique raw token whose hash matches hashResetToken', () => {
    const a = generateResetToken();
    const b = generateResetToken();

    expect(a.rawToken).not.toBe(b.rawToken);
    expect(a.tokenHash).toBe(hashResetToken(a.rawToken));
    // URL-safe base64 (no +, /, or = padding) so it is safe in a query string.
    expect(a.rawToken).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('computes the expiry as now + TTL', () => {
    const now = new Date('2026-06-07T00:00:00.000Z');
    const expiry = resetTokenExpiry(now);
    expect(expiry.getTime()).toBe(now.getTime() + RESET_TOKEN_TTL_MS);
  });
});
