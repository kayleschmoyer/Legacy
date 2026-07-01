import { safeCssColor } from './safeCssColor';

describe('safeCssColor', () => {
  it('returns undefined for null/undefined/empty', () => {
    expect(safeCssColor(null)).toBeUndefined();
    expect(safeCssColor(undefined)).toBeUndefined();
    expect(safeCssColor('')).toBeUndefined();
  });

  it('allows hex colors', () => {
    expect(safeCssColor('#abc')).toBe('#abc');
    expect(safeCssColor('#aabbcc')).toBe('#aabbcc');
    expect(safeCssColor('#aabbccdd')).toBe('#aabbccdd');
  });

  it('allows rgb/rgba', () => {
    expect(safeCssColor('rgb(255, 0, 0)')).toBe('rgb(255, 0, 0)');
    expect(safeCssColor('rgba(0,0,0,0.5)')).toBe('rgba(0,0,0,0.5)');
  });

  it('allows hsl/hsla', () => {
    expect(safeCssColor('hsl(120, 100%, 50%)')).toBe('hsl(120, 100%, 50%)');
    expect(safeCssColor('hsla(120,100%,50%,0.5)')).toBe(
      'hsla(120,100%,50%,0.5)',
    );
  });

  it('allows named colors', () => {
    expect(safeCssColor('red')).toBe('red');
    expect(safeCssColor('transparent')).toBe('transparent');
  });

  it('blocks CSS injection payloads', () => {
    expect(safeCssColor('expression(alert(1))')).toBeUndefined();
    expect(safeCssColor('url(javascript:alert(1))')).toBeUndefined();
    expect(safeCssColor('#fff; background: red')).toBeUndefined();
  });

  it('trims whitespace', () => {
    expect(safeCssColor('  #abc  ')).toBe('#abc');
  });
});
