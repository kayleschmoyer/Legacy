# Multi-Provider Identity & Canonical Email

Legacy Sports lets a single user authenticate through several OAuth providers (Discord, Google, Apple) and local password. Each provider reports its own email, and those emails frequently differ — a user's Discord email is rarely their Apple Relay email, which is rarely their Google address. This document describes how provider identities are modeled, how a single **canonical email** is derived and maintained for the OAuth proxy and downstream consumers, and the migration path from today's single-column model.

> Status: **Proposed** (design). Tracked by epic LS-7821. Supersedes the LS-6660 behavior that overwrote `users.email` from Discord on every sign-in.

---

## Motivation

### Today's model (single email column)

`app_internal.users` stores exactly one email:

```typescript
// lib/db-client/src/drizzle/internal/schema.ts
email: varchar('email', { length: 100 }).notNull(),   // UNIQUE (users_email_uk)
discordId: varchar('discord_id', { length: 32 }),     // only Discord has identity columns
discordUsername: varchar('discord_username', { length: 100 }),
discordAvatar: varchar('discord_avatar', { length: 255 }),
```

That single column is overloaded with three distinct jobs:

1. **Login lookup key** — Google and Apple have _no_ provider-id columns. `getOrCreateUser(email)` / `getUserFromGoogleEmail(email)` look the user up purely by email (`lambdas/oauth-proxy/src/handlers/UserManager.ts`, `lambdas/oauth-proxy/src/util/users.ts`).
2. **Canonical identity** — `createJwt` stamps `email: user.email` into the internal JWT (`lambdas/oauth-proxy/src/util/jwt.ts:30`), which every downstream lambda trusts.
3. **Uniqueness anchor** — `users_email_uk` guarantees one row per email.

### Why this breaks with multiple providers

- **Same human, two accounts.** A user who first signs in with Discord (email `a@discord`) and later signs in with Google (email `b@gmail`) is looked up by email, finds no match, and gets a **second user row**. Their leagues, subscription, and history are now split across two accounts.
- **Canonical email clobbering.** The LS-6660 change refreshes `users.email` whenever Discord reports a different verified email. For a user whose canonical/billing email is their Google address, a Discord email change silently rewrites their canonical email — affecting the JWT, any email-keyed lookups, and user-facing "signed in as" surfaces. This is the specific risk that motivated this redesign.
- **No link management.** Only Discord has explicit `link`/`unlink`. Google and Apple are implicitly "linked" by email collision, which is both unsafe (LS-6695 takeover guard exists precisely because email match is weak) and unmanageable (no way to see or revoke a linked Google identity).

---

## Design overview

Split the three responsibilities apart:

| Responsibility                          | Today                                      | Proposed                                                                               |
| --------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| Per-provider identity & email           | `discord_*` columns; Google/Apple implicit | `user_identities` table, one row per linked provider                                   |
| Login lookup                            | by `users.email`                           | by `(provider, provider_account_id)`, with a guarded email-match fallback              |
| Canonical email (JWT, billing, display) | `users.email` (mutable, last-writer-wins)  | `users.canonical_email` (explicit, first-provider-wins, user-changeable)               |
| Uniqueness                              | `users_email_uk` on the one email          | `users_canonical_email_uk` + per-identity `(provider, provider_account_id)` uniqueness |

### Core principle

**Provider emails are inputs. The canonical email is a decision.** Each linked identity keeps the email _that provider_ reported (so we can always re-link, notify, or display it). The user has exactly one canonical email used for the JWT, Stripe, and "signed in as" — chosen once at account creation (first provider wins) and changed only by an explicit, deliberate user action.

---

## Data model

### New table: `app_internal.user_identities`

