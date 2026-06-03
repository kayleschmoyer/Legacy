import {
  ApolloClient,
  HttpLink,
  InMemoryCache,
  NormalizedCacheObject,
} from '@apollo/client';
import { config } from '@legacy-sports/app-config/native';
import { GetUserById, UserFragment } from '../../api/db/graphql.generated';

export class DbClient {
  public readonly apolloClient: ApolloClient<NormalizedCacheObject>;

  constructor() {
    const graphqlHost = config.graphqlHost;
    const link = new HttpLink({
      uri: (operation) => `${graphqlHost}?ref=${operation.operationName}`,
    });

    this.apolloClient = new ApolloClient({
      cache: new InMemoryCache(),
      link,
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
