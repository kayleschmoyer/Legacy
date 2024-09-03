import { Argv } from 'yargs';
import {
  ApolloClient,
  ApolloQueryResult,
  InMemoryCache,
  NormalizedCacheObject,
} from '@apollo/client';
import { loadCareerStats } from '@legacy-sports/data-loaders';
import { BatchHttpLink } from '@apollo/client/link/batch-http';
import axios from 'axios';
import {
  GetAllPlayers,
  GetAllPlayersQuery,
  PlayerFragment,
} from '../api/db/graphql.generated';
import {LOGGER} from '@legacy-sports/logging'
import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import { EnvironmentVariable } from '../EnvironmentVariable';

export const loadCareerStatsCommandBuilder = (argv: Argv) =>
  argv
    .usage('load-career-stats')
    .option('remote', {
      type: 'boolean',
      default: true,
    })
    .demand('remote');

type ArgsType<T> = T extends Argv<infer P> ? P : never;

async function insertIntoSqs(playerId: string): Promise<void> {
  const sqsHost = getEnvVarRequired(EnvironmentVariable.LOAD_STATS_SQS_HOST);

  await axios.post(sqsHost, { playerId: playerId });
}

type HandleLoadCareerStatsArgs = ArgsType<
  ReturnType<typeof loadCareerStatsCommandBuilder>
>;

async function fetchAllPlayers(
  client: ApolloClient<NormalizedCacheObject>,
): Promise<PlayerFragment[]> {
  let cursor = null;
  let hasNext = true;
  const result: PlayerFragment[] = [];

  let response: ApolloQueryResult<GetAllPlayersQuery>;

  while (hasNext) {
    response = await client.query({
      query: GetAllPlayers,
      variables: {
        after: cursor,
      },
    });

    const players = response.data.players?.nodes;

    if (players) {
      for (const player of players) {
        if (player) {
          result.push(player);
        }
      }
    }

    cursor = response.data.players?.pageInfo.endCursor;
    hasNext = !!response.data.players?.pageInfo.hasNextPage;
  }

  return result;
}

export async function handleLoadCareerStats(
  args: HandleLoadCareerStatsArgs,
): Promise<void> {
  LOGGER.debug('Loading Player Stats');
  const gqlHost = getEnvVarRequired(EnvironmentVariable.GRAPHQL_HOST);

  const client = new ApolloClient({
    link: new BatchHttpLink({
      uri: gqlHost,
      batchMax: 5,
      batchInterval: 20,
    }),
    cache: new InMemoryCache(),
  });

  const players = await fetchAllPlayers(client);

  for (const player of players) {
    LOGGER.info(`Loading Player ${player.brefId}`);
    if (args.remote) {
      await insertIntoSqs(player.brefId);
    } else {
      await loadCareerStats(client, player.brefId);
    }

    break;
  }

  LOGGER.info(`Created ${players.length} players`);
}
