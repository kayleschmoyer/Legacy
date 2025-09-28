import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { builder } from './builder';

// Create a single database service instance to reuse across all resolvers
const dbService = createDatabaseService(getDbOptions());

// User type
const UserRef = builder.objectRef<{
  id: number;
  email?: string | null;
  username?: string | null;
  accessLevel?: string | null;
}>('User');

UserRef.implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    email: t.exposeString('email', { nullable: true }),
    username: t.exposeString('username', { nullable: true }),
    accessLevel: t.exposeString('accessLevel', { nullable: true }),
  }),
});

// Add users query to the Query type
builder.queryField('users', (t) =>
  t.field({
    type: [UserRef],
    args: {
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
      orderBy: t.arg.string({ required: false }),
      orderDirection: t.arg.string({ required: false }),
    },
    resolve: async (root, args) => {
      const orderBy = args.orderBy as 'id' | 'email' | 'username' | undefined;
      const orderDirection = args.orderDirection as 'asc' | 'desc' | undefined;

      const users = await dbService.users.getUsers({
        limit: args.limit || undefined,
        offset: args.offset || undefined,
        orderBy: orderBy || 'id',
        orderDirection: orderDirection || 'asc',
      });

      return users.map((user) => ({
        id: Number(user.id),
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      }));
    },
  }),
);

builder.queryField('user', (t) =>
  t.field({
    type: UserRef,
    nullable: true,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: async (parent, { id }) => {
      // Using shared dbService instance

      const user = await dbService.users.getUserById(id);

      if (!user) return null;

      return {
        id: Number(user.id),
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      };
    },
  }),
);

builder.queryField('userByEmail', (t) =>
  t.field({
    type: UserRef,
    nullable: true,
    args: {
      email: t.arg.string({ required: true }),
    },
    resolve: async (parent, { email }) => {
      // Using shared dbService instance

      const user = await dbService.users.getUserByEmail(email);

      if (!user) return null;

      return {
        id: Number(user.id),
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      };
    },
  }),
);

builder.queryField('searchUsers', (t) =>
  t.field({
    type: [UserRef],
    args: {
      searchTerm: t.arg.string({ required: true }),
      limit: t.arg.int({ required: false }),
    },
    resolve: async (parent, args) => {
      // Using shared dbService instance

      const users = await dbService.users.searchUsers(
        args.searchTerm,
        args.limit || 10,
      );

      return users.map((user) => ({
        id: Number(user.id),
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      }));
    },
  }),
);
