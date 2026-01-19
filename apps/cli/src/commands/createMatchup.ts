import { Argv } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';
import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import axios from 'axios';
import { ArgsType } from './ArgsType';
import { AuthMiddleware } from '../services/AuthMiddleware';

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

interface CreateMatchupResponse {
  matchupId: string | number;
  playersAdded: number;
  league: number;
  week: number;
}

export async function handleCreateMatchup(
  args: HandleCreateMatchupArgs,
): Promise<void> {
  LOGGER.debug('Creating Matchups');

  const { league, week } = args;

  const host = getEnvVarRequired('GAME_SELECTION_LAMBDA_HOST');
  
  // Get authentication headers
  const authMiddleware = new AuthMiddleware();
  const headers = await authMiddleware.getAuthHeaders();

  const response = await axios.post<CreateMatchupResponse>(`${host}/games/create-matchup`, {
    league: league,
    week: week,
  }, { headers });
  
  LOGGER.info(`✅ Matchup created successfully!`);
  LOGGER.info(`   Matchup ID: ${response.data.matchupId}`);
  LOGGER.info(`   Players added: ${response.data.playersAdded}`);
  LOGGER.info(`   League: ${response.data.league}, Week: ${response.data.week}`);
}
