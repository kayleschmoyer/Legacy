import {
  ApolloClient,
  InMemoryCache,
  NormalizedCacheObject,
} from '@apollo/client';
import { SQSEvent } from 'aws-lambda';
import { BatchHttpLink } from '@apollo/client/link/batch-http';
import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import { GetPlayerByBrefId } from './api/db/graphql.generated';
import { loadCareerStats } from '@legacy-sports/data-loaders';
import {LOGGER} from '@legacy-sports/logging'
import fetch from 'cross-fetch';

enum EnvironmentVariable {
  GRAPHQL_HOST = 'GRAPHQL_HOST',
}

async function loadPlayer(
  client: ApolloClient<NormalizedCacheObject>,
  brefId: string,
): Promise<void> {
  LOGGER.debug(`Importing ${brefId}`);

  const response = await client.query({
    query: GetPlayerByBrefId,
    variables: {
      brefId: brefId,
    },
  });

  const player = response.data.playerByBrefId;

  if (!player) {
    throw new Error(`Could not find player ${brefId}`);
  }

  await loadCareerStats(client, player.brefId);
}

export const handler = async (event: SQSEvent) => {
  LOGGER.debug(event);

  const gqlHost = getEnvVarRequired(EnvironmentVariable.GRAPHQL_HOST);

  const client = new ApolloClient({
    link: new BatchHttpLink({
      uri: gqlHost,
      fetch: fetch,
    }),
    cache: new InMemoryCache(),
  });

  for (const record of event.Records) {
    await loadPlayer(client, JSON.parse(record.body));
  }

  LOGGER.debug('done');
};
