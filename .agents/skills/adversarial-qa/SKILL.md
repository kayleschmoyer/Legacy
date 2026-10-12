---
name: adversarial-qa
description: 'Live, hostile-user exploitation testing against a disposable local stack — mints forged tokens for several personas (owner, outsider, non-member, admin) and tries to break authorization, injection, and race-condition invariants through the real GraphQL API, not by reading source. Load when: asked to verify whether a suspected authz/security/race-condition bug is real, to confirm a QA-audit finding before filing it, or to run/extend the adversarial-qa scenario suite under scripts/adversarial-qa/.'
metadata:
  scope: 'scripts/adversarial-qa/**, lambdas/db/src/schema/authorization.ts, lambdas/db/src/schema/**'
---

# Skill: Adversarial QA

Everything else in this repo's QA process **reads or looks**: `qa-audit` reads code against a Jira ticket's description; `ui-audit` screenshots pages against the design system; `ground-truth-verification` checks doc claims against code. None of them **execute an attack**. This skill does — it stands up a throwaway local stack, forges tokens for a handful of adversarial personas, and tries live mutations/queries a hostile user would try. A scenario that succeeds here is strictly stronger evidence than a code-reading finding: the code path that should have refused it, on this run, didn't.

The inverse matters too: a scenario that gets correctly blocked **disproves** a reading-only suspicion. Don't carry a finding from code review into a ticket as "confirmed" when this suite says otherwise — see the injection-statkey scenario below, which exists specifically because a static read of `SeasonDraftGameService`'s `sql.raw(statKey)` looked exploitable and a live attempt did not reproduce it.

## When to use this vs. the other audit skills

| Question                                                            | Skill                       |
| ------------------------------------------------------------------- | --------------------------- |
| "Does this feature match its spec?"                                 | `qa-audit`                  |
| "Does this page look right / match the design system?"              | `ui-audit`                  |
| "Is this documented claim still true?"                              | `ground-truth-verification` |
| "Can a real hostile request actually bypass this check, right now?" | **this skill**              |

Use this one to turn a suspected authz/injection/race-condition bug into a yes/no answer before filing it, or to add regression coverage for one that was confirmed and fixed.

## Running it

```bash
scripts/adversarial-qa/start-local-stack.sh              # starts Postgres + lambdas/db/src/dev.ts, seeds personas, runs every scenario
scripts/adversarial-qa/start-local-stack.sh cross-team-mutation   # run one scenario by filename (no .mjs)
```

If the stack is already up (Postgres running, `lambdas/db/src/dev.ts` listening on :5000), you can skip straight to:

```bash
node scripts/adversarial-qa/seed-personas.mjs
node scripts/adversarial-qa/run.mjs
```

Output is one line per scenario: 🔴 `EXPLOITED` (the attack succeeded — file it), 🟢 `blocked` (checked and safe), ⚠️ `ERROR` (the scenario itself broke — fix the scenario, not a finding). Exit code is non-zero iff anything was exploited.

## Why this only runs locally — read before touching anything here

`lambdas/db/src/dev.ts` decodes a JWT's payload **without verifying its signature** (a dev convenience) and falls back to an admin user with no token at all. That is exactly what lets this harness mint a token for any persona by id — and exactly why it is useless, and dangerous, pointed anywhere but a disposable local database. The real server (`lambdas/db/src/server/apollo.ts` + `context.ts`) verifies signatures and would reject every token this harness mints outright.

`scripts/adversarial-qa/lib/stack.mjs`'s `assertLocalTarget()` is the only thing standing between "sandbox tool" and "forged-admin-token generator pointed at a real database" — every script in this directory calls it first, and refuses to run unless `DB_HOST`/`DATABASE_URL`/`ADVERSARIAL_QA_GRAPHQL_URL` all resolve to localhost. **Never weaken or remove that guard.** If you ever want this class of test to run against a real deployed environment, that is a different, much bigger undertaking (real credentials for real throwaway accounts, explicit written authorization, a scoped environment) — it is not this skill, and this harness's forged-JWT approach does not transfer to it.

## Scenario catalog (`scripts/adversarial-qa/scenarios/*.mjs`)

