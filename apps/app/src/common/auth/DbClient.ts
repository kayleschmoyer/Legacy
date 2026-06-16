import {
  ApolloClient,
  CombinedGraphQLErrors,
  from,
  HttpLink,
  InMemoryCache,
  Observable,
  ServerError,
} from '@apollo/client';
import type { ApolloLink } from '@apollo/client/link';
import { ErrorLink } from '@apollo/client/link/error';
import { RetryLink } from '@apollo/client/link/retry';
import { setContext } from '@apollo/client/link/context';
import { config } from '@legacy-sports/app-config/native';
import { LOGGER } from '@legacy-sports/logging';
import { SecureStorageProvider } from '@legacy-sports/shared-components';
import { GetUserById, UserFragment } from '@legacy-sports/graphql';
import { INTERNAL_JWT_KEY, silentlyRefreshJwt } from './jwtRefresh';

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

    const errorLink = new ErrorLink(({ error, operation, forward }) => {
      const is401 = ServerError.is(error) && error.statusCode === 401;
      const isUnauthenticated =
        CombinedGraphQLErrors.is(error) &&
        error.errors.some(
          (e) =>
            (e.extensions?.['code'] as string | undefined) ===
            'UNAUTHENTICATED',
        );

      if (is401 || isUnauthenticated) {
        // Attempt a silent JWT refresh via /refresh-jwt and replay the
        // operation with the new token (authLink re-reads it from secure
        // storage). silentlyRefreshJwt() clears the session itself on a
        // definitive rejection, so here we just propagate the original error
        // when no fresh token comes back. This stops the 24h JWT expiry from
        // force-bouncing the user through a full Google Sign-In (LS-8103).
        return new Observable<ApolloLink.Result>((observer) => {
          silentlyRefreshJwt()
            .then((newToken) => {
              if (!newToken) {
                observer.error(error);
                return;
              }
              forward(operation).subscribe({
                next: (value) => observer.next(value),
                error: (err: unknown) => observer.error(err),
                complete: () => observer.complete(),
              });
            })
            .catch((err: unknown) => {
              observer.error(err);
            });
        });
      }

      return;
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
