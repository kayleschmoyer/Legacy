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
