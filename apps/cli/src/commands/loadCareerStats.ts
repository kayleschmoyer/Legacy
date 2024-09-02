
import { Argv } from 'yargs';
import {
  ApolloClient,
  ApolloQueryResult,
  InMemoryCache,
  NormalizedCacheObject,
} from '@apollo/client';
import {
  BulkUpdateStats,
  BulkUpdateStatsInput,
  GetAllPlayers,
  GetAllPlayersQuery,
  PlayerFragment,
} from '../api/db/graphql.generated';
import {getCareerStats} from '@legacy-sports/bref-client';

export const loadCareerStatsCommandBuilder = (argv: Argv) =>
  argv.usage('load-career-stats');


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

export async function handleLoadCareerStats(): Promise<void> {
  console.log('Loading Player Stats');

  const client = new ApolloClient({
    uri: process.env.GRAPHQL_HOST,
    cache: new InMemoryCache(),
  });

  const players = await fetchAllPlayers(client);

  for (const player of players) {
    console.log(`Importing ${player.name}`);
    const stats = await getCareerStats(player);

    const input: BulkUpdateStatsInput = {
      battingStats: [],
      fieldingStats: [],
      pitchingStats: [],
    };

    if (stats.batting) {
      input.battingStats.push(stats.batting);
    }

    if (stats.fielding) {
      input.fieldingStats.push(stats.fielding);
    }

    if (stats.pitching) {
      input.pitchingStats.push(stats.pitching);
    }

    await client.mutate({
      mutation: BulkUpdateStats,
      variables: {
        input: input,
      },
    });
  }

  console.log(`Created ${players.length} players`);
}
