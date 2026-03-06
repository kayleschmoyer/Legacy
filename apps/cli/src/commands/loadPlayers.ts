import { getPlayers, Letter } from '@legacy-sports/bref-client';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import {
  bulkCreatePlayers,
  runWithPublicClient,
} from '@legacy-sports/db-client';

export async function handleLoadPlayers(): Promise<void> {
  LOGGER.info('Starting player loading process...');

  try {
    const opts = getDbOptions();
    LOGGER.info(`Database options: ${JSON.stringify(opts)}`);

    let totalPlayersCreated = 0;
    const startTime = Date.now();

    LOGGER.info('Connecting to database...');
    await runWithPublicClient(opts, async (db) => {
      LOGGER.info(
        'Database connection established, starting player loading...',
      );

      // Load all players from A-Z
      const letters: Letter[] = [
        'a',
        'b',
        'c',
        'd',
        'e',
        'f',
        'g',
        'h',
        'i',
        'j',
        'k',
        'l',
        'm',
        'n',
        'o',
        'p',
        'q',
        'r',
        's',
        't',
        'u',
        'v',
        'w',
        'x',
        'y',
        'z',
      ];

      for (let i = 0; i < letters.length; i++) {
        const letter = letters[i];

        try {
          LOGGER.info(
            `[${i + 1}/${letters.length}] Loading players for letter: ${letter.toUpperCase()}`,
          );
          const letterPlayers = await getPlayers(letter);

          if (letterPlayers.length === 0) {
            LOGGER.info(`No players found for letter ${letter.toUpperCase()}`);
            continue;
          }

          LOGGER.info(
            `Found ${
              letterPlayers.length
            } players for letter ${letter.toUpperCase()}`,
          );
          const createdPlayers = await bulkCreatePlayers(db, letterPlayers);
          totalPlayersCreated += createdPlayers.length;

          LOGGER.info(
            `Letter ${letter.toUpperCase()}: Created/updated ${
              createdPlayers.length
            } players (Total so far: ${totalPlayersCreated})`,
          );
        } catch (error) {
          LOGGER.error(
            `Error loading players for letter ${letter.toUpperCase()}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          throw error; // Re-throw to stop the process on error
        }
      }
    });

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    LOGGER.info(`✅ Player loading completed successfully!`);
    LOGGER.info(`📊 Total players processed: ${totalPlayersCreated}`);
    LOGGER.info(`⏱️  Duration: ${duration.toFixed(2)} seconds`);
  } catch (error) {
    LOGGER.error(
      `Fatal error in handleLoadPlayers: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    if (error instanceof Error && error.stack) {
      LOGGER.error(`Stack trace: ${error.stack}`);
    }
    throw error;
  }
}
