import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { builder } from './builder';

// Player type
const PlayerRef = builder.objectRef<{
  id: number;
  firstName: string;
  lastName: string;
  brefId: string;
}>('Player');

PlayerRef.implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    firstName: t.exposeString('firstName'),
    lastName: t.exposeString('lastName'),
    brefId: t.exposeString('brefId'),
  }),
});

// Add players query
builder.queryField('players', (t) =>
  t.field({
    type: [PlayerRef],
    args: {
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
      orderBy: t.arg.string({ required: false }),
      orderDirection: t.arg.string({ required: false }),
    },
    resolve: async (root, args) => {
      const dbService = createDatabaseService(getDbOptions());

      const orderBy = args.orderBy as
        | 'id'
        | 'firstName'
        | 'lastName'
        | 'brefId'
        | undefined;
      const orderDirection = args.orderDirection as 'asc' | 'desc' | undefined;

      return dbService.players.getPlayers({
        limit: args.limit || undefined,
        offset: args.offset || undefined,
        orderBy: orderBy || 'id',
        orderDirection: orderDirection || 'asc',
      });
    },
  })
);

builder.queryField('player', (t) =>
  t.field({
    type: PlayerRef,
    nullable: true,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: async (parent, { id }) => {
      const dbService = createDatabaseService(getDbOptions());

      return dbService.players.getPlayerById(id);
    },
  })
);

builder.queryField('playerByBrefId', (t) =>
  t.field({
    type: PlayerRef,
    nullable: true,
    args: {
      brefId: t.arg.string({ required: true }),
    },
    resolve: async (parent, { brefId }) => {
      const dbService = createDatabaseService(getDbOptions());

      return dbService.players.getPlayerByBrefId(brefId);
    },
  })
);

builder.queryField('searchPlayers', (t) =>
  t.field({
    type: [PlayerRef],
    args: {
      searchTerm: t.arg.string({ required: true }),
      limit: t.arg.int({ required: false }),
    },
    resolve: async (parent, args) => {
      const dbService = createDatabaseService(getDbOptions());

      return dbService.players.searchPlayers(args.searchTerm, args.limit || 10);
    },
  })
);
