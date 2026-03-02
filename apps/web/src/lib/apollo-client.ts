import {
  ApolloClient,
  createHttpLink,
  from,
  InMemoryCache,
} from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { env } from '../config/environment';

// GraphQL endpoint URL from centralized environment config
const GRAPHQL_URL = env.graphqlUrl;

// Debug logging to check what URL is being used
console.log('🔗 Apollo Client Configuration:');
console.log('GraphQL URL from env config:', GRAPHQL_URL);

const httpLink = createHttpLink({
  uri: (operation) => `${GRAPHQL_URL}?ref=${operation.operationName}`,
  headers: {
    'apollo-require-preflight': 'true',
  },
});

// Authentication link to add JWT token to requests
const authLink = setContext((_, { headers }) => {
  // Get the authentication token from local storage if it exists
  const token = localStorage.getItem('auth_jwt');

  // Return the headers to the context so httpLink can read them
  return {
    headers: {
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
});

export const apolloClient = new ApolloClient({
  link: from([authLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: {
      errorPolicy: 'all',
    },
    query: {
      errorPolicy: 'all',
    },
  },
});
