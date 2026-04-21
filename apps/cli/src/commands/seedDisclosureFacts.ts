/**
 * CLI command: seed-disclosure-facts
 *
 * Populates the `player_facts` table from existing player and career-stats data.
 * Required before the Who Am I? disclosure game (`/games/disclosure`) can start
 * a session — the game selects a random eligible player at session-start and
 * will throw an internal server error if no eligible players are found (LS-3784).
 *
 * The seed is idempotent: re-running is safe and only inserts new rows.
 *
 * Usage:
 *   ls-cli seed-disclosure-facts
 */

import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import {
  DisclosureGameService,
  runWithPublicClient,
} from '@legacy-sports/db-client';

export async function handleSeedDisclosureFacts(): Promise<void> {
  LOGGER.info('Seeding player_facts table for the disclosure game…');

  await runWithPublicClient(getDbOptions(), async (db) => {
    const svc = new DisclosureGameService(db);
    const inserted = await svc.seedPlayerFacts();
    LOGGER.info(`Done. ${inserted} new fact rows inserted.`);
  });
}
