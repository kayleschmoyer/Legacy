import { CareerStats, getCareerStats } from '@legacy-sports/bref-client';
import { LOGGER } from '@legacy-sports/logging';
import {
  bulkUpsertBattingSeason,
  bulkUpsertFieldingSeason,
  bulkUpsertPitchingSeason,
  getPlayerByBrefId,
  PublicDb,
} from '@legacy-sports/db-client';

export async function loadCareerStats(
  db: PublicDb,
  brefId: string
): Promise<CareerStats> {
  const player = await getPlayerByBrefId(db, brefId);

  if (!player) {
    throw new Error(`Could not find player ${brefId}`);
  }

  LOGGER.debug(`Importing ${brefId}`);
  const stats = await getCareerStats(player);

  LOGGER.debug(`Inserting ${stats.batting.length} batting records.`);
  await bulkUpsertBattingSeason(db, stats.batting);
  LOGGER.debug(`Inserting ${stats.fielding.length} fielding records.`);
  await bulkUpsertFieldingSeason(db, stats.fielding);
  LOGGER.debug(`Inserting ${stats.pitching.length} pitching records.`);
  await bulkUpsertPitchingSeason(db, stats.pitching);

  return stats;
}
