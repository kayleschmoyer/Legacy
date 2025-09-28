// Load environment variables first
import './env';

import { LOGGER } from '@legacy-sports/logging';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { schema } from './schema';

const PORT = 5000;

async function startServer() {
  LOGGER.info('🔄 Building GraphQL schema...');

  // Log environment variables for debugging
  LOGGER.info('🌍 Environment Variables:');
  LOGGER.info(`  DB_HOST: ${process.env.DB_HOST || 'NOT SET'}`);
  LOGGER.info(`  DB_USER: ${process.env.DB_USER || 'NOT SET'}`);
  LOGGER.info(
    `  DB_PASSWORD: ${process.env.DB_PASSWORD ? '***SET***' : 'NOT SET'}`,
  );
  LOGGER.info(`  DB_CERT_PATH: ${process.env.DB_CERT_PATH || 'NOT SET'}`);
  LOGGER.info(`  USE_LOCAL_CREDS: ${process.env.USE_LOCAL_CREDS || 'NOT SET'}`);

  // Test database connection
  try {
    LOGGER.info('🔗 Testing database connection...');
    const dbService = createDatabaseService(getDbOptions());
    // Test the connection by making a simple query
    void dbService.users.getUserById(1).catch(() => {
      // Query may fail, but it tests the connection
    });
    LOGGER.info('✅ Database connection successful!');
  } catch (error) {
    LOGGER.error(`❌ Database connection failed: ${error}`);
    LOGGER.info(
      '📝 Make sure your .env.local file has the correct database credentials',
    );
  }

  // Create Apollo Server instance
  const server = new ApolloServer({
    schema,
    introspection: true,
  });

  // Log available queries for debugging
  const queryFields = schema.getQueryType()?.getFields() || {};
  const queryNames = Object.keys(queryFields);
  const careerQueries = queryNames.filter((name) => name.includes('career'));

  LOGGER.info(`📊 Schema built with ${queryNames.length} queries`);
  LOGGER.info(`🏆 Career statistics queries: ${careerQueries.join(', ')}`);

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
  LOGGER.info('👀 File watching enabled - server will restart on changes');
}

startServer().catch((error: Error) => {
  LOGGER.error(`Failed to start server: ${error.message}`);
  process.exit(1);
});
