import { Argv } from 'yargs';
import { getPlayers, Letter } from '@legacy-sports/bref-client';
import { LOGGER } from '@legacy-sports/logging';
import {
  bulkCreatePlayers,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';

export const loadPlayersCommandBuilder = (argv: Argv) =>
  argv.usage('load-players');

export async function handleLoadPlayers(): Promise<void> {
  LOGGER.debug('Loading Players');

  const opts = getDbOptions();
  await runWithPublicClient(opts, async (db) => {
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(97 + i);
      LOGGER.debug(`Loading Letter ${letter}`);
      const letterPlayers = await getPlayers(letter as Letter);
      await bulkCreatePlayers(db, letterPlayers);
      LOGGER.info(`Created ${letterPlayers.length} players`);
    }
  });
}
