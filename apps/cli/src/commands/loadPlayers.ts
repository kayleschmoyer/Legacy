import { Argv } from 'yargs';
import { ApolloClient, InMemoryCache } from '@apollo/client';
import { BulkCreatePlayers, CreatePlayerInputRecordInput } from '../api/db/graphql.generated';
import {getPlayers, Letter} from '@legacy-sports/bref-client';
import { LOGGER } from '@legacy-sports/logging';

export const loadPlayersCommandBuilder = (argv: Argv) =>
  argv
    .usage('load-players');



export async function handleLoadPlayers(): Promise<void> {
  const players: CreatePlayerInputRecordInput[] = [];

  LOGGER.debug('Loading Players');

  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(97 + i);
    LOGGER.debug(`Loading Letter ${letter}`)
    const letterPlayers = await getPlayers(letter as Letter);
    players.push(...letterPlayers);
  }

  const client = new ApolloClient({
    uri: process.env.GRAPHQL_HOST,
    cache: new InMemoryCache(),
  });

  const PAGE_SIZE = 1000;
  for (let i = 0; i < Math.ceil(players.length / PAGE_SIZE); i++) {
    const thisRequest = players.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE);
    await client.mutate({
      mutation: BulkCreatePlayers,
      variables: {
        input: {
          playersToCreate: thisRequest,
        },
      },
    });
  }

  LOGGER.info(`Created ${players.length} players`);
}
