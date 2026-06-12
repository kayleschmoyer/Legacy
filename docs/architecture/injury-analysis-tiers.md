# Injury Analysis Surface — Free vs. Premium Tiers

**Ticket:** LS-6254 ([FPD-030])
**Status:** Tier split defined — feature not yet implemented
**Agent lens:** Senior QA Lead

## Why this document exists

The "expert injury analysis" surface for the Football Player Detail page (the
**Injury Status & News** feature) is open green-field — no implementation exists
and the source file is `(future)`. Before the implementation ticket (**FPD-026**)
ships, the line between what every user sees for free and what Premium unlocks
must be **defined**, so the build has a concrete target and QA has a spec to test
against. This document draws that line.

It is the policy companion to
[`injury-data-provenance.md`](injury-data-provenance.md) (LS-6253), which defines
**where injury data comes from and how it is audited**. This document defines
**which slices of that data each tier may see**. Read both before implementing
FPD-026.

## Current state (June 2026)

No injury-analysis UI exists. The only `injury` value in the codebase is
placeholder data on the demo Draft `PlayerCard`
(`lib/shared-components/src/features/draft/PlayerCard.tsx`); there is no live
injury feed (see [`injury-data-provenance.md`](injury-data-provenance.md) for the
provenance gap). The Football Player Detail view
(`lib/shared-components/src/features/football/FootballPlayerDetail.tsx`) already
ships an established **premium-upsell pattern** — the `ProjectionsTeaser` card —
which the injury surface should reuse rather than reinvent (see
[Premium gating mechanism](#premium-gating-mechanism)).

## The tier split

### Free baseline — injury **status**, nothing more

Every user, signed in or not, free or premium, sees the at-a-glance answer to
"can this player play?":

| Element                    | Detail                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| **Status badge**           | The official designation — `Healthy` / `Questionable` / `Doubtful` / `Out` — with its color. |
| **Last-updated timestamp** | When the status was last fetched (e.g. "updated 2h ago"), so the user can gauge staleness.   |

The status vocabulary and badge colors mirror the standard NFL injury-report
designations already documented in
[`injury-data-provenance.md`](injury-data-provenance.md#current-state-june-2026)
(`healthy` → green, `questionable` → yellow, `doubtful` → orange, `out` → red),
and the source must be surfaced on hover per the FPD-029 trust requirement. The
free tier is **the fact of the status and its freshness** — not the analysis
behind it.

### Premium — the **expert analysis** behind the status

Premium unlocks the "why" and "what next" that a fantasy manager pays for:

| Element                            | Detail                                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Practice-participation history** | The week's practice log (DNP / Limited / Full) leading into game day — the leading indicator analysts watch.    |
| **Analyst note / writeup**         | A short human (or curated) writeup interpreting the injury and its fantasy impact.                              |
| **Return-from-IR projection**      | For players on IR, the projected return window (e.g. "Eligible to return Week 9; targeting Week 11").           |
| **Game-time decision tracker**     | For game-day-decision players, a live-ish tracker of the latest signal (inactives list, beat-reporter updates). |

Premium is **the interpretation and the forward-looking projection** — the
practice trend, the analyst's read, the IR timeline, and the game-time tracker.
A free user sees _that_ a player is `Questionable`; a premium user sees the
practice trend that produced it, an analyst's take, and whether to expect them
active by kickoff.

### Boundary summary

| Capability                     | Free | Premium |
| ------------------------------ | :--: | :-----: |
| Status badge (Healthy/Q/D/Out) |  ✅  |   ✅    |
| Last-updated timestamp         |  ✅  |   ✅    |
| Source-on-hover (provenance)   |  ✅  |   ✅    |
| Practice-participation history |  —   |   ✅    |
| Analyst note / writeup         |  —   |   ✅    |
| Return-from-IR projection      |  —   |   ✅    |
| Game-time decision tracker     |  —   |   ✅    |

## Premium gating mechanism

When FPD-026 implements this surface, it should gate the premium block through
the platform's existing entitlement model rather than an ad-hoc `isPremium`
branch:

- **Entitlement key.** Add a forward-looking entitlement —
  `expert_injury_analysis` — to `ENTITLEMENTS` and attach it to the `premium`
  tier in `TIER_ENTITLEMENTS` in `lib/utils/src/lib/entitlements.ts` (with a
  matching Stripe Feature `lookup_key` seeded by
  `apps/cli/src/commands/seedStripe.ts`). Gating code should ask
  `tierHasEntitlement(tier, ENTITLEMENTS.expert_injury_analysis)` /
  `requireEntitlement(...)` — framed around the **capability**, not the tier that
  currently grants it — consistent with the entitlements module's guidance.
- **UI treatment.** Reuse the `ProjectionsTeaser` upsell pattern already in
  `FootballPlayerDetail.tsx`: render the free status badge unconditionally, and
  for non-premium users show a blurred teaser of the analysis block with a lock
  badge and an "Upgrade to Premium" CTA (the same cross-platform blur/opacity
  treatment, web `filter` ignored gracefully on React Native).

> Defining the entitlement key and Stripe Feature, and wiring the gate, is
> **implementation work owned by FPD-026** — this document only specifies the
> intended key name and the pattern to follow so the implementation has a target.

## Open questions for FPD-026

These do not block this tier definition but should be resolved during
implementation:

- **Analyst-note sourcing** — is the writeup authored in-house, curated from a
  licensed provider, or generated? This depends on the provider selection still
  open in [`injury-data-provenance.md`](injury-data-provenance.md#candidate-sources).
- **Game-time-decision refresh cadence** — "live-ish" needs a concrete polling /
  push interval, constrained by the chosen provider's update frequency and
  licensing terms.

## Scope of this document

In scope: defining the free baseline vs. premium feature split for the injury
analysis surface, naming the intended entitlement key, and pointing the
implementation at the existing gating pattern — so the FPD-030 finding has a
durable, testable record before FPD-026 is built. **Out of scope:** building the
Injury Status & News UI, selecting/contracting an injury-data provider, and any
entitlement/schema code changes — those land with FPD-026 and must satisfy this
split and the provenance requirements in
[`injury-data-provenance.md`](injury-data-provenance.md).
