/**
 * LS-8068: drag-to-draft slot eligibility.
 *
 * Verifies the rail display-slot codes map onto the canonical position
 * eligibility table, including the display-only codes (baseball P / UTIL,
 * football DEF) and the "no classification = defer to server" rule.
 */
import { isPlayerEligibleForSlot } from './draftDnd';

describe('isPlayerEligibleForSlot — baseball', () => {
  it('matches an exact infield position', () => {
    expect(isPlayerEligibleForSlot('baseball', 'SS', ['SS'])).toBe(true);
    expect(isPlayerEligibleForSlot('baseball', '1B', ['1B', '3B'])).toBe(true);
  });

  it('rejects a position the player is not eligible for', () => {
    expect(isPlayerEligibleForSlot('baseball', 'SS', ['1B'])).toBe(false);
    expect(isPlayerEligibleForSlot('baseball', 'C', ['OF'])).toBe(false);
  });

  it('accepts any outfield variant into the OF slot', () => {
    expect(isPlayerEligibleForSlot('baseball', 'OF', ['CF'])).toBe(true);
    expect(isPlayerEligibleForSlot('baseball', 'OF', ['LF', 'RF'])).toBe(true);
    expect(isPlayerEligibleForSlot('baseball', 'OF', ['1B'])).toBe(false);
  });

  it('treats the P slot as any pitching position', () => {
    expect(isPlayerEligibleForSlot('baseball', 'P', ['SP'])).toBe(true);
    expect(isPlayerEligibleForSlot('baseball', 'P', ['RP'])).toBe(true);
    expect(isPlayerEligibleForSlot('baseball', 'P', ['P'])).toBe(true);
    expect(isPlayerEligibleForSlot('baseball', 'P', ['SS'])).toBe(false);
  });

  it('treats the UTIL (U) slot as any batter but not a pure pitcher', () => {
    expect(isPlayerEligibleForSlot('baseball', 'U', ['1B'])).toBe(true);
    expect(isPlayerEligibleForSlot('baseball', 'U', ['C'])).toBe(true);
    expect(isPlayerEligibleForSlot('baseball', 'U', ['SP'])).toBe(false);
  });
});

describe('isPlayerEligibleForSlot — football', () => {
  it('matches exact skill positions and FLEX', () => {
    expect(isPlayerEligibleForSlot('football', 'QB', ['QB'])).toBe(true);
    expect(isPlayerEligibleForSlot('football', 'FLEX', ['RB'])).toBe(true);
    expect(isPlayerEligibleForSlot('football', 'FLEX', ['QB'])).toBe(false);
  });

  it('maps the DEF display slot onto DST eligibility', () => {
    expect(isPlayerEligibleForSlot('football', 'DEF', ['DST'])).toBe(true);
    expect(isPlayerEligibleForSlot('football', 'DEF', ['QB'])).toBe(false);
  });
});

describe('isPlayerEligibleForSlot — fallbacks', () => {
  it('defers to the server when the player has no classification data', () => {
    expect(isPlayerEligibleForSlot('baseball', 'SS', [])).toBe(true);
    expect(isPlayerEligibleForSlot('baseball', 'SS', undefined)).toBe(true);
    expect(isPlayerEligibleForSlot('baseball', 'SS', null)).toBe(true);
  });

  it('rejects an unknown slot code for a classified player', () => {
    expect(isPlayerEligibleForSlot('baseball', 'ZZ', ['SS'])).toBe(false);
  });
});
