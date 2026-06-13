import {
  pgTable,
  pgSchema,
  index,
  unique,
  serial,
  varchar,
  integer,
  text,
  timestamp,
  boolean,
  bigint,
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

export const identityProviderInAppInternal = appInternal.enum(
  'identity_provider',
  ['local', 'discord', 'google', 'apple'],
);

export const usersInAppInternal = appInternal.table(
  'users',
  {
    id: serial('id').primaryKey().notNull(),
    username: varchar('username', { length: 50 }),
    canonicalEmail: varchar('canonical_email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 128 }),
    accessLevel: accessLevelInAppInternal('access_level').default('none'),
    privacyPolicyAcceptedAt: timestamp('privacy_policy_accepted_at', {
      withTimezone: true,
    }),
    avatarUrl: text('avatar_url'),
    subscriptionTier: subscriptionTierInAppInternal('subscription_tier')
      .notNull()
      .default('free'),
    themePreference: varchar('theme_preference', { length: 10 }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    totpSecret: text('totp_secret'),
    canonicalEmailSource: identityProviderInAppInternal(
      'canonical_email_source',
    ),
    passwordResetToken: varchar('password_reset_token', { length: 128 }),
    passwordResetExpiresAt: timestamp('password_reset_expires_at', {
      withTimezone: true,
    }),
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
      canonicalEmailIdx: index().using(
        'btree',
        table.canonicalEmail.asc().nullsLast(),
      ),
      usersUsernameUk: unique('users_username_uk').on(table.username),
      usersCanonicalEmailUk: unique('users_canonical_email_uk').on(
        table.canonicalEmail,
      ),
    };
  },
);

export const userIdentities = appInternal.table(
  'user_identities',
  {
    id: serial('id').primaryKey().notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => usersInAppInternal.id, { onDelete: 'cascade' }),
    provider: identityProviderInAppInternal('provider').notNull(),
    providerAccountId: varchar('provider_account_id', { length: 255 }),
    providerEmail: varchar('provider_email', { length: 255 }),
    providerEmailVerified: boolean('provider_email_verified')
      .notNull()
      .default(false),
    providerUsername: varchar('provider_username', { length: 255 }),
    providerAvatar: varchar('provider_avatar', { length: 512 }),
    linkedAt: timestamp('linked_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (table) => {
    return {
      userIdIdx: index('user_identities_user_id_idx').on(table.userId),
      providerAccountUk: unique('user_identities_provider_account_uk').on(
        table.provider,
        table.providerAccountId,
      ),
      userProviderUk: unique('user_identities_user_provider_uk').on(
        table.userId,
        table.provider,
      ),
    };
  },
);

/**
 * Single-use, expiring password-reset tokens (LS-6678 / LGN-023).
 *
 * Only the SHA-256 hash of the reset token is persisted — the raw token lives
 * solely in the email link, so a database compromise cannot be used to reset
 * an account. `usedAt` enforces single-use; `expiresAt` enforces expiry. Rows
 * are reaped lazily on consume and may also be cleaned up out-of-band.
 */
export const passwordResetTokens = appInternal.table(
  'password_reset_tokens',
  {
    id: serial('id').primaryKey().notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => usersInAppInternal.id, { onDelete: 'cascade' }),
    // Hex-encoded SHA-256 digest of the raw token (64 chars).
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      tokenHashUk: unique('password_reset_tokens_token_hash_uk').on(
        table.tokenHash,
      ),
      userIdIdx: index('password_reset_tokens_user_id_idx').on(table.userId),
      expiresAtIdx: index('password_reset_tokens_expires_at_idx').on(
        table.expiresAt,
      ),
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
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    appleOriginalTransactionId: text('apple_original_transaction_id'),
    appleProductId: text('apple_product_id'),
    appleEnvironment: text('apple_environment'),
    appleLastNotificationType: text('apple_last_notification_type'),
    googlePurchaseToken: text('google_purchase_token'),
    googleProductId: text('google_product_id'),
    status: text('status').notNull().default('inactive'),
    tier: text('tier').notNull().default('free'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    gracePeriodEndsAt: timestamp('grace_period_ends_at', {
      withTimezone: true,
    }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    refundAmountCents: integer('refund_amount_cents'),
    disputedAt: timestamp('disputed_at', { withTimezone: true }),
    disputeStatus: text('dispute_status'),
    lastEventTimestamp: bigint('last_event_timestamp', { mode: 'number' }),
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
      appleOriginalTransactionIdUk: unique(
        'subscriptions_apple_original_transaction_id_uk',
      ).on(table.appleOriginalTransactionId),
      googlePurchaseTokenUk: unique(
        'subscriptions_google_purchase_token_uk',
      ).on(table.googlePurchaseToken),
    };
  },
);

export const stripeEvents = appInternal.table('stripe_events', {
  eventId: text('event_id').primaryKey().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const appleEvents = appInternal.table('apple_events', {
  eventId: text('event_id').primaryKey().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const googleEvents = appInternal.table('google_events', {
  eventId: text('event_id').primaryKey().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
