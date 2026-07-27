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
  email?: string | null; // mapped from users.canonical_email
  username?: string | null;
  accessLevel?: string | null;
  avatarUrl?: string | null;
  subscriptionTier?: string | null;
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
    themePreference: t.exposeString('themePreference', { nullable: true }),
  }),
});

// UserIdentity type (LS-7822) — one row per linked auth provider.
// provider_account_id is intentionally NOT exposed: the provider's raw account
// id never leaves the internal schema (the public.user_identities view omits it).
export const UserIdentityRef = builder.objectRef<{
  id: number;
  userId: number;
  provider: string;
  providerEmail?: string | null;
  providerEmailVerified: boolean;
  providerUsername?: string | null;
  providerAvatar?: string | null;
  linkedAt: string;
  lastLoginAt?: string | null;
}>('UserIdentity');

UserIdentityRef.implement({
  description:
    'A single authentication provider linked to a user (Discord, Google, Apple, or local password). The provider account id is never exposed.',
  fields: (t) => ({
    // id, userId, provider, providerEmailVerified, and linkedAt are NOT NULL in
    // app_internal.user_identities, so they are exposed as non-nullable here.
    id: t.exposeInt('id', { nullable: false }),
    userId: t.exposeInt('userId', { nullable: false }),
    provider: t.exposeString('provider', { nullable: false }),
    providerEmail: t.exposeString('providerEmail', { nullable: true }),
    providerEmailVerified: t.exposeBoolean('providerEmailVerified', {
      nullable: false,
    }),
    providerUsername: t.exposeString('providerUsername', { nullable: true }),
    providerAvatar: t.exposeString('providerAvatar', { nullable: true }),
    linkedAt: t.exposeString('linkedAt', { nullable: false }),
    lastLoginAt: t.exposeString('lastLoginAt', { nullable: true }),
  }),
});

