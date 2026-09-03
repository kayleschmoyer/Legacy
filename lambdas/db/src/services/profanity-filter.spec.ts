import { detectProfanity } from './profanity-filter';

describe('detectProfanity', () => {
  it('returns false for empty or whitespace-only text', () => {
    expect(detectProfanity('')).toBe(false);
    expect(detectProfanity('   ')).toBe(false);
  });

  it('returns false for clean text', () => {
    expect(detectProfanity('Good luck this week!')).toBe(false);
    expect(detectProfanity('go Wolfpack')).toBe(false);
  });

  it('returns true for text containing a profane word', () => {
    expect(detectProfanity('you fucking idiot')).toBe(true);
    expect(detectProfanity('this is bullshit')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(detectProfanity('FUCK this')).toBe(true);
    expect(detectProfanity('FuCk this')).toBe(true);
  });

  it('matches whole words only, not substrings (Scunthorpe problem)', () => {
    expect(detectProfanity('this class is a great assessment')).toBe(false);
    expect(detectProfanity('the pass rate was high')).toBe(false);
  });

  it('matches a profane word at a string boundary', () => {
    expect(detectProfanity('shit.')).toBe(true);
    expect(detectProfanity('(shit)')).toBe(true);
  });
});
