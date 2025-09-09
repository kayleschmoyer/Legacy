import {
  CreateMatchupPlayer,
  createMatchupRecord,
  getMatchup,
  getMissingMatchupRecords,
  getPublicDbConnection,
  getSeasonBattingStatsForPlayer,
  PublicDb,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';
import { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from 'aws-lambda';

interface CreateMatchupEvent {
  league: number;
  week: number;
}

async function createMatchup(
  db: PublicDb,
  event: CreateMatchupEvent
): Promise<void> {
  const matchup = await getMatchup(db, event.league, event.week);

  if (matchup === null) {
    throw new Error('Matchup has not been created');
  }

  const missingRecords = await getMissingMatchupRecords(db, matchup.id);

  for (const player of missingRecords) {
    const seasons = await getSeasonBattingStatsForPlayer(db, player.id);
    const seasonIdx = Math.floor(Math.random() * seasons.length);

    const season = seasons[seasonIdx];

    const record: CreateMatchupPlayer = {
      matchupId: matchup.id,
      playerId: player.id,
      season: season.season,
    };

    LOGGER.debug(
      `Creating matchup record: ${matchup.id}, ${player.id}, ${season.season}`
    );

    await createMatchupRecord(db, record);
  }
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const options = getDbOptions();
  const db = getPublicDbConnection(options);

  const failures: SQSBatchItemFailure[] = [];

  try {
    await db.initialize();

    for (const record of event.Records) {
      try {
        const matchup = JSON.parse(record.body) as CreateMatchupEvent;
        await createMatchup(db.db, matchup);
      } catch (err) {
        failures.push({ itemIdentifier: record.messageId });
        LOGGER.error(err instanceof Error ? err.message : String(err));
      }
    }
  } finally {
    await db.close();
  }

  return {
    batchItemFailures: failures,
  };
}
