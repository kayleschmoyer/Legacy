/**
 * Baseball auto-pick strategy — projected FPG × positional scarcity multiplier.
 *
 * Lifted verbatim from the pre-LS-4665 scoreByPositionalScarcity in
 * auto-pick-scorer.ts. The numeric output (player id and score ordering) MUST
 * stay bit-identical; baseball.spec.ts pins it with a snapshot.
 */

import { ALLOWED_POSITIONS } from '@legacy-sports/utils';
import type { AutoPickScore, AutoPickStrategy } from './types';
import type { PlayerDraftInfo } from '../candidate-pool';

// Aliased for readability. `helpers.ts` exports the same map as
// ALLOWED_POSITIONS_FOR_AUTO_PICK for the legacy inline scorer in
// make-draft-pick.ts; this strategy intentionally imports from utils directly.
const ALLOWED_POSITIONS_FOR_AUTO_PICK = ALLOWED_POSITIONS;

function scoreForUnfilledPositions(
  playerDraftInfo: Map<number, PlayerDraftInfo>,
  unfilledPositionTypes: string[],
): AutoPickScore {
  const totalEligible = Math.max(playerDraftInfo.size, 1);

  const positionCandidateCounts = new Map<string, number>();
  for (const posType of unfilledPositionTypes) {
    const allowedStatPositions = ALLOWED_POSITIONS_FOR_AUTO_PICK[posType] ?? [
      posType,
    ];
    let posCount = 0;
    for (const [, info] of playerDraftInfo) {
      if (allowedStatPositions.some((sp) => info.positions.includes(sp))) {
        posCount++;
      }
    }
    positionCandidateCounts.set(posType, Math.max(posCount, 1));
  }

  let bestScore = -Infinity;
  let bestPlayerId: number | undefined;
  let bestReason = '';

  for (const [id, info] of playerDraftInfo) {
    let scarcityMultiplier = 0.25;
    let matchesUnfilled = false;
    let bestPosition = '';

    for (const posType of unfilledPositionTypes) {
      const allowedStatPositions = ALLOWED_POSITIONS_FOR_AUTO_PICK[posType] ?? [
        posType,
      ];
      if (allowedStatPositions.some((sp) => info.positions.includes(sp))) {
        matchesUnfilled = true;
        const posCount = positionCandidateCounts.get(posType) ?? totalEligible;
        const posScarcity = Math.min(Math.sqrt(totalEligible / posCount), 5.0);
        if (posScarcity > scarcityMultiplier) {
          scarcityMultiplier = posScarcity;
          bestPosition = posType;
        }
      }
    }

    const draftScore = info.fpg * scarcityMultiplier;
    if (draftScore > bestScore) {
      bestScore = draftScore;
      bestPlayerId = id;
      bestReason = matchesUnfilled
        ? `Best available for ${bestPosition} — ${info.fpg.toFixed(1)} projected matchup pts (×${scarcityMultiplier.toFixed(1)} positional scarcity)`
        : `Best available (bench) — ${info.fpg.toFixed(1)} projected matchup pts`;
    }
  }

  return { playerId: bestPlayerId, reason: bestReason };
}

export const baseballStrategy: AutoPickStrategy = {
  sport: 'baseball',
  scoreForUnfilledPositions,
};
