import SchemaBuilder from '@pothos/core';
import { createDatabaseService } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';

// Initialize database service
const dbService = createDatabaseService(getDbOptions());

// Define the schema builder with comprehensive types
export const builder = new SchemaBuilder<{
  Objects: {
    User: {
      id: number;
      email?: string | null;
      username?: string | null;
      accessLevel?: string | null;
    };
    Player: {
      id: number;
      name: string;
      brefId: string;
    };
  };
}>({
  // Add notStrict to make TypeScript happy
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  notStrict: true,
});

// Create the basic Query type (types will be added by separate files)
builder.queryType({
  fields: (t) => ({
    hello: t.string({
      resolve: () => 'Hello from Pothos + Drizzle!',
    }),
  }),
});

// Note: The final schema is built and exported in index.ts after all types are registered
