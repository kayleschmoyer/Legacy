import { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from 'aws-lambda';
import {
  getSeasonBattingStatsForPlayerSeason,
  getSeasonFieldingStatsForPlayerSeason,
  getSeasonPitchingStatsForPlayerSeason,
  PublicDb,
  PublicSchema,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq, exists, not } from 'drizzle-orm';
import { getDb } from '../utils/db';

interface SelectGameEvent {
  matchupId: number;
  game: number;
}

function selectGameNumber(stats: { g: number | null } | null): number | null {
  if (!stats?.g) {
    return null;
  }

  // 1-indexed
  return Math.floor(Math.random() * stats.g) + 1;
}

async function selectGamesForMatchup(
  db: PublicDb,
  matchupId: number,
  gameNumber: number
): Promise<void> {
  const result = await db
    .select()
    .from(PublicSchema.matchupPlayers)
    .where(
      and(
        eq(PublicSchema.matchupPlayers.matchupId, matchupId),
        not(
          exists(
            db
              .select()
              .from(PublicSchema.matchupPlayerGames)
              .where(
                and(
                  eq(
                    PublicSchema.matchupPlayerGames.matchupPlayerId,
                    PublicSchema.matchupPlayers.id
                  ),
                  eq(PublicSchema.matchupPlayerGames.gameNum, gameNumber)
                )
              )
          )
        )
      )
    );

  LOGGER.debug(`Fetching ${result.length} matchup records`);

  for (const matchupPlayer of result) {
    const battingStats = await getSeasonBattingStatsForPlayerSeason(
      db,
      matchupPlayer.playerId,
      matchupPlayer.season
    );
    const pitchingStats = await getSeasonPitchingStatsForPlayerSeason(
      db,
      matchupPlayer.playerId,
      matchupPlayer.season
    );

    // Fielding stats are segmented by position
    const fieldingStatsArray = await getSeasonFieldingStatsForPlayerSeason(
      db,
      matchupPlayer.playerId,
      matchupPlayer.season
    );

    const fieldingStats =
      fieldingStatsArray[Math.floor(Math.random() * fieldingStatsArray.length)];

    const battingGameNum = selectGameNumber(battingStats);
    const fieldingGameNum = selectGameNumber(fieldingStats);
    let pitchingGameNum: number | null = null;

    // Pitchers can only throw one game per week
    if (gameNumber === 1) {
      pitchingGameNum = selectGameNumber(pitchingStats);
    }

    LOGGER.debug(
      `Selected Games ${battingGameNum} ${pitchingGameNum} ${fieldingGameNum}`
    );

    await db.insert(PublicSchema.matchupPlayerGames).values({
      battingGameNum: battingGameNum,
      fieldingGameNum: fieldingGameNum,
      fieldingGamePos: fieldingStats?.pos,
      gameNum: gameNumber,
      matchupPlayerId: matchupPlayer.id,
      pitchingGameNum: pitchingGameNum,
    });
  }
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  LOGGER.debug('Processing SQS event', { event });

  const db = await getDb();

  const failures: SQSBatchItemFailure[] = [];

  try {
    for (const record of event.Records) {
      try {
        const matchup = JSON.parse(record.body) as SelectGameEvent;
        await selectGamesForMatchup(db.db, matchup.matchupId, matchup.game);
      } catch (err) {
        failures.push({ itemIdentifier: record.messageId });
        LOGGER.error('Error processing record', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    await db.close();
  }

  return {
    batchItemFailures: failures,
  };
}
