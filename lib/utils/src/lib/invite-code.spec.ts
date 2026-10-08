import { INVITE_CODE_LENGTH, normalizeInviteCode } from './invite-code';

describe('normalizeInviteCode (LS-10652)', () => {
  it('trims surrounding whitespace from a pasted code', () => {
    expect(normalizeInviteCode('  LHTCJ9ZZ  ')).toBe('LHTCJ9ZZ');
  });

  it('removes internal spaces and dashes', () => {
    expect(normalizeInviteCode('LHTC J9ZZ')).toBe('LHTCJ9ZZ');
    expect(normalizeInviteCode('LHTC-J9ZZ')).toBe('LHTCJ9ZZ');
  });

  it('upper-cases the code', () => {
    expect(normalizeInviteCode('lhtcj9zz')).toBe('LHTCJ9ZZ');
  });

  it(`caps the result at ${INVITE_CODE_LENGTH} characters`, () => {
    expect(normalizeInviteCode('LHTCJ9ZZEXTRA')).toBe('LHTCJ9ZZ');
  });

  it('leaves a partial code partial', () => {
    expect(normalizeInviteCode(' abc ')).toBe('ABC');
    expect(normalizeInviteCode('')).toBe('');
  });
});
