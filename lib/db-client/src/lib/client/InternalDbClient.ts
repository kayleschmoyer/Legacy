import { and, eq, isNull } from 'drizzle-orm';
import { TakeUniqueOrNull, TakeUniqueOrThrow } from './utils/TakeUniqueOrThrow';
import { GenericDatabase } from './abstract/BaseDbClient';
import { InternalUser } from '../../types/DatabaseTypes';
import * as Schema from '../../drizzle/internal/schema';

export const InternalSchema = Schema;

export type InternalDb = GenericDatabase<typeof Schema>;

export async function createUser(
  db: InternalDb,
  email: string,
  password?: string,
): Promise<InternalUser> {
  const internalUser = {
    email: email,
    passwordHash: password,
    username: email,
  };

  return await db
    .insert(Schema.usersInAppInternal)
    .values(internalUser)
    .returning()
    .then(TakeUniqueOrThrow);
}

export async function getUserByEmail(
  db: InternalDb,
  email: string,
): Promise<InternalUser | null> {
  return await db
    .select()
    .from(Schema.usersInAppInternal)
    .where(() => eq(Schema.usersInAppInternal.email, email))
    .then(TakeUniqueOrNull);
}

export async function getUserById(
  db: InternalDb,
  id: number,
): Promise<InternalUser | null> {
  return await db
    .select()
    .from(Schema.usersInAppInternal)
    .where(() => eq(Schema.usersInAppInternal.id, id))
    .then(TakeUniqueOrNull);
}

export async function getUserByDiscordId(
  db: InternalDb,
  discordId: string,
): Promise<InternalUser | null> {
  return await db
    .select()
    .from(Schema.usersInAppInternal)
    .where(() => eq(Schema.usersInAppInternal.discordId, discordId))
    .then(TakeUniqueOrNull);
}

/** A single subscription row as stored in the internal schema. */
export type InternalSubscription = typeof Schema.subscriptions.$inferSelect;

/**
 * Fetch the subscription row for a user, or null if they have none.
 *
 * `userId` is indexed but not unique on the subscriptions table, so this
 * intentionally takes the first row (via LIMIT 1) rather than asserting
 * uniqueness — mirroring SubscriptionService.getSubscriptionByUserId.
 */
export async function getSubscriptionByUserId(
  db: InternalDb,
  userId: number,
): Promise<InternalSubscription | null> {
  const results = await db
    .select()
    .from(Schema.subscriptions)
    .where(() => eq(Schema.subscriptions.userId, userId))
    .limit(1);
  return results[0] ?? null;
}

export async function linkDiscordAccount(
  db: InternalDb,
  userId: number,
  discordId: string,
  discordUsername: string,
  discordAvatar: string | null,
): Promise<InternalUser> {
  return await db
    .update(Schema.usersInAppInternal)
    .set({
      discordId,
      discordUsername,
      discordAvatar,
      updatedAt: new Date(),
    })
    .where(eq(Schema.usersInAppInternal.id, userId))
    .returning()
    .then(TakeUniqueOrThrow);
}

/**
 * Updates a user's email address.
 *
 * The email column carries a unique constraint (users_email_uk), so callers
 * must ensure no other account already owns `email` before invoking this —
 * otherwise the update throws on the constraint. Used to refresh the stored
 * email when an OAuth provider reports a changed verified email (LS-6660).
 */
export async function updateUserEmail(
  db: InternalDb,
  userId: number,
  email: string,
): Promise<InternalUser> {
  return await db
    .update(Schema.usersInAppInternal)
    .set({ email, updatedAt: new Date() })
    .where(eq(Schema.usersInAppInternal.id, userId))
    .returning()
    .then(TakeUniqueOrThrow);
}

/**
 * Sets avatarUrl for a user only if their current avatarUrl is null.
 * Safe to call unconditionally — it is a no-op when avatarUrl is already set.
 */
export async function setInitialAvatarUrl(
  db: InternalDb,
  userId: number,
  avatarUrl: string,
): Promise<void> {
  await db
    .update(Schema.usersInAppInternal)
    .set({ avatarUrl, updatedAt: new Date() })
    .where(
      and(
        eq(Schema.usersInAppInternal.id, userId),
        isNull(Schema.usersInAppInternal.avatarUrl),
      ),
    );
}

/**
 * Stamp a user's `last_login_at` with the current time after a successful
 * login. Intentionally does NOT touch `updated_at` — a login is an
 * authentication event, not a profile mutation, so it should not move the
 * row's content-modification timestamp. (LS-6674 / LGN-019)
 */
export async function updateLastLoginAt(
  db: InternalDb,
  userId: number,
): Promise<void> {
  await db
    .update(Schema.usersInAppInternal)
    .set({ lastLoginAt: new Date() })
    .where(eq(Schema.usersInAppInternal.id, userId));
}

/** A user's multi-factor-auth state as stored in the internal schema. */
export interface UserMfaState {
  mfaEnabled: boolean;
  totpSecret: string | null;
}

/**
 * Read a user's MFA state (enrollment flag + TOTP secret), or null if the
 * user does not exist. Selects only the MFA columns rather than the full row
 * so the secret is never fetched alongside unrelated user data by accident.
 */
export async function getUserMfa(
  db: InternalDb,
  userId: number,
): Promise<UserMfaState | null> {
  return await db
    .select({
      mfaEnabled: Schema.usersInAppInternal.mfaEnabled,
      totpSecret: Schema.usersInAppInternal.totpSecret,
    })
    .from(Schema.usersInAppInternal)
    .where(() => eq(Schema.usersInAppInternal.id, userId))
    .then(TakeUniqueOrNull);
}

/**
 * Update a user's MFA state. Sets both the enrollment flag and the TOTP secret
 * (pass totpSecret: null to clear it when disabling MFA). Returns the updated
 * user row.
 */
export async function setUserMfa(
  db: InternalDb,
  userId: number,
  { mfaEnabled, totpSecret }: UserMfaState,
): Promise<InternalUser> {
  return await db
    .update(Schema.usersInAppInternal)
    .set({ mfaEnabled, totpSecret, updatedAt: new Date() })
    .where(eq(Schema.usersInAppInternal.id, userId))
    .returning()
    .then(TakeUniqueOrThrow);
}

export async function unlinkDiscordAccount(
  db: InternalDb,
  userId: number,
): Promise<InternalUser> {
  return await db
    .update(Schema.usersInAppInternal)
    .set({
      discordId: null,
      discordUsername: null,
      discordAvatar: null,
      updatedAt: new Date(),
    })
    .where(eq(Schema.usersInAppInternal.id, userId))
    .returning()
    .then(TakeUniqueOrThrow);
}
