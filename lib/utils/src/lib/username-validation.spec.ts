import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  validateUsername,
} from './username-validation';

describe('validateUsername', () => {
  it('exposes the 3-50 bounds', () => {
    expect(USERNAME_MIN_LENGTH).toBe(3);
    expect(USERNAME_MAX_LENGTH).toBe(50);
  });

  it('rejects a 2-character username', () => {
    expect(validateUsername('ab')).toEqual({ valid: false, reason: 'length' });
  });

  it('accepts a 3-character username', () => {
    expect(validateUsername('abc')).toEqual({ valid: true, username: 'abc' });
  });

  it('accepts a 50-character username', () => {
    const value = 'a'.repeat(50);
    expect(validateUsername(value)).toEqual({ valid: true, username: value });
  });

  it('rejects a 51-character username', () => {
    expect(validateUsername('a'.repeat(51))).toEqual({
      valid: false,
      reason: 'length',
    });
  });

  it('rejects an empty or whitespace-only username as a length failure', () => {
    expect(validateUsername('')).toEqual({ valid: false, reason: 'length' });
    expect(validateUsername('     ')).toEqual({
      valid: false,
      reason: 'length',
    });
  });

  it('trims surrounding whitespace before measuring length', () => {
    expect(validateUsername('  abc  ')).toEqual({
      valid: true,
      username: 'abc',
    });
    expect(validateUsername(`  ${'a'.repeat(50)}  `).valid).toBe(true);
    expect(validateUsername('  ab  ')).toEqual({
      valid: false,
      reason: 'length',
    });
  });

  it('rejects emoji and non-ASCII characters', () => {
    expect(validateUsername('user😀name')).toEqual({
      valid: false,
      reason: 'characters',
    });
    expect(validateUsername('üñïçödé')).toEqual({
      valid: false,
      reason: 'characters',
    });
    expect(validateUsername('日本語のなまえ')).toEqual({
      valid: false,
      reason: 'characters',
    });
  });

  it('rejects interior whitespace and other punctuation', () => {
    expect(validateUsername('user name').valid).toBe(false);
    expect(validateUsername('user@name').valid).toBe(false);
    expect(validateUsername('user\nname').valid).toBe(false);
  });

  it('accepts a leading dot (current rule; tightening it is a separate ticket)', () => {
    expect(validateUsername('.hidden')).toEqual({
      valid: true,
      username: '.hidden',
    });
  });

  it('accepts letters, digits, underscore, hyphen and period', () => {
    expect(validateUsername('A_b-c.9')).toEqual({
      valid: true,
      username: 'A_b-c.9',
    });
  });
});
