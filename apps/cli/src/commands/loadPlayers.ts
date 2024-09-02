import { Argv } from 'yargs';
import htmlParser from 'node-html-parser';
import { ApolloClient, InMemoryCache } from '@apollo/client';
import { BulkCreatePlayers, CreatePlayerInputRecordInput } from '../api/db/graphql.generated';
import {getPlayers, Letter} from '@legacy-sports/bref-client';

export const loadPlayersCommandBuilder = (argv: Argv) =>
  argv
    .usage('load-players');



export async function handleLoadPlayers(): Promise<void> {
  const players: CreatePlayerInputRecordInput[] = [];

  console.log('Loading Players');

  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(97 + i);
    console.log(`Loading Letter ${letter}`)
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

  console.log(`Created ${players.length} players`);
}
