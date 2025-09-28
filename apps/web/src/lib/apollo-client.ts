import { ApolloClient, createHttpLink, InMemoryCache } from '@apollo/client';

// GraphQL endpoint URL - can be overridden with environment variable
const GRAPHQL_URL =
  process.env.REACT_APP_GRAPHQL_HOST ||
  process.env.VITE_GRAPHQL_HOST ||
  'http://localhost:5000/graphql';

const httpLink = createHttpLink({
  uri: (operation) => `${GRAPHQL_URL}?ref=${operation.operationName}`,
});

export const apolloClient = new ApolloClient({
  link: httpLink,
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
