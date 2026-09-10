# PFA crosswalk coverage report (LS-9993)

## ⚠️ This report has NOT been run against a live crawl — read this before trusting any number below

Acceptance criteria for this ticket call for crawling all 78 PFA player-index
pages and measuring real crosswalk coverage by decade. **That crawl could
not be executed in either development environment this slice has been built
in so far.** Outbound network access to `www.profootballarchives.com` is
blocked by the network egress policy:

- `curl` to `https://www.profootballarchives.com/nflplayers-a.html` returns
  `CONNECT tunnel failed, response 403`.
- A `WebFetch` call to the same URL returns
  `{"error_type":"EGRESS_BLOCKED","domain":"www.profootballarchives.com", ...}`.
- The agent network proxy's own status endpoint records the denial as a
  policy decision (`connect_rejected`, `"gateway answered 403 to CONNECT
(policy denial or upstream failure)"`), not a transient failure.

This is the same blocker `lib/pfa-client/README.md` documents for LS-9991's
parser fixtures — confirmed independently here, in a second session, against
the same host. It appears to be a property of this class of sandboxed
development environment, not of the live site (LS-9908's spike measured PFA
serving HTTP 200 with no Cloudflare challenge from an unrestricted network).

**What this means for the acceptance criteria:**

| AC                                                                        | Status                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crawl all 78 player-index pages into a source table                       | **Blocked in this environment.** `crawlPlayerIndex()` (`src/lib/crawl-player-index.ts`) is implemented, unit-tested against mocked HTTP, and ready to run — it has not been run against the live site.                                                                                                    |
| Crosswalk resolver: pfa_id -> players.id with confidence + method per row | **Done.** `resolvePfaCrosswalk()` (`src/lib/crosswalk-resolver.ts`), fully unit-tested. Ready to run against real crawl output + `fetchFootballPlayerCandidates()`.                                                                                                                                       |
| Coverage report by decade, committed                                      | **Done as a methodology demonstration, not real measurement** — see below. The generator (`buildCoverageReport` / `renderCoverageReportMarkdown`) is implemented and unit-tested; the table below is built from a small hand-constructed synthetic sample, not from any live crawl or real `players` row. |
| Explicitly flag poor-coverage decades rather than averaging               | **Done** — `buildCoverageReport` computes per-decade match rate and a `poorCoverageDecades` list (`< 70%` by default), and the markdown renderer marks flagged rows with ⚠️.                                                                                                                              |

**To produce the real report**, from an environment with unrestricted
egress to `profootballarchives.com`:

```ts
import {
  crawlPlayerIndex,
  fetchFootballPlayerCandidates,
  resolvePfaCrosswalk,
  buildCoverageReport,
  renderCoverageReportMarkdown,
} from '@legacy-sports/pfa-client';
import { runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';

const sourceTable = await crawlPlayerIndex(); // all 78 pages
const rows = await runWithPublicClient(getDbOptions(), async (db) => {
  const candidates = await fetchFootballPlayerCandidates(db);
  return resolvePfaCrosswalk(sourceTable.entries, candidates);
});
const report = buildCoverageReport(rows);
console.log(renderCoverageReportMarkdown(report));
```

Then replace the sample section below with the real output, and replace
this warning banner with the crawl's `crawledAt` timestamp and any page
errors from `sourceTable.errors`.

## Method

Mirrors the LS-9817 / LS-9908 crosswalk-coverage method: broken out **by
decade of the matched player's final season** (not a single aggregate
percentage), with any decade below a 70% match rate flagged explicitly
rather than folded into the overall number. Unmatched entries (no same-name
candidate in `players`, or an unresolved ambiguous match) have no known
decade and are bucketed separately as `unresolved` rather than guessed into
a decade or silently dropped.

Per-row match methods, in increasing order of risk (see
`PfaCrosswalkMatchMethod` in `src/lib/types.ts`):

- `exact_name_unique` — exactly one `players` row shares the normalized
  name.
- `exact_name_era_mismatch` — the only same-name candidate's known active
  seasons don't overlap the era the PFA `league` value implies (AFL:
  1960-1969, AAFC: 1946-1949); still the only name match, flagged rather
  than trusted.
- `name_era_disambiguated` — multiple same-name candidates, narrowed to one
  by the era window.
- `ambiguous_unresolved` — multiple candidates remain; no match emitted.
- `no_match` — no `players` row shares the normalized name at all.

**Known gap: college is not usable for matching today.** PFA's
player-index pages carry a `college` field (parsed by LS-9991's
`PlayerIndexParser`), but the `players` table has no college column, so
college can only be recorded on the crosswalk source table for now, not
joined against. Era-assistance is instead derived from the PFA `league`
value (nfl/afl/aafc), which is the only era signal the player-index pages
themselves carry.

## Sample report (SYNTHETIC — methodology demonstration only)

Generated from 20 hand-constructed PFA entries against 16 hand-constructed
`players` candidates, deliberately including a duplicate-name collision
(two "John Smith"s in the AFL era) and several no-match entries, to
exercise every code path end-to-end. **None of these rows correspond to
real PFA data or real database rows.**

Overall: 14 / 20 matched (70.0%)

| Decade     | Total | Matched | Match Rate |
| ---------- | ----- | ------- | ---------- |
| 1950s      | 3     | 3       | 100.0%     |
| 1970s      | 4     | 4       | 100.0%     |
| 1980s      | 2     | 2       | 100.0%     |
| 1990s      | 2     | 2       | 100.0%     |
| 2000s      | 2     | 2       | 100.0%     |
| 2010s      | 1     | 1       | 100.0%     |
| unresolved | 6     | 0       | 0.0%       |

No decade fell below the 70% coverage threshold in this sample — but this
sample was constructed to include a bounded, known number of misses, not
measured. A real run may look very different: LS-9908's nflverse spike
found 1960s crosswalk coverage as low as 0.6% by a completely different
(pfr_id-based) method, so a materially worse 1960s/1970s number here would
not be surprising and must not be smoothed over when the real crawl runs.
