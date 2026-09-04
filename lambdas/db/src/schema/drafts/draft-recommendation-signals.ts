/**
 * Draft Intelligence signal derivation (LS-9855)
 *
 * Every recommendation the Draft Intelligence panel renders carries a short,
 * labelled signal chip — POS RUN / TIER BREAK / ROSTER FIT / VALUE — above the
 * player name, so the panel is scannable at a glance mid-pick. Before this the
 * only rationale was the free-text `reason` string, which the panel could not
 * group, colour, or filter by.
 *
 * The signal is derived from the same three factors that already drive both
 * the score and the `reason` string (positional need, positional scarcity, and
 * the normalized stat score), so it is a re-labelling of facts the algorithm
 * already established rather than a new claim about a player. `reason` is left
 * untouched and remains the human-readable rationale.
 *
 * The signal is nullable on purpose: when none of the branches below hold, the
 * caller emits `null` and the panel omits the chip entirely. A fabricated
 * catch-all label would read as a real finding to a drafting user — the same
 * failure mode as the fabricated-zero regression in LS-9473.
 *
 * Shared by the baseball and football branches of `getDraftRecommendations`
 * (queries.ts) so the two sports cannot drift apart on what a chip means.
 */

/**
 * The signal vocabulary. Matches the `DraftRecommendationSignal` GraphQL enum
 * in types.ts — keep the two in step.
 */
export const DRAFT_RECOMMENDATION_SIGNALS = [
  'POS_RUN',
  'TIER_BREAK',
  'ROSTER_FIT',
  'VALUE',
] as const;

export type DraftRecommendationSignal =
  (typeof DRAFT_RECOMMENDATION_SIGNALS)[number];

/**
 * Scarcity above which the remaining pool at a position counts as a run.
 * Mirrors the threshold the existing "Only N Xs left" reason already uses, so
 * the chip and the rationale below it can never disagree.
 */
export const POS_RUN_SCARCITY_THRESHOLD = 0.7;

/**
 * Minimum drop in normalized stat score between a candidate and the next-best
 * remaining candidate at the same position for the gap to count as a tier
 * break. Stat scores are min-max normalized to [0, 1] across the candidate
 * pool, so 0.1 is a tenth of the full spread — a visible cliff rather than the
 * ordinary player-to-player decay.
 */
export const TIER_BREAK_STAT_GAP = 0.1;

/**
 * Minimum normalized stat score for the VALUE fallback. A candidate with no
 * roster need, no positional run, and no tier break behind them is only worth
 * a chip if their raw production still stands out; below this the caller emits
 * no signal at all.
 */
export const VALUE_STAT_SCORE_THRESHOLD = 0.7;

/**
 * A candidate as far as tier-break detection is concerned: an identity, the
 * position whose tier it sits in, and its normalized stat score.
 */
export type TierBreakCandidate = {
  id: number;
  position: string;
  statScore: number;
};

/**
 * Returns the IDs of candidates that sit immediately above a tier break — the
 * last player at their position before a `TIER_BREAK_STAT_GAP` cliff in stat
 * score.
 *
 * Computed over the whole remaining pool at each position (not just the top-5
 * that get returned), because the drop that matters is the one to the next
 * player a drafter could actually take.
 *
 * The last remaining candidate at a position has no next tier to break away
 * from, so it is never a tier break — a thin pool is positional scarcity, and
 * POS_RUN already covers it.
 */
export function findTierBreakCandidateIds(
  candidates: readonly TierBreakCandidate[],
): ReadonlySet<number> {
  const byPosition = new Map<string, TierBreakCandidate[]>();
  for (const candidate of candidates) {
    const bucket = byPosition.get(candidate.position);
    if (bucket) {
      bucket.push(candidate);
    } else {
      byPosition.set(candidate.position, [candidate]);
    }
  }

  const tierBreakIds = new Set<number>();
  for (const bucket of byPosition.values()) {
    const ranked = bucket.slice().sort((a, b) => b.statScore - a.statScore);
    for (let i = 0; i < ranked.length - 1; i++) {
      const current = ranked[i];
      const next = ranked[i + 1];
      if (current.statScore - next.statScore >= TIER_BREAK_STAT_GAP) {
        tierBreakIds.add(current.id);
      }
    }
  }
  return tierBreakIds;
}

/**
 * The facts the signal is derived from — all already computed by the scoring
 * algorithm for the recommendation's `score`.
 */
export type SignalInputs = {
  /** Positional need: 1.0 empty slot, 0.5 under quota, 0.0 quota filled. */
  positionalNeed: number;
  /** Positional scarcity in [0, 1]; 1 means the thinnest position in the pool. */
  scarcity: number;
  /** Normalized stat score in [0, 1] across the candidate pool. */
  statScore: number;
  /** Whether a tier break sits immediately below this candidate. */
  isTierBreak: boolean;
};

/**
 * Derives the single signal chip for a recommendation, or `null` when none
 * applies.
 *
 * Precedence is deliberately the same order the `reason` string already
 * branches on, so the chip always labels the rationale rendered beneath it
 * rather than contradicting it:
 *
 *   1. ROSTER_FIT  — the pick fills an empty or under-quota slot on *your*
 *                    roster. The most specific claim available, and what the
 *                    reason string leads with.
 *   2. POS_RUN     — the pool at this position is nearly exhausted.
 *   3. TIER_BREAK  — the last player before a cliff in production at this
 *                    position.
 *   4. VALUE       — no need, no run, no cliff, but the raw production is
 *                    still top of the pool.
 *
 * A candidate matching none of the four gets no chip.
 */
export function deriveDraftRecommendationSignal({
  positionalNeed,
  scarcity,
  statScore,
  isTierBreak,
}: SignalInputs): DraftRecommendationSignal | null {
  if (positionalNeed > 0) return 'ROSTER_FIT';
  if (scarcity > POS_RUN_SCARCITY_THRESHOLD) return 'POS_RUN';
  if (isTierBreak) return 'TIER_BREAK';
  if (statScore >= VALUE_STAT_SCORE_THRESHOLD) return 'VALUE';
  return null;
}
