// Placeholder apollo client for example purposes
import { ApolloClient, InMemoryCache } from '@apollo/client';

export const apolloClient = new ApolloClient({
  uri: 'http://localhost:5000/graphql', // Replace with your GraphQL endpoint
  cache: new InMemoryCache(),
});
