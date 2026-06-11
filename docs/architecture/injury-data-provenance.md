# Injury Data Provenance & Audit Trail

**Ticket:** LS-6253 ([FPD-029])
**Status:** Provenance model documented — feature not yet implemented
**Agent lens:** Observability / Data Accuracy

## Why this document exists

When an injury status is shown to a user (e.g. on the Football Player Detail
page) and that user disputes it — "this player is active, not Out" — support
needs an **audit trail**: where did this status come from, which provider
reported it, and when was it fetched? Today no such provenance is recorded or
documented, so a dispute cannot be traced back to a source. This document
establishes the provenance model and the requirements any injury-status feature
must satisfy before it ships.

## Current state (June 2026)

Legacy Sports is a **historical / archived-stats** fantasy platform. Player data
is sourced from archived records, not a live feed:

- **Football** — player identity and stats come from
  [Pro Football Reference](https://www.pro-football-reference.com/) (the
  `pfrId` column on the football player schema; see
  `lambdas/db/src/schema/football.ts`). There is **no live injury feed** wired
  into the system. Week-level / live data is still pending (see the
  `weeklyStats` TODO under LS-6233).
- **Baseball** — stats come from archived MLB box scores of historical seasons.
  Because games are final and historical, there is no in-game injury concept
  (see the "no injury luck mid-game" note in
  `lib/utils/src/lib/help-content.ts`).

The only place an `injury` value currently appears in the codebase is the demo
Draft `PlayerCard` (`lib/shared-components/src/features/draft/PlayerCard.tsx`),
where it is **placeholder data**, not sourced from any provider. Its status
vocabulary mirrors the standard NFL injury-report designations:

| Status         | Meaning                 | Card color |
| -------------- | ----------------------- | ---------- |
| `healthy`      | No designation / active | Green      |
| `questionable` | Questionable to play    | Yellow     |
| `doubtful`     | Unlikely to play        | Orange     |
| `out`          | Ruled out               | Red        |

**There is no documented source for these values.** That gap is the subject of
this document.

## Provenance requirements (when injury status ships)

Any feature that surfaces a live injury status to users — Football Player
Detail's Injury Status & News feature is the first planned consumer — **must**
record and expose the following provenance so support has an audit trail:

1. **Source / provider identifier** — the authoritative provider the status was
   read from (see [Candidate sources](#candidate-sources) below). Stored
   alongside the status, never inferred at display time.
2. **Original report reference** — the upstream artifact the status maps to
   (e.g. the official NFL game-status injury report for a given team/week), so a
   disputed status can be traced to the exact source document.
3. **Fetch timestamp** — when the status was last retrieved from the provider,
   so support can distinguish "stale data" from "wrong data".
4. **Audit trail** — the tuple `(status, source, originalReportReference,
fetchedAt)` must be persisted and queryable by support, not only rendered
   transiently in the UI.

### UX requirement: surface the source on hover

Per the FPD-029 finding, the displayed injury status must surface its
provenance to the user for trust. When the feature ships, hovering (or
long-pressing on touch) the injury status badge must reveal the source, e.g.:

> **Source:** NFL official injury report · updated 2h ago

This makes the provenance visible to the user directly and pre-empts most
disputes before they reach support.

## Candidate sources

The injury data provider has **not been selected** — this is forward-looking.
The licensed-data evaluation in
[`mlb-data-provider-evaluation.md`](mlb-data-provider-evaluation.md) surveyed
commercial redistributors (Sportradar, SportsDataIO, MySportsFeeds, Rolling
Insights, BALLDONTLIE); a football injury feed would come from the same class
of licensed provider, with the **official NFL injury report** as the upstream
source of truth. Whichever provider is chosen, the four provenance fields above
must be captured at ingestion.

## Scope of this document

In scope: documenting the provenance model and the audit-trail requirements so
the gap identified in FPD-029 has a durable record. **Out of scope:** building
the Injury Status & News UI, selecting/contracting an actual provider, and any
schema changes — those land with the feature itself, which must satisfy the
requirements above.
