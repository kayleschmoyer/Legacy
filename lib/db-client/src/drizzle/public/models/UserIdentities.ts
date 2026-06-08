import {
  integer,
  text,
  varchar,
  boolean,
  timestamp,
  pgView,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Public view over app_internal.user_identities (LS-7822).
 *
 * `provider_account_id` is intentionally omitted — the provider's raw account id
 * must never leak through the public schema or the GraphQL layer. `provider` is
 * cast to text in the underlying view (mirroring the subscription_tier
 * convention) so the public schema does not need a duplicate enum type.
 */
export const userIdentities = pgView('user_identities', {
  id: integer('id').notNull(),
  userId: integer('user_id').notNull(),
  provider: text('provider').notNull(),
  providerEmail: varchar('provider_email', { length: 255 }),
  providerEmailVerified: boolean('provider_email_verified').notNull(),
  providerUsername: varchar('provider_username', { length: 255 }),
  providerAvatar: varchar('provider_avatar', { length: 512 }),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
}).as(sql`SELECT id,
       user_id,
       provider::text AS provider,
       provider_email,
       provider_email_verified,
       provider_username,
       provider_avatar,
       linked_at,
       last_login_at
FROM app_internal.user_identities`);
