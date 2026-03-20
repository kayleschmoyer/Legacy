import { cleanDescription, utils } from './utils';

describe('utils', () => {
  it('should work', () => {
    expect(utils()).toEqual('utils');
  });
});

describe('cleanDescription', () => {
  it('strips trailing ", and." from a description', () => {
    expect(cleanDescription('Signed by the Red Sox, and.')).toBe(
      'Signed by the Red Sox.',
    );
  });

  it('strips trailing ", , , , and." with multiple empty fields', () => {
    expect(cleanDescription('Traded to the Yankees, , , ,  and.')).toBe(
      'Traded to the Yankees.',
    );
  });

  it('strips trailing ",  and." with extra whitespace', () => {
    expect(cleanDescription('Released by the Cubs,  and.')).toBe(
      'Released by the Cubs.',
    );
  });

  it('returns a normal description unchanged', () => {
    const desc = 'Signed as a free agent by the Dodgers.';
    expect(cleanDescription(desc)).toBe(desc);
  });

  it('returns an empty string unchanged', () => {
    expect(cleanDescription('')).toBe('');
  });

  it('does not strip "and" when it is part of the sentence', () => {
    const desc = 'Traded to the Cubs for Smith and Jones.';
    expect(cleanDescription(desc)).toBe(desc);
  });
});
