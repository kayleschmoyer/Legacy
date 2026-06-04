import { sign } from 'jsonwebtoken';
import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { randomBytes } from 'node:crypto';
import { builder } from './builder';
import { requireAdmin, requireAuth } from './authorization';
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
  themePreference?: string | null;
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
    themePreference: t.exposeString('themePreference', { nullable: true }),
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

      LOGGER.error('Admin user list viewed', {
        audit: true,
        actor: { id: Number(user.id) },
        resultCount: users.length,
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
        themePreference: u.themePreference ?? null,
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

      const count = await dbService.users.countUsers({
        searchTerm: args.search || undefined,
        filters: accessLevelFilter
          ? { accessLevel: accessLevelFilter }
          : undefined,
      });

      LOGGER.error('Admin user count viewed', {
        audit: true,
        actor: { id: Number(user.id) },
        count,
      });

      return count;
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
        themePreference: user.themePreference ?? null,
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
        themePreference: foundUser.themePreference ?? null,
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
        themePreference: user.themePreference ?? null,
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
      await requireAdmin(context);
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
        themePreference: updated.themePreference ?? null,
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
          themePreference: updated.themePreference ?? null,
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
        themePreference: updated.themePreference ?? null,
      };
    },
  }),
);

const ALLOWED_THEME_PREFERENCES: readonly string[] = [
  'system',
  'light',
  'dark',
];

builder.mutationField('updateUserTheme', (t) =>
  t.field({
    type: UserRef,
    nullable: true,
    description:
      'Update the theme preference ("system" | "light" | "dark") for the currently authenticated user. Syncs the choice across devices (LS-4913).',
    args: {
      themePreference: t.arg.string({ required: true }),
    },
    resolve: async (parent, { themePreference }, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      if (!ALLOWED_THEME_PREFERENCES.includes(themePreference)) {
        throw UserInputError(
          'themePreference must be one of: system, light, dark',
        );
      }

      const updated = await dbService.users.updateUserTheme(
        context.user.id,
        themePreference,
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
        themePreference: updated.themePreference ?? null,
      };
    },
  }),
);

// ─── Leaked test-user cleanup (LS-4917) ───────────────────────────────────────

/**
 * Sweep target: per-run test users left over by the short-lived
 * `int-${role}-${Date.now().toString(36)}@test.legacysports.dev` producer
 * introduced in commit 4a9121732 (March 2026) and reverted by LS-2314.
 * The producer is gone; these orphan rows are a one-time backfill, but the
 * mutation is exposed so any future drift can be cleaned up the same way.
 *
 * The pattern is hardcoded (not caller-supplied) to keep this admin-only path
 * from being usable to wipe arbitrary user cohorts.
 */
const LEAKED_TEST_USER_EMAIL_PATTERN = 'int-%@test.legacysports.dev';

/**
 * Minimum age required before a matching user is eligible for deletion.
 * Mirrors the rationale of `MIN_LEAGUE_AGE_FOR_CLEANUP_MS` in the integration
 * league cleanup — protects against any future producer that briefly resurfaces
 * the same naming pattern from having its fixtures yanked mid-run.
 */
const DEFAULT_LEAKED_USER_MIN_AGE_DAYS = 7;

const CleanupLeakedTestUsersResultRef = builder.objectRef<{
  matched: number;
  deleted: number;
  dryRun: boolean;
  minAgeDays: number;
  sampleEmails: string[];
  errors: string[];
}>('CleanupLeakedTestUsersResult');

CleanupLeakedTestUsersResultRef.implement({
  fields: (t) => ({
    matched: t.exposeInt('matched'),
    deleted: t.exposeInt('deleted'),
    dryRun: t.exposeBoolean('dryRun'),
    minAgeDays: t.exposeInt('minAgeDays'),
    sampleEmails: t.exposeStringList('sampleEmails'),
    errors: t.exposeStringList('errors'),
  }),
});

builder.mutationField('cleanupLeakedTestUsers', (t) =>
  t.field({
    type: CleanupLeakedTestUsersResultRef,
    description:
      'Admin only: delete leaked `int-*@test.legacysports.dev` test users older than `minAgeDays` (default 7). Pass `dryRun: true` to preview the match set.',
    args: {
      dryRun: t.arg.boolean({ required: true }),
      minAgeDays: t.arg.int({ required: false }),
    },
    resolve: async (parent, { dryRun, minAgeDays }, context) => {
      const adminUser = await requireAdmin(context);

      const ageDays = minAgeDays ?? DEFAULT_LEAKED_USER_MIN_AGE_DAYS;
      if (ageDays < 1) {
        throw UserInputError('minAgeDays must be >= 1');
      }

      const result = await dbService.users.deleteLeakedTestUsers({
        emailLikePattern: LEAKED_TEST_USER_EMAIL_PATTERN,
        minAgeMs: ageDays * 24 * 60 * 60 * 1000,
        dryRun,
      });

      // Audit log: every sweep is recorded at error level with actor ID and
      // counts only — no emails or other PII. Sample emails for operator
      // spot-checking are returned in the GraphQL response, not logged.
      LOGGER.error('Leaked test-user cleanup sweep', {
        audit: true,
        actor: { id: Number(adminUser.id) },
        dryRun,
        minAgeDays: ageDays,
        matched: result.matched.length,
        deleted: result.deleted,
        errorCount: result.errors.length,
      });

      return {
        matched: result.matched.length,
        deleted: result.deleted,
        dryRun,
        minAgeDays: ageDays,
        sampleEmails: result.matched.slice(0, 10).map((u) => u.email),
        errors: result.errors.map(
          (e) => `user ${e.id} (${e.email}): ${e.message}`,
        ),
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
      const adminUser = await requireAdmin(context);

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
          id: Number(adminUser.id),
          email: adminUser.email,
          username: adminUser.username,
        },
      };

      const IMPERSONATION_TTL = '2h';
      const token = sign(payload, jwtSecret, {
        algorithm: 'HS256',
        expiresIn: IMPERSONATION_TTL,
        issuer: 'legacy-sports-oauth-proxy',
        audience: 'legacy-sports',
        jwtid: randomBytes(16).toString('hex'),
      });

      // Audit log: record every impersonation event for security forensics.
      // Logged at error level so it is forwarded to centralized error monitoring
      // systems (e.g. Rollbar) while still appearing prominently in server logs.
      LOGGER.error('Admin impersonation token issued', {
        audit: true,
        actor: {
          id: Number(adminUser.id),
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
