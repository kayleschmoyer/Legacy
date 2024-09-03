import { ApolloClient, NormalizedCacheObject } from '@apollo/client';
import { CareerStats, getCareerStats } from '@legacy-sports/bref-client';
import {
  GetPlayerByBrefId,
  SeasonBatting,
  SeasonFielding,
  SeasonPitching,
  UpsertSeasonBatting,
  UpsertSeasonFielding,
  UpsertSeasonPitching,
} from '../api/db/graphql.generated';
import { LOGGER } from '@legacy-sports/logging';

async function upsertFieldingSeason(
  client: ApolloClient<NormalizedCacheObject>,
  stats: SeasonFielding,
): Promise<void> {
  try {
    await client.mutate({
      mutation: UpsertSeasonFielding,
      variables: {
        where: {
          playerId: stats.playerId,
          team: stats.team,
          lgId: stats.lgId,
          season: stats.season,
          pos: stats.pos,
        },
        input: {
          seasonFielding: stats,
        },
      },
    });
  } catch (err) {
    LOGGER.error('Error Sending Request');
    LOGGER.debug(JSON.stringify(stats));
    throw err;
  }
}

async function upsertBattingSeason(
  client: ApolloClient<NormalizedCacheObject>,
  stats: SeasonBatting,
): Promise<void> {
  try {
    await client.mutate({
      mutation: UpsertSeasonBatting,
      variables: {
        where: {
          playerId: stats.playerId,
          team: stats.team,
          lgId: stats.lgId,
          season: stats.season,
        },
        input: {
          seasonBatting: stats,
        },
      },
    });
  } catch (err) {
    LOGGER.error('Error Sending Request');
    LOGGER.debug(JSON.stringify(stats));
    throw err;
  }
}

async function upsertPitchingSeason(
  client: ApolloClient<NormalizedCacheObject>,
  stats: SeasonPitching,
): Promise<void> {
  try {
    await client.mutate({
      mutation: UpsertSeasonPitching,
      variables: {
        where: {
          playerId: stats.playerId,
          team: stats.team,
          lgId: stats.lgId,
          season: stats.season,
        },
        input: {
          seasonPitching: stats,
        },
      },
    });
  } catch (err) {
    LOGGER.error('Error Sending Request');
    LOGGER.debug(JSON.stringify(stats));
    throw err;
  }
}

export async function loadCareerStats(
  client: ApolloClient<NormalizedCacheObject>,
  brefId: string,
): Promise<CareerStats> {
  const playerResponse = await client.query({
    query: GetPlayerByBrefId,
    variables: {
      brefId: brefId,
    },
  });

  const player = playerResponse.data.playerByBrefId;

  if (!player) {
    throw new Error(`Could not find player ${brefId}`);
  }

  const promises = [];
  LOGGER.debug(`Importing ${brefId}`);
  const stats = await getCareerStats(player);

  promises.push(stats.batting.map((s) => upsertBattingSeason(client, s)));
  promises.push(stats.fielding.map((s) => upsertFieldingSeason(client, s)));
  promises.push(stats.pitching.map((s) => upsertPitchingSeason(client, s)));

  await Promise.all(promises);

  return stats;
}
