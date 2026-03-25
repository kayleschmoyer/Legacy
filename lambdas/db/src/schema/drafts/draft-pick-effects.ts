/**
 * Draft domain — post-pick side effects for auto-pick.
 *
 * Handles WebSocket notifications (pick made + draft complete),
 * matchup creation, badge evaluation, and activity log insertion.
 * WebSocket notifications are fire-and-forget / non-fatal — failures are
 * logged but never propagate to the caller.
 */

import { createBadgeService, type PublicDb } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import type { WebSocketNotificationService } from '@legacy-sports/aws-utils';

import { createAllMatchupsForLeague } from '../matchups/mutations';
import { logDraftPickActivity } from '../../services/activity-log';

const badgeService = createBadgeService(getDbOptions());

// ── Types ────────────────────────────────────────────────────────────────────

export interface PickEffectsParams {
  db: PublicDb;
  notificationService: WebSocketNotificationService | null | undefined;
  draftLeagueId: number;
  draftId: number;
  selectionMethod: string;
  pickResult: {
    draftPick: { id: number };
    autoPlayerId: number;
    autoPickReason: string;
    isDraftComplete: boolean;
    currentPickInfo: {
      teamId: number;
      round: number;
      pickNumber: number;
      overallPick: number;
    };
    nextPickInfo:
      | {
          teamId: number;
          round: number;
          pickNumber: number;
          overallPick: number;
        }
      | null
      | undefined;
    nextDeadline: Date | null;
  };
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Execute all post-pick side effects. Returns the number of drafts completed
 * (0 or 1) for the caller to track.
 */
export async function executePickEffects(
  params: PickEffectsParams,
): Promise<{ draftsCompleted: number }> {
  const {
    db,
    notificationService,
    draftLeagueId,
    draftId,
    selectionMethod,
    pickResult,
  } = params;

  let draftsCompleted = 0;

  // Send WebSocket notifications (outside transaction, non-fatal)
  if (notificationService) {
    try {
      await sendPickNotifications(
        notificationService,
        draftLeagueId,
        draftId,
        pickResult,
      );
    } catch (err) {
      LOGGER.warn('[executePickEffects] Pick notification failed (non-fatal)', {
        draftId,
        err,
      });
    }
  }

  // Auto-create matchups + badges when draft completes
  if (pickResult.isDraftComplete) {
    draftsCompleted = 1;

    if (notificationService) {
      try {
        await notificationService.notifyDraftCompleted(
          draftLeagueId,
          selectionMethod,
        );
      } catch (err) {
        LOGGER.warn(
          '[executePickEffects] Draft completion notification failed (non-fatal)',
          { draftId, err },
        );
      }
    }

    await handleDraftCompletion(db, draftLeagueId);
  }

  // Record auto-pick in the activity log (fire-and-forget, non-fatal)
  logAutoPick(db, draftLeagueId, pickResult);

  return { draftsCompleted };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

async function sendPickNotifications(
  notificationService: WebSocketNotificationService,
  draftLeagueId: number,
  draftId: number,
  pickResult: PickEffectsParams['pickResult'],
): Promise<void> {
  await notificationService.notifyDraftPickMade(
    draftLeagueId,
    draftId,
    pickResult.draftPick.id,
    pickResult.currentPickInfo.teamId,
    pickResult.autoPlayerId,
    pickResult.currentPickInfo.round,
    pickResult.currentPickInfo.pickNumber,
    pickResult.currentPickInfo.overallPick,
    pickResult.nextPickInfo
      ? {
          teamId: pickResult.nextPickInfo.teamId,
          round: pickResult.nextPickInfo.round,
          pickNumber: pickResult.nextPickInfo.pickNumber,
          overallPick: pickResult.nextPickInfo.overallPick,
        }
      : undefined,
    {
      wasAutoPick: true,
      autoPickReason: pickResult.autoPickReason,
      currentPickDeadline: pickResult.nextDeadline?.toISOString() ?? null,
    },
  );
}

async function handleDraftCompletion(
  db: PublicDb,
  draftLeagueId: number,
): Promise<void> {
  try {
    const matchupResult = await createAllMatchupsForLeague(db, draftLeagueId);
    LOGGER.info(
      '[autoProcessDraftPicks] Auto-created matchups after draft completion',
      {
        leagueId: draftLeagueId,
        matchupCount: matchupResult.matchupCount,
      },
    );
  } catch (matchupError) {
    LOGGER.error(
      '[autoProcessDraftPicks] Failed to auto-create matchups',
      matchupError instanceof Error
        ? matchupError
        : new Error(String(matchupError)),
      { leagueId: draftLeagueId },
    );
  }

  // Evaluate draft badges (fire-and-forget, non-fatal)
  badgeService.evaluateDraftBadges(draftLeagueId).catch((err: unknown) => {
    LOGGER.warn(
      '[autoProcessDraftPicks] Badge evaluation after draft failed (non-fatal)',
      { leagueId: draftLeagueId, err },
    );
  });
}

function logAutoPick(
  db: PublicDb,
  draftLeagueId: number,
  pickResult: PickEffectsParams['pickResult'],
): void {
  void logDraftPickActivity(
    { db },
    {
      leagueId: draftLeagueId,
      teamId: pickResult.currentPickInfo.teamId,
      actorUserId: null,
      playerId: pickResult.autoPlayerId,
      round: pickResult.currentPickInfo.round,
      pickNumber: pickResult.currentPickInfo.pickNumber,
      overallPick: pickResult.currentPickInfo.overallPick,
      wasAutoPick: true,
      autoPickReason: pickResult.autoPickReason,
    },
  );
}
