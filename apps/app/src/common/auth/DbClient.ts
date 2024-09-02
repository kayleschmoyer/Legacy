import {
  ApolloClient,
  InMemoryCache,
  NormalizedCacheObject,
} from '@apollo/client/core';
import {getEnvVarRequired} from '@legacy-sports/env-utilities';
import {
  EnvironmentVariable,
} from '../EnvironmentVariables';
import {
  GetUserById,
  UserFragment,
} from '../../api/db/graphql.generated';

export class DbClient {
  public readonly apolloClient: ApolloClient<NormalizedCacheObject>;

  constructor() {
    this.apolloClient = new ApolloClient({
      uri: getEnvVarRequired(EnvironmentVariable.GRAPHQL_HOST),
      cache: new InMemoryCache(),
    });
  }

  public async getUserById(
    id: number,
  ): Promise<UserFragment | undefined | null> {
    const response = await this.apolloClient.query({
      query: GetUserById,
      variables: {
        id: id,
      },
    });

    return response.data.user;
  }
}
