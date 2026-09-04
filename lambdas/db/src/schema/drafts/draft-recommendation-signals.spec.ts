/**
 * Unit coverage for Draft Intelligence signal derivation (LS-9855).
 *
 * Each signal type has its own derivation branch, and the null case is a
 * first-class outcome rather than an edge case: a recommendation with no
 * qualifying signal must produce `null` so the panel omits the chip instead of
 * showing a fabricated label (LS-9473 precedent).
 */
import {
  deriveDraftRecommendationSignal,
  findTierBreakCandidateIds,
  POS_RUN_SCARCITY_THRESHOLD,
  TIER_BREAK_STAT_GAP,
  VALUE_STAT_SCORE_THRESHOLD,
} from './draft-recommendation-signals';

describe('deriveDraftRecommendationSignal', () => {
  const base = {
    positionalNeed: 0,
    scarcity: 0,
    statScore: 0,
    isTierBreak: false,
  };

  describe('ROSTER_FIT', () => {
    it('fires when the position is an empty roster slot', () => {
      expect(
        deriveDraftRecommendationSignal({ ...base, positionalNeed: 1.0 }),
      ).toBe('ROSTER_FIT');
    });

    it('fires when the position is filled but still under quota', () => {
      expect(
        deriveDraftRecommendationSignal({ ...base, positionalNeed: 0.5 }),
      ).toBe('ROSTER_FIT');
    });

    it('outranks every other signal so the chip matches the reason string', () => {
      // The `reason` string leads with the roster-slot rationale whenever
      // positional need is non-zero, so the chip must too.
      expect(
        deriveDraftRecommendationSignal({
          positionalNeed: 0.5,
          scarcity: 0.95,
          statScore: 1.0,
          isTierBreak: true,
        }),
      ).toBe('ROSTER_FIT');
    });
  });

  describe('POS_RUN', () => {
    it('fires when the remaining pool at the position is thin', () => {
      expect(
        deriveDraftRecommendationSignal({
          ...base,
          scarcity: POS_RUN_SCARCITY_THRESHOLD + 0.05,
        }),
      ).toBe('POS_RUN');
    });

    it('does not fire exactly at the threshold, matching the reason string', () => {
      // The "Only N Xs left" reason uses a strict `>` — the chip must use the
      // same comparison or the two can disagree on a boundary pool.
      expect(
        deriveDraftRecommendationSignal({
          ...base,
          scarcity: POS_RUN_SCARCITY_THRESHOLD,
        }),
      ).toBeNull();
    });

    it('outranks a tier break and a high stat score', () => {
      expect(
        deriveDraftRecommendationSignal({
          positionalNeed: 0,
          scarcity: 0.9,
          statScore: 1.0,
          isTierBreak: true,
        }),
      ).toBe('POS_RUN');
    });
  });

  describe('TIER_BREAK', () => {
    it('fires when a production cliff sits below the candidate', () => {
      expect(
        deriveDraftRecommendationSignal({ ...base, isTierBreak: true }),
      ).toBe('TIER_BREAK');
    });

    it('outranks a high stat score', () => {
      expect(
        deriveDraftRecommendationSignal({
          ...base,
          isTierBreak: true,
          statScore: 1.0,
        }),
      ).toBe('TIER_BREAK');
    });
  });

  describe('VALUE', () => {
    it('fires for top-of-pool production with no need, run, or cliff', () => {
      expect(
        deriveDraftRecommendationSignal({
          ...base,
          statScore: VALUE_STAT_SCORE_THRESHOLD,
        }),
      ).toBe('VALUE');
    });
  });

  describe('no signal', () => {
    it('returns null when nothing qualifies', () => {
      expect(
        deriveDraftRecommendationSignal({
          ...base,
          statScore: VALUE_STAT_SCORE_THRESHOLD - 0.01,
        }),
      ).toBeNull();
    });

    it('returns null for an entirely unremarkable candidate', () => {
      expect(deriveDraftRecommendationSignal(base)).toBeNull();
    });
  });
});

describe('findTierBreakCandidateIds', () => {
  it('flags the last candidate above a stat-score cliff at its position', () => {
    const ids = findTierBreakCandidateIds([
      { id: 1, position: '1B', statScore: 0.9 },
      { id: 2, position: '1B', statScore: 0.85 },
      // 0.85 -> 0.6 is a 0.25 drop, well past TIER_BREAK_STAT_GAP.
      { id: 3, position: '1B', statScore: 0.6 },
    ]);
    expect([...ids]).toEqual([2]);
  });

  it('is independent per position', () => {
    const ids = findTierBreakCandidateIds([
      { id: 1, position: 'SS', statScore: 0.9 },
      { id: 2, position: 'SS', statScore: 0.2 },
      { id: 3, position: 'OF', statScore: 0.5 },
      { id: 4, position: 'OF', statScore: 0.48 },
    ]);
    // The SS cliff is real; the OF pair decays smoothly and is not a tier.
    expect([...ids]).toEqual([1]);
  });

  it('ignores input order', () => {
    const ids = findTierBreakCandidateIds([
      { id: 3, position: 'SP', statScore: 0.1 },
      { id: 1, position: 'SP', statScore: 0.9 },
      { id: 2, position: 'SP', statScore: 0.85 },
    ]);
    expect([...ids]).toEqual([2]);
  });

  it('does not flag the last remaining candidate at a position', () => {
    // A single remaining player has no next tier to break away from — that is
    // scarcity, which POS_RUN already covers.
    const ids = findTierBreakCandidateIds([
      { id: 1, position: 'C', statScore: 0.95 },
    ]);
    expect(ids.size).toBe(0);
  });

  it('flags a gap just past the threshold', () => {
    // Deliberately not asserting the exact-threshold case: stat scores are
    // floats, so a gap "exactly" TIER_BREAK_STAT_GAP wide is not something a
    // caller can construct or rely on. What matters is which side of the
    // threshold a gap falls on.
    const ids = findTierBreakCandidateIds([
      { id: 1, position: 'RP', statScore: 0.5 },
      { id: 2, position: 'RP', statScore: 0.5 - TIER_BREAK_STAT_GAP - 0.01 },
    ]);
    expect([...ids]).toEqual([1]);
  });

  it('does not flag a gap short of the threshold', () => {
    const ids = findTierBreakCandidateIds([
      { id: 1, position: 'RP', statScore: 0.5 },
      { id: 2, position: 'RP', statScore: 0.5 - TIER_BREAK_STAT_GAP + 0.01 },
    ]);
    expect(ids.size).toBe(0);
  });

  it('flags every candidate that sits above a cliff, not just the top one', () => {
    const ids = findTierBreakCandidateIds([
      { id: 1, position: '3B', statScore: 0.9 },
      { id: 2, position: '3B', statScore: 0.7 },
      { id: 3, position: '3B', statScore: 0.4 },
    ]);
    expect([...ids].sort()).toEqual([1, 2]);
  });

  it('returns an empty set for an empty pool', () => {
    expect(findTierBreakCandidateIds([]).size).toBe(0);
  });
});
