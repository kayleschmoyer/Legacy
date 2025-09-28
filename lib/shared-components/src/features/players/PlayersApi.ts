// Local GraphQL types, documents, and hooks from shared-components
export {
  type Player as PlayerFragment,
  type GetAllPlayersQuery,
  type GetAllPlayersQueryVariables,
  type GetAllPlayersQueryHookResult,
  type GetAllPlayersLazyQueryHookResult,
  type GetAllPlayersQueryResult,
  PlayerFragmentDoc as PLAYER_FRAGMENT,
  GetAllPlayers as GET_ALL_PLAYERS,
  useGetAllPlayersQuery,
  useGetAllPlayersLazyQuery,
} from '../../api/db/graphql.generated';
