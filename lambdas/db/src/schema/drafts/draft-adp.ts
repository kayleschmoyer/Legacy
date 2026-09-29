/**
 * Draft domain — the stack-rank ADP shared by the board's two consumers.
 *
 * "True" ADP (real historical draft data) isn't collected yet, so a player's
 * consensus rank is a stack rank: their 1-based position when the league's
 * *entire* draftable pool is ordered by projected value, using the league's
 * own customized scoring settings when it has ever edited them (LS-696),
 * falling back to the default (league_id IS NULL) scoring profile, and finally
 * to the projections pipeline column for any player neither cache has scored.
 *
 * The rank is computed as a window function over the pool-defining predicates
 * only — sport, the prior-rostering exclusion, and the league's static
 * eligibility rules — and deliberately NOT over the already-drafted exclusion,
 * search term, position pill, or open-roster-slot predicates a caller may
 * layer on top. That is what makes the rank stable for the life of the draft:
 * it does not renumber as players are drafted, searched for, or filtered off
 * the current page.
 *
 * "Prior-rostering" is load-bearing and is not the same as "rostered": a live
 * pick rosters its player immediately, so the window deliberately keeps the
 * players this draft's own picks rostered. See
 * {@link buildDraftAdpPoolConditions} for why both consumers break without
 * that carve-out.
 *
 * Two callers share this module, and the fact that they share it is the point
 * (LS-10096):
 *
 *  - `getAvailableDraftPlayers` reads the rank for *undrafted* players, to
 *    show the board's rank column; and
 *  - `DraftPick.adp` reads it for *drafted* ones, so the value-heat board can
 *    compute `overallPick − adp` for a pick that has already been made.
 *
 * Before this module the CTE lived inline in the available-players query only,
 * so the two halves of the board could have ranked the same player differently
 * the moment either copy drifted. A pick's tint is an assertion about how well
 * a manager drafted; it has to come from the same numbers the board showed
 * them when they were choosing.
 */

import {
  buildEligibilityConditions,
  PublicSchema,
  withPoolTimeoutRetry,
} from '@legacy-sports/db-client';
import type { GenericDatabase } from '@legacy-sports/db-client';
import { eq, type SQL, sql } from 'drizzle-orm';

type Db = GenericDatabase<typeof PublicSchema>;

/** Sport discriminator, mirroring `leagues.sport`. */
export type DraftSport = 'baseball' | 'football';

/**
 * The league columns the pool predicates read. The two enum-backed columns are
 * narrowed to their Postgres enum values rather than `string`, matching
 * `LeagueEligibilitySettings` — widening them here would only push a cast
 * onto every caller.
 */
export interface DraftAdpLeagueSettings {
  sport: DraftSport | null;
  playerPool: 'all' | 'nl' | 'al' | 'nfl' | 'afc' | 'nfc' | null;
  minCareerGames: number | null;
  minCareerSeasons: number | null;
  baseballHofOnly: boolean | null;
  baseballEraFilter: string | null;
  customEraStartYear: number | null;
  customEraEndYear: number | null;
}

/**
 * Build the `draft_adp` CTE. `poolConditions` must be the pool-defining
 * predicates ONLY (see the module comment) and reference the table alias `p`.
 *
 * The returned fragment is a complete `WITH draft_adp AS (...)` clause and is
 * meant to be prefixed to a SELECT that joins `draft_adp` on `player_id`.
 */
