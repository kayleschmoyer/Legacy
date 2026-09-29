/**
 * Draft domain — draft lifecycle status (LS-10074).
 *
 * `leagues.draft_status` was the only record of where a draft stood, which a
 * draft-first mock draft (epic LS-9252) cannot use. LS-10073 added
 * `drafts.status` as the new home and a `leagues_sync_draft_status` trigger
 * that mirrors league → draft for the lambdas deployed at the time.
 *
 * This slice flips the direction: `drafts.status` is what the draft room
 * reads, and every league-draft transition dual-writes `leagues.draft_status`
 * (plus `leagues.league_phase` where it already did) inside the same
 * transaction, so the league row the rest of the app reads never diverges.
 * Slice 8 retires the league column.
 */

import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { and, eq } from 'drizzle-orm';

type LeagueRow = typeof PublicSchema.leagues.$inferSelect;

export type DraftLifecycleStatus = LeagueRow['draftStatus'];
export type LeaguePhase = LeagueRow['leaguePhase'];

/**
 * Move a league draft to `status`, writing both the draft row and its league.
 *
 * Order matters only for economy, not correctness: the draft row is written
 * first, then the league. The LS-10073 `leagues_sync_draft_status` trigger
 * fires on the league write and re-asserts the same value on `drafts.status`,
 * which its `IS DISTINCT FROM` guard turns into a no-op.
 *
 * Must run inside the caller's transaction so the two rows commit together.
 *
 * @param expectedLeagueStatus - when set, the league write is conditional on
 *   the league still being in this status, preserving a caller's existing
 *   compare-and-set. The draft write is made conditional the same way.
 */
export async function setLeagueDraftStatus(
  tx: PublicDb,
  params: {
    draftId: number;
    leagueId: number;
    status: DraftLifecycleStatus;
    /** Written onto `leagues.league_phase` when provided. */
    leaguePhase?: LeaguePhase;
    expectedLeagueStatus?: DraftLifecycleStatus;
  },
): Promise<void> {
  const { draftId, leagueId, status, leaguePhase, expectedLeagueStatus } =
    params;

  await tx
    .update(PublicSchema.drafts)
    .set({ status, updatedAt: new Date() })
    .where(
      expectedLeagueStatus
        ? and(
            eq(PublicSchema.drafts.id, draftId),
            eq(PublicSchema.drafts.status, expectedLeagueStatus),
          )
        : eq(PublicSchema.drafts.id, draftId),
    );

  await tx
    .update(PublicSchema.leagues)
    .set({
      draftStatus: status,
      ...(leaguePhase ? { leaguePhase } : {}),
    })
    .where(
      expectedLeagueStatus
        ? and(
            eq(PublicSchema.leagues.id, leagueId),
            eq(PublicSchema.leagues.draftStatus, expectedLeagueStatus),
          )
        : eq(PublicSchema.leagues.id, leagueId),
    );
}

/**
 * Move any draft to `status`: {@link setLeagueDraftStatus} for a league
 * draft, a `drafts`-only write for a draft-first mock draft (LS-10076), which
 * has no league row to keep in step. `leaguePhase` is ignored for a mock
 * draft for the same reason.
 *
 * Must run inside the caller's transaction.
 */
export async function setDraftStatus(
  tx: PublicDb,
  params: {
    draftId: number;
    leagueId: number | null;
    status: DraftLifecycleStatus;
    leaguePhase?: LeaguePhase;
    expectedStatus?: DraftLifecycleStatus;
  },
): Promise<void> {
  const { draftId, leagueId, status, leaguePhase, expectedStatus } = params;

  if (leagueId !== null) {
    await setLeagueDraftStatus(tx, {
      draftId,
      leagueId,
      status,
      leaguePhase,
      expectedLeagueStatus: expectedStatus,
    });
    return;
  }

  await tx
    .update(PublicSchema.drafts)
    .set({ status, updatedAt: new Date() })
    .where(
      expectedStatus
        ? and(
            eq(PublicSchema.drafts.id, draftId),
            eq(PublicSchema.drafts.status, expectedStatus),
          )
        : eq(PublicSchema.drafts.id, draftId),
    );
}

/**
 * The draft's own lifecycle status — the draft room's source of truth.
 *
 * Returns `null` when the draft does not exist.
 */
export async function getDraftStatus(
  db: PublicDb,
  draftId: number,
): Promise<DraftLifecycleStatus | null> {
  const [row] = await db
    .select({ status: PublicSchema.drafts.status })
    .from(PublicSchema.drafts)
    .where(eq(PublicSchema.drafts.id, draftId))
    .limit(1);

  return row?.status ?? null;
}
