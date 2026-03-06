import {
  ApolloClient,
  InMemoryCache,
  NormalizedCacheObject,
} from '@apollo/client';
import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import { EnvironmentVariable } from '../EnvironmentVariables';
import { GetUserById, UserFragment } from '../../api/db/graphql.generated';

export class DbClient {
  public readonly apolloClient: ApolloClient<NormalizedCacheObject>;

  constructor() {
    this.apolloClient = new ApolloClient({
      cache: new InMemoryCache(),
      uri: (op) =>
        `${getEnvVarRequired(EnvironmentVariable.GRAPHQL_HOST)}?ref=${
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          op.operationName
        }`,
    });
  }

  public async getUserById(
    id: number,
  ): Promise<UserFragment | undefined | null> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const response = await this.apolloClient.query({
      query: GetUserById,
      variables: {
        id: id,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    return response.data.user;
  }
}
