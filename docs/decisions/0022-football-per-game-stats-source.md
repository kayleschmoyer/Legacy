# 0022. Football per-game stats: nflverse for 1999+, licensed Pro Football Archives for 1960-1998, no PFR scraping

Date: 2026-09-09

## Status

Accepted

## Context

Football game-stat loading (`game_football_*`) has never run in production — those tables are empty — but the loader routes to Pro Football Reference (PFR) the same way the baseball loader used to route to Baseball Reference before LS-9817 replaced that path with a Retrosheet-in-S3 corpus. All 20,052 football players carry a `pfr_id`, so the football path was on track to repeat the exact capacity wall LS-9817 removed for baseball.

The football universe spans 1960-2025. The closest football analogue to Retrosheet, nflverse's `stats_player` release, only covers 1999-2025 — 54.7% of player-seasons across all six scoring-relevant stat tables (passing/rushing/receiving/kicking/defense/IDP; the ticket's original passing+rushing+receiving-only count was 49.4%). There is no known free bulk source for 1960-1998, and four of the product's six football "eras" (`pioneer`, `single_platoon`, `super_bowl_era`, `west_coast`) fall entirely before 1999 and are sold as premium features, so restricting football to 1999+ was not a cost-free option.

LS-9908 (this decision's spike) measured, rather than assumed, each open question:

- **PFR's rate limit is 20 req/min (not BBRef's 15/min), but rate is not the binding constraint.** PFR sits behind a Cloudflare bot challenge that 403s every scripted request — including `robots.txt` — at any rate, while sibling Sports Reference sites (including baseball-reference.com, in the same session) serve normally. The existing `PFRSession` client already depends on a hand-harvested, expiring `cf_clearance` cookie for this reason.
- **Sports Reference's terms explicitly prohibit the artifact this decision would otherwise build.** Their data-use terms bar automated collection that "adversely impacts site performance or access" and bar building "any database, archive, or other data store" from scraped content; custom data requests start at $5,000. This independently rules out a PFR-derived S3 corpus regardless of the Cloudflare wall.
- **nflverse is CC-BY-4.0**, permitting commercial use and redistribution with attribution — directly analogous to Retrosheet's license, which LS-9817 already built the attribution-notice pattern for.
- **The `pfr_id` → nflverse `gsis_id` crosswalk is total on nflverse's own player mapping table** (22,648 of 22,648 rows with a `pfr_id` also carry a `gsis_id`) and reaches 99.35% coverage of the 8,949 players in this database with at least one 1999+ season — closely mirroring LS-9809's 99% baseball crosswalk result.
- **The nflverse schema maps cleanly onto `game_football_*`** for every scoring-relevant column; the only gaps (`rating`, `lng`, `targets` for 2003-2008) are display-only fields DEFAULT_SCORING never reads.
- **Value-level validation against existing PFR-derived season totals** (after excluding traded-player seasons, where the current PFR-scraped `football_season_*` tables are structurally incomplete — see LS-9915) showed 94-98% exact agreement with a median residual delta of 1 unit, consistent with play-by-play-derived vs. official-box-score methodology differences.
- **A pre-1999 bulk source that is both per-game and permissively licensed does not exist among nflverse, PFR, ESPN (per-player box scores start in 1999 industry-wide — corroborated independently by ESPN's API), or commercial vendors** (Sportradar starts 2000, SportsDataIO 2010, MySportsFeeds 2009, BigDataBall 2016 with terms forbidding commercial use, Genius Sports 2021). **Pro Football Archives (profootballarchives.com)** was identified as the one source spanning the full pre-1999 range (back to 1920) with no stated prohibition on commercial or automated use in its terms — silence, not permission, but negotiable in a way Sports Reference's explicit prohibition and footballdb's explicit commercial-use ban are not.

Following the spike, the product owner independently pursued and closed licensing with Pro Football Archives. LS-9948 (PFA ingest for 1960-1998) is in review; LS-9919 (nflverse-based tranche-A backfill for 1999+ multi-team seasons) is merged. This ADR records the decision those tickets already implement, for readers who will not find it by reading Jira comments.

One inconsistency surfaced while writing this up: **LS-9920** ("re-scrape the 7,398 pre-1999 players from PFR to repair multi-team seasons") is still open and proposes exactly the PFR scraping this decision rules out. It predates the PFA finding and appears superseded by LS-9948; flagged separately on that ticket rather than resolved here.

## Decision

We will source football per-game stats from **nflverse** (`stats_player`, CC-BY-4.0) for **1999-2025**, and from a **licensed Pro Football Archives corpus** for **1960-1998**, both staged in S3 keyed by this database's own player id with the crosswalk resolved at ingest time — mirroring the LS-9817 pattern (seam identification, S3 layout, ingest-time crosswalk, provider with fallback, value-level validation).

We will **not** scrape Pro Football Reference to build a historical corpus, for any season range. PFR's Cloudflare bot wall and Sports Reference's data-use terms (prohibiting derived databases and automated collection) independently rule this out — this was the ticket's originally-proposed option and it is explicitly rejected, not merely deprioritized.

We will **not** restrict football to 1999+. Four of six football eras are entirely pre-1999 and are sold as a premium feature; deleting them was judged more costly than sourcing pre-1999 data. Per-game IDP stats (tackles, sacks) and per-game fumbles remain permanently unavailable pre-1999 from any source at any price (sacks were not an official NFL statistic until 1982; tackles never were an official stat; PFA carries no fumbles category) — this is an accepted, permanent product constraint, not a gap to close later.

## Consequences

### Easier

- Football per-game stat loading no longer depends on live, rate-limited, Cloudflare-gated scraping of PFR at request time — the existing on-demand PFR fetch path (`load-football-game.ts`) can be retired once both corpora are in place.
- The full 1960-2025 football era catalogue, including all four premium pre-1999 eras, stays sellable with real (not silently-zeroed) per-game stats.
- Adopting nflverse/PFA as the season-total source (by summing per-game rows) structurally fixes the LS-9915 traded-player truncation bug in `football_season_*`, rather than requiring a separate parser patch.

### Harder

- Two ingest providers (nflverse + PFA) must be maintained behind the same `getGameLog` interface instead of one, each with different crosswalk strength (nflverse: direct `pfr_id`→`gsis_id` lookup, ~99%; PFA: name+era+position-assisted, weaker, coverage not yet fully measured at ingest scale).
- Pre-1999 fumble and IDP scoring needs an explicit product decision (accept null / season-rate approximation kept out of the raw stat columns / disable for cross-era leagues) rather than silently scoring zero, since the current silent-zero behavior looks like a bug rather than a documented limitation.
- Kicking data for the PFA range requires a second crawl route (player game-log pages), not the box-score pages used for every other stat category.

### Now constrained

- Any future football per-game data source decision must clear the same bar this one did: Sports Reference properties (PFR, footballdb, and by extension any sibling site with similar terms) are not viable bulk sources regardless of rate-limit engineering, because the blocker is access (Cloudflare) and licensing (terms of use), not throughput.
- `game_football_passing.rating`, `game_football_rushing.lng`, `game_football_receiving.lng`/`targets` (2003-2008), and all pre-1999 fumbles/IDP fields are permanent display-only gaps or absences — code and product surfaces should treat these as "unknown," not synthesize or backfill them from derived estimates.
- Any redistribution of nflverse or PFA-derived data must carry the CC-BY-4.0 attribution nflverse requires and honor whatever terms the PFA license agreement specifies; this ADR does not itself constitute the PFA license text and should not be treated as a substitute for it.
