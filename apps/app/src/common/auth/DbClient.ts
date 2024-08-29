import {
  ApolloClient,
  InMemoryCache,
  NormalizedCacheObject,
} from '@apollo/client/core';
import {
  EnvironmentVariable,
  getEnvVarRequired,
} from '../EnvironmentVariables';
import {
  CreateUser,
  GetUserByEmail,
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

    return response.data.userById;
  }
}