export function buildDraftAdpCte({
  leagueId,
  leagueSport,
  poolConditions,
}: {
  /** `null` for a mock draft: only the league-less default cache applies. */
  leagueId: number | null;
  leagueSport: DraftSport;
  poolConditions: SQL[];
}): SQL {
  const poolWhereClause = sql`WHERE ${sql.join(poolConditions, sql` AND `)}`;

  // Football reads football_player_scoring_cache (LS-9484) and can fall back
  // to the projections column; baseball has no equivalent pipeline column.
  return leagueSport === 'football'
    ? sql`
        WITH draft_adp AS (
          SELECT p.id AS player_id,
            RANK() OVER (
              ORDER BY COALESCE(cs_league.avg_ppg, cs_default.avg_ppg, p.projected_fantasy_points::numeric, 0) DESC
            ) AS adp
          FROM public.players p
          LEFT JOIN public.football_player_scoring_cache cs_league
            ON cs_league.player_id = p.id AND cs_league.league_id = ${leagueId}
          LEFT JOIN public.football_player_scoring_cache cs_default
            ON cs_default.player_id = p.id AND cs_default.league_id IS NULL
          ${poolWhereClause}
        )
      `
    : sql`
        WITH draft_adp AS (
          SELECT p.id AS player_id,
            RANK() OVER (
              ORDER BY COALESCE(cs_league.avg_ppg, cs_default.avg_ppg, 0) DESC
            ) AS adp
          FROM public.players p
          LEFT JOIN public.player_scoring_cache cs_league
            ON cs_league.player_id = p.id AND cs_league.league_id = ${leagueId}
          LEFT JOIN public.player_scoring_cache cs_default
            ON cs_default.player_id = p.id AND cs_default.league_id IS NULL
          ${poolWhereClause}
        )
      `;
}

/**
 * Assemble the pool-defining predicates for a league. Kept next to
 * {@link buildDraftAdpCte} so a change to what "the pool" means lands on both
 * consumers at once.
 */
export function buildDraftAdpPoolConditions({
  draftId,
  leagueId,
  leagueSport,
  league,
}: {
  draftId: number;
  /** `null` for a mock draft, which rosters nobody (LS-10076). */
  leagueId: number | null;
  leagueSport: DraftSport;
  league: DraftAdpLeagueSettings | undefined;
}): SQL[] {
  return [
    sql`p.sport = ${leagueSport}`,
    // Players already rostered in this league are not draftable (LS-8674:
    // keepers are applied to rosters before the first pick), so they are not
    // part of the pool the rank is taken over either — with one exception
    // that the whole feature depends on.
    //
    // A live (non-mock) pick rosters its player immediately: commitDraftPick
    // calls addPlayerToRoster, which writes a team_members row inside the same
    // transaction as the draft_picks row. So "rostered in this league" grows
    // by one on every pick, and a bare NOT EXISTS would shrink the ranking
    // window as the draft runs. Two things break if it does:
    //
    //  - DraftPick.adp would be null for every pick ever made, because the
    //    player is rostered the instant they are drafted. The value-heat board
    //    would render nothing but em dashes in a real league (LS-10096).
    //  - The rank is documented as stable for the life of the draft, but
    //    RANK() over a shrinking window renumbers everyone left behind on
    //    every pick — the exact behaviour LS-696 removed.
    //
    // So players rostered *by this draft's own picks* stay in the window. The
    // window is then the pool as it stood when the draft began: keepers and
    // other prior rosterings excluded, this draft's picks still ranked.
    // A mock draft has no league and writes no roster rows, so nothing is
    // excluded — the window is the whole eligible pool (LS-10076).
    ...(leagueId === null
      ? []
      : [
          sql`(
          NOT EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.league_id = ${leagueId} AND tm.player_id = p.id
          )
          OR EXISTS (
            SELECT 1 FROM public.draft_picks dp
            WHERE dp.draft_id = ${draftId} AND dp.player_id = p.id
          )
        )`,
        ]),
    ...buildEligibilityConditions({
      sport: leagueSport,
      playerPool: league?.playerPool ?? 'all',
      minCareerGames: league?.minCareerGames ?? 50,
      minCareerSeasons: league?.minCareerSeasons ?? 3,
      baseballHofOnly: league?.baseballHofOnly ?? false,
      baseballEraFilter: league?.baseballEraFilter ?? undefined,
      customEraStartYear: league?.customEraStartYear ?? null,
      customEraEndYear: league?.customEraEndYear ?? null,
    }).map(({ condition }) => condition),
  ];
}

