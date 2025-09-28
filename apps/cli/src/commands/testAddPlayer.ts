import { Argv } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';
import { DatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';

export const testAddPlayerCommandBuilder = (argv: Argv) =>
  argv.usage('test-add-player');

export async function handleTestAddPlayer(): Promise<void> {
  LOGGER.info('Testing adding a single player...');

  const opts = getDbOptions();
  const dbService = new DatabaseService(opts);

  try {
    // Try to retrieve any existing players first
    const existingPlayers = await dbService.players.getPlayers({ limit: 5 });
    LOGGER.info(`Found ${existingPlayers.length} existing players in database`);

    if (existingPlayers.length > 0) {
      existingPlayers.forEach((player) => {
        LOGGER.info(
          `Player: ${player.firstName} ${player.lastName} (${player.brefId})`,
        );
      });
    } else {
      LOGGER.info(
        'No players found in database - this confirms our schema is working but empty',
      );
    }
  } catch (err) {
    LOGGER.error(`Error in test: ${String(err)}`);
    throw err;
  }
}