```typescript
export const userIdentitiesInAppInternal = appInternal.table(
  'user_identities',
  {
    id: serial('id').primaryKey().notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => usersInAppInternal.id, { onDelete: 'cascade' }),
    provider: identityProviderEnum('provider').notNull(), // 'discord' | 'google' | 'apple' | 'local'
    // Stable provider-side subject id. Discord snowflake, Google `sub`,
    // Apple `sub`. For 'local', equals the user id (one local identity per user).
    providerAccountId: varchar('provider_account_id', {
      length: 255,
    }).notNull(),
    // Email AS REPORTED BY THIS PROVIDER (may differ per provider; may be an
    // Apple private-relay address). Never used directly as canonical.
    providerEmail: varchar('provider_email', { length: 255 }),
    providerEmailVerified: boolean('provider_email_verified')
      .notNull()
      .default(false),
    // Provider display metadata (e.g. Discord username/avatar) lives here too.
    providerUsername: varchar('provider_username', { length: 255 }),
    providerAvatar: varchar('provider_avatar', { length: 255 }),
    linkedAt: timestamp('linked_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => ({
    // One provider account links to at most one user.
    providerAccountUk: unique('user_identities_provider_account_uk').on(
      t.provider,
      t.providerAccountId,
    ),
    // A user links a given provider at most once.
    userProviderUk: unique('user_identities_user_provider_uk').on(
      t.userId,
      t.provider,
    ),
    userIdIdx: index('idx_user_identities_user_id').on(t.userId),
  }),
);
```

### Changes to `app_internal.users`

```typescript
// Rename intent: this column is the ONE email used by JWT/billing/display.
canonicalEmail: varchar('canonical_email', { length: 255 }).notNull(), // UNIQUE
// Which linked identity the canonical email currently tracks (nullable for
// manual override). Lets us answer "where did this email come from?" and
// re-derive on unlink.
canonicalEmailSource: identityProviderEnum('canonical_email_source'),
```

- `canonical_email` replaces today's `email` (see migration plan — it is a rename + backfill, not a new column).
- The `discord_id` / `discord_username` / `discord_avatar` columns are migrated into `user_identities` rows and then dropped (kept temporarily for rollback safety — see phasing).

### Provider enum

```typescript
export const identityProviderEnum = appInternal.enum('identity_provider', [
  'local',
  'discord',
  'google',
  'apple',
]);
```

---

## Canonical email policy

**First provider wins; user can change it.**

1. **At account creation**, `canonical_email` = the creating provider's `provider_email`, and `canonical_email_source` = that provider.
2. **On linking another provider**, the canonical email is **not** touched. The new identity simply gets its own `user_identities` row with its own `provider_email`.
3. **On a provider email change** (e.g. Discord reports a new verified email), update only that identity's `provider_email`. Update `users.canonical_email` **only if** `canonical_email_source` equals that provider — i.e. the canonical email tracks its chosen source, and a change from a non-source provider never rewrites canonical. (This is the explicit reversal of LS-6660's unconditional overwrite.)
4. **User-initiated change**: a new authenticated mutation `setCanonicalEmail(identityId)` lets the user pick which _already-linked, verified_ identity's email becomes canonical. It sets `canonical_email` and `canonical_email_source` together, after re-checking the `users_canonical_email_uk` constraint. Only verified provider emails are eligible.
5. **On unlink of the canonical source**: re-derive canonical from the remaining identities by link order (oldest first), preferring verified emails; require at least one identity (or a local password) to remain so the account stays reachable.

### Why not auto-pick "best" email?

First-provider-wins is predictable and matches user expectation ("the email I signed up with is my email"). Auto-selecting by provider priority would silently change a user's canonical/billing email when they link a higher-priority provider — exactly the surprise we are trying to eliminate. The user override covers the cases where the default is wrong.

---

## Authentication flow (revised)

All providers converge on a shared resolver, replacing the per-provider email-only lookups.

