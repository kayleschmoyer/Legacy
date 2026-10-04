# @legacy-sports/football-game-stats-provider

Game-level football stats for the 1999-2025 seasons, sourced from
[nflverse](https://github.com/nflverse/nflverse-data) and staged in S3
(`terraform/main/football-corpus.tf`'s `nflverse/` prefix), with a
`@legacy-sports/pfr-client` scrape fallback for anything the corpus doesn't
cover. Implements LS-9989 (see `docs/decisions/0022-football-per-game-stats-source.md`
and the LS-9908 spike it records).

## Why this exists

Pro Football Reference sits behind a Cloudflare bot wall that 403s every
scripted request, and Sports Reference's terms of use independently prohibit
building a derived data store from their content. nflverse is CC-BY-4.0 and
covers 1999-2025 (the range play-by-play-derived stats exist for) from a
different, license-compatible source. This package is the 1999-2025 sibling
of `lib/pfa-client` (1960-1998, LS-9948) — both are staged behind the same
`getGameLog` interface `@legacy-sports/pfr-client` already established, so
`lambdas/stats-lambda/src/load-football-game.ts` can adopt either without a
call-site change beyond the import.

## Data source and attribution (required by nflverse's license)

> Football per-game stats for the 1999-2025 seasons are sourced from
> nflverse (https://github.com/nflverse/nflverse-data), licensed under
> CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/).

Exported as `NFLVERSE_ATTRIBUTION` (`src/lib/types.ts`) — surface it
wherever this data (or a product built on it) is user-visible, per
CC-BY-4.0's attribution requirement.

## Layout

- `src/lib/types.ts` — stored payload shapes, S3 key builders
  (`nflverse/v1/<pfrId>/<season>.json.gz` for player payloads,
  `nflverse/v1/team-defense/<nflTeam>/<season>.json.gz` for team defense —
  see the doc-comment on `NflversePlayerSeasonPayload` for why team defense
  is staged separately), and the attribution string.
- `src/lib/transform.ts` — pure functions turning nflverse's
  `stats_player_week_<season>.csv` (release `player_stats`), `players.csv`
  (release `players`) and `games.csv` (release `schedules`) rows into this
  package's stored shapes. Column names were captured live against a real
  download on 2026-09-11 — see the doc-comment at the top of this file for
  the exact schema and a note on where an older nflverse schema revision
  (`lib/data-loaders/src/lib/backfill-nflverse-multiteam-seasons.ts`,
  LS-9919) uses different column names for the same concepts.
- `src/lib/s3-store.ts` — request-scoped promise-memo cache over S3 reads,
  mirroring `@legacy-sports/game-stats-provider`'s `s3-store.ts` (LS-9817)
  exactly (`FOOTBALL_CORPUS_S3_BUCKET`/`FOOTBALL_CORPUS_S3_PREFIX` env vars,
  15-minute TTL, 512-entry LRU-ish eviction, never-memoize-a-failure).
- `src/lib/provider.ts` — the three drop-in `getGameLog` replacements
  (`CareerStats`, `IDPStats`, `TeamDefense`), each falling back to
  `@legacy-sports/pfr-client`'s live scraper on a corpus miss.

## Fixtures are real, not synthetic

Every fixture in `src/lib/__fixtures__/` is a verbatim excerpt of real rows
downloaded from nflverse's GitHub releases (Patrick Mahomes, Matt Prater and
Kareem Jackson's actual 2023 week 1-3 lines, plus the matching real
schedule rows) — this environment had working network egress to
`github.com`, unlike the one `lib/pfa-client` was built in. `transform.spec.ts`
asserts against the real recorded values (including real final scores for
the team-defense points-allowed derivation), so those tests double as a
value-level validation against nflverse's own source truth for this sample.
See `VALIDATION-REPORT.md` for a larger, dedicated sample.

## Known gaps (mirrors ADR 0022's documented permanent gaps)

- `rating` (passer rating) and `lng` (long gain, rushing/receiving) are not
  present in nflverse's weekly file — always `null`, not synthesized.
- Field-goal _attempts_ by distance band aren't published, only _makes_ by
  band — `fg019a`/`fg2029a`/etc are always `null`.
- Team defense yards/points allowed are derived (opposing offense's summed
  weekly output; schedule's final score), not read from a single nflverse
  "team defense" table — nflverse does not publish one. See the doc-comment
  on `buildTeamDefenseGames` in `transform.ts`.

## PFA read path, 1960-1998 (LS-9997)

`PfaCareerStats.getGameLog(player, season)` (`src/lib/pfa-provider.ts`)
reads `pfa/v1/<pfrId>/<season>.json.gz` from the same bucket
(`FOOTBALL_CORPUS_S3_BUCKET`/`FOOTBALL_CORPUS_S3_PREFIX`, same memo cache)
and returns the same `GameLog` shape as `CareerStats.getGameLog`. The objects
are written by the PFA ingest (LS-9995), and `src/lib/pfa-types.ts` mirrors
that ingest's payload shape.

- **This is the PFA half only.** It is not wired into a season-boundary
  router, and `load-football-game.ts` does not call it. LS-10214 owns the
  1960-1998 -> PFA / 1999+ -> nflverse routing.
- **No data comes back as `null`.** A NoSuchKey miss (crosswalk miss, no games
  that season), a season outside 1960-1998, or no bucket configured all
  return `null`. There is no `pfr-client` fallback, because PFR cannot be
  reached from a server (LS-9908).
- **Errors throw.** A non-404 S3 error throws. So does a corrupt or
  wrong-shaped object, as `PfaPayloadError`.
- **Permanent gaps (ADR 0022):** `fumbles` is always `null` (unknown, never
  `0`). There is no PFA IDP or team-defense game log.
