# @legacy-sports/pfa-client

HTML parser, rate limiter, crawl script, and crosswalk resolver for Pro
Football Archives (PFA), used to ingest per-game football stats for
1960-1998 (LS-9948). See LS-9948, LS-9991 (parser + rate limiter), LS-9993
(this package's crawl script + crosswalk resolver, this section), and
LS-9997 (S3 ingest command) for the full slice.

## Crawl script + crosswalk resolver (LS-9993)

- `crawlPlayerIndex()` (`src/lib/crawl-player-index.ts`) — crawls all 28 PFA
  player-index pages (NFL a-z, plus the single-page AFL and AAFC indexes —
  PFA has no per-letter pages for those two leagues) into a source table of
  `PfaPlayerIndexEntry` rows, recording per-page errors rather than
  aborting the whole crawl on one bad page.
- `resolvePfaCrosswalk()` (`src/lib/crosswalk-resolver.ts`) — joins those
  entries against this repo's `players` table by normalized name, assisted
  by an era window derived from the PFA `league` value (afl: 1960-1969,
  aafc: 1946-1949). Every input row produces exactly one output row with a
  confidence score and match method — never a silent best-guess.
  `fetchFootballPlayerCandidates()` loads the `players`-side join data (each
  football player's active-season range, derived from
  `football_season_*` tables since `players` has no career-year or college
  column).
- `buildCoverageReport()` / `renderCoverageReportMarkdown()`
  (`src/lib/coverage-report.ts`) — decade-stratified coverage measurement
  following the LS-9817/LS-9908 method, flagging any decade below a 70%
  match rate explicitly instead of averaging it away.

**⚠️ The live crawl has not been run.** See
[`COVERAGE-REPORT.md`](./COVERAGE-REPORT.md) for the confirmed network
blocker (egress to `profootballarchives.com` denied by the sandbox's
network policy, independently of the fixture-validation gap below) and
exact instructions to produce a real report once network access is
available.

## ⚠️ Fixtures are synthetic, not captured — validate before the live crawl

Every `__fixtures__/*.html` file in this package is **hand-built from the
documented column headers and sample rows in LS-9948's description and its
2026-09-09 comment (id 20612)**, not captured from a real PFA page. Network
egress to `profootballarchives.com` is blocked in the environment this
package was developed in — both a direct `curl` and a `WebFetch` call to the
live site returned `EGRESS_BLOCKED`. So the parsing conventions this package
assumes (an ALL-CAPS caption cell naming each stat table, a header row
directly below it, one data row per player with the player's name as an
anchor in the first cell) are an inference from prose, not a verified fact
about PFA's real markup.

**Before LS-9993 (crosswalk resolver) or LS-9997 (S3 ingest) run a live
crawl**, capture a handful of real pages — at minimum one box score from
each of the 1960s/1970s/1980s/1990s, one player-index page, and one kicker
game-log page — from an environment with network access, and diff them
against the fixtures here. Update `BoxScoreParser.ts`,
`PlayerIndexParser.ts`, `KickerGameLogParser.ts`, and `HtmlParser.ts`'s
table-detection convention to match reality, and replace the synthetic
fixtures with the real captures (sanitized of any incidental PII beyond
player names, which are already public).

## What this package does NOT parse

- **Kicking stats** — PFA box scores never render a kicking table (0% across
  4,942 crawled games, per LS-9948 comment 20612). `fgm`/`fga`/`xpm`/`xpa`
  come only from `KickerGameLogParser`'s per-kicker `SCORING` route.
- **`game_football_defense_idp`** (solo tackles / assisted tackles / sacks)
  — sacks were not an official NFL statistic until 1982 and tackles have
  never been official, so this is a confirmed permanent gap, not something
  this parser omits by mistake. Do not add it.
- **Fumbles** — confirmed unavailable in any PFA table (box score or game
  log) for any era. Do not synthesize or backfill this field downstream.
