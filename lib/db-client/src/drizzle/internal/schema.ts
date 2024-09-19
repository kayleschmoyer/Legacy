import {
  pgTable,
  pgSchema,
  index,
  unique,
  serial,
  varchar,
  char,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const appInternal = pgSchema('app_internal');
export const accessLevelInAppInternal = appInternal.enum('access_level', [
  'none',
  'admin',
]);

export const usersInAppInternal = appInternal.table(
  'users',
  {
    id: serial('id').primaryKey().notNull(),
    username: varchar('username', { length: 50 }),
    email: varchar('email', { length: 100 }).notNull(),
    passwordHash: char('password_hash', { length: 128 }),
    accessLevel: accessLevelInAppInternal('access_level').default('none'),
  },
  (table) => {
    return {
      idx: index('users__index').using(
        'btree',
        table.username.asc().nullsLast()
      ),
      emailIdx: index().using('btree', table.email.asc().nullsLast()),
      usersUsernameUk: unique('users_username_uk').on(table.username),
      usersEmailUk: unique('users_email_uk').on(table.email),
    };
  }
);
