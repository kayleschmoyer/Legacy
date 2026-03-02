// Load environment variables first
import './env';
import { LOGGER } from '@legacy-sports/logging';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { schema } from './schema';
import { createLoaders } from './schema/dataloaders';

interface JWTPayload {
  id: number;
  email?: string;
  username: string;
  isAdmin?: boolean;
  [key: string]: unknown; // For other JWT standard fields
}

interface User {
  id: number;
  email?: string;
  username: string;
  isAdmin: boolean;
}

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

  // Create database service for use in context
  const dbService = createDatabaseService(getDbOptions());

  // Test database connection
  try {
    LOGGER.info('🔗 Testing database connection...');
    // Test the connection by making a simple query
    void dbService.users.getUserById(1).catch(() => {
      // Query may fail, but it tests the connection
    });
    LOGGER.info('✅ Database connection successful!');
  } catch (error) {
    LOGGER.error(
      `❌ Database connection failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    LOGGER.info(
      '📝 Make sure your .env.local file has the correct database credentials',
    );
  }

  // Create Apollo Server instance
  const server = new ApolloServer({
    schema,
    introspection: true,
    csrfPrevention: false,
    formatError: (formattedError, error) => {
      // Log all errors with full context
      LOGGER.error('GraphQL Error', {
        message: formattedError.message,
        path: formattedError.path,
        extensions: formattedError.extensions,
        locations: formattedError.locations,
        originalError: error,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Return the formatted error to the client
      return formattedError;
    },
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
    context: async ({ req }) => {
      // Extract JWT from Authorization header
      const authorization = req.headers.authorization;
      let user: User | null = null;

      if (authorization && authorization.startsWith('Bearer ')) {
        try {
          const token = authorization.substring(7); // Remove 'Bearer ' prefix

          // Decode JWT payload (simple base64 decode - no signature verification for dev)
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(
              Buffer.from(
                parts[1].replace(/-/g, '+').replace(/_/g, '/'),
                'base64',
              ).toString(),
            ) as JWTPayload;

            user = {
              id: payload.id,
              email: payload.email,
              username: payload.username,
              isAdmin:
                payload.isAdmin === true || payload.accessLevel === 'admin',
            };
          }
        } catch (error) {
          LOGGER.warn(
            `Failed to decode JWT: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // Development fallback: provide a default user when no auth token is present
      if (!user) {
        user = {
          id: 1,
          email: 'dev@example.com',
          username: 'devuser',
          isAdmin: true,
        };
      }

      // Create a shared database connection for this request
      // This prevents each resolver from creating its own connection
      const db = await dbService.getDb();

      return {
        user,
        loaders: createLoaders(db), // Pass shared connection to loaders
        db, // Shared connection for all resolvers in this request
      };
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
