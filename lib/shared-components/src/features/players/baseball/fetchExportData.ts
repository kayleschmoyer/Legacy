/**
 * Fetch the full filtered result set for the MLB player-stats export (LS-10731).
 *
 * The grids only hold the page the user is looking at, so the export used to
 * contain at most one page (e.g. 25 of 1,096 BOS hitters). Product decided the
 * export covers every filtered row up to {@link EXPORT_ROW_CAP} per table, so
 * the controller re-runs the grids' own queries here with the page window
 * widened to the cap.
 */
import {
  type CareerPitchingFragment,
  GetCareerBattingStats,
  type GetCareerBattingStatsQuery,
  type GetCareerBattingStatsQueryVariables,
  GetCareerPitchingStats,
  GetCareerPitchingStatsCount,
  type GetCareerPitchingStatsCountQuery,
  type GetCareerPitchingStatsCountQueryVariables,
  type GetCareerPitchingStatsQuery,
  type GetCareerPitchingStatsQueryVariables,
} from '@legacy-sports/graphql';
import type { ApolloClient } from '@apollo/client';
import {
  type PlayerCareerStats,
  transformCareerStats,
} from '../services/CareerStatsService';

/** The subset of ApolloClient the export fetch needs (eases unit testing). */
export type ExportQueryClient = Pick<ApolloClient, 'query'>;

export interface FetchedTable<Row> {
  readonly rows: readonly Row[];
  /** Rows matching the filters server-side, before the cap. */
  readonly matched: number;
}

/**
 * Fetch up to `cap` career-batting rows for `params` (sort + filters).
 *
 * The server silently clamps `first` (5,000 for large-page-size holders, 100
 * otherwise — statistics.ts), so this pages by the number of rows each response
 * actually returned rather than by the requested window. A premium holder gets
 * the whole set in one request; anyone else is paged transparently.
 */
export async function fetchAllBattingRows(
  client: ExportQueryClient,
  params: GetCareerBattingStatsQueryVariables,
  cap: number,
): Promise<FetchedTable<PlayerCareerStats>> {
  const rows: PlayerCareerStats[] = [];
  let matched = 0;
  let offset = 0;
  while (rows.length < cap) {
    const { data } = await client.query<
      GetCareerBattingStatsQuery,
      GetCareerBattingStatsQueryVariables
    >({
      query: GetCareerBattingStats,
      variables: {
        ...params,
        first: cap - rows.length,
        // Same offset cursor encoding the grid's pager uses.
        after: offset > 0 ? btoa(String(offset)) : undefined,
      },
      fetchPolicy: 'network-only',
    });
    const connection = data?.careerBattingStats;
    matched = connection?.totalCount ?? matched;
    const edges = connection?.edges ?? [];
    if (edges.length === 0) break;
    for (const edge of edges) {
      if (edge) rows.push(transformCareerStats(edge.node || {}));
    }
    offset += edges.length;
    if (offset >= matched) break;
  }
  return { rows: rows.slice(0, cap), matched: Math.max(matched, rows.length) };
}

/**
 * Fetch up to `cap` career-pitching rows for `params` (sort + filters). The
 * pitching query has no server-side page cap today, but it is still paged
 * against the filtered count so a future clamp can't silently truncate the
 * export.
 */
export async function fetchAllPitchingRows(
  client: ExportQueryClient,
  params: GetCareerPitchingStatsQueryVariables,
  cap: number,
): Promise<FetchedTable<CareerPitchingFragment>> {
  const { data: countData } = await client.query<
    GetCareerPitchingStatsCountQuery,
    GetCareerPitchingStatsCountQueryVariables
  >({
    query: GetCareerPitchingStatsCount,
    variables: {
      minGames: params.minGames,
      minWins: params.minWins,
      maxWins: params.maxWins,
      minStrikeouts: params.minStrikeouts,
      maxStrikeouts: params.maxStrikeouts,
      minERA: params.minERA,
      maxERA: params.maxERA,
      searchTerm: params.searchTerm,
      position: params.position,
      team: params.team,
    },
    fetchPolicy: 'network-only',
  });

  const countedMatches = countData?.careerPitchingStatsCount;

  const rows: CareerPitchingFragment[] = [];
  let offset = 0;
  while (rows.length < cap) {
    const requested = cap - rows.length;
    const { data } = await client.query<
      GetCareerPitchingStatsQuery,
      GetCareerPitchingStatsQueryVariables
    >({
      query: GetCareerPitchingStats,
      variables: { ...params, limit: requested, offset },
      fetchPolicy: 'network-only',
    });
    const page = data?.careerPitchingStats ?? [];
    if (page.length === 0) break;
    for (const row of page) {
      if (row) rows.push(row);
    }
    offset += page.length;
    // Without a count, a short page is the only end-of-results signal.
    if (
      countedMatches == null
        ? page.length < requested
        : offset >= countedMatches
    )
      break;
  }

  return {
    rows: rows.slice(0, cap),
    matched: Math.max(countedMatches ?? 0, rows.length),
  };
}
