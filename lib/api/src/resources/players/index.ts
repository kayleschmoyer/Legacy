// Player resource exports
// Note: GraphQL operations are generated in the shared/graphql.generated.ts file
// This file provides convenient re-exports for player-related operations

export {
  GetAllPlayers,
  useGetAllPlayersQuery,
  useGetAllPlayersLazyQuery,
  GetPlayer,
  useGetPlayerQuery,
  useGetPlayerLazyQuery,
  GetPlayerByBrefId,
  useGetPlayerByBrefIdQuery,
  useGetPlayerByBrefIdLazyQuery,
} from '../../shared/graphql.generated';

export type {
  GetAllPlayersQuery,
  GetAllPlayersQueryVariables,
  GetPlayerQuery,
  GetPlayerQueryVariables,
  GetPlayerByBrefIdQuery,
  GetPlayerByBrefIdQueryVariables,
} from '../../shared/graphql.generated';
