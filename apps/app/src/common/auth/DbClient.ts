import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { config } from '@legacy-sports/app-config/native';
import { GetUserById, UserFragment } from '../../api/db/graphql.generated';

export class DbClient {
  public readonly apolloClient: ApolloClient;

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
    const response = await this.apolloClient.query<{
      user: UserFragment | null;
    }>({
      query: GetUserById,
      variables: { id },
    });

    return response.data?.user ?? null;
  }
}
