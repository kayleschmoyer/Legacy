import {
  DUES_AMOUNT_REQUIRED_MESSAGE,
  DUES_AMOUNT_TOO_HIGH_MESSAGE,
  getDuesAmountError,
  MAX_DUES_CENTS,
} from './league-dues';

describe('league-dues limits (LS-10735)', () => {
  it('caps dues at $10,000, well below the GraphQL Int ceiling', () => {
    expect(MAX_DUES_CENTS).toBe(1_000_000);
    expect(MAX_DUES_CENTS).toBeLessThan(2 ** 31 - 1);
  });

  it.each([1, 1235, MAX_DUES_CENTS])('accepts %i cents', (cents) => {
    expect(getDuesAmountError(cents)).toBeNull();
  });

  it.each([0, -100, NaN])('requires a positive amount (%p)', (cents) => {
    expect(getDuesAmountError(cents)).toBe(DUES_AMOUNT_REQUIRED_MESSAGE);
  });

  it.each([MAX_DUES_CENTS + 1, 99_999_999_900, Infinity])(
    'rejects %i cents as over the max',
    (cents) => {
      expect(getDuesAmountError(cents)).toBe(DUES_AMOUNT_TOO_HIGH_MESSAGE);
    },
  );
});