/**
 * Rank every player already drafted in `draftId`, keyed by player id.
 *
 * Restricted to drafted players on purpose: the caller is the pick-history
 * payload, so ranking the whole pool and shipping it would be thousands of
 * rows to answer a question about a few hundred picks.
 *
 * A player absent from the returned map has no rank on file — neither scoring
 * cache has scored them. Callers must render that as "unknown" rather than
 * substituting a number: a fabricated rank becomes a fabricated pick value,
 * which is exactly the kind of confidently-wrong number the draft recap would
 * carry all season.
 *
 * All three queries are wrapped in withPoolTimeoutRetry (LS-8478 pattern, as
 * applied across the loaders by LS-10037): this runs once per draft from a
 * DataLoader batching a whole pick-history page, and the ranking query is a
 * window function over the league's entire draftable pool — a heavy consumer
 * of the shared per-Lambda pool at exactly the moment a live draft is
 * generating concurrent load.
 */
export async function loadDraftedPlayerAdp(
  db: Db,
  draftId: number,
): Promise<Map<number, number>> {
  const [draft] = await withPoolTimeoutRetry(() =>
    db
      .select({
        leagueId: PublicSchema.drafts.leagueId,
        sport: PublicSchema.drafts.sport,
      })
      .from(PublicSchema.drafts)
      .where(eq(PublicSchema.drafts.id, draftId))
      .limit(1),
  );

  if (!draft) return new Map();

  const leagueId = draft.leagueId;
  const [settings] =
    leagueId === null
      ? // A mock draft's pool lives on mock_draft_settings (LS-10076).
        await withPoolTimeoutRetry(() =>
          db
            .select({
              sport: PublicSchema.drafts.sport,
              playerPool: PublicSchema.mockDraftSettings.playerPool,
              minCareerGames: PublicSchema.mockDraftSettings.minCareerGames,
              minCareerSeasons: PublicSchema.mockDraftSettings.minCareerSeasons,
              baseballHofOnly: PublicSchema.mockDraftSettings.hofOnly,
              baseballEraFilter: PublicSchema.mockDraftSettings.eraFilter,
              customEraStartYear:
                PublicSchema.mockDraftSettings.customEraStartYear,
              customEraEndYear: PublicSchema.mockDraftSettings.customEraEndYear,
            })
            .from(PublicSchema.mockDraftSettings)
            .innerJoin(
              PublicSchema.drafts,
              eq(
                PublicSchema.drafts.id,
                PublicSchema.mockDraftSettings.draftId,
              ),
            )
            .where(eq(PublicSchema.mockDraftSettings.draftId, draftId))
            .limit(1),
        )
      : await withPoolTimeoutRetry(() =>
          db
            .select({
              sport: PublicSchema.leagues.sport,
              playerPool: PublicSchema.leagues.playerPool,
              minCareerGames: PublicSchema.leagues.minCareerGames,
              minCareerSeasons: PublicSchema.leagues.minCareerSeasons,
              baseballHofOnly: PublicSchema.leagues.baseballHofOnly,
              baseballEraFilter: PublicSchema.leagues.baseballEraFilter,
              customEraStartYear: PublicSchema.leagues.customEraStartYear,
              customEraEndYear: PublicSchema.leagues.customEraEndYear,
            })
            .from(PublicSchema.leagues)
            .where(eq(PublicSchema.leagues.id, leagueId))
            .limit(1),
        );

  const leagueSport = settings?.sport ?? draft.sport;
  const cte = buildDraftAdpCte({
    leagueId,
    leagueSport,
    poolConditions: buildDraftAdpPoolConditions({
      draftId,
      leagueId,
      leagueSport,
      league: settings,
    }),
  });

  const result = await withPoolTimeoutRetry(() =>
    db.execute(sql`
      ${cte}
      SELECT da.player_id, da.adp
      FROM draft_adp da
      JOIN public.draft_picks dp ON dp.player_id = da.player_id
      WHERE dp.draft_id = ${draftId}
    `),
  );

  const ranks = new Map<number, number>();
  for (const row of result.rows as unknown as Array<{
    player_id: number | string;
    adp: number | string | null;
  }>) {
    if (row.adp == null) continue;
    ranks.set(Number(row.player_id), Number(row.adp));
  }
  return ranks;
}
