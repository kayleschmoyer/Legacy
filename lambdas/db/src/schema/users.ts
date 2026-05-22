import { sign } from 'jsonwebtoken';
import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { builder } from './builder';
import { requireAuth } from './authorization';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from './graphql-errors';
import { getJwtSecret } from '../server/context';

// Create a single database service instance to reuse across all resolvers
const dbService = createDatabaseService(getDbOptions());

// User type
export const UserRef = builder.objectRef<{
  id: number;
  email?: string | null;
  username?: string | null;
  accessLevel?: string | null;
  avatarUrl?: string | null;
  subscriptionTier?: string | null;
  discordId?: string | null;
  discordUsername?: string | null;
  discordAvatar?: string | null;
}>('User');

UserRef.implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    email: t.exposeString('email', { nullable: true }),
    username: t.exposeString('username', { nullable: true }),
    accessLevel: t.exposeString('accessLevel', { nullable: true }),
    avatarUrl: t.exposeString('avatarUrl', { nullable: true }),
    subscriptionTier: t.exposeString('subscriptionTier', { nullable: true }),
    discordId: t.exposeString('discordId', { nullable: true }),
    discordUsername: t.exposeString('discordUsername', { nullable: true }),
    discordAvatar: t.exposeString('discordAvatar', { nullable: true }),
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
      search: t.arg.string({ required: false }),
      accessLevel: t.arg.string({ required: false }),
    },
    resolve: async (root, args, context) => {
      // Admin only — this endpoint lists all users with their email addresses
      const user = requireAuth(context);
      if (!user.isAdmin) {
        throw ForbiddenError('Admin access required to list all users');
      }

      const orderBy = args.orderBy as 'id' | 'email' | 'username' | undefined;
      const orderDirection = args.orderDirection as 'asc' | 'desc' | undefined;
      const accessLevelFilter = args.accessLevel as
        | 'none'
        | 'admin'
        | undefined;

      const users = await dbService.users.getUsers({
        limit: args.limit || undefined,
        offset: args.offset || undefined,
        orderBy: orderBy || 'email',
        orderDirection: orderDirection || 'asc',
        searchTerm: args.search || undefined,
        filters: accessLevelFilter
          ? { accessLevel: accessLevelFilter }
          : undefined,
      });

      return users.map((u) => ({
        id: Number(u.id),
        email: u.email,
        username: u.username,
        accessLevel: u.accessLevel,
        avatarUrl: u.avatarUrl ?? null,
        discordId: u.discordId ?? null,
        discordUsername: u.discordUsername ?? null,
        discordAvatar: u.discordAvatar ?? null,
      }));
    },
  }),
);

builder.queryField('usersCount', (t) =>
  t.field({
    type: 'Int',
    args: {
      search: t.arg.string({ required: false }),
      accessLevel: t.arg.string({ required: false }),
    },
    resolve: async (root, args, context) => {
      // Admin only
      const user = requireAuth(context);
      if (!user.isAdmin) {
        throw ForbiddenError('Admin access required to count users');
      }

      const accessLevelFilter = args.accessLevel as
        | 'none'
        | 'admin'
        | undefined;

      return dbService.users.countUsers({
        searchTerm: args.search || undefined,
        filters: accessLevelFilter
          ? { accessLevel: accessLevelFilter }
          : undefined,
      });
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
        avatarUrl: user.avatarUrl ?? null,
        discordId: user.discordId ?? null,
        discordUsername: user.discordUsername ?? null,
        discordAvatar: user.discordAvatar ?? null,
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
    resolve: async (parent, { email }, context) => {
      // Admin only — looking up users by email exposes PII
      const authedUser = requireAuth(context);
      if (!authedUser.isAdmin) {
        throw ForbiddenError('Admin access required to look up users by email');
      }

      // Using shared dbService instance

      const foundUser = await dbService.users.getUserByEmail(email);

      if (!foundUser) return null;

      return {
        id: Number(foundUser.id),
        email: foundUser.email,
        username: foundUser.username,
        accessLevel: foundUser.accessLevel,
        avatarUrl: foundUser.avatarUrl ?? null,
        discordId: foundUser.discordId ?? null,
        discordUsername: foundUser.discordUsername ?? null,
        discordAvatar: foundUser.discordAvatar ?? null,
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
    resolve: async (parent, args, context) => {
      // Requires authentication — used for inviting users to leagues
      requireAuth(context);

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
        avatarUrl: user.avatarUrl ?? null,
        discordId: user.discordId ?? null,
        discordUsername: user.discordUsername ?? null,
        discordAvatar: user.discordAvatar ?? null,
      }));
    },
  }),
);

