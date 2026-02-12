// Placeholder apollo client for example purposes
import { ApolloClient, createHttpLink, InMemoryCache } from '@apollo/client';

export const apolloClient = new ApolloClient({
  link: createHttpLink({ uri: 'http://localhost:5000/graphql' }), // Replace with your GraphQL endpoint
  cache: new InMemoryCache(),
});
