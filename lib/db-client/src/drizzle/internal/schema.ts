import {
  pgTable,
  pgSchema,
  index,
  unique,
  serial,
  varchar,
  char,
  integer,
  text,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const appInternal = pgSchema('app_internal');
export const accessLevelInAppInternal = appInternal.enum('access_level', [
  'none',
  'admin',
]);

export const consentTypeEnum = appInternal.enum('consent_type', [
  'data_processing',
  'marketing_emails',
  'analytics',
  'third_party_sharing',
]);

export const consentStatusEnum = appInternal.enum('consent_status', [
  'granted',
  'revoked',
]);

export const dataRequestTypeEnum = appInternal.enum('data_request_type', [
  'export',
  'deletion',
]);

export const dataRequestStatusEnum = appInternal.enum('data_request_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);

export const subscriptionTierInAppInternal = appInternal.enum(
  'subscription_tier',
  ['free', 'premium'],
);

export const usersInAppInternal = appInternal.table(
  'users',
  {
    id: serial('id').primaryKey().notNull(),
    username: varchar('username', { length: 50 }),
    email: varchar('email', { length: 100 }).notNull(),
    passwordHash: char('password_hash', { length: 128 }),
    accessLevel: accessLevelInAppInternal('access_level').default('none'),
    privacyPolicyAcceptedAt: timestamp('privacy_policy_accepted_at', {
      withTimezone: true,
    }),
    avatarUrl: text('avatar_url'),
    subscriptionTier: subscriptionTierInAppInternal('subscription_tier')
      .notNull()
      .default('free'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      idx: index('users__index').using(
        'btree',
        table.username.asc().nullsLast(),
      ),
      emailIdx: index().using('btree', table.email.asc().nullsLast()),
      usersUsernameUk: unique('users_username_uk').on(table.username),
      usersEmailUk: unique('users_email_uk').on(table.email),
    };
  },
);

export const userConsents = appInternal.table(
  'user_consents',
  {
    id: serial('id').primaryKey().notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => usersInAppInternal.id, { onDelete: 'cascade' }),
    consentType: consentTypeEnum('consent_type').notNull(),
    status: consentStatusEnum('status').notNull().default('granted'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      userIdIdx: index('user_consents_user_id_idx').on(table.userId),
      typeIdx: index('user_consents_type_idx').on(table.consentType),
      statusIdx: index('user_consents_status_idx').on(table.status),
      uniqueUserConsent: unique('user_consents_user_type_uk').on(
        table.userId,
        table.consentType,
      ),
    };
  },
);

export const dataRequests = appInternal.table(
  'data_requests',
  {
    id: serial('id').primaryKey().notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => usersInAppInternal.id, { onDelete: 'cascade' }),
    requestType: dataRequestTypeEnum('request_type').notNull(),
    status: dataRequestStatusEnum('status').notNull().default('pending'),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    exportUrl: text('export_url'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      userIdIdx: index('data_requests_user_id_idx').on(table.userId),
      statusIdx: index('data_requests_status_idx').on(table.status),
      typeIdx: index('data_requests_type_idx').on(table.requestType),
      pendingIdx: index('data_requests_pending_idx').on(
        table.status,
        table.requestedAt,
      ),
    };
  },
);

export const subscriptions = appInternal.table(
  'subscriptions',
  {
    id: serial('id').primaryKey().notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => usersInAppInternal.id, { onDelete: 'cascade' }),
    stripeCustomerId: text('stripe_customer_id').notNull(),
    stripeSubscriptionId: text('stripe_subscription_id').notNull(),
    status: text('status').notNull().default('inactive'),
    tier: text('tier').notNull().default('free'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      userIdIdx: index('subscriptions_user_id_idx').on(table.userId),
      stripeCustomerIdUk: unique('subscriptions_stripe_customer_id_uk').on(
        table.stripeCustomerId,
      ),
      stripeSubscriptionIdUk: unique(
        'subscriptions_stripe_subscription_id_uk',
      ).on(table.stripeSubscriptionId),
    };
  },
);

export const stripeEvents = appInternal.table('stripe_events', {
  eventId: text('event_id').primaryKey().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
