// Re-export typed hooks and document from codegen.
// The raw query lives in src/api/db/players/PlayerSeasonStats.graphql
export {
  GetAllPlayerSeasonStats as GET_ALL_PLAYER_SEASON_STATS,
  useGetAllPlayerSeasonStatsQuery,
  useGetAllPlayerSeasonStatsLazyQuery,
} from '../../api/db/graphql.generated';
