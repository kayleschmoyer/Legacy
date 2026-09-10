/**
 * Unit coverage for the slot-eligibility decision rule (LS-6427).
 *
 * `canFillSlot` is the pure half of the server-side gate — no DB, no league
 * lookup, just "may a player eligible at these positions fill this slot in
 * this sport". The wiring around it (sport resolution, slot-code resolution,
 * per-sport eligibility views, the thrown error) is covered against real
 * PostgreSQL in `teams/position-eligibility.db.spec.ts`.
 */
import { canFillSlot } from './position-eligibility';

describe('canFillSlot', () => {
  describe('football', () => {
    it('accepts RB, WR, and TE into FLEX', () => {
      expect(canFillSlot(['RB'], 'FLEX', 'football')).toBe(true);
      expect(canFillSlot(['WR'], 'FLEX', 'football')).toBe(true);
      expect(canFillSlot(['TE'], 'FLEX', 'football')).toBe(true);
    });

    it('rejects QB, K, and DST from FLEX', () => {
      expect(canFillSlot(['QB'], 'FLEX', 'football')).toBe(false);
      expect(canFillSlot(['K'], 'FLEX', 'football')).toBe(false);
      expect(canFillSlot(['DST'], 'FLEX', 'football')).toBe(false);
    });

    it('rejects a kicker from a QB slot and a QB from a K slot', () => {
      expect(canFillSlot(['K'], 'QB', 'football')).toBe(false);
      expect(canFillSlot(['QB'], 'K', 'football')).toBe(false);
    });

    it('accepts a player into their own position slot', () => {
      expect(canFillSlot(['QB'], 'QB', 'football')).toBe(true);
      expect(canFillSlot(['K'], 'K', 'football')).toBe(true);
      expect(canFillSlot(['DST'], 'DST', 'football')).toBe(true);
    });

    it('accepts QB into SFLEX but not into FLEX', () => {
      expect(canFillSlot(['QB'], 'SFLEX', 'football')).toBe(true);
      expect(canFillSlot(['QB'], 'FLEX', 'football')).toBe(false);
    });

    it('accepts a multi-position player when any one position qualifies', () => {
      expect(canFillSlot(['QB', 'WR'], 'FLEX', 'football')).toBe(true);
    });

    it('accepts a kicker into the premium KP slot and rejects a non-kicker (LS-9675)', () => {
      // KP (combined kicker/punter, LS-9107) now has a real crosswalk entry
      // rather than relying on the fail-open "unmapped slot" rule below —
      // that rule let non-kickers into KP too, which is the bug LS-9675 fixed.
      expect(canFillSlot(['K'], 'KP', 'football')).toBe(true);
      expect(canFillSlot(['QB'], 'KP', 'football')).toBe(false);
    });
  });

  describe('baseball', () => {
    it('rejects an outfielder from an infield slot', () => {
      expect(canFillSlot(['LF', 'RF'], 'C', 'baseball')).toBe(false);
      expect(canFillSlot(['LF'], '1B', 'baseball')).toBe(false);
    });

    it('accepts an outfielder into OF and their own corner slot', () => {
      expect(canFillSlot(['LF'], 'OF', 'baseball')).toBe(true);
      expect(canFillSlot(['LF'], 'LF', 'baseball')).toBe(true);
    });

    it('accepts any infielder into IF and any position player into DH', () => {
      expect(canFillSlot(['SS'], 'IF', 'baseball')).toBe(true);
      expect(canFillSlot(['C'], 'DH', 'baseball')).toBe(true);
    });

    it('rejects a starter from a relief slot and vice versa', () => {
      expect(canFillSlot(['SP'], 'RP', 'baseball')).toBe(false);
      expect(canFillSlot(['RP'], 'SP', 'baseball')).toBe(false);
    });
  });

  describe('sport scoping', () => {
    it('reads the football table for football leagues, not the baseball alias', () => {
      // 'FLEX' exists only in the football table. Were the gate reading the
      // legacy baseball-only ALLOWED_POSITIONS, this lookup would miss — the
      // exact defect LS-6427 was filed for.
      expect(canFillSlot(['WR'], 'FLEX', 'football')).toBe(true);
    });

    it('does not leak football slots into baseball leagues', () => {
      // 'FLEX' is absent from the baseball table, so it is an unmapped slot
      // there and falls open rather than silently applying football's rule.
      expect(canFillSlot(['WR'], 'FLEX', 'baseball')).toBe(true);
      // A slot that IS mapped in baseball still enforces the baseball rule.
      expect(canFillSlot(['WR'], 'C', 'baseball')).toBe(false);
    });
  });

  describe('fail-open rules', () => {
    it('treats a player with no eligibility data as universally eligible', () => {
      expect(canFillSlot([], 'QB', 'football')).toBe(true);
      expect(canFillSlot([], 'C', 'baseball')).toBe(true);
    });

    it('treats a slot code absent from the crosswalk as eligible', () => {
      // 'XFLEX' does not exist as a real slot type; it stands in here for
      // "any slot code the crosswalk has never heard of."
      expect(canFillSlot(['QB'], 'XFLEX', 'football')).toBe(true);
    });

    it('treats a null or empty slot code as eligible', () => {
      expect(canFillSlot(['QB'], null, 'football')).toBe(true);
      expect(canFillSlot(['QB'], undefined, 'football')).toBe(true);
      expect(canFillSlot(['QB'], '', 'football')).toBe(true);
    });
  });
});
