import {
  formatDelta,
  formatNetValue,
  NO_VALUE,
  pickValue,
  signatureStat,
  teamInitials,
  teamNetValue,
  tintBand,
} from './valueHeat';
import type { DraftPlayer } from './types';

const pick = (overallPick: number, adp: number | null | undefined) => ({
  overallPick,
  adp,
});

describe('pickValue', () => {
  it('is the overall pick number minus the consensus rank', () => {
    // Consensus #1 taken at pick 5 — fell four slots.
    expect(pickValue(pick(5, 1))).toBe(4);
    // Consensus #30 taken at pick 5 — a 25-slot reach.
    expect(pickValue(pick(5, 30))).toBe(-25);
    expect(pickValue(pick(12, 12))).toBe(0);
  });

  it('is null when the consensus rank is missing', () => {
    // adp is nullable and real historical ADP data isn't collected yet, so
    // both spellings of "absent" have to survive.
    expect(pickValue(pick(5, null))).toBeNull();
    expect(pickValue(pick(5, undefined))).toBeNull();
  });

  it('is null rather than NaN for a non-finite rank', () => {
    expect(pickValue(pick(5, Number.NaN))).toBeNull();
    expect(pickValue(pick(5, Number.POSITIVE_INFINITY))).toBeNull();
  });
});

describe('tintBand', () => {
  it('uses thresholds of 6 and 14, not the prototype legend’s 8', () => {
    // The boundaries themselves are the interesting cases: 6 and 14 tint, 5
    // and 13 do not escalate. The option-C legend claimed "8+", which matched
    // neither branch — this test pins the real numbers.
    expect(tintBand(5)).toBe(0);
    expect(tintBand(6)).toBe(2);
    expect(tintBand(13)).toBe(2);
    expect(tintBand(14)).toBe(3);
    expect(tintBand(40)).toBe(3);
  });

  it('is symmetric for reaches', () => {
    expect(tintBand(-5)).toBe(0);
    expect(tintBand(-6)).toBe(-2);
    expect(tintBand(-13)).toBe(-2);
    expect(tintBand(-14)).toBe(-3);
    expect(tintBand(-40)).toBe(-3);
  });

  it('applies no tint when the value is unknown', () => {
    expect(tintBand(null)).toBe(0);
  });

  it('applies no tint at exactly zero', () => {
    expect(tintBand(0)).toBe(0);
  });
});

describe('formatDelta', () => {
  it('signs the number in both directions', () => {
    expect(formatDelta(4)).toBe('+4');
    expect(formatDelta(-25)).toBe('-25');
    expect(formatDelta(0)).toBe('0');
  });

  it('renders an em dash when the value is unknown', () => {
    // Not "0", and not "+0": an unknown rank must never read as a pick made
    // exactly on consensus.
    expect(formatDelta(null)).toBe(NO_VALUE);
    expect(formatDelta(null)).not.toBe('0');
  });
});

describe('teamNetValue', () => {
  it('sums the values of ranked picks', () => {
    expect(teamNetValue([pick(5, 1), pick(20, 30), pick(31, 25)])).toBe(
      4 + -10 + 6,
    );
  });

  it('excludes picks with no consensus rank from the total', () => {
    const withUnranked = teamNetValue([
      pick(5, 1),
      pick(9, null),
      pick(31, 25),
    ]);
    const withoutUnranked = teamNetValue([pick(5, 1), pick(31, 25)]);

    expect(withUnranked).toBe(withoutUnranked);
    expect(withUnranked).toBe(10);
  });

  it('does not treat a missing rank as a zero-value pick', () => {
    // The trap this guards: `overallPick - (adp ?? 0)` would score this pick
    // as +9 and inflate the team's total by the pick number itself.
    expect(teamNetValue([pick(9, null)])).toBe(0);
    expect(teamNetValue([pick(9, undefined)])).toBe(0);
  });

  it('is zero for a team with no picks at all', () => {
    expect(teamNetValue([])).toBe(0);
  });
});

describe('formatNetValue', () => {
  it('signs positive totals and leaves zero unsigned', () => {
    expect(formatNetValue(18)).toBe('+18');
    expect(formatNetValue(-7)).toBe('-7');
    expect(formatNetValue(0)).toBe('0');
  });
});

describe('teamInitials', () => {
  it('takes the first letter of each word', () => {
    expect(teamInitials('Sandlot Dreamers')).toBe('SD');
    expect(teamInitials('Chi-Town')).toBe('C');
  });

  it('tolerates extra whitespace and caps the length', () => {
    expect(teamInitials('  Iron   Horse  Club ')).toBe('IHC');
    expect(teamInitials('a b c d e f')).toBe('ABCD');
  });
});

describe('signatureStat', () => {
  const hitter = (overrides: Partial<DraftPlayer> = {}): DraftPlayer => ({
    id: 1,
    name: 'Babe Ruth',
    position: 'OF',
    avg: 0.342,
    hr: 714,
    rbi: 2214,
    runs: 2174,
    sb: 123,
    games: 2503,
    hits: 2873,
    obp: 0.474,
    slg: 0.69,
    ...overrides,
  });

  it('picks the position-preferred stat for a hitter', () => {
    expect(signatureStat(hitter(), 'baseball')).toEqual({
      label: 'HR',
      value: '714',
    });
  });

  it('leads a pitcher with ERA rather than a hitter column', () => {
    const pitcher = hitter({
      name: 'Cy Young',
      position: 'P',
      isPitcher: true,
      era: 2.63,
      strikeouts: 2803,
      hr: 0,
    });
    expect(signatureStat(pitcher, 'baseball')).toEqual({
      label: 'ERA',
      value: '2.63',
    });
  });

  it('falls back down the pitcher chain when ERA is absent', () => {
    const pitcher = hitter({
      position: 'P',
      isPitcher: true,
      era: undefined,
      strikeouts: 2803,
    });
    expect(signatureStat(pitcher, 'baseball')).toEqual({
      label: 'K',
      value: '2803',
    });
  });

  it('returns null when the player is unknown', () => {
    // The cell omits the element entirely rather than rendering a second em
    // dash next to the one an unknown rank already shows.
    expect(signatureStat(undefined, 'baseball')).toBeNull();
  });
});
