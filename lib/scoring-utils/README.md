# scoring-utils

The one way to score a matchup and persist the result.

`@legacy-sports/scoring` is the pure scoring engine: it turns stats plus
multipliers into numbers and is bundled into web and mobile, so it carries no
database dependency. This library is the server-side half — it owns the
database work that surrounds a scoring call (reading the matchup, resolving the
league's multipliers, fetching and partitioning the stat rows, writing the
score back) and therefore depends on both `@legacy-sports/db-client` and
`@legacy-sports/scoring`.

It exists as its own library rather than living in either of those two because
`db-client` cannot import `scoring` (that would be a dependency cycle) and
`scoring` cannot export a database-touching function from the barrel that
`apps/web` and `apps/app` bundle.

## Usage

Score one matchup:

```ts
import { scoreMatchup } from '@legacy-sports/scoring-utils';

await scoreMatchup(db, matchupId, leagueId, { forceRecalculation: true });
```

Score many matchups in one league without re-reading the scoring profile per
matchup:

```ts
import { createLeagueMatchupScorer } from '@legacy-sports/scoring-utils';

const scorer = await createLeagueMatchupScorer(db, leagueId);
for (const matchupId of matchupIds) {
  await scorer.scoreMatchup(matchupId, { forceRecalculation: true });
}
```

Both forms run the same core. There is deliberately no entry point that accepts
caller-supplied scoring settings — see the module doc in `src/matchup-score.ts`.
