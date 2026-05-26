import { LOGGER } from '@legacy-sports/logging';
import {
  PublicDb,
  PublicSchema,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { eq } from 'drizzle-orm';
import { getDbOptions } from '@legacy-sports/utils/node';

interface HandleGetPlayerFootballDefenseArgs {
  playerId?: number;
}

// Prints career defense row — covers both DST (career_football_defense)
// and IDP (career_football_defense_idp).
export async function handleGetPlayerFootballDefense(
  args: HandleGetPlayerFootballDefenseArgs,
): Promise<void> {
  const { playerId } = args;

  if (!playerId) {
    LOGGER.error('--player-id is required');
    process.exit(1);
  }

  const opts = getDbOptions();

  await runWithPublicClient(opts, async (db: PublicDb) => {
    const [dstRow] = await db
      .select()
      .from(PublicSchema.careerFootballDefense)
      .where(eq(PublicSchema.careerFootballDefense.playerId, playerId));

    const [idpRow] = await db
      .select()
      .from(PublicSchema.careerFootballDefenseIdp)
      .where(eq(PublicSchema.careerFootballDefenseIdp.playerId, playerId));

    if (!dstRow && !idpRow) {
      LOGGER.info(`No career defense stats found for player ${playerId}`);
      return;
    }

    if (dstRow) {
      LOGGER.info('DST (career_football_defense):');
      LOGGER.info(JSON.stringify(dstRow, null, 2));
    }

    if (idpRow) {
      LOGGER.info('IDP (career_football_defense_idp):');
      LOGGER.info(JSON.stringify(idpRow, null, 2));
    }
  });
}
