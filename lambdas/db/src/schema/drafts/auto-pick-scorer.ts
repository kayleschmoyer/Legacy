/**
 * Draft domain — auto-pick player selection logic.
 *
 * Scores candidates from the pre-computed candidate pool entirely in-memory
 * (projected FPG × positional scarcity). Handles draft queue preference,
 * bench fallback, final fallback, and concurrent-pick guards.
 */

import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq } from 'drizzle-orm';

import {
  ALLOWED_POSITIONS_FOR_AUTO_PICK,
  getFirstQueuedPlayerForTeam,
} from './helpers';
import type { BestBenchPick, PlayerDraftInfo } from './candidate-pool';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AutoPickResult {
  playerId: number;
  reason: string;
}

export interface AutoPickParams {
  tx: PublicDb;
  draftId: number;
  /** Pre-computed candidate pool from fetchCandidatePool. */
  eligibleIds: number[];
  playerDraftInfo: Map<number, PlayerDraftInfo>;
  rankedEligibleIds: number[];
  bestBenchPick: BestBenchPick | undefined;
  /** Current pick info from getCurrentDraftPickInfo. */
  currentPickInfo: { teamId: number };
  /** Unfilled roster position slot types for the current team. */
  unfilledPositionTypes: string[];
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Select the best player for an auto-pick, applying this priority:
 *
 * 1. Draft queue — user's pre-selected player (if eligible)
 * 2. Smart scoring — projected FPG × positional scarcity multiplier
 * 3. Bench fallback — pre-computed versatility + FPG pick
 * 4. Final fallback — first eligible player (no career stats edge case)
 *
 * After selection, a concurrent-pick guard walks the ranked list if the
 * preferred player was drafted between Phase 1 and this transaction.
 */
export async function selectAutoPickPlayer(
  params: AutoPickParams,
): Promise<AutoPickResult> {
  const {
    tx,
    draftId,
    eligibleIds,
    playerDraftInfo,
    rankedEligibleIds,
    bestBenchPick,
    currentPickInfo,
    unfilledPositionTypes,
  } = params;

  let autoPlayerId: number | undefined;
  let autoPickReason = '';

  // ── Draft queue check (LS-473) ──────────────────────────────────────
  const eligibleIdSet = new Set(eligibleIds);
  const queuedPlayerId = await getFirstQueuedPlayerForTeam(
    tx,
    draftId,
    currentPickInfo.teamId,
  );
  if (queuedPlayerId !== null && eligibleIdSet.has(queuedPlayerId)) {
    autoPlayerId = queuedPlayerId;
    autoPickReason = `Draft queue pick — player ${queuedPlayerId} (user's next queued selection)`;
    LOGGER.info('[LS-473] autoProcessDraftPicks: using draft queue selection', {
      draftId,
      teamId: currentPickInfo.teamId,
      playerId: autoPlayerId,
    });
  }

  // ── Smart auto-pick: projected fantasy points + positional scarcity ──
  if (autoPlayerId === undefined && unfilledPositionTypes.length > 0) {
    const scored = scoreByPositionalScarcity(
      playerDraftInfo,
      unfilledPositionTypes,
    );
    autoPlayerId = scored.playerId;
    autoPickReason = scored.reason;

    LOGGER.info('[autoProcessDraftPicks] Smart auto-pick selected', {
      draftId,
      playerId: autoPlayerId,
      reason: autoPickReason,
      unfilledPositionTypes,
    });
  } else if (autoPlayerId === undefined) {
    // No unfilled starting positions — use bench pick
    if (bestBenchPick) {
      autoPlayerId = bestBenchPick.playerId;
      autoPickReason = `Best available (bench) — ${bestBenchPick.fpg.toFixed(1)} projected matchup pts, starts in ${bestBenchPick.slotsCoverable}/${bestBenchPick.totalSlots} slots`;
      LOGGER.info(
        '[autoProcessDraftPicks] Auto-pick for bench (versatility + matchup pts)',
        {
          draftId,
          playerId: autoPlayerId,
          reason: autoPickReason,
          totalSlots: bestBenchPick.totalSlots,
        },
      );
    }
  }

  // Final fallback (should rarely happen — only if no stats exist)
  if (autoPlayerId === undefined) {
    autoPlayerId = eligibleIds[0];
    autoPickReason = 'Fallback selection (no career stats available)';
    LOGGER.info('[autoProcessDraftPicks] Using final fallback auto-pick', {
      draftId,
      playerId: autoPlayerId,
    });
  }

  // ── Concurrent pick guard ──────────────────────────────────────────
  autoPlayerId = await guardConcurrentPick(
    tx,
    draftId,
    autoPlayerId,
    rankedEligibleIds,
  );

  if (autoPlayerId === undefined) {
    throw new Error(`No available players for draft ${draftId}`);
  }

  return { playerId: autoPlayerId, reason: autoPickReason };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Score candidates by projected FPG × positional scarcity multiplier.
 * Players matching scarcer unfilled positions get a boost; players not
 * matching any unfilled position get a penalty (0.25×).
 */
function scoreByPositionalScarcity(
  playerDraftInfo: Map<number, PlayerDraftInfo>,
  unfilledPositionTypes: string[],
): AutoPickResult {
  const totalEligible = Math.max(playerDraftInfo.size, 1);

  // Compute positional scarcity: scarcer positions → higher boost
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
    let scarcityMultiplier = 0.25; // Penalty for not filling any need
    let matchesUnfilled = false;
    let bestPosition = '';

    for (const posType of unfilledPositionTypes) {
      const allowedStatPositions = ALLOWED_POSITIONS_FOR_AUTO_PICK[posType] ?? [
        posType,
      ];
      if (allowedStatPositions.some((sp) => info.positions.includes(sp))) {
        matchesUnfilled = true;
        const posCount = positionCandidateCounts.get(posType) ?? totalEligible;
        // sqrt-based scarcity: moderate boost, capped at 5×
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

  return {
    playerId: bestPlayerId as number,
    reason: bestReason,
  };
}

/**
 * Guard against a concurrent pick taking our preferred player between
 * Phase 1 (pre-computation) and Phase 2 (locked transaction). Walks the
 * ranked list to find the first still-available candidate.
 */
async function guardConcurrentPick(
  tx: PublicDb,
  draftId: number,
  preferredId: number,
  rankedEligibleIds: number[],
): Promise<number | undefined> {
  const [alreadyDrafted] = await tx
    .select({ playerId: PublicSchema.draftPicks.playerId })
    .from(PublicSchema.draftPicks)
    .where(
      and(
        eq(PublicSchema.draftPicks.draftId, draftId),
        eq(PublicSchema.draftPicks.playerId, preferredId),
      ),
    )
    .limit(1);

  if (!alreadyDrafted) {
    return preferredId;
  }

  // Walk the ranked list to find the first available
  for (const candidateId of rankedEligibleIds) {
    if (candidateId === preferredId) continue;
    const [taken] = await tx
      .select({ playerId: PublicSchema.draftPicks.playerId })
      .from(PublicSchema.draftPicks)
      .where(
        and(
          eq(PublicSchema.draftPicks.draftId, draftId),
          eq(PublicSchema.draftPicks.playerId, candidateId),
        ),
      )
      .limit(1);
    if (!taken) {
      return candidateId;
    }
  }

  return undefined;
}
