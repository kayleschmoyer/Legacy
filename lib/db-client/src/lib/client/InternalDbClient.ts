import { eq } from 'drizzle-orm';
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
