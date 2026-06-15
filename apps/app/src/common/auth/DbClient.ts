import {
  ApolloClient,
  CombinedGraphQLErrors,
  from,
  HttpLink,
  InMemoryCache,
  ServerError,
} from '@apollo/client';
import { ErrorLink } from '@apollo/client/link/error';
import { RetryLink } from '@apollo/client/link/retry';
import { setContext } from '@apollo/client/link/context';
import { config } from '@legacy-sports/app-config/native';
import { LOGGER } from '@legacy-sports/logging';
import { SecureStorageProvider } from '@legacy-sports/shared-components';
import { GetUserById, UserFragment } from '@legacy-sports/graphql';
import { emitSessionExpired } from './sessionEvents';

const INTERNAL_JWT_KEY = 'INTERNAL_JWT';

export class DbClient {
  public readonly apolloClient: ApolloClient;

  constructor() {
    const httpLink = new HttpLink({
      uri: (operation) =>
        `${config.graphqlHost}?ref=${operation.operationName}`,
    });

    const authLink = setContext(async (_, prevContext) => {
      let token: string | null = null;
      try {
        token = await SecureStorageProvider.getItem(INTERNAL_JWT_KEY);
      } catch (err) {
        LOGGER.error(
          'Failed to read auth token for request',
          err instanceof Error ? err : new Error(String(err)),
        );
      }
      return {
        headers: {
          ...(prevContext['headers'] as Record<string, unknown>),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      };
    });

    const retryLink = new RetryLink({
      delay: { initial: 300, max: 5000, jitter: true },
      attempts: {
        max: 3,
        retryIf: (error: unknown) =>
          error instanceof Error && !('statusCode' in error),
      },
    });

    const errorLink = new ErrorLink(({ error }) => {
      const is401 = ServerError.is(error) && error.statusCode === 401;
      const isUnauthenticated =
        CombinedGraphQLErrors.is(error) &&
        error.errors.some(
          (e) =>
            (e.extensions?.['code'] as string | undefined) ===
            'UNAUTHENTICATED',
        );

      if (is401 || isUnauthenticated) {
        emitSessionExpired();
      }
    });

    this.apolloClient = new ApolloClient({
      cache: new InMemoryCache(),
      link: from([retryLink, errorLink, authLink, httpLink]),
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
