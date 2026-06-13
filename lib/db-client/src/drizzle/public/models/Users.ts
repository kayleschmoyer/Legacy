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
  canonicalEmail: varchar('canonical_email', { length: 255 }),
  username: varchar('username', { length: 50 }),
  accessLevel: accessLevel('access_level'),
  avatarUrl: text('avatar_url'),
  subscriptionTier: text('subscription_tier'),
  themePreference: varchar('theme_preference', { length: 10 }),
  canonicalEmailSource: text('canonical_email_source'),
}).as(sql`SELECT id,
       canonical_email,
       username,
       access_level::character varying::access_level AS access_level,
       avatar_url,
       subscription_tier::text AS subscription_tier,
       theme_preference,
       canonical_email_source::text AS canonical_email_source
FROM app_internal.users`);