```
resolveOrCreateUser({ provider, providerAccountId, providerEmail, emailVerified, ...meta }):
  1. identity = getIdentity(provider, providerAccountId)
     → if found: load user, refresh identity.providerEmail/lastLoginAt,
        apply canonical-email rule #3, return user.   [returning user, fast path]

  2. // No identity row for this provider account. Decide: link vs. create.
     emailOwner = providerEmail ? getUserByCanonicalEmailOrIdentityEmail(providerEmail) : null

  3. if emailOwner:
       // The LS-6695 takeover guard fires ONLY against credentialed accounts.
       // Block (do not auto-link) when EITHER:
       //   (a) emailOwner has a passwordHash — a local-auth account; or
       //   (b) emailOwner already has a *different* identity for THIS provider
       //       (would be a second-account collision).
       if (!emailVerified || emailOwner.passwordHash || emailOwner.hasIdentity(provider)):
         return CONFLICT_REQUIRES_EXPLICIT_LINK   // 409 → sign in + link from settings

       // Otherwise emailOwner is a password-less account whose canonical/identity
       // email exactly matches this provider's *verified* email and has no
       // identity for this provider yet. This is the returning historical
       // Google/Apple user (pre-migration email-only login). Safe to backfill:
       attachIdentity(emailOwner, provider, providerAccountId, providerEmail, emailVerified, meta)
       apply canonical-email rule #3
       return emailOwner   [returning historical user — auto-linked]

  4. // Brand-new user.
     user = createUser(canonicalEmail = providerEmail, canonicalEmailSource = provider)
     createIdentity(user, provider, providerAccountId, providerEmail, emailVerified, meta)
     return user [new user]
```

#### `getUserByCanonicalEmailOrIdentityEmail` — lookup order & precedence

Step 2's email-owner lookup is deliberately ordered and total:

1. **Canonical first.** Query `users.canonical_email = providerEmail` (unique via `users_canonical_email_uk`). At most one row — if it matches, that is the email owner. Canonical match always wins.
2. **Identity email fallback.** Only if there is no canonical match, query `user_identities.provider_email = providerEmail`. This catches a user whose canonical email differs but who already linked another provider under this address.
3. **Ambiguity is impossible by construction for the linkable case.** Auto-link in step 3 requires `emailVerified` **and** that `emailOwner` has no password. A _verified_ provider email can belong to only one human, and our own verified emails are what populate `provider_email`, so two distinct users cannot both hold the same verified `provider_email` — except the legitimately-shared-but-unverified case (rule allows duplicate `provider_email` rows, but those are never auto-link candidates because the guard requires `emailVerified`). If the fallback ever returns more than one `userId` (only possible via unverified/legacy data), treat it as ambiguous and **fail closed**: return `CONFLICT_REQUIRES_EXPLICIT_LINK` rather than guessing. Implementation: `LIMIT 2` and branch on count.

So the precedence is canonical-email → identity-email, single-row-or-conflict, and the takeover guard (verified + password-less) gates every auto-link regardless of which path matched.

### Explicit linking (`/oauth/<provider>/link`)

The link flow runs **inside an authenticated session** (the user is already signed in). It:

