import { maskEmail } from './email';

describe('maskEmail', () => {
  it('keeps the first local-part character and the full domain', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('j***@example.com');
  });

  it('fully masks a single-character local part', () => {
    expect(maskEmail('a@example.com')).toBe('***@example.com');
  });

  it('returns *** when there is no domain', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });

  it('returns *** for an empty string', () => {
    expect(maskEmail('')).toBe('***');
  });
});
