import { LOGGER } from '@legacy-sports/logging';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { schema } from './schema';

const PORT = 5000;

async function startServer() {
  // Create Apollo Server instance
  const server = new ApolloServer({
    schema,
    introspection: true,
  });

  // Start the standalone server
  const { url } = await startStandaloneServer(server, {
    listen: { port: PORT },
    // eslint-disable-next-line @typescript-eslint/require-await
    context: async () => {
      return {};
    },
  });

  LOGGER.info(`🚀 GraphQL server ready at ${url}`);
  LOGGER.info(`🎮 GraphQL Playground available at ${url}`);
}

startServer().catch((error: Error) => {
  LOGGER.error(`Failed to start server: ${error.message}`);
  process.exit(1);
});