builder.mutationField('updateUserRole', (t) =>
  t.field({
    type: UserRef,
    nullable: true,
    description:
      'Update a user\'s access level. Requires admin access. Use "admin" to grant admin privileges or "none" to revoke them.',
    args: {
      userId: t.arg.int({ required: true }),
      accessLevel: t.arg.string({ required: true }),
    },
    resolve: async (parent, { userId, accessLevel }, context) => {
      if (!context.user?.isAdmin) {
        throw ForbiddenError('Admin access required to update user roles');
      }
      if (accessLevel !== 'none' && accessLevel !== 'admin') {
        throw new Error('accessLevel must be "none" or "admin"');
      }

      const updated = await dbService.users.updateUserAccessLevel(
        userId,
        accessLevel,
      );

      if (!updated) return null;

      return {
        id: Number(updated.id),
        email: updated.email,
        username: updated.username,
        accessLevel: updated.accessLevel,
        avatarUrl: updated.avatarUrl ?? null,
        discordId: updated.discordId ?? null,
        discordUsername: updated.discordUsername ?? null,
        discordAvatar: updated.discordAvatar ?? null,
      };
    },
  }),
);

builder.mutationField('updateUsername', (t) =>
  t.field({
    type: UserRef,
    nullable: true,
    description: 'Update the username for the currently authenticated user.',
    args: {
      username: t.arg.string({ required: true }),
    },
    resolve: async (parent, { username }, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const trimmed = username.trim();
      if (trimmed.length < 3 || trimmed.length > 50) {
        throw UserInputError('Username must be between 3 and 50 characters');
      }
      if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
        throw UserInputError(
          'Username can only contain letters, numbers, underscores, hyphens, and periods',
        );
      }

      try {
        const updated = await dbService.users.updateUsername(
          context.user.id,
          trimmed,
        );

        if (!updated) return null;

        return {
          id: Number(updated.id),
          email: updated.email,
          username: updated.username,
          accessLevel: updated.accessLevel,
          avatarUrl: updated.avatarUrl ?? null,
          discordId: updated.discordId ?? null,
          discordUsername: updated.discordUsername ?? null,
          discordAvatar: updated.discordAvatar ?? null,
        };
      } catch (error: unknown) {
        // Check for Postgres unique constraint violation (code 23505)
        const pgError = error as { code?: string; constraint?: string };
        if (
          pgError.code === '23505' &&
          pgError.constraint === 'users_username_uk'
        ) {
          throw UserInputError('Username is already taken');
        }
        throw error;
      }
    },
  }),
);

builder.mutationField('updateUserAvatar', (t) =>
  t.field({
    type: UserRef,
    nullable: true,
    description: 'Update the avatar URL for the currently authenticated user.',
    args: {
      avatarUrl: t.arg.string({ required: false }),
    },
    resolve: async (parent, { avatarUrl }, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const url = avatarUrl ?? null;
      if (url !== null && url.length > 2048) {
        throw new Error('Avatar URL cannot exceed 2048 characters');
      }

      const updated = await dbService.users.updateUserAvatar(
        context.user.id,
        url,
      );

      if (!updated) return null;

      return {
        id: Number(updated.id),
        email: updated.email,
        username: updated.username,
        accessLevel: updated.accessLevel,
        avatarUrl: updated.avatarUrl ?? null,
        discordId: updated.discordId ?? null,
        discordUsername: updated.discordUsername ?? null,
        discordAvatar: updated.discordAvatar ?? null,
      };
    },
  }),
);

// ─── Impersonation ────────────────────────────────────────────────────────────

const ImpersonateUserResultRef = builder.objectRef<{
  token: string;
}>('ImpersonateUserResult');

ImpersonateUserResultRef.implement({
  fields: (t) => ({
    token: t.exposeString('token'),
  }),
});

/**
 * Admin-only mutation that generates a signed impersonation JWT for a target
 * user.  The calling user must have `isAdmin === true`.  Admins cannot
 * impersonate other admin users.
 */
builder.mutationField('impersonateUser', (t) =>
  t.field({
    type: ImpersonateUserResultRef,
    description:
      'Admin only: generate a JWT that authenticates as the specified user for debugging purposes.',
    args: {
      userId: t.arg.int({ required: true }),
    },
    resolve: async (parent, { userId }, context) => {
      if (!context.user?.isAdmin) {
        throw ForbiddenError('Forbidden: admin access required');
      }

      const targetUser = await dbService.users.getUserById(userId);
      if (!targetUser) {
        throw new Error(`User ${userId} not found`);
      }

      if (targetUser.accessLevel === 'admin') {
        throw ForbiddenError(
          'Forbidden: cannot impersonate another admin user',
        );
      }

      const jwtSecret = await getJwtSecret();

      const payload = {
        id: Number(targetUser.id),
        email: targetUser.email,
        username: targetUser.username ?? '',
        accessLevel: targetUser.accessLevel ?? 'none',
        impersonatedBy: {
          id: Number(context.user.id),
          email: context.user.email,
          username: context.user.username,
        },
      };

      const IMPERSONATION_TTL = '2h';
      const token = sign(payload, jwtSecret, {
        algorithm: 'HS256',
        expiresIn: IMPERSONATION_TTL,
      });

      // Audit log: record every impersonation event for security forensics.
      // Logged at error level so it is forwarded to centralized error monitoring
      // systems (e.g. Rollbar) while still appearing prominently in server logs.
      LOGGER.error('Admin impersonation token issued', {
        audit: true,
        actor: {
          id: Number(context.user.id),
        },
        target: {
          id: Number(targetUser.id),
        },
        issuedAt: new Date().toISOString(),
        expiresIn: IMPERSONATION_TTL,
      });

      return { token };
    },
  }),
);
