import { PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { eq } from 'drizzle-orm';

/**
 * Terminal slots for a rostered player who cannot get a game this week —
 * no assigned season (waiver add, no eligible season — LS-9534) or, for
 * football, no corpus identity.
 *
 * Skipping such a player without writing a slot row pins their matchup's
 * game progression at 0: progression is the MINIMUM resolved-slot count per
 * rostered player (getSelectedGamesCountBatch), so every "Select Game N"
 * re-queues game 1 as a no-op and the week can never finish (LS-10780).
 * Writing noGameDataFound slots resolves them the same way the stats
 * pipeline does when it gives up on a game (LS-9925).
 *
 * Returns a per-matchup marker: call it for each such player; it inserts a
 * noGameDataFound row for every slot the player is missing up to the current
 * game — and up to the furthest game already played in this matchup, which
 * heals matchups that got stuck before this fix. Waivers never add players
 * to locked (in_progress) matchups, so the player's state is final for the
 * week. Returns the game numbers it marked.
 */
export function createNoGameDataSlotMarker(
  db: PublicDb,
  matchupId: number,
  gameNumber: number,
  gamesPerMatchup: number,
): (matchupPlayerId: number) => Promise<number[]> {
  // Loaded lazily, once per matchup — most matchups never need it.
  let matchupSlotRows: Array<{
    matchupPlayerId: number;
    gameNum: number;
  }> | null = null;

  return async (matchupPlayerId) => {
    matchupSlotRows ??= await db
      .select({
        matchupPlayerId: PublicSchema.matchupPlayerGames.matchupPlayerId,
        gameNum: PublicSchema.matchupPlayerGames.gameNum,
      })
      .from(PublicSchema.matchupPlayerGames)
      .innerJoin(
        PublicSchema.matchupPlayers,
        eq(
          PublicSchema.matchupPlayers.id,
          PublicSchema.matchupPlayerGames.matchupPlayerId,
        ),
      )
      .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId));

    const furthestGameNum = Math.min(
      gamesPerMatchup,
      Math.max(gameNumber, ...matchupSlotRows.map((r) => r.gameNum)),
    );
    const playerGameNums = new Set(
      matchupSlotRows
        .filter((r) => r.matchupPlayerId === matchupPlayerId)
        .map((r) => r.gameNum),
    );
    const missing: number[] = [];
    for (let n = 1; n <= furthestGameNum; n++) {
      if (!playerGameNums.has(n)) missing.push(n);
    }

    if (missing.length > 0) {
      await db.insert(PublicSchema.matchupPlayerGames).values(
        missing.map((gameNum) => ({
          gameNum,
          matchupPlayerId,
          gameIdentifier: null,
          gamePosition: null,
          statsLoadingStatus: 'completed' as const,
          noGameDataFound: true,
        })),
      );
    }
    return missing;
  };
}
