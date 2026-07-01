import { normalizeTeamColor } from './useTeamBranding';

describe('normalizeTeamColor (LS-5964)', () => {
  it('returns fallback for null/undefined/empty', () => {
    expect(normalizeTeamColor(null, '#1B3A5C')).toBe('#1B3A5C');
    expect(normalizeTeamColor(undefined, '#1B3A5C')).toBe('#1B3A5C');
    expect(normalizeTeamColor('', '#1B3A5C')).toBe('#1B3A5C');
  });

  it('uppercases well-formed #RRGGBB values', () => {
    expect(normalizeTeamColor('#ff0000', '#000000')).toBe('#FF0000');
    expect(normalizeTeamColor('#1b3a5c', '#000000')).toBe('#1B3A5C');
    expect(normalizeTeamColor('#AABBCC', '#000000')).toBe('#AABBCC');
  });

  it('coerces bare 6-char hex to #-prefixed', () => {
    expect(normalizeTeamColor('FF0000', '#000000')).toBe('#FF0000');
    expect(normalizeTeamColor('1b3a5c', '#000000')).toBe('#1B3A5C');
    expect(normalizeTeamColor('aabbcc', '#000000')).toBe('#AABBCC');
  });

  it('coerces bare 3-char hex to #-prefixed', () => {
    expect(normalizeTeamColor('F00', '#000000')).toBe('#F00');
    expect(normalizeTeamColor('abc', '#000000')).toBe('#ABC');
  });

  it('passes through CSS named colors unchanged', () => {
    expect(normalizeTeamColor('red', '#000000')).toBe('red');
    expect(normalizeTeamColor('transparent', '#000000')).toBe('transparent');
  });

  it('passes through non-hex strings unchanged (no injection)', () => {
    expect(normalizeTeamColor('url(evil)', '#000000')).toBe('url(evil)');
  });
});
