import { LOGGER } from '@legacy-sports/logging';
import { DatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';

interface HandleListPlayersArgs {
  limit?: number;
  search?: string;
}

export async function handleListPlayers(
  args: HandleListPlayersArgs,
): Promise<void> {
  LOGGER.debug(`Fetching ${args.limit} players from database`);

  const opts = getDbOptions();
  const dbService = new DatabaseService(opts);

  try {
    // Use the PlayerService to get players
    const playerList = await dbService.players.getPlayers({
      limit: args.limit,
      filters: args.search
        ? {
            fullNameLike: args.search,
          }
        : undefined,
    });

    if (playerList.length === 0) {
      LOGGER.info('No players found in database');
      return;
    }

    LOGGER.info(`Found ${playerList.length} players:`);

    // Display players in a nice format
    console.log('\n┌─────┬──────────────┬─────────────────────────────┐');
    console.log('│ ID  │ Bref ID      │ Name                        │');
    console.log('├─────┼──────────────┼─────────────────────────────┤');

    playerList.forEach((player) => {
      const fullName = `${player.firstName} ${player.lastName}`;
      console.log(
        `│ ${String(player.id).padEnd(3)} │ ${String(player.brefId).padEnd(12)} │ ${fullName.padEnd(27)} │`,
      );
    });

    console.log('└─────┴──────────────┴─────────────────────────────┘\n');
  } catch (err) {
    LOGGER.error(`Error fetching players: ${String(err)}`);
    throw err;
  }
}
