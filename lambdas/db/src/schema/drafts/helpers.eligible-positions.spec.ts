/**
 * Unit tests for eligibleStatPositionsForUnfilledSlots (LS-8065).
 *
 * This pure helper is the core of the draft-board pickability fix: it maps a
 * team's still-open league position slot types to the player stat positions
 * that satisfy at least one of them. A player whose eligible positions
 * intersect this set "meets a requirement" and stays on the board; a player
 * who doesn't is hidden.
 */

import { eligibleStatPositionsForUnfilledSlots } from './helpers';

describe('eligibleStatPositionsForUnfilledSlots (LS-8065)', () => {
  it('returns an empty list when no slots are unfilled', () => {
    // Empty unfilled list ⇒ no positional predicate ⇒ board stays unfiltered.
    expect(eligibleStatPositionsForUnfilledSlots([])).toEqual([]);
  });

  it('maps a pitcher slot to the pitcher stat positions (incl. generic P)', () => {
    // Only an SP slot left ⇒ only pitchers meet a requirement; hitters hidden.
    expect(eligibleStatPositionsForUnfilledSlots(['SP'])).toEqual(['SP', 'P']);
  });

  it('maps a single-position slot to exactly that stat position', () => {
    expect(eligibleStatPositionsForUnfilledSlots(['C'])).toEqual(['C']);
  });

  it('expands a utility/flex slot to all positions it accepts', () => {
    expect(eligibleStatPositionsForUnfilledSlots(['OF'])).toEqual([
      'LF',
      'RF',
      'CF',
      'OF',
    ]);
  });

  it('de-duplicates positions shared across multiple unfilled slots', () => {
    // SP and RP both include the generic 'P' — it must appear only once.
    expect(eligibleStatPositionsForUnfilledSlots(['SP', 'RP'])).toEqual([
      'SP',
      'P',
      'RP',
    ]);
  });

  it('unions positions across mixed slot types', () => {
    expect(eligibleStatPositionsForUnfilledSlots(['C', 'SP'])).toEqual([
      'C',
      'SP',
      'P',
    ]);
  });

  it('contributes no positions for slot types absent from the mapping', () => {
    // Mirrors the auto-pick helper: a slot type it can't map can't be filled.
    expect(eligibleStatPositionsForUnfilledSlots(['NOT_A_SLOT'])).toEqual([]);
  });
});
