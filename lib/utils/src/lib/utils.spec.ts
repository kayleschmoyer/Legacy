import {
  cleanDescription,
  extractPlayerNameFromDescription,
  utils,
} from './utils';

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

describe('extractPlayerNameFromDescription', () => {
  it('extracts name from a trade description', () => {
    expect(
      extractPlayerNameFromDescription(
        'Red Sox traded SS Xander Bogaerts to the Padres for prospects.',
      ),
    ).toBe('Xander Bogaerts');
  });

  it('extracts name from a free agent signing', () => {
    expect(
      extractPlayerNameFromDescription(
        'Yankees signed free agent RHP Gerrit Cole.',
      ),
    ).toBe('Gerrit Cole');
  });

  it('extracts name with a position like LHP', () => {
    expect(
      extractPlayerNameFromDescription(
        'Dodgers signed free agent LHP Clayton Kershaw.',
      ),
    ).toBe('Clayton Kershaw');
  });

  it('extracts name ending with "for" clause', () => {
    expect(
      extractPlayerNameFromDescription(
        'Mets traded 1B Pete Alonso for two minor leaguers.',
      ),
    ).toBe('Pete Alonso');
  });

  it('returns null when no pattern matches', () => {
    expect(
      extractPlayerNameFromDescription('Released by the Marlins.'),
    ).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(extractPlayerNameFromDescription('')).toBeNull();
  });
});
