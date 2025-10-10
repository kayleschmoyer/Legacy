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
import { 
  getDbOptions,
  getSentryConfigFromEnv, 
  initSentry, 
  withSentry, 
  captureError,
  addBreadcrumb 
} from '@legacy-sports/utils';
import { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from 'aws-lambda';

// Initialize Sentry
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

interface CreateMatchupEvent {
  league: number;
  week: number;
}

async function createMatchup(
  db: PublicDb,
  event: CreateMatchupEvent,
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
      `Creating matchup record: ${matchup.id}, ${player.id}, ${season.season}`,
    );

    await createMatchupRecord(db, record);
  }
}

const baseCreateMatchupHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  addBreadcrumb(
    `Processing ${event.Records.length} create matchup messages`,
    { recordCount: event.Records.length }
  );

  const options = getDbOptions();
  const db = getPublicDbConnection(options);

  const failures: SQSBatchItemFailure[] = [];

  try {
    await db.initialize();

    for (const record of event.Records) {
      try {
        const matchup = JSON.parse(record.body) as CreateMatchupEvent;
        
        addBreadcrumb(
          'Processing create matchup message',
          { 
            messageId: record.messageId,
            league: matchup.league,
            week: matchup.week
          }
        );

        await createMatchup(db.db, matchup);
      } catch (err) {
        failures.push({ itemIdentifier: record.messageId });
        LOGGER.error(err instanceof Error ? err.message : String(err));
        
        captureError(err instanceof Error ? err : new Error(String(err)), {
          tags: {
            lambda: 'game-selection-create-matchup',
            operation: 'createMatchup'
          },
          extra: {
            messageId: record.messageId,
            recordBody: record.body
          }
        });
      }
    }
  } finally {
    await db.close();
  }

  return {
    batchItemFailures: failures,
  };
};

export const handler = withSentry(baseCreateMatchupHandler);
