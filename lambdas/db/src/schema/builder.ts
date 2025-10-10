import SchemaBuilder from '@pothos/core';
import RelayPlugin from '@pothos/plugin-relay';
import DataloaderPlugin from '@pothos/plugin-dataloader';
import ValidationPlugin from '@pothos/plugin-validation';
import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';

// Initialize database service
createDatabaseService(getDbOptions());

// Define context type for GraphQL resolvers
export interface Context {
  user?: {
    id: number;
    email?: string | null;
    username?: string | null;
    isAdmin?: boolean;
  } | null;
}

// Define the schema builder with comprehensive types
export const builder = new SchemaBuilder<{
  Context: Context;
  Objects: {
    User: {
      id: number;
      email?: string | null;
      username?: string | null;
      accessLevel?: string | null;
    };
    Player: {
      id: number;
      firstName: string;
      lastName: string;
      brefId: string;
      statsLastFetchedAt: Date | null;
    };
    CareerBatting: {
      playerId: number | null;
      g: number | null;
      pa: number | null;
      ab: number | null;
      r: number | null;
      h: number | null;
      doubles: number | null;
      triples: number | null;
      hr: number | null;
      rbi: number | null;
      sb: number | null;
      cs: number | null;
      bb: number | null;
      so: number | null;
      tb: number | null;
      gidp: number | null;
      hbp: number | null;
      sh: number | null;
      ibb: number | null;
    };
    CareerPitching: {
      playerId: number | null;
      w: number | null;
      l: number | null;
      g: number | null;
      gs: number | null;
      gf: number | null;
      cg: number | null;
      sho: number | null;
      sv: number | null;
      h: number | null;
      r: number | null;
      er: number | null;
      hr: number | null;
      bb: number | null;
      ibb: number | null;
      so: number | null;
      hbp: number | null;
      bk: number | null;
      wp: number | null;
      battersFaced: number | null;
      outsRecorded: number | null;
      outRate: number | null;
      era: string | null;
    };
    CareerFielding: {
      playerId: number | null;
      g: number | null;
      gs: number | null;
      cg: number | null;
      innDef: number | null;
      chances: number | null;
      po: number | null;
      a: number | null;
      eDef: number | null;
      dpDef: number | null;
      sb: number | null;
      cs: number | null;
      pickoffs: number | null;
      wp: number | null;
      pos: string | null;
    };
  };
}>({
  plugins: [RelayPlugin, DataloaderPlugin, ValidationPlugin],
  relayOptions: {
    // Configure relay options for connections
    clientMutationId: 'omit',
    cursorType: 'String',
  },
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

// Create the basic Mutation type (mutations will be added by separate files)
builder.mutationType({
  fields: (t) => ({
    // This is just a placeholder - actual mutations are added in separate files
    _placeholder: t.boolean({
      resolve: () => true,
    }),
  }),
});

// Note: The final schema is built and exported in index.ts after all types are registered