// Authenticated user's own linked identities. Restricted to the caller so one
// user can never enumerate another user's provider emails.
builder.queryField('myIdentities', (t) =>
  t.field({
    type: [UserIdentityRef],
    nullable: false,
    description:
      "List the authenticated user's linked authentication provider identities.",
    resolve: async (root, args, context) => {
      const user = requireAuth(context);

      const identities = await dbService.users.getUserIdentities(
        Number(user.id),
      );

      // id, userId, provider, providerEmailVerified, and linkedAt are NOT NULL
      // in the view, so no null-coalescing is needed for them.
      return identities.map((identity) => ({
        id: Number(identity.id),
        userId: Number(identity.userId),
        provider: identity.provider,
        providerEmail: identity.providerEmail ?? null,
        providerEmailVerified: identity.providerEmailVerified,
        providerUsername: identity.providerUsername ?? null,
        providerAvatar: identity.providerAvatar ?? null,
        linkedAt: identity.linkedAt.toISOString(),
        lastLoginAt: identity.lastLoginAt?.toISOString() ?? null,
      }));
    },
  }),
);

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

      const rawOrderBy = args.orderBy as
        | 'id'
        | 'email'
        | 'canonicalEmail'
        | 'username'
        | undefined;
      // 'email' is kept as a backward-compat alias for GraphQL clients
      const orderBy = rawOrderBy === 'email' ? 'canonicalEmail' : rawOrderBy;
      const orderDirection = args.orderDirection as 'asc' | 'desc' | undefined;
      const accessLevelFilter = args.accessLevel as
        | 'none'
        | 'admin'
        | undefined;

      const users = await dbService.users.getUsers({
        limit: args.limit || undefined,
        offset: args.offset || undefined,
        orderBy: orderBy || 'canonicalEmail',
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
        email: u.canonicalEmail,
        username: u.username,
        accessLevel: u.accessLevel,
        avatarUrl: u.avatarUrl ?? null,
        subscriptionTier: u.subscriptionTier ?? null,
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

      // Audit log: routine admin view, not a security-sensitive action —
      // logged at info level so it isn't forwarded to Rollbar as an error.
      LOGGER.info('Admin user count viewed', {
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
        email: user.canonicalEmail,
        username: user.username,
        accessLevel: user.accessLevel,
        avatarUrl: user.avatarUrl ?? null,
        // `subscriptionTier` is exposed on `UserRef` (LS-822) and requested by
        // the `GetUserById` document, but was never included in this hand-built
        // return object — so the field always resolved to `null`. Harmless until
        // LS-5030 wrapped the whole league-detail page in a `PremiumGate` keyed
        // on `useIsPremium()` → `GetUserById.subscriptionTier`: every non-admin
        // premium user was then mis-read as free and blocked by the gate
        // (the `accessLevel === 'admin'` shortcut masked it for admins). LS-8247
        // fixed this `user(id)` path; LS-8249 extends the same fix to every
        // other resolver that builds the `User` shape (below).
        subscriptionTier: user.subscriptionTier ?? null,
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
        email: foundUser.canonicalEmail,
        username: foundUser.username,
        accessLevel: foundUser.accessLevel,
        avatarUrl: foundUser.avatarUrl ?? null,
        subscriptionTier: foundUser.subscriptionTier ?? null,
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
        email: user.canonicalEmail,
        username: user.username,
        accessLevel: user.accessLevel,
        avatarUrl: user.avatarUrl ?? null,
        subscriptionTier: user.subscriptionTier ?? null,
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
        email: updated.canonicalEmail,
        username: updated.username,
        accessLevel: updated.accessLevel,
        avatarUrl: updated.avatarUrl ?? null,
        subscriptionTier: updated.subscriptionTier ?? null,
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
          email: updated.canonicalEmail,
          username: updated.username,
          accessLevel: updated.accessLevel,
          avatarUrl: updated.avatarUrl ?? null,
          subscriptionTier: updated.subscriptionTier ?? null,
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
        email: updated.canonicalEmail,
        username: updated.username,
        accessLevel: updated.accessLevel,
        avatarUrl: updated.avatarUrl ?? null,
        subscriptionTier: updated.subscriptionTier ?? null,
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
        email: updated.canonicalEmail,
        username: updated.username,
        accessLevel: updated.accessLevel,
        avatarUrl: updated.avatarUrl ?? null,
        subscriptionTier: updated.subscriptionTier ?? null,
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
        sampleEmails: result.matched.slice(0, 10).map((u) => u.canonicalEmail),
        errors: result.errors.map(
          (e) => `user ${e.id} (${e.canonicalEmail}): ${e.message}`,
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
        email: targetUser.canonicalEmail,
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

// ─── setCanonicalEmail (LS-7825) ─────────────────────────────────────────────

const SetCanonicalEmailResultRef = builder.objectRef<{
  user: {
    id: number;
    email?: string | null;
    username?: string | null;
    accessLevel?: string | null;
    avatarUrl?: string | null;
    subscriptionTier?: string | null;
    themePreference?: string | null;
  };
  changed: boolean;
}>('SetCanonicalEmailResult');

SetCanonicalEmailResultRef.implement({
  fields: (t) => ({
    user: t.field({
      type: UserRef,
      nullable: false,
      resolve: (parent) => parent.user,
    }),
    changed: t.exposeBoolean('changed', { nullable: false }),
  }),
});

/**
 * Authenticated mutation: set the caller's canonical email from one of their
 * already-linked, verified provider identities.  Enforces the canonical-email
 * policy in `docs/architecture/multi-provider-identity.md` §4.
 */
builder.mutationField('setCanonicalEmail', (t) =>
  t.field({
    type: SetCanonicalEmailResultRef,
    nullable: false,
    description:
      "Set the authenticated user's canonical email from one of their linked, verified provider identities.",
    args: {
      identityId: t.arg.int({ required: true }),
    },
    resolve: async (parent, { identityId }, context) => {
      const authedUser = requireAuth(context);

      let result: {
        user: import('@legacy-sports/db-client').User | null;
        changed: boolean;
      };
      try {
        result = await dbService.users.setCanonicalEmail(
          Number(authedUser.id),
          identityId,
        );
      } catch (error) {
        const e = error as { userInput?: boolean; message?: string };
        if (e.userInput) {
          throw UserInputError(e.message ?? 'Invalid request');
        }
        throw error;
      }

      if (!result.user) {
        throw new Error('User not found after canonical email update');
      }

      LOGGER.error('Canonical email updated', {
        audit: true,
        actor: { id: Number(authedUser.id) },
        changed: result.changed,
      });

      return {
        user: {
          id: Number(result.user.id),
          email: result.user.canonicalEmail,
          username: result.user.username,
          accessLevel: result.user.accessLevel,
          avatarUrl: result.user.avatarUrl ?? null,
          subscriptionTier: result.user.subscriptionTier ?? null,
          themePreference: result.user.themePreference ?? null,
        },
        changed: result.changed,
      };
    },
  }),
);
