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
