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

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
