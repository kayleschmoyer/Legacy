import {
  pgTable,
  unique,
  serial,
  text,
  varchar,
  foreignKey,
  integer,
  date,
  index,
  timestamp,
  bigint,
  numeric,
  doublePrecision,
  primaryKey,
  char,
  pgEnum,
  pgView,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { accessLevel } from './Enums';

export const users = pgView('users', {
  id: integer('id'),
  email: varchar('email', { length: 100 }),
  username: varchar('username', { length: 50 }),
  accessLevel: accessLevel('access_level'),
  avatarUrl: text('avatar_url'),
  subscriptionTier: text('subscription_tier'),
  discordId: varchar('discord_id', { length: 32 }),
  discordUsername: varchar('discord_username', { length: 100 }),
  discordAvatar: varchar('discord_avatar', { length: 255 }),
}).as(sql`SELECT id,
       email,
       username,
       access_level::character varying::access_level AS access_level,
       avatar_url,
       subscription_tier::text AS subscription_tier,
       discord_id,
       discord_username,
       discord_avatar
FROM app_internal.users`);
