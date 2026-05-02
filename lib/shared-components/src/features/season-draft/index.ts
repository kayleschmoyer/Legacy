/**
 * Season Draft Game Feature
 *
 * A turn-based drafting game where players select baseball player + season
 * combinations to fill roster positions. Scoring is based on season stats.
 */

export { SeasonDraftGame } from './SeasonDraftGame';
export { SeasonDraftGameCreate } from './SeasonDraftGameCreate';
export { SeasonDraftGameLobby } from './SeasonDraftGameLobby';
export { SeasonDraftJoin } from './SeasonDraftJoin';

// Re-export generated hooks and types for consumers
export {
  useGetSeasonDraftGameQuery,
  useGetSeasonDraftGameLazyQuery,
  useGetSeasonDraftGamesQuery,
  useGetSeasonDraftGameByInviteCodeQuery,
  useGetSeasonDraftGameStatValueLazyQuery,
  useSearchPlayersForDraftLazyQuery,
  useSearchUsersForDraftLazyQuery,
  useCreateSeasonDraftGameMutation,
  useJoinSeasonDraftGameMutation,
  useStartSeasonDraftGameMutation,
  useMakeSeasonDraftPickMutation,
  useCancelSeasonDraftGameMutation,
} from '../../api/db/graphql.generated';
