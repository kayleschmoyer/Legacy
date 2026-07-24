import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add entitlements_updated_at to app_internal.users
 *
 * Purpose:
 * - Foundation slice for LS-8638 (Stripe-driven premium gating). Entitlements
 *   are carried in the JWT (minted from live Stripe), so there is no
 *   per-request Stripe lookup on the fast path. To force-expire already-issued
 *   tokens when Stripe entitlements change, enforcement (LS-8643) compares the
 *   token's `iat` against this per-user marker.
 *
 * Semantics:
 * - This is an INVALIDATION MARKER, not an entitlement cache. It records only
 *   WHEN a user's entitlements last changed; nothing about which entitlements
 *   the user has is stored here (those live in the JWT claim). Its only failure
 *   mode is a spurious token refresh (fail-safe).
 * - NOT NULL DEFAULT now(): every row always has a concrete timestamp, so the
 *   downstream `iat >= entitlements_updated_at` comparison never faces NULL.
 *   Existing tokens minted before this migration (iat < now()) are treated as
 *   stale once enforcement lands, triggering exactly one self-healing refresh —
 *   the documented fail-safe.
 *
 * Changes:
 * - Adds entitlements_updated_at column to app_internal.users.
 *
 * Scope note: no runtime code reads or writes this column yet (LS-8642 bumps it
 * from the Stripe webhook; LS-8643 reads it for enforcement). The public.users
 * view is intentionally unchanged — this is an internal enforcement marker, not
 * a publicly-exposed field.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration runner hands each migration a PgDatabase<any>; this is the shared signature across all migrations
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE app_internal.users
    ADD COLUMN IF NOT EXISTS entitlements_updated_at timestamptz NOT NULL DEFAULT now();
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration runner hands each migration a PgDatabase<any>; this is the shared signature across all migrations
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE app_internal.users
    DROP COLUMN entitlements_updated_at;
  `);
};
