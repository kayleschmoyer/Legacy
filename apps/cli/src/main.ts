import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
  handleLoadPlayers,
  loadPlayersCommandBuilder,
} from './commands/loadPlayers';
import {
  handleLoadCareerStats,
  loadCareerStatsCommandBuilder,
} from './commands/loadCareerStats';
import { LOGGER } from '@legacy-sports/logging';

async function run(): Promise<void> {
  await yargs(hideBin(process.argv))
    .command('load-players', '', loadPlayersCommandBuilder, handleLoadPlayers)
    .command(
      'load-career-stats',
      '',
      loadCareerStatsCommandBuilder,
      handleLoadCareerStats,
    )
    .demandCommand()
    .help()
    .parse();
}

run().catch((err: unknown) => {
  if (err instanceof Error) {
    LOGGER.error(err.message);
    LOGGER.debug(JSON.stringify(err));
    LOGGER.debug(err.stack);
  } else if (typeof err === 'string') {
    LOGGER.error(err);
  }
  process.exit(1);
});
