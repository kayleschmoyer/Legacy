import { parsePlayerIds } from './deriveFootballSeasonStats';

describe('parsePlayerIds', () => {
  it('accepts comma- and space-separated ids and de-duplicates them', () => {
    expect(parsePlayerIds('12,34 56,,12')).toEqual([12, 34, 56]);
  });

  it('rejects anything that is not a positive integer id', () => {
    expect(() => parsePlayerIds('12,abc')).toThrow('Invalid player id: "abc"');
    expect(() => parsePlayerIds('0')).toThrow('Invalid player id: "0"');
    expect(() => parsePlayerIds('1.5')).toThrow('Invalid player id: "1.5"');
  });
});
