import { LOGGER } from '@legacy-sports/logging';
import {
  PublicDb,
  PublicSchema,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { eq } from 'drizzle-orm';
import { getDbOptions } from '@legacy-sports/utils/node';

interface HandleGetPlayerFootballPassingArgs {
  playerId?: number;
}

export async function handleGetPlayerFootballPassing(
  args: HandleGetPlayerFootballPassingArgs,
): Promise<void> {
  const { playerId } = args;

  if (!playerId) {
    LOGGER.error('--player-id is required');
    process.exit(1);
  }

  const opts = getDbOptions();

  await runWithPublicClient(opts, async (db: PublicDb) => {
    const [row] = await db
      .select()
      .from(PublicSchema.careerFootballPassing)
      .where(eq(PublicSchema.careerFootballPassing.playerId, playerId));

    if (!row) {
      LOGGER.info(`No career passing stats found for player ${playerId}`);
      return;
    }

    LOGGER.info(JSON.stringify(row, null, 2));
  });
}