1. Verifies the provider token and extracts `(providerAccountId, providerEmail)`.
2. Rejects if that provider account is already linked to a _different_ user (`user_identities_provider_account_uk` violation → 409).
3. Rejects if the user already has an identity for that provider (`user_identities_user_provider_uk`).
4. Inserts a `user_identities` row. Canonical email is left unchanged (rule #2).

This generalizes today's Discord-only `linkDiscordAccount` / `unlinkDiscordAccount` to all providers and removes the implicit "email collision = linked" behavior for Google/Apple.

### JWT

`createJwt` reads `user.canonical_email` (mechanically a rename of `user.email`). No downstream consumer change — they continue to receive one `email` claim plus the stable `id`. Identity (authorization) is already keyed on `user.id`, not email, so the JWT contract is unchanged in shape.

---

## Edge cases

| Case                                                                              | Handling                                                                                                                                                                                 |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple private relay email                                                         | Stored as `provider_email` for the Apple identity; eligible to be canonical only if the user explicitly picks it. Relay addresses still deliver, so this is allowed but not the default. |
| Two providers report the _same_ email                                             | Allowed — they are distinct identity rows with the same `provider_email`. Canonical uniqueness is on `canonical_email`, not provider emails.                                             |
| Provider with no email (rare Discord/Apple)                                       | Identity row stored with `provider_email = null`. Cannot be chosen as canonical. Sign-in still works via `(provider, providerAccountId)`.                                                |
| User changes canonical to an email another user holds as canonical                | `users_canonical_email_uk` rejects; surface a clear error.                                                                                                                               |
| Unlink the last identity                                                          | Refuse unless a local password identity remains; otherwise the account becomes unreachable.                                                                                              |
| Existing duplicate accounts (same human, two rows from pre-migration email split) | Out of scope for the migration itself; provide an **account-merge** follow-up (separate ticket) — detect by overlapping provider emails and offer a guided merge.                        |
| LS-6660 overwrite already shipped                                                 | This design removes that code path; the rename migration backfills `canonical_email` from the current `email` value, so no data is lost.                                                 |

---

## Migration plan (phased, reversible)

The migration is **expand → backfill → contract**, so each phase ships independently and is rollback-safe.

**Phase 1 — Expand (additive, no behavior change).**

- Add `identity_provider` enum and `user_identities` table.
- Add `users.canonical_email_source` (nullable).
- Backfill `user_identities` from existing data:
  - one `discord` row per user with a non-null `discord_id` (carrying `discord_username`/`discord_avatar`);
  - one `local` row per user with a non-null `password_hash`;
  - we cannot retroactively know Google/Apple `sub` for historical email-only logins — those identities are **lazily created on next sign-in** by the resolver (step 3, the auto-link branch). The auto-link is **not** a takeover-guard bypass: it fires only when the matched account (i) has **no password** (so it is not a credentialed/local-auth account — the LS-6695 case), (ii) has **no existing identity for that provider** yet, and (iii) the provider's email is **verified** and matches the account's canonical/identity email. A password-protected account with the same email is never auto-linked — it gets `CONFLICT_REQUIRES_EXPLICIT_LINK` and must link from settings.
- Keep `users.email` as the source of truth this phase; `canonical_email` not yet introduced.

**Phase 2 — Cut over reads/writes.**

- Rename `users.email` → `users.canonical_email` (single rename migration; update Drizzle schema, generated views, GraphQL `User` type, and all `getUserByEmail` callers).
- Switch the OAuth proxy to the shared `resolveOrCreateUser` resolver and the generalized link flow.
- Remove the LS-6660 unconditional email-refresh; replace with rule #3.
- Add the `setCanonicalEmail` mutation + account-settings UI for choosing canonical email and viewing/unlinking identities.

**Phase 3 — Contract.**

- Drop `users.discord_id` / `discord_username` / `discord_avatar` once all reads go through `user_identities` and a bake period confirms no regressions.

Each phase is its own PR/ticket. Phases 1 and 3 are migrations (High risk — touches auth + schema; follow the migration entrypoint and run `db_migrate` + "Verify Migrations Applied" on the dev RDS). Phase 2 carries the behavioral risk and needs the fullest test coverage.

---

## Testing

- Unit: `resolveOrCreateUser` truth table (new user / returning identity / email-owner conflict / link / canonical rule #3) per provider.
- Unit: canonical re-derivation on unlink; `setCanonicalEmail` constraint + verification gating.
- Integration: full Discord/Google/Apple sign-in then cross-provider link in `apps/web-e2e/src/integration/tests/` (live backend) — assert one user row, two identity rows, unchanged canonical email.
- Migration: backfill correctness on a dev-seed restore (`db_restore_dev_seed` → run Phase 1 → assert identity rows).

---

## Open questions

1. Should account-merge (de-duplicating pre-migration split accounts) ship with this epic or as a fast-follow? (Recommended: fast-follow — it is materially more complex and not required to stop the bleeding.)
2. Do we want to notify the user (email/Discord) when their canonical email changes via the user-initiated path? (Recommended: yes, to the _previous_ canonical address, as an anti-hijack signal.)
3. Length: bump email columns to 255 (RFC 5321 max) during the rename, or keep 100? (Recommended: 255 — Apple relay and some Google addresses approach the old limit.)
