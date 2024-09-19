import './.startup';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { logError } from '@legacy-sports/utils';
import {
  handleLoadPlayers,
  loadPlayersCommandBuilder,
} from './commands/loadPlayers';
import {
  handleLoadCareerStats,
  loadCareerStatsCommandBuilder,
} from './commands/loadCareerStats';
import {
  computeScoringCommandBuilder,
  handleComputeScoring,
} from './commands/computeScoring';
import {
  runMigrations,
  runMigrationsCommandBuilder,
} from './commands/runMigrations';
import {
  createMatchupCommandBuilder,
  handleCreateMatchup,
} from './commands/createMatchup';

async function run(): Promise<void> {
  await yargs(hideBin(process.argv))
    .command('load-players', '', loadPlayersCommandBuilder, handleLoadPlayers)
    .command(
      'load-career-stats',
      '',
      loadCareerStatsCommandBuilder,
      handleLoadCareerStats
    )
    .command(
      'compute-scoring',
      '',
      computeScoringCommandBuilder,
      handleComputeScoring
    )
    .command('run-migrations', '', runMigrationsCommandBuilder, runMigrations)
    .command(
      'create-matchup',
      'Creates the matchup records for players in the matchup',
      createMatchupCommandBuilder,
      handleCreateMatchup
    )
    .demandCommand()
    .help()
    .parse();
}

run().catch((err: unknown) => {
  logError(err);
  process.exit(1);
});
