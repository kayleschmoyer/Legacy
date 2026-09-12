import {
  cleanDescription,
  extractPlayerNameFromDescription,
  mapWithConcurrency,
  stripDiacritics,
  utils,
} from './utils';

describe('utils', () => {
  it('should work', () => {
    expect(utils()).toEqual('utils');
  });
});

describe('mapWithConcurrency', () => {
  it('returns results in input order regardless of completion order', async () => {
    const items = [30, 10, 20];
    const result = await mapWithConcurrency(items, 2, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(result).toEqual([30, 10, 20]);
  });

  it('never runs more than `concurrency` calls at once', async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    let inFlight = 0;
    let maxInFlight = 0;

    await mapWithConcurrency(items, 3, async (i) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight--;
      return i;
    });

    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it('returns an empty array for an empty input without calling fn', async () => {
    const fn = jest.fn();
    const result = await mapWithConcurrency([], 3, fn);
    expect(result).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('caps effective concurrency at the item count', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await mapWithConcurrency([1, 2], 10, fn);
    expect(result).toEqual(['ok', 'ok']);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('propagates a rejection from fn', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, (i) => {
        if (i === 2) return Promise.reject(new Error('boom'));
        return Promise.resolve(i);
      }),
    ).rejects.toThrow('boom');
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

describe('stripDiacritics', () => {
  it('strips accents from a Spanish player name', () => {
    expect(stripDiacritics('José Ramírez')).toBe('Jose Ramirez');
  });

  it('strips the ñ from a name', () => {
    expect(stripDiacritics('Adolis García Muñoz')).toBe('Adolis Garcia Munoz');
  });

  it('handles uppercase accented letters', () => {
    expect(stripDiacritics('ÀÉÎÕÜÇ')).toBe('AEIOUC');
  });

  it('leaves a plain ASCII string unchanged', () => {
    expect(stripDiacritics('Mike Trout')).toBe('Mike Trout');
  });

  it('returns an empty string unchanged', () => {
    expect(stripDiacritics('')).toBe('');
  });

  it('reproduces the canonical-name swap that crashed on Hermes (LS-7946)', () => {
    // The widget swaps an ASCII-rendered name in a description back to the
    // accented canonical name. stripDiacritics replaces the unsupported
    // String.prototype.normalize used previously.
    const canonical = 'José Abreu';
    const ascii = stripDiacritics(canonical);
    expect(ascii).toBe('Jose Abreu');
    expect('Signed Jose Abreu as a free agent.'.replace(ascii, canonical)).toBe(
      'Signed José Abreu as a free agent.',
    );
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