Each file exports `title`, `severity`, and an async `run(ctx)` returning `{ exploited: boolean, detail: string }`. `ctx` gives you `gql`, `gqlRace`, `PERSONAS`, plus the fixture's `league`, `teams`, `playerId`.

- **`cross-team-mutation.mjs`** — can `outsider` (an ordinary team manager) rename/edit a team they don't own?
- **`commissioner-bypass.mjs`** — can `outsider` trigger a commissioner-only system mutation (`autoAdvanceMatchups`)?
- **`non-member-read.mjs`** — can `nonMember` (no relationship to the league at all) read standings/analytics?
- **`injection-statkey.mjs`** — does a crafted `statKey` subquery return a different result than the honest baseline? (Compares values, not just "did it error" — a validation error is not evidence either way.)
- **`race-double-claim.mjs`** — do two near-simultaneous `forceAddPlayer` calls let the same player land on two rosters?

## Adding a scenario

1. Pick the exact authorization/invariant claim you're testing and name the file after the attack, not the symptom (`cross-team-mutation.mjs`, not `bug-1234.mjs`).
2. Write `run(ctx)` so `exploited` is computed from a **material difference** in the response — not "it didn't throw." (See `injection-statkey.mjs`'s baseline-vs-injected comparison for the pattern; a scenario that calls something an error "fine" either way is not a scenario.)
3. Run it alone first (`start-local-stack.sh your-new-scenario`) before adding it to the default sweep, so a broken scenario doesn't masquerade as a finding.
4. If it comes from a `qa-audit` or manual-review finding, cross-reference the Jira ticket in the file's header comment.

## When a scenario finds something

File the Jira ticket as you normally would, but cite the live result, not a code reading: quote the `detail` string and the request/response, and say "confirmed live via `scripts/adversarial-qa`" rather than "found by reading `X.ts`." That distinction is the entire point of this skill — reviewers and the implementer both get a reproducible, executable proof instead of a hypothesis.

If a fix lands for an exploited scenario, re-run it and confirm it flips to 🟢 before closing the ticket — the scenario is now a regression guard; leave it in the suite.

## Gotchas

- **Entitlement staleness**: every persona's `entitlements_updated_at` is seeded to epoch (`seed-personas.mjs`) so a freshly minted token (with `iat = now`) is never considered stale. If you add a persona by hand, do the same or every call will fail with `ENTITLEMENTS_STALE` before your scenario logic even runs.
- **Reserved id range**: personas live at `PERSONA_ID_BASE` (900001) and up (`scripts/adversarial-qa/lib/stack.mjs`). Never reuse ids below that — they can collide with real seeded data on a shared dev database (though this harness should only ever run against its own disposable DB).
- **`public.users` is a view** — seed into `app_internal.users`, the base table, or the insert fails with "cannot insert into column of view."
- **One fixture per run** — `run.mjs` creates a fresh scratch league every invocation; it does not reuse leagues across runs, so re-running is always clean but also always creates DB rows (harmless on a disposable DB, but don't point this at anything you want to stay tidy).

## Related skills

- [qa-audit](../qa-audit/SKILL.md) — where a suspected finding usually comes from, before being confirmed here.
- [ui-audit](../ui-audit/SKILL.md) — the visual/design-system analog; same "live, not static" spirit, different target (pixels vs. authorization).
- [ground-truth-verification](../ground-truth-verification/SKILL.md) — same "verify, don't assume" discipline, applied to documentation claims instead of security claims.
- [database](../database/SKILL.md) — migrations and local DB mechanics this harness's setup script leans on.

## Provenance and maintenance

Created after a manual live-exploitation pass (hand-run `psql`/`curl`/ad hoc Node scripts against a locally stood-up `lambdas/db/src/dev.ts`) confirmed real cross-team-mutation, commissioner-bypass, non-member-read, and race-condition findings during a QA sweep, and disproved a reading-only SQL-injection suspicion in the same pass. This skill formalizes that one-off harness into a reusable, checked-in tool. Re-verify before trusting an old scenario result: re-run `start-local-stack.sh` — a fix landing for any scenario should flip its verdict to 🟢, and if it doesn't, the scenario itself (not just the app) needs a second look.
