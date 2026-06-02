import {
  ApolloClient,
  HttpLink,
  InMemoryCache,
  NormalizedCacheObject,
} from '@apollo/client';
import Constants from 'expo-constants';
import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import { EnvironmentVariable } from '../EnvironmentVariables';
import { GetUserById, UserFragment } from '../../api/db/graphql.generated';

/**
 * Resolve the GraphQL host. `getEnvVarOptional` reads `process.env` via a
 * dynamic key, which `babel-preset-expo` cannot inline, so in a release bundle
 * it is always `undefined`; the value is instead embedded into
 * `Constants.expoConfig.extra.graphqlHost` by `app.config.js`. Prefer the env
 * var (so `expo start` and tests keep working), then fall back to `extra`
 * (LS-6399).
 */
function resolveGraphqlHost(): string {
  const fromEnv = getEnvVarOptional(EnvironmentVariable.GRAPHQL_HOST);
  if (fromEnv) {
    return fromEnv;
  }
  const fromExtra: unknown = Constants.expoConfig?.extra?.graphqlHost;
  if (typeof fromExtra === 'string' && fromExtra.length > 0) {
    return fromExtra;
  }
  throw new Error(
    `GraphQL host is not configured: set ${EnvironmentVariable.GRAPHQL_HOST} or extra.graphqlHost`,
  );
}

export class DbClient {
  public readonly apolloClient: ApolloClient<NormalizedCacheObject>;

  constructor() {
    const graphqlHost = resolveGraphqlHost();
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
