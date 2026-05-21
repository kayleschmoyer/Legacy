/**
 * Unit tests for the rosterUtils helpers.
 *
 * `isEligibleForSlot` is the source of truth for the MatchupRosterEditorView
 * pre-mutation guard added in LS-4036. Keeping these tests tight and pure
 * means the regression surface for "batter dropped into a pitcher slot" is
 * locked down even though the Tamagui-driven view interactions are hard to
 * drive from JSDOM.
 */
import { isEligibleForSlot, isPitcherPositionType } from './rosterUtils';

describe('isEligibleForSlot (LS-4036)', () => {
  it('returns true when the slot type appears in the eligible list', () => {
    expect(isEligibleForSlot(['SP'], 'SP')).toBe(true);
    expect(isEligibleForSlot(['C', '1B'], '1B')).toBe(true);
  });

  it('is case-insensitive on both sides', () => {
    expect(isEligibleForSlot(['sp'], 'SP')).toBe(true);
    expect(isEligibleForSlot(['SP'], 'sp')).toBe(true);
  });

  it('returns false when the slot type is not in the eligible list', () => {
    // The bug from the ticket: batter dropped into a pitcher slot.
    expect(isEligibleForSlot(['C', '1B'], 'SP')).toBe(false);
    expect(isEligibleForSlot(['SP'], 'C')).toBe(false);
  });

  it('returns false for missing or empty eligibility lists against a starter slot', () => {
    expect(isEligibleForSlot(null, 'SP')).toBe(false);
    expect(isEligibleForSlot(undefined, 'SP')).toBe(false);
    expect(isEligibleForSlot([], 'SP')).toBe(false);
  });

  it('treats a null/empty slot type as always allowed (moving to bench)', () => {
    expect(isEligibleForSlot(['C'], null)).toBe(true);
    expect(isEligibleForSlot(null, null)).toBe(true);
    expect(isEligibleForSlot([], undefined)).toBe(true);
  });
});

describe('isPitcherPositionType', () => {
  it('identifies SP and RP as pitching slots', () => {
    expect(isPitcherPositionType('SP')).toBe(true);
    expect(isPitcherPositionType('RP')).toBe(true);
    expect(isPitcherPositionType('sp')).toBe(true);
  });

  it('returns false for batter slots', () => {
    expect(isPitcherPositionType('C')).toBe(false);
    expect(isPitcherPositionType('1B')).toBe(false);
    expect(isPitcherPositionType('OF')).toBe(false);
  });
});
