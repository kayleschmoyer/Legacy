import { Argv } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';
import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import axios from 'axios';
import { ArgsType } from './ArgsType';

export const createMatchupCommandBuilder = (argv: Argv) =>
  argv
    .usage('create-matchup')
    .option('league', {
      type: 'number',
    })
    .demandOption('league')
    .option('week', { type: 'number' })
    .demandOption('week');

type HandleCreateMatchupArgs = ArgsType<
  ReturnType<typeof createMatchupCommandBuilder>
>;

export async function handleCreateMatchup(
  args: HandleCreateMatchupArgs,
): Promise<void> {
  LOGGER.debug('Creating Matchups');

  const { league, week } = args;

  const host = getEnvVarRequired('GAME_SELECTION_LAMBDA_HOST');

  await axios.post(`${host}/create-matchup`, {
    league: league,
    week: week,
  });
}
