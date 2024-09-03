/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
import { FieldPolicy, FieldReadFunction, TypePolicies, TypePolicy } from '@apollo/client/cache';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export const PlayerFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Player"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Player"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"brefId"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]} as unknown as DocumentNode<PlayerFragment, unknown>;
export const BulkCreatePlayers = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"BulkCreatePlayers"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreatePlayersInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createPlayers"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"players"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Player"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Player"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Player"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"brefId"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]} as unknown as DocumentNode<BulkCreatePlayersMutation, BulkCreatePlayersMutationVariables>;
export const GetPlayerByBrefId = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetPlayerByBrefId"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"brefId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"playerByBrefId"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"brefId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"brefId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Player"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Player"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Player"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"brefId"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]} as unknown as DocumentNode<GetPlayerByBrefIdQuery, GetPlayerByBrefIdQueryVariables>;
export const GetAllPlayers = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetAllPlayers"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Cursor"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"players"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Player"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Player"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Player"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"brefId"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]} as unknown as DocumentNode<GetAllPlayersQuery, GetAllPlayersQueryVariables>;
export type PlayerFragment = { __typename?: 'Player', brefId: string, id: number, name?: string | null };

export type BulkCreatePlayersMutationVariables = Exact<{
  input: CreatePlayersInput;
}>;


export type BulkCreatePlayersMutation = { __typename?: 'Mutation', createPlayers?: { __typename?: 'CreatePlayersPayload', players?: Array<{ __typename?: 'Player', brefId: string, id: number, name?: string | null } | null> | null } | null };

export type GetPlayerByBrefIdQueryVariables = Exact<{
  brefId: Scalars['String']['input'];
}>;


export type GetPlayerByBrefIdQuery = { __typename?: 'Query', playerByBrefId?: { __typename?: 'Player', brefId: string, id: number, name?: string | null } | null };

export type GetAllPlayersQueryVariables = Exact<{
  after?: InputMaybe<Scalars['Cursor']['input']>;
}>;


export type GetAllPlayersQuery = { __typename?: 'Query', players?: { __typename?: 'PlayersConnection', nodes: Array<{ __typename?: 'Player', brefId: string, id: number, name?: string | null } | null>, pageInfo: { __typename?: 'PageInfo', hasNextPage: boolean, endCursor?: string | null } } | null };

/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  BigFloat: { input: any; output: any; }
  Cursor: { input: string; output: string; }
  Date: { input: any; output: any; }
  Datetime: { input: string; output: string; }
};

/** All input for the `bulkUpdateStats` mutation. */
export type BulkUpdateStatsInput = {
  battingStats: Array<InputMaybe<UpdateBattingStatsInputRecordInput>>;
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  fieldingStats: Array<InputMaybe<UpdateFieldingStatsInputRecordInput>>;
  pitchingStats: Array<InputMaybe<UpdatePitchingStatsInputRecordInput>>;
};

/** The output of our `bulkUpdateStats` mutation. */
export type BulkUpdateStatsPayload = {
  __typename?: 'BulkUpdateStatsPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  players?: Maybe<Array<Maybe<Player>>>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};

/** All input for the create `Draft` mutation. */
export type CreateDraftInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `Draft` to be created by this mutation. */
  draft: DraftInput;
};

/** The output of our create `Draft` mutation. */
export type CreateDraftPayload = {
  __typename?: 'CreateDraftPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `Draft` that was created by this mutation. */
  draft?: Maybe<Draft>;
  /** An edge for our `Draft`. May be used by Relay 1. */
  draftEdge?: Maybe<DraftsEdge>;
  /** Reads a single `League` that is related to this `Draft`. */
  league?: Maybe<League>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our create `Draft` mutation. */
export type CreateDraftPayloadDraftEdgeArgs = {
  orderBy?: InputMaybe<Array<DraftsOrderBy>>;
};

/** All input for the create `DraftTeam` mutation. */
export type CreateDraftTeamInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `DraftTeam` to be created by this mutation. */
  draftTeam: DraftTeamInput;
};

/** The output of our create `DraftTeam` mutation. */
export type CreateDraftTeamPayload = {
  __typename?: 'CreateDraftTeamPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Draft` that is related to this `DraftTeam`. */
  draft?: Maybe<Draft>;
  /** The `DraftTeam` that was created by this mutation. */
  draftTeam?: Maybe<DraftTeam>;
  /** An edge for our `DraftTeam`. May be used by Relay 1. */
  draftTeamEdge?: Maybe<DraftTeamsEdge>;
  /** Reads a single `League` that is related to this `DraftTeam`. */
  league?: Maybe<League>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `Team` that is related to this `DraftTeam`. */
  teamLeague?: Maybe<Team>;
};


/** The output of our create `DraftTeam` mutation. */
export type CreateDraftTeamPayloadDraftTeamEdgeArgs = {
  orderBy?: InputMaybe<Array<DraftTeamsOrderBy>>;
};

/** All input for the `createLeagueAndTeams` mutation. */
export type CreateLeagueAndTeamsInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  draftDate: Scalars['Date']['input'];
  draftType: DraftType;
  leagueName: Scalars['String']['input'];
  numberOfTeams: Scalars['Int']['input'];
  userId: Scalars['Int']['input'];
};

/** The output of our `createLeagueAndTeams` mutation. */
export type CreateLeagueAndTeamsPayload = {
  __typename?: 'CreateLeagueAndTeamsPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  league?: Maybe<League>;
  /** An edge for our `League`. May be used by Relay 1. */
  leagueEdge?: Maybe<LeaguesEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our `createLeagueAndTeams` mutation. */
export type CreateLeagueAndTeamsPayloadLeagueEdgeArgs = {
  orderBy?: InputMaybe<Array<LeaguesOrderBy>>;
};

/** All input for the create `League` mutation. */
export type CreateLeagueInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `League` to be created by this mutation. */
  league: LeagueInput;
};

/** All input for the create `LeagueMember` mutation. */
export type CreateLeagueMemberInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `LeagueMember` to be created by this mutation. */
  leagueMember: LeagueMemberInput;
};

/** The output of our create `LeagueMember` mutation. */
export type CreateLeagueMemberPayload = {
  __typename?: 'CreateLeagueMemberPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `LeagueMember`. */
  league?: Maybe<League>;
  /** The `LeagueMember` that was created by this mutation. */
  leagueMember?: Maybe<LeagueMember>;
  /** An edge for our `LeagueMember`. May be used by Relay 1. */
  leagueMemberEdge?: Maybe<LeagueMembersEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `User` that is related to this `LeagueMember`. */
  user?: Maybe<User>;
};


/** The output of our create `LeagueMember` mutation. */
export type CreateLeagueMemberPayloadLeagueMemberEdgeArgs = {
  orderBy?: InputMaybe<Array<LeagueMembersOrderBy>>;
};

/** All input for the create `LeagueMessage` mutation. */
export type CreateLeagueMessageInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `LeagueMessage` to be created by this mutation. */
  leagueMessage: LeagueMessageInput;
};

/** The output of our create `LeagueMessage` mutation. */
export type CreateLeagueMessagePayload = {
  __typename?: 'CreateLeagueMessagePayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `LeagueMessage`. */
  league?: Maybe<League>;
  /** The `LeagueMessage` that was created by this mutation. */
  leagueMessage?: Maybe<LeagueMessage>;
  /** An edge for our `LeagueMessage`. May be used by Relay 1. */
  leagueMessageEdge?: Maybe<LeagueMessagesEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `User` that is related to this `LeagueMessage`. */
  user?: Maybe<User>;
  /** Reads a single `LeagueMember` that is related to this `LeagueMessage`. */
  userLeague?: Maybe<LeagueMember>;
};


/** The output of our create `LeagueMessage` mutation. */
export type CreateLeagueMessagePayloadLeagueMessageEdgeArgs = {
  orderBy?: InputMaybe<Array<LeagueMessagesOrderBy>>;
};

/** The output of our create `League` mutation. */
export type CreateLeaguePayload = {
  __typename?: 'CreateLeaguePayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `League` that was created by this mutation. */
  league?: Maybe<League>;
  /** An edge for our `League`. May be used by Relay 1. */
  leagueEdge?: Maybe<LeaguesEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our create `League` mutation. */
export type CreateLeaguePayloadLeagueEdgeArgs = {
  orderBy?: InputMaybe<Array<LeaguesOrderBy>>;
};

/** All input for the create `Player` mutation. */
export type CreatePlayerInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `Player` to be created by this mutation. */
  player: PlayerInput;
};

/** An input for mutations affecting `CreatePlayerInputRecord` */
export type CreatePlayerInputRecordInput = {
  brefId?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};

/** The output of our create `Player` mutation. */
export type CreatePlayerPayload = {
  __typename?: 'CreatePlayerPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `Player` that was created by this mutation. */
  player?: Maybe<Player>;
  /** An edge for our `Player`. May be used by Relay 1. */
  playerEdge?: Maybe<PlayersEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our create `Player` mutation. */
export type CreatePlayerPayloadPlayerEdgeArgs = {
  orderBy?: InputMaybe<Array<PlayersOrderBy>>;
};

/** All input for the `createPlayers` mutation. */
export type CreatePlayersInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  playersToCreate: Array<InputMaybe<CreatePlayerInputRecordInput>>;
};

/** The output of our `createPlayers` mutation. */
export type CreatePlayersPayload = {
  __typename?: 'CreatePlayersPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  players?: Maybe<Array<Maybe<Player>>>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};

/** All input for the create `SeasonBatting` mutation. */
export type CreateSeasonBattingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `SeasonBatting` to be created by this mutation. */
  seasonBatting: SeasonBattingInput;
};

/** The output of our create `SeasonBatting` mutation. */
export type CreateSeasonBattingPayload = {
  __typename?: 'CreateSeasonBattingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Player` that is related to this `SeasonBatting`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `SeasonBatting` that was created by this mutation. */
  seasonBatting?: Maybe<SeasonBatting>;
  /** An edge for our `SeasonBatting`. May be used by Relay 1. */
  seasonBattingEdge?: Maybe<SeasonBattingsEdge>;
};


/** The output of our create `SeasonBatting` mutation. */
export type CreateSeasonBattingPayloadSeasonBattingEdgeArgs = {
  orderBy?: InputMaybe<Array<SeasonBattingsOrderBy>>;
};

/** All input for the create `SeasonFielding` mutation. */
export type CreateSeasonFieldingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `SeasonFielding` to be created by this mutation. */
  seasonFielding: SeasonFieldingInput;
};

/** The output of our create `SeasonFielding` mutation. */
export type CreateSeasonFieldingPayload = {
  __typename?: 'CreateSeasonFieldingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Player` that is related to this `SeasonFielding`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `SeasonFielding` that was created by this mutation. */
  seasonFielding?: Maybe<SeasonFielding>;
  /** An edge for our `SeasonFielding`. May be used by Relay 1. */
  seasonFieldingEdge?: Maybe<SeasonFieldingsEdge>;
};


/** The output of our create `SeasonFielding` mutation. */
export type CreateSeasonFieldingPayloadSeasonFieldingEdgeArgs = {
  orderBy?: InputMaybe<Array<SeasonFieldingsOrderBy>>;
};

/** All input for the create `SeasonPitching` mutation. */
export type CreateSeasonPitchingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `SeasonPitching` to be created by this mutation. */
  seasonPitching: SeasonPitchingInput;
};

/** The output of our create `SeasonPitching` mutation. */
export type CreateSeasonPitchingPayload = {
  __typename?: 'CreateSeasonPitchingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `SeasonPitching` that was created by this mutation. */
  seasonPitching?: Maybe<SeasonPitching>;
  /** An edge for our `SeasonPitching`. May be used by Relay 1. */
  seasonPitchingEdge?: Maybe<SeasonPitchingsEdge>;
};


/** The output of our create `SeasonPitching` mutation. */
export type CreateSeasonPitchingPayloadSeasonPitchingEdgeArgs = {
  orderBy?: InputMaybe<Array<SeasonPitchingsOrderBy>>;
};

/** All input for the create `Team` mutation. */
export type CreateTeamInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `Team` to be created by this mutation. */
  team: TeamInput;
};

/** The output of our create `Team` mutation. */
export type CreateTeamPayload = {
  __typename?: 'CreateTeamPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `Team`. */
  league?: Maybe<League>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `Team` that was created by this mutation. */
  team?: Maybe<Team>;
  /** An edge for our `Team`. May be used by Relay 1. */
  teamEdge?: Maybe<TeamsEdge>;
};


/** The output of our create `Team` mutation. */
export type CreateTeamPayloadTeamEdgeArgs = {
  orderBy?: InputMaybe<Array<TeamsOrderBy>>;
};

/** All input for the create `User` mutation. */
export type CreateUserInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `User` to be created by this mutation. */
  user: UserInput;
};

/** The output of our create `User` mutation. */
export type CreateUserPayload = {
  __typename?: 'CreateUserPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `User` that was created by this mutation. */
  user?: Maybe<User>;
  /** An edge for our `User`. May be used by Relay 1. */
  userEdge?: Maybe<UsersEdge>;
};


/** The output of our create `User` mutation. */
export type CreateUserPayloadUserEdgeArgs = {
  orderBy?: InputMaybe<Array<UsersOrderBy>>;
};

/** All input for the `deleteDraftByNodeId` mutation. */
export type DeleteDraftByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `Draft` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteDraft` mutation. */
export type DeleteDraftInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
};

/** The output of our delete `Draft` mutation. */
export type DeleteDraftPayload = {
  __typename?: 'DeleteDraftPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedDraftNodeId?: Maybe<Scalars['ID']['output']>;
  /** The `Draft` that was deleted by this mutation. */
  draft?: Maybe<Draft>;
  /** An edge for our `Draft`. May be used by Relay 1. */
  draftEdge?: Maybe<DraftsEdge>;
  /** Reads a single `League` that is related to this `Draft`. */
  league?: Maybe<League>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our delete `Draft` mutation. */
export type DeleteDraftPayloadDraftEdgeArgs = {
  orderBy?: InputMaybe<Array<DraftsOrderBy>>;
};

/** All input for the `deleteDraftTeamByDraftIdAndDraftOrder` mutation. */
export type DeleteDraftTeamByDraftIdAndDraftOrderInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  draftId: Scalars['Int']['input'];
  draftOrder: Scalars['Int']['input'];
};

/** All input for the `deleteDraftTeamByNodeId` mutation. */
export type DeleteDraftTeamByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `DraftTeam` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteDraftTeam` mutation. */
export type DeleteDraftTeamInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  draftId: Scalars['Int']['input'];
  leagueId: Scalars['Int']['input'];
  teamId: Scalars['Int']['input'];
};

/** The output of our delete `DraftTeam` mutation. */
export type DeleteDraftTeamPayload = {
  __typename?: 'DeleteDraftTeamPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedDraftTeamNodeId?: Maybe<Scalars['ID']['output']>;
  /** Reads a single `Draft` that is related to this `DraftTeam`. */
  draft?: Maybe<Draft>;
  /** The `DraftTeam` that was deleted by this mutation. */
  draftTeam?: Maybe<DraftTeam>;
  /** An edge for our `DraftTeam`. May be used by Relay 1. */
  draftTeamEdge?: Maybe<DraftTeamsEdge>;
  /** Reads a single `League` that is related to this `DraftTeam`. */
  league?: Maybe<League>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `Team` that is related to this `DraftTeam`. */
  teamLeague?: Maybe<Team>;
};


/** The output of our delete `DraftTeam` mutation. */
export type DeleteDraftTeamPayloadDraftTeamEdgeArgs = {
  orderBy?: InputMaybe<Array<DraftTeamsOrderBy>>;
};

/** All input for the `deleteLeagueByNodeId` mutation. */
export type DeleteLeagueByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `League` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteLeague` mutation. */
export type DeleteLeagueInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
};

/** All input for the `deleteLeagueMemberByNodeId` mutation. */
export type DeleteLeagueMemberByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `LeagueMember` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteLeagueMember` mutation. */
export type DeleteLeagueMemberInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  leagueId: Scalars['Int']['input'];
  userId: Scalars['Int']['input'];
};

/** The output of our delete `LeagueMember` mutation. */
export type DeleteLeagueMemberPayload = {
  __typename?: 'DeleteLeagueMemberPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedLeagueMemberNodeId?: Maybe<Scalars['ID']['output']>;
  /** Reads a single `League` that is related to this `LeagueMember`. */
  league?: Maybe<League>;
  /** The `LeagueMember` that was deleted by this mutation. */
  leagueMember?: Maybe<LeagueMember>;
  /** An edge for our `LeagueMember`. May be used by Relay 1. */
  leagueMemberEdge?: Maybe<LeagueMembersEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `User` that is related to this `LeagueMember`. */
  user?: Maybe<User>;
};


/** The output of our delete `LeagueMember` mutation. */
export type DeleteLeagueMemberPayloadLeagueMemberEdgeArgs = {
  orderBy?: InputMaybe<Array<LeagueMembersOrderBy>>;
};

/** All input for the `deleteLeagueMessageByNodeId` mutation. */
export type DeleteLeagueMessageByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `LeagueMessage` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteLeagueMessage` mutation. */
export type DeleteLeagueMessageInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
};

/** The output of our delete `LeagueMessage` mutation. */
export type DeleteLeagueMessagePayload = {
  __typename?: 'DeleteLeagueMessagePayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedLeagueMessageNodeId?: Maybe<Scalars['ID']['output']>;
  /** Reads a single `League` that is related to this `LeagueMessage`. */
  league?: Maybe<League>;
  /** The `LeagueMessage` that was deleted by this mutation. */
  leagueMessage?: Maybe<LeagueMessage>;
  /** An edge for our `LeagueMessage`. May be used by Relay 1. */
  leagueMessageEdge?: Maybe<LeagueMessagesEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `User` that is related to this `LeagueMessage`. */
  user?: Maybe<User>;
  /** Reads a single `LeagueMember` that is related to this `LeagueMessage`. */
  userLeague?: Maybe<LeagueMember>;
};


/** The output of our delete `LeagueMessage` mutation. */
export type DeleteLeagueMessagePayloadLeagueMessageEdgeArgs = {
  orderBy?: InputMaybe<Array<LeagueMessagesOrderBy>>;
};

/** The output of our delete `League` mutation. */
export type DeleteLeaguePayload = {
  __typename?: 'DeleteLeaguePayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedLeagueNodeId?: Maybe<Scalars['ID']['output']>;
  /** The `League` that was deleted by this mutation. */
  league?: Maybe<League>;
  /** An edge for our `League`. May be used by Relay 1. */
  leagueEdge?: Maybe<LeaguesEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our delete `League` mutation. */
export type DeleteLeaguePayloadLeagueEdgeArgs = {
  orderBy?: InputMaybe<Array<LeaguesOrderBy>>;
};

/** All input for the `deletePlayerByBrefId` mutation. */
export type DeletePlayerByBrefIdInput = {
  brefId: Scalars['String']['input'];
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
};

/** All input for the `deletePlayerByNodeId` mutation. */
export type DeletePlayerByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `Player` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deletePlayer` mutation. */
export type DeletePlayerInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
};

/** The output of our delete `Player` mutation. */
export type DeletePlayerPayload = {
  __typename?: 'DeletePlayerPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedPlayerNodeId?: Maybe<Scalars['ID']['output']>;
  /** The `Player` that was deleted by this mutation. */
  player?: Maybe<Player>;
  /** An edge for our `Player`. May be used by Relay 1. */
  playerEdge?: Maybe<PlayersEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our delete `Player` mutation. */
export type DeletePlayerPayloadPlayerEdgeArgs = {
  orderBy?: InputMaybe<Array<PlayersOrderBy>>;
};

/** All input for the `deleteSeasonBattingByNodeId` mutation. */
export type DeleteSeasonBattingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `SeasonBatting` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteSeasonBatting` mutation. */
export type DeleteSeasonBattingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  lgId: Scalars['String']['input'];
  playerId: Scalars['Int']['input'];
  season: Scalars['String']['input'];
  team: Scalars['String']['input'];
};

/** The output of our delete `SeasonBatting` mutation. */
export type DeleteSeasonBattingPayload = {
  __typename?: 'DeleteSeasonBattingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedSeasonBattingNodeId?: Maybe<Scalars['ID']['output']>;
  /** Reads a single `Player` that is related to this `SeasonBatting`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `SeasonBatting` that was deleted by this mutation. */
  seasonBatting?: Maybe<SeasonBatting>;
  /** An edge for our `SeasonBatting`. May be used by Relay 1. */
  seasonBattingEdge?: Maybe<SeasonBattingsEdge>;
};


/** The output of our delete `SeasonBatting` mutation. */
export type DeleteSeasonBattingPayloadSeasonBattingEdgeArgs = {
  orderBy?: InputMaybe<Array<SeasonBattingsOrderBy>>;
};

/** All input for the `deleteSeasonFieldingByNodeId` mutation. */
export type DeleteSeasonFieldingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `SeasonFielding` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteSeasonFielding` mutation. */
export type DeleteSeasonFieldingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  lgId: Scalars['String']['input'];
  playerId: Scalars['Int']['input'];
  pos: Scalars['String']['input'];
  season: Scalars['String']['input'];
  team: Scalars['String']['input'];
};

/** The output of our delete `SeasonFielding` mutation. */
export type DeleteSeasonFieldingPayload = {
  __typename?: 'DeleteSeasonFieldingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedSeasonFieldingNodeId?: Maybe<Scalars['ID']['output']>;
  /** Reads a single `Player` that is related to this `SeasonFielding`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `SeasonFielding` that was deleted by this mutation. */
  seasonFielding?: Maybe<SeasonFielding>;
  /** An edge for our `SeasonFielding`. May be used by Relay 1. */
  seasonFieldingEdge?: Maybe<SeasonFieldingsEdge>;
};


/** The output of our delete `SeasonFielding` mutation. */
export type DeleteSeasonFieldingPayloadSeasonFieldingEdgeArgs = {
  orderBy?: InputMaybe<Array<SeasonFieldingsOrderBy>>;
};

/** All input for the `deleteSeasonPitchingByNodeId` mutation. */
export type DeleteSeasonPitchingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `SeasonPitching` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteSeasonPitching` mutation. */
export type DeleteSeasonPitchingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  lgId: Scalars['String']['input'];
  playerId: Scalars['Int']['input'];
  season: Scalars['String']['input'];
  team: Scalars['String']['input'];
};

/** The output of our delete `SeasonPitching` mutation. */
export type DeleteSeasonPitchingPayload = {
  __typename?: 'DeleteSeasonPitchingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedSeasonPitchingNodeId?: Maybe<Scalars['ID']['output']>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `SeasonPitching` that was deleted by this mutation. */
  seasonPitching?: Maybe<SeasonPitching>;
  /** An edge for our `SeasonPitching`. May be used by Relay 1. */
  seasonPitchingEdge?: Maybe<SeasonPitchingsEdge>;
};


/** The output of our delete `SeasonPitching` mutation. */
export type DeleteSeasonPitchingPayloadSeasonPitchingEdgeArgs = {
  orderBy?: InputMaybe<Array<SeasonPitchingsOrderBy>>;
};

/** All input for the `deleteTeamByIdAndLeagueId` mutation. */
export type DeleteTeamByIdAndLeagueIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  leagueId: Scalars['Int']['input'];
};

/** All input for the `deleteTeamByNodeId` mutation. */
export type DeleteTeamByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `Team` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteTeam` mutation. */
export type DeleteTeamInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
};

/** The output of our delete `Team` mutation. */
export type DeleteTeamPayload = {
  __typename?: 'DeleteTeamPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedTeamNodeId?: Maybe<Scalars['ID']['output']>;
  /** Reads a single `League` that is related to this `Team`. */
  league?: Maybe<League>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `Team` that was deleted by this mutation. */
  team?: Maybe<Team>;
  /** An edge for our `Team`. May be used by Relay 1. */
  teamEdge?: Maybe<TeamsEdge>;
};


/** The output of our delete `Team` mutation. */
export type DeleteTeamPayloadTeamEdgeArgs = {
  orderBy?: InputMaybe<Array<TeamsOrderBy>>;
};

/** All input for the `deleteUserByEmail` mutation. */
export type DeleteUserByEmailInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  email: Scalars['String']['input'];
};

/** All input for the `deleteUserByNodeId` mutation. */
export type DeleteUserByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `User` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteUserByUsername` mutation. */
export type DeleteUserByUsernameInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  username: Scalars['String']['input'];
};

/** All input for the `deleteUser` mutation. */
export type DeleteUserInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
};

/** The output of our delete `User` mutation. */
export type DeleteUserPayload = {
  __typename?: 'DeleteUserPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedUserNodeId?: Maybe<Scalars['ID']['output']>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `User` that was deleted by this mutation. */
  user?: Maybe<User>;
  /** An edge for our `User`. May be used by Relay 1. */
  userEdge?: Maybe<UsersEdge>;
};


/** The output of our delete `User` mutation. */
export type DeleteUserPayloadUserEdgeArgs = {
  orderBy?: InputMaybe<Array<UsersOrderBy>>;
};

export type Draft = Node & {
  __typename?: 'Draft';
  date?: Maybe<Scalars['Date']['output']>;
  draftOrder: DraftOrder;
  /** Reads and enables pagination through a set of `DraftTeam`. */
  draftTeams: DraftTeamsConnection;
  draftType: DraftType;
  id: Scalars['Int']['output'];
  /** Reads a single `League` that is related to this `Draft`. */
  league?: Maybe<League>;
  leagueId: Scalars['Int']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
};


export type DraftDraftTeamsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<DraftTeamCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<DraftTeamsOrderBy>>;
};

/** A condition to be used against `Draft` object types. All fields are tested for equality and combined with a logical ‘and.’ */
export type DraftCondition = {
  /** Checks for equality with the object’s `date` field. */
  date?: InputMaybe<Scalars['Date']['input']>;
  /** Checks for equality with the object’s `draftOrder` field. */
  draftOrder?: InputMaybe<DraftOrder>;
  /** Checks for equality with the object’s `draftType` field. */
  draftType?: InputMaybe<DraftType>;
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `leagueId` field. */
  leagueId?: InputMaybe<Scalars['Int']['input']>;
};

/** An input for mutations affecting `Draft` */
export type DraftInput = {
  date?: InputMaybe<Scalars['Date']['input']>;
  draftOrder?: InputMaybe<DraftOrder>;
  draftType: DraftType;
  id?: InputMaybe<Scalars['Int']['input']>;
  leagueId: Scalars['Int']['input'];
};

export enum DraftOrder {
  Normal = 'NORMAL',
  Snake = 'SNAKE'
}

/** Represents an update to a `Draft`. Fields that are set will be updated. */
export type DraftPatch = {
  date?: InputMaybe<Scalars['Date']['input']>;
  draftOrder?: InputMaybe<DraftOrder>;
  draftType?: InputMaybe<DraftType>;
  id?: InputMaybe<Scalars['Int']['input']>;
  leagueId?: InputMaybe<Scalars['Int']['input']>;
};

export type DraftTeam = Node & {
  __typename?: 'DraftTeam';
  /** Reads a single `Draft` that is related to this `DraftTeam`. */
  draft?: Maybe<Draft>;
  draftId: Scalars['Int']['output'];
  draftOrder: Scalars['Int']['output'];
  /** Reads a single `League` that is related to this `DraftTeam`. */
  league?: Maybe<League>;
  leagueId: Scalars['Int']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  teamId: Scalars['Int']['output'];
  /** Reads a single `Team` that is related to this `DraftTeam`. */
  teamLeague?: Maybe<Team>;
};

/**
 * A condition to be used against `DraftTeam` object types. All fields are tested
 * for equality and combined with a logical ‘and.’
 */
export type DraftTeamCondition = {
  /** Checks for equality with the object’s `draftId` field. */
  draftId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `draftOrder` field. */
  draftOrder?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `leagueId` field. */
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `teamId` field. */
  teamId?: InputMaybe<Scalars['Int']['input']>;
};

/** An input for mutations affecting `DraftTeam` */
export type DraftTeamInput = {
  draftId: Scalars['Int']['input'];
  draftOrder: Scalars['Int']['input'];
  leagueId: Scalars['Int']['input'];
  teamId: Scalars['Int']['input'];
};

/** Represents an update to a `DraftTeam`. Fields that are set will be updated. */
export type DraftTeamPatch = {
  draftId?: InputMaybe<Scalars['Int']['input']>;
  draftOrder?: InputMaybe<Scalars['Int']['input']>;
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  teamId?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `DraftTeam` values. */
export type DraftTeamsConnection = {
  __typename?: 'DraftTeamsConnection';
  /** A list of edges which contains the `DraftTeam` and cursor to aid in pagination. */
  edges: Array<DraftTeamsEdge>;
  /** A list of `DraftTeam` objects. */
  nodes: Array<Maybe<DraftTeam>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `DraftTeam` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `DraftTeam` edge in the connection. */
export type DraftTeamsEdge = {
  __typename?: 'DraftTeamsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `DraftTeam` at the end of the edge. */
  node?: Maybe<DraftTeam>;
};

/** Methods to use when ordering `DraftTeam`. */
export enum DraftTeamsOrderBy {
  DraftIdAsc = 'DRAFT_ID_ASC',
  DraftIdDesc = 'DRAFT_ID_DESC',
  DraftOrderAsc = 'DRAFT_ORDER_ASC',
  DraftOrderDesc = 'DRAFT_ORDER_DESC',
  LeagueIdAsc = 'LEAGUE_ID_ASC',
  LeagueIdDesc = 'LEAGUE_ID_DESC',
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  TeamIdAsc = 'TEAM_ID_ASC',
  TeamIdDesc = 'TEAM_ID_DESC'
}

export enum DraftType {
  Blind = 'BLIND',
  Legacy = 'LEGACY',
  Normal = 'NORMAL'
}

/** A connection to a list of `Draft` values. */
export type DraftsConnection = {
  __typename?: 'DraftsConnection';
  /** A list of edges which contains the `Draft` and cursor to aid in pagination. */
  edges: Array<DraftsEdge>;
  /** A list of `Draft` objects. */
  nodes: Array<Maybe<Draft>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `Draft` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `Draft` edge in the connection. */
export type DraftsEdge = {
  __typename?: 'DraftsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `Draft` at the end of the edge. */
  node?: Maybe<Draft>;
};

/** Methods to use when ordering `Draft`. */
export enum DraftsOrderBy {
  DateAsc = 'DATE_ASC',
  DateDesc = 'DATE_DESC',
  DraftOrderAsc = 'DRAFT_ORDER_ASC',
  DraftOrderDesc = 'DRAFT_ORDER_DESC',
  DraftTypeAsc = 'DRAFT_TYPE_ASC',
  DraftTypeDesc = 'DRAFT_TYPE_DESC',
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  LeagueIdAsc = 'LEAGUE_ID_ASC',
  LeagueIdDesc = 'LEAGUE_ID_DESC',
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC'
}

export type League = Node & {
  __typename?: 'League';
  /** Reads and enables pagination through a set of `DraftTeam`. */
  draftTeams: DraftTeamsConnection;
  /** Reads and enables pagination through a set of `Draft`. */
  drafts: DraftsConnection;
  id: Scalars['Int']['output'];
  /** Reads and enables pagination through a set of `LeagueMember`. */
  leagueMembers: LeagueMembersConnection;
  /** Reads and enables pagination through a set of `LeagueMessage`. */
  leagueMessages: LeagueMessagesConnection;
  name: Scalars['String']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  owner: Scalars['Int']['output'];
  /** Reads and enables pagination through a set of `Team`. */
  teams: TeamsConnection;
};


export type LeagueDraftTeamsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<DraftTeamCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<DraftTeamsOrderBy>>;
};


export type LeagueDraftsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<DraftCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<DraftsOrderBy>>;
};


export type LeagueLeagueMembersArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<LeagueMemberCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LeagueMembersOrderBy>>;
};


export type LeagueLeagueMessagesArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<LeagueMessageCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LeagueMessagesOrderBy>>;
};


export type LeagueTeamsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<TeamCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TeamsOrderBy>>;
};

/** A condition to be used against `League` object types. All fields are tested for equality and combined with a logical ‘and.’ */
export type LeagueCondition = {
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `name` field. */
  name?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `owner` field. */
  owner?: InputMaybe<Scalars['Int']['input']>;
};

/** An input for mutations affecting `League` */
export type LeagueInput = {
  id?: InputMaybe<Scalars['Int']['input']>;
  name: Scalars['String']['input'];
  owner: Scalars['Int']['input'];
};

export type LeagueMember = Node & {
  __typename?: 'LeagueMember';
  /** Reads a single `League` that is related to this `LeagueMember`. */
  league?: Maybe<League>;
  leagueId: Scalars['Int']['output'];
  /** Reads and enables pagination through a set of `LeagueMessage`. */
  leagueMessagesByUserIdAndLeagueId: LeagueMessagesConnection;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  permissionLevel: LeaguePermissionLevel;
  teamId?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `User` that is related to this `LeagueMember`. */
  user?: Maybe<User>;
  userId: Scalars['Int']['output'];
};


export type LeagueMemberLeagueMessagesByUserIdAndLeagueIdArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<LeagueMessageCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LeagueMessagesOrderBy>>;
};

/**
 * A condition to be used against `LeagueMember` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type LeagueMemberCondition = {
  /** Checks for equality with the object’s `leagueId` field. */
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `permissionLevel` field. */
  permissionLevel?: InputMaybe<LeaguePermissionLevel>;
  /** Checks for equality with the object’s `teamId` field. */
  teamId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `userId` field. */
  userId?: InputMaybe<Scalars['Int']['input']>;
};

/** An input for mutations affecting `LeagueMember` */
export type LeagueMemberInput = {
  leagueId: Scalars['Int']['input'];
  permissionLevel: LeaguePermissionLevel;
  teamId?: InputMaybe<Scalars['Int']['input']>;
  userId: Scalars['Int']['input'];
};

/** Represents an update to a `LeagueMember`. Fields that are set will be updated. */
export type LeagueMemberPatch = {
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  permissionLevel?: InputMaybe<LeaguePermissionLevel>;
  teamId?: InputMaybe<Scalars['Int']['input']>;
  userId?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `LeagueMember` values. */
export type LeagueMembersConnection = {
  __typename?: 'LeagueMembersConnection';
  /** A list of edges which contains the `LeagueMember` and cursor to aid in pagination. */
  edges: Array<LeagueMembersEdge>;
  /** A list of `LeagueMember` objects. */
  nodes: Array<Maybe<LeagueMember>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `LeagueMember` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `LeagueMember` edge in the connection. */
export type LeagueMembersEdge = {
  __typename?: 'LeagueMembersEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `LeagueMember` at the end of the edge. */
  node?: Maybe<LeagueMember>;
};

/** Methods to use when ordering `LeagueMember`. */
export enum LeagueMembersOrderBy {
  LeagueIdAsc = 'LEAGUE_ID_ASC',
  LeagueIdDesc = 'LEAGUE_ID_DESC',
  Natural = 'NATURAL',
  PermissionLevelAsc = 'PERMISSION_LEVEL_ASC',
  PermissionLevelDesc = 'PERMISSION_LEVEL_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  TeamIdAsc = 'TEAM_ID_ASC',
  TeamIdDesc = 'TEAM_ID_DESC',
  UserIdAsc = 'USER_ID_ASC',
  UserIdDesc = 'USER_ID_DESC'
}

export type LeagueMessage = Node & {
  __typename?: 'LeagueMessage';
  id: Scalars['Int']['output'];
  /** Reads a single `League` that is related to this `LeagueMessage`. */
  league?: Maybe<League>;
  leagueId: Scalars['Int']['output'];
  messageText: Scalars['String']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  timestamp?: Maybe<Scalars['Datetime']['output']>;
  /** Reads a single `User` that is related to this `LeagueMessage`. */
  user?: Maybe<User>;
  userId: Scalars['Int']['output'];
  /** Reads a single `LeagueMember` that is related to this `LeagueMessage`. */
  userLeague?: Maybe<LeagueMember>;
};

/**
 * A condition to be used against `LeagueMessage` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type LeagueMessageCondition = {
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `leagueId` field. */
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `messageText` field. */
  messageText?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `timestamp` field. */
  timestamp?: InputMaybe<Scalars['Datetime']['input']>;
  /** Checks for equality with the object’s `userId` field. */
  userId?: InputMaybe<Scalars['Int']['input']>;
};

/** An input for mutations affecting `LeagueMessage` */
export type LeagueMessageInput = {
  id?: InputMaybe<Scalars['Int']['input']>;
  leagueId: Scalars['Int']['input'];
  messageText: Scalars['String']['input'];
  timestamp?: InputMaybe<Scalars['Datetime']['input']>;
  userId: Scalars['Int']['input'];
};

/** Represents an update to a `LeagueMessage`. Fields that are set will be updated. */
export type LeagueMessagePatch = {
  id?: InputMaybe<Scalars['Int']['input']>;
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  messageText?: InputMaybe<Scalars['String']['input']>;
  timestamp?: InputMaybe<Scalars['Datetime']['input']>;
  userId?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `LeagueMessage` values. */
export type LeagueMessagesConnection = {
  __typename?: 'LeagueMessagesConnection';
  /** A list of edges which contains the `LeagueMessage` and cursor to aid in pagination. */
  edges: Array<LeagueMessagesEdge>;
  /** A list of `LeagueMessage` objects. */
  nodes: Array<Maybe<LeagueMessage>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `LeagueMessage` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `LeagueMessage` edge in the connection. */
export type LeagueMessagesEdge = {
  __typename?: 'LeagueMessagesEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `LeagueMessage` at the end of the edge. */
  node?: Maybe<LeagueMessage>;
};

/** Methods to use when ordering `LeagueMessage`. */
export enum LeagueMessagesOrderBy {
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  LeagueIdAsc = 'LEAGUE_ID_ASC',
  LeagueIdDesc = 'LEAGUE_ID_DESC',
  MessageTextAsc = 'MESSAGE_TEXT_ASC',
  MessageTextDesc = 'MESSAGE_TEXT_DESC',
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  TimestampAsc = 'TIMESTAMP_ASC',
  TimestampDesc = 'TIMESTAMP_DESC',
  UserIdAsc = 'USER_ID_ASC',
  UserIdDesc = 'USER_ID_DESC'
}

/** Represents an update to a `League`. Fields that are set will be updated. */
export type LeaguePatch = {
  id?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  owner?: InputMaybe<Scalars['Int']['input']>;
};

export enum LeaguePermissionLevel {
  Commissioner = 'COMMISSIONER',
  Owner = 'OWNER'
}

/** A connection to a list of `League` values. */
export type LeaguesConnection = {
  __typename?: 'LeaguesConnection';
  /** A list of edges which contains the `League` and cursor to aid in pagination. */
  edges: Array<LeaguesEdge>;
  /** A list of `League` objects. */
  nodes: Array<Maybe<League>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `League` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `League` edge in the connection. */
export type LeaguesEdge = {
  __typename?: 'LeaguesEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `League` at the end of the edge. */
  node?: Maybe<League>;
};

/** Methods to use when ordering `League`. */
export enum LeaguesOrderBy {
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  NameAsc = 'NAME_ASC',
  NameDesc = 'NAME_DESC',
  Natural = 'NATURAL',
  OwnerAsc = 'OWNER_ASC',
  OwnerDesc = 'OWNER_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC'
}

/** The root mutation type which contains root level fields which mutate data. */
export type Mutation = {
  __typename?: 'Mutation';
  bulkUpdateStats?: Maybe<BulkUpdateStatsPayload>;
  /** Creates a single `Draft`. */
  createDraft?: Maybe<CreateDraftPayload>;
  /** Creates a single `DraftTeam`. */
  createDraftTeam?: Maybe<CreateDraftTeamPayload>;
  /** Creates a single `League`. */
  createLeague?: Maybe<CreateLeaguePayload>;
  createLeagueAndTeams?: Maybe<CreateLeagueAndTeamsPayload>;
  /** Creates a single `LeagueMember`. */
  createLeagueMember?: Maybe<CreateLeagueMemberPayload>;
  /** Creates a single `LeagueMessage`. */
  createLeagueMessage?: Maybe<CreateLeagueMessagePayload>;
  /** Creates a single `Player`. */
  createPlayer?: Maybe<CreatePlayerPayload>;
  createPlayers?: Maybe<CreatePlayersPayload>;
  /** Creates a single `SeasonBatting`. */
  createSeasonBatting?: Maybe<CreateSeasonBattingPayload>;
  /** Creates a single `SeasonFielding`. */
  createSeasonFielding?: Maybe<CreateSeasonFieldingPayload>;
  /** Creates a single `SeasonPitching`. */
  createSeasonPitching?: Maybe<CreateSeasonPitchingPayload>;
  /** Creates a single `Team`. */
  createTeam?: Maybe<CreateTeamPayload>;
  /** Creates a single `User`. */
  createUser?: Maybe<CreateUserPayload>;
  /** Deletes a single `Draft` using a unique key. */
  deleteDraft?: Maybe<DeleteDraftPayload>;
  /** Deletes a single `Draft` using its globally unique id. */
  deleteDraftByNodeId?: Maybe<DeleteDraftPayload>;
  /** Deletes a single `DraftTeam` using a unique key. */
  deleteDraftTeam?: Maybe<DeleteDraftTeamPayload>;
  /** Deletes a single `DraftTeam` using a unique key. */
  deleteDraftTeamByDraftIdAndDraftOrder?: Maybe<DeleteDraftTeamPayload>;
  /** Deletes a single `DraftTeam` using its globally unique id. */
  deleteDraftTeamByNodeId?: Maybe<DeleteDraftTeamPayload>;
  /** Deletes a single `League` using a unique key. */
  deleteLeague?: Maybe<DeleteLeaguePayload>;
  /** Deletes a single `League` using its globally unique id. */
  deleteLeagueByNodeId?: Maybe<DeleteLeaguePayload>;
  /** Deletes a single `LeagueMember` using a unique key. */
  deleteLeagueMember?: Maybe<DeleteLeagueMemberPayload>;
  /** Deletes a single `LeagueMember` using its globally unique id. */
  deleteLeagueMemberByNodeId?: Maybe<DeleteLeagueMemberPayload>;
  /** Deletes a single `LeagueMessage` using a unique key. */
  deleteLeagueMessage?: Maybe<DeleteLeagueMessagePayload>;
  /** Deletes a single `LeagueMessage` using its globally unique id. */
  deleteLeagueMessageByNodeId?: Maybe<DeleteLeagueMessagePayload>;
  /** Deletes a single `Player` using a unique key. */
  deletePlayer?: Maybe<DeletePlayerPayload>;
  /** Deletes a single `Player` using a unique key. */
  deletePlayerByBrefId?: Maybe<DeletePlayerPayload>;
  /** Deletes a single `Player` using its globally unique id. */
  deletePlayerByNodeId?: Maybe<DeletePlayerPayload>;
  /** Deletes a single `SeasonBatting` using a unique key. */
  deleteSeasonBatting?: Maybe<DeleteSeasonBattingPayload>;
  /** Deletes a single `SeasonBatting` using its globally unique id. */
  deleteSeasonBattingByNodeId?: Maybe<DeleteSeasonBattingPayload>;
  /** Deletes a single `SeasonFielding` using a unique key. */
  deleteSeasonFielding?: Maybe<DeleteSeasonFieldingPayload>;
  /** Deletes a single `SeasonFielding` using its globally unique id. */
  deleteSeasonFieldingByNodeId?: Maybe<DeleteSeasonFieldingPayload>;
  /** Deletes a single `SeasonPitching` using a unique key. */
  deleteSeasonPitching?: Maybe<DeleteSeasonPitchingPayload>;
  /** Deletes a single `SeasonPitching` using its globally unique id. */
  deleteSeasonPitchingByNodeId?: Maybe<DeleteSeasonPitchingPayload>;
  /** Deletes a single `Team` using a unique key. */
  deleteTeam?: Maybe<DeleteTeamPayload>;
  /** Deletes a single `Team` using a unique key. */
  deleteTeamByIdAndLeagueId?: Maybe<DeleteTeamPayload>;
  /** Deletes a single `Team` using its globally unique id. */
  deleteTeamByNodeId?: Maybe<DeleteTeamPayload>;
  /** Deletes a single `User` using a unique key. */
  deleteUser?: Maybe<DeleteUserPayload>;
  /** Deletes a single `User` using a unique key. */
  deleteUserByEmail?: Maybe<DeleteUserPayload>;
  /** Deletes a single `User` using its globally unique id. */
  deleteUserByNodeId?: Maybe<DeleteUserPayload>;
  /** Deletes a single `User` using a unique key. */
  deleteUserByUsername?: Maybe<DeleteUserPayload>;
  /** Updates a single `Draft` using a unique key and a patch. */
  updateDraft?: Maybe<UpdateDraftPayload>;
  /** Updates a single `Draft` using its globally unique id and a patch. */
  updateDraftByNodeId?: Maybe<UpdateDraftPayload>;
  /** Updates a single `DraftTeam` using a unique key and a patch. */
  updateDraftTeam?: Maybe<UpdateDraftTeamPayload>;
  /** Updates a single `DraftTeam` using a unique key and a patch. */
  updateDraftTeamByDraftIdAndDraftOrder?: Maybe<UpdateDraftTeamPayload>;
  /** Updates a single `DraftTeam` using its globally unique id and a patch. */
  updateDraftTeamByNodeId?: Maybe<UpdateDraftTeamPayload>;
  /** Updates a single `League` using a unique key and a patch. */
  updateLeague?: Maybe<UpdateLeaguePayload>;
  /** Updates a single `League` using its globally unique id and a patch. */
  updateLeagueByNodeId?: Maybe<UpdateLeaguePayload>;
  /** Updates a single `LeagueMember` using a unique key and a patch. */
  updateLeagueMember?: Maybe<UpdateLeagueMemberPayload>;
  /** Updates a single `LeagueMember` using its globally unique id and a patch. */
  updateLeagueMemberByNodeId?: Maybe<UpdateLeagueMemberPayload>;
  /** Updates a single `LeagueMessage` using a unique key and a patch. */
  updateLeagueMessage?: Maybe<UpdateLeagueMessagePayload>;
  /** Updates a single `LeagueMessage` using its globally unique id and a patch. */
  updateLeagueMessageByNodeId?: Maybe<UpdateLeagueMessagePayload>;
  /** Updates a single `Player` using a unique key and a patch. */
  updatePlayer?: Maybe<UpdatePlayerPayload>;
  /** Updates a single `Player` using a unique key and a patch. */
  updatePlayerByBrefId?: Maybe<UpdatePlayerPayload>;
  /** Updates a single `Player` using its globally unique id and a patch. */
  updatePlayerByNodeId?: Maybe<UpdatePlayerPayload>;
  /** Updates a single `SeasonBatting` using a unique key and a patch. */
  updateSeasonBatting?: Maybe<UpdateSeasonBattingPayload>;
  /** Updates a single `SeasonBatting` using its globally unique id and a patch. */
  updateSeasonBattingByNodeId?: Maybe<UpdateSeasonBattingPayload>;
  /** Updates a single `SeasonFielding` using a unique key and a patch. */
  updateSeasonFielding?: Maybe<UpdateSeasonFieldingPayload>;
  /** Updates a single `SeasonFielding` using its globally unique id and a patch. */
  updateSeasonFieldingByNodeId?: Maybe<UpdateSeasonFieldingPayload>;
  /** Updates a single `SeasonPitching` using a unique key and a patch. */
  updateSeasonPitching?: Maybe<UpdateSeasonPitchingPayload>;
  /** Updates a single `SeasonPitching` using its globally unique id and a patch. */
  updateSeasonPitchingByNodeId?: Maybe<UpdateSeasonPitchingPayload>;
  /** Updates a single `Team` using a unique key and a patch. */
  updateTeam?: Maybe<UpdateTeamPayload>;
  /** Updates a single `Team` using a unique key and a patch. */
  updateTeamByIdAndLeagueId?: Maybe<UpdateTeamPayload>;
  /** Updates a single `Team` using its globally unique id and a patch. */
  updateTeamByNodeId?: Maybe<UpdateTeamPayload>;
  /** Updates a single `User` using a unique key and a patch. */
  updateUser?: Maybe<UpdateUserPayload>;
  /** Updates a single `User` using a unique key and a patch. */
  updateUserByEmail?: Maybe<UpdateUserPayload>;
  /** Updates a single `User` using its globally unique id and a patch. */
  updateUserByNodeId?: Maybe<UpdateUserPayload>;
  /** Updates a single `User` using a unique key and a patch. */
  updateUserByUsername?: Maybe<UpdateUserPayload>;
  /** Upserts a single `Draft`. */
  upsertDraft?: Maybe<UpsertDraftPayload>;
  /** Upserts a single `DraftTeam`. */
  upsertDraftTeam?: Maybe<UpsertDraftTeamPayload>;
  /** Upserts a single `League`. */
  upsertLeague?: Maybe<UpsertLeaguePayload>;
  /** Upserts a single `LeagueMember`. */
  upsertLeagueMember?: Maybe<UpsertLeagueMemberPayload>;
  /** Upserts a single `LeagueMessage`. */
  upsertLeagueMessage?: Maybe<UpsertLeagueMessagePayload>;
  /** Upserts a single `Player`. */
  upsertPlayer?: Maybe<UpsertPlayerPayload>;
  /** Upserts a single `SeasonBatting`. */
  upsertSeasonBatting?: Maybe<UpsertSeasonBattingPayload>;
  /** Upserts a single `SeasonFielding`. */
  upsertSeasonFielding?: Maybe<UpsertSeasonFieldingPayload>;
  /** Upserts a single `SeasonPitching`. */
  upsertSeasonPitching?: Maybe<UpsertSeasonPitchingPayload>;
  /** Upserts a single `Team`. */
  upsertTeam?: Maybe<UpsertTeamPayload>;
  upsertTypeIntoTable?: Maybe<UpsertTypeIntoTablePayload>;
  /** Upserts a single `User`. */
  upsertUser?: Maybe<UpsertUserPayload>;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationBulkUpdateStatsArgs = {
  input: BulkUpdateStatsInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateDraftArgs = {
  input: CreateDraftInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateDraftTeamArgs = {
  input: CreateDraftTeamInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateLeagueArgs = {
  input: CreateLeagueInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateLeagueAndTeamsArgs = {
  input: CreateLeagueAndTeamsInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateLeagueMemberArgs = {
  input: CreateLeagueMemberInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateLeagueMessageArgs = {
  input: CreateLeagueMessageInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreatePlayerArgs = {
  input: CreatePlayerInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreatePlayersArgs = {
  input: CreatePlayersInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateSeasonBattingArgs = {
  input: CreateSeasonBattingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateSeasonFieldingArgs = {
  input: CreateSeasonFieldingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateSeasonPitchingArgs = {
  input: CreateSeasonPitchingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateTeamArgs = {
  input: CreateTeamInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateUserArgs = {
  input: CreateUserInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteDraftArgs = {
  input: DeleteDraftInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteDraftByNodeIdArgs = {
  input: DeleteDraftByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteDraftTeamArgs = {
  input: DeleteDraftTeamInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteDraftTeamByDraftIdAndDraftOrderArgs = {
  input: DeleteDraftTeamByDraftIdAndDraftOrderInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteDraftTeamByNodeIdArgs = {
  input: DeleteDraftTeamByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteLeagueArgs = {
  input: DeleteLeagueInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteLeagueByNodeIdArgs = {
  input: DeleteLeagueByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteLeagueMemberArgs = {
  input: DeleteLeagueMemberInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteLeagueMemberByNodeIdArgs = {
  input: DeleteLeagueMemberByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteLeagueMessageArgs = {
  input: DeleteLeagueMessageInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteLeagueMessageByNodeIdArgs = {
  input: DeleteLeagueMessageByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeletePlayerArgs = {
  input: DeletePlayerInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeletePlayerByBrefIdArgs = {
  input: DeletePlayerByBrefIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeletePlayerByNodeIdArgs = {
  input: DeletePlayerByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteSeasonBattingArgs = {
  input: DeleteSeasonBattingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteSeasonBattingByNodeIdArgs = {
  input: DeleteSeasonBattingByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteSeasonFieldingArgs = {
  input: DeleteSeasonFieldingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteSeasonFieldingByNodeIdArgs = {
  input: DeleteSeasonFieldingByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteSeasonPitchingArgs = {
  input: DeleteSeasonPitchingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteSeasonPitchingByNodeIdArgs = {
  input: DeleteSeasonPitchingByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteTeamArgs = {
  input: DeleteTeamInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteTeamByIdAndLeagueIdArgs = {
  input: DeleteTeamByIdAndLeagueIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteTeamByNodeIdArgs = {
  input: DeleteTeamByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteUserArgs = {
  input: DeleteUserInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteUserByEmailArgs = {
  input: DeleteUserByEmailInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteUserByNodeIdArgs = {
  input: DeleteUserByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteUserByUsernameArgs = {
  input: DeleteUserByUsernameInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateDraftArgs = {
  input: UpdateDraftInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateDraftByNodeIdArgs = {
  input: UpdateDraftByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateDraftTeamArgs = {
  input: UpdateDraftTeamInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateDraftTeamByDraftIdAndDraftOrderArgs = {
  input: UpdateDraftTeamByDraftIdAndDraftOrderInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateDraftTeamByNodeIdArgs = {
  input: UpdateDraftTeamByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateLeagueArgs = {
  input: UpdateLeagueInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateLeagueByNodeIdArgs = {
  input: UpdateLeagueByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateLeagueMemberArgs = {
  input: UpdateLeagueMemberInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateLeagueMemberByNodeIdArgs = {
  input: UpdateLeagueMemberByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateLeagueMessageArgs = {
  input: UpdateLeagueMessageInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateLeagueMessageByNodeIdArgs = {
  input: UpdateLeagueMessageByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdatePlayerArgs = {
  input: UpdatePlayerInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdatePlayerByBrefIdArgs = {
  input: UpdatePlayerByBrefIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdatePlayerByNodeIdArgs = {
  input: UpdatePlayerByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateSeasonBattingArgs = {
  input: UpdateSeasonBattingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateSeasonBattingByNodeIdArgs = {
  input: UpdateSeasonBattingByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateSeasonFieldingArgs = {
  input: UpdateSeasonFieldingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateSeasonFieldingByNodeIdArgs = {
  input: UpdateSeasonFieldingByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateSeasonPitchingArgs = {
  input: UpdateSeasonPitchingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateSeasonPitchingByNodeIdArgs = {
  input: UpdateSeasonPitchingByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateTeamArgs = {
  input: UpdateTeamInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateTeamByIdAndLeagueIdArgs = {
  input: UpdateTeamByIdAndLeagueIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateTeamByNodeIdArgs = {
  input: UpdateTeamByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateUserArgs = {
  input: UpdateUserInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateUserByEmailArgs = {
  input: UpdateUserByEmailInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateUserByNodeIdArgs = {
  input: UpdateUserByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateUserByUsernameArgs = {
  input: UpdateUserByUsernameInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpsertDraftArgs = {
  input: UpsertDraftInput;
  where?: InputMaybe<UpsertDraftWhere>;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpsertDraftTeamArgs = {
  input: UpsertDraftTeamInput;
  where?: InputMaybe<UpsertDraftTeamWhere>;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpsertLeagueArgs = {
  input: UpsertLeagueInput;
  where?: InputMaybe<UpsertLeagueWhere>;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpsertLeagueMemberArgs = {
  input: UpsertLeagueMemberInput;
  where?: InputMaybe<UpsertLeagueMemberWhere>;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpsertLeagueMessageArgs = {
  input: UpsertLeagueMessageInput;
  where?: InputMaybe<UpsertLeagueMessageWhere>;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpsertPlayerArgs = {
  input: UpsertPlayerInput;
  where?: InputMaybe<UpsertPlayerWhere>;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpsertSeasonBattingArgs = {
  input: UpsertSeasonBattingInput;
  where?: InputMaybe<UpsertSeasonBattingWhere>;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpsertSeasonFieldingArgs = {
  input: UpsertSeasonFieldingInput;
  where?: InputMaybe<UpsertSeasonFieldingWhere>;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpsertSeasonPitchingArgs = {
  input: UpsertSeasonPitchingInput;
  where?: InputMaybe<UpsertSeasonPitchingWhere>;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpsertTeamArgs = {
  input: UpsertTeamInput;
  where?: InputMaybe<UpsertTeamWhere>;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpsertTypeIntoTableArgs = {
  input: UpsertTypeIntoTableInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpsertUserArgs = {
  input: UpsertUserInput;
  where?: InputMaybe<UpsertUserWhere>;
};

/** An object with a globally unique `ID`. */
export type Node = {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
};

/** Information about pagination in a connection. */
export type PageInfo = {
  __typename?: 'PageInfo';
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars['Cursor']['output']>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars['Boolean']['output'];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars['Boolean']['output'];
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars['Cursor']['output']>;
};

export type PgAttribute = {
  __typename?: 'PgAttribute';
  attacl?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  attalign: Scalars['String']['output'];
  attbyval: Scalars['Boolean']['output'];
  attcacheoff: Scalars['Int']['output'];
  attcollation: Scalars['BigFloat']['output'];
  attcompression: Scalars['String']['output'];
  attfdwoptions?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  attgenerated: Scalars['String']['output'];
  atthasdef: Scalars['Boolean']['output'];
  atthasmissing: Scalars['Boolean']['output'];
  attidentity: Scalars['String']['output'];
  attinhcount: Scalars['Int']['output'];
  attisdropped: Scalars['Boolean']['output'];
  attislocal: Scalars['Boolean']['output'];
  attlen: Scalars['Int']['output'];
  attmissingval?: Maybe<Scalars['String']['output']>;
  attname: Scalars['String']['output'];
  attndims: Scalars['Int']['output'];
  attnotnull: Scalars['Boolean']['output'];
  attnum: Scalars['Int']['output'];
  attoptions?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  attrelid: Scalars['BigFloat']['output'];
  attstattarget: Scalars['Int']['output'];
  attstorage: Scalars['String']['output'];
  atttypid: Scalars['BigFloat']['output'];
  atttypmod: Scalars['Int']['output'];
};

/** A connection to a list of `PgAttribute` values. */
export type PgAttributesConnection = {
  __typename?: 'PgAttributesConnection';
  /** A list of edges which contains the `PgAttribute` and cursor to aid in pagination. */
  edges: Array<PgAttributesEdge>;
  /** A list of `PgAttribute` objects. */
  nodes: Array<Maybe<PgAttribute>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `PgAttribute` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `PgAttribute` edge in the connection. */
export type PgAttributesEdge = {
  __typename?: 'PgAttributesEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `PgAttribute` at the end of the edge. */
  node?: Maybe<PgAttribute>;
};

export type Player = Node & {
  __typename?: 'Player';
  brefId: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  name?: Maybe<Scalars['String']['output']>;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  /** Reads and enables pagination through a set of `SeasonBatting`. */
  seasonBattings: SeasonBattingsConnection;
  /** Reads and enables pagination through a set of `SeasonFielding`. */
  seasonFieldings: SeasonFieldingsConnection;
};


export type PlayerSeasonBattingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<SeasonBattingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SeasonBattingsOrderBy>>;
};


export type PlayerSeasonFieldingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<SeasonFieldingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SeasonFieldingsOrderBy>>;
};

/** A condition to be used against `Player` object types. All fields are tested for equality and combined with a logical ‘and.’ */
export type PlayerCondition = {
  /** Checks for equality with the object’s `brefId` field. */
  brefId?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `name` field. */
  name?: InputMaybe<Scalars['String']['input']>;
};

/** An input for mutations affecting `Player` */
export type PlayerInput = {
  brefId: Scalars['String']['input'];
  id?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};

/** Represents an update to a `Player`. Fields that are set will be updated. */
export type PlayerPatch = {
  brefId?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};

/** A connection to a list of `Player` values. */
export type PlayersConnection = {
  __typename?: 'PlayersConnection';
  /** A list of edges which contains the `Player` and cursor to aid in pagination. */
  edges: Array<PlayersEdge>;
  /** A list of `Player` objects. */
  nodes: Array<Maybe<Player>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `Player` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `Player` edge in the connection. */
export type PlayersEdge = {
  __typename?: 'PlayersEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `Player` at the end of the edge. */
  node?: Maybe<Player>;
};

/** Methods to use when ordering `Player`. */
export enum PlayersOrderBy {
  BrefIdAsc = 'BREF_ID_ASC',
  BrefIdDesc = 'BREF_ID_DESC',
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  NameAsc = 'NAME_ASC',
  NameDesc = 'NAME_DESC',
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC'
}

/** The root query type which gives access points into the data universe. */
export type Query = Node & {
  __typename?: 'Query';
  draft?: Maybe<Draft>;
  /** Reads a single `Draft` using its globally unique `ID`. */
  draftByNodeId?: Maybe<Draft>;
  draftTeam?: Maybe<DraftTeam>;
  draftTeamByDraftIdAndDraftOrder?: Maybe<DraftTeam>;
  /** Reads a single `DraftTeam` using its globally unique `ID`. */
  draftTeamByNodeId?: Maybe<DraftTeam>;
  /** Reads and enables pagination through a set of `DraftTeam`. */
  draftTeams?: Maybe<DraftTeamsConnection>;
  /** Reads and enables pagination through a set of `Draft`. */
  drafts?: Maybe<DraftsConnection>;
  /** Reads and enables pagination through a set of `PgAttribute`. */
  getColumnsForType?: Maybe<PgAttributesConnection>;
  league?: Maybe<League>;
  /** Reads a single `League` using its globally unique `ID`. */
  leagueByNodeId?: Maybe<League>;
  leagueMember?: Maybe<LeagueMember>;
  /** Reads a single `LeagueMember` using its globally unique `ID`. */
  leagueMemberByNodeId?: Maybe<LeagueMember>;
  /** Reads and enables pagination through a set of `LeagueMember`. */
  leagueMembers?: Maybe<LeagueMembersConnection>;
  leagueMessage?: Maybe<LeagueMessage>;
  /** Reads a single `LeagueMessage` using its globally unique `ID`. */
  leagueMessageByNodeId?: Maybe<LeagueMessage>;
  /** Reads and enables pagination through a set of `LeagueMessage`. */
  leagueMessages?: Maybe<LeagueMessagesConnection>;
  /** Reads and enables pagination through a set of `League`. */
  leagues?: Maybe<LeaguesConnection>;
  /** Fetches an object given its globally unique `ID`. */
  node?: Maybe<Node>;
  /** The root query type must be a `Node` to work well with Relay 1 mutations. This just resolves to `query`. */
  nodeId: Scalars['ID']['output'];
  player?: Maybe<Player>;
  playerByBrefId?: Maybe<Player>;
  /** Reads a single `Player` using its globally unique `ID`. */
  playerByNodeId?: Maybe<Player>;
  /** Reads and enables pagination through a set of `Player`. */
  players?: Maybe<PlayersConnection>;
  /**
   * Exposes the root query type nested one level down. This is helpful for Relay 1
   * which can only query top level fields if they are in a particular form.
   */
  query: Query;
  seasonBatting?: Maybe<SeasonBatting>;
  /** Reads a single `SeasonBatting` using its globally unique `ID`. */
  seasonBattingByNodeId?: Maybe<SeasonBatting>;
  /** Reads and enables pagination through a set of `SeasonBatting`. */
  seasonBattings?: Maybe<SeasonBattingsConnection>;
  seasonFielding?: Maybe<SeasonFielding>;
  /** Reads a single `SeasonFielding` using its globally unique `ID`. */
  seasonFieldingByNodeId?: Maybe<SeasonFielding>;
  /** Reads and enables pagination through a set of `SeasonFielding`. */
  seasonFieldings?: Maybe<SeasonFieldingsConnection>;
  seasonPitching?: Maybe<SeasonPitching>;
  /** Reads a single `SeasonPitching` using its globally unique `ID`. */
  seasonPitchingByNodeId?: Maybe<SeasonPitching>;
  /** Reads and enables pagination through a set of `SeasonPitching`. */
  seasonPitchings?: Maybe<SeasonPitchingsConnection>;
  team?: Maybe<Team>;
  teamByIdAndLeagueId?: Maybe<Team>;
  /** Reads a single `Team` using its globally unique `ID`. */
  teamByNodeId?: Maybe<Team>;
  /** Reads and enables pagination through a set of `Team`. */
  teams?: Maybe<TeamsConnection>;
  user?: Maybe<User>;
  userByEmail?: Maybe<User>;
  /** Reads a single `User` using its globally unique `ID`. */
  userByNodeId?: Maybe<User>;
  userByUsername?: Maybe<User>;
  /** Reads and enables pagination through a set of `User`. */
  users?: Maybe<UsersConnection>;
};


/** The root query type which gives access points into the data universe. */
export type QueryDraftArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryDraftByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryDraftTeamArgs = {
  draftId: Scalars['Int']['input'];
  leagueId: Scalars['Int']['input'];
  teamId: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryDraftTeamByDraftIdAndDraftOrderArgs = {
  draftId: Scalars['Int']['input'];
  draftOrder: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryDraftTeamByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryDraftTeamsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<DraftTeamCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<DraftTeamsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryDraftsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<DraftCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<DraftsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryGetColumnsForTypeArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  typeName: Scalars['String']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryLeagueArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryLeagueByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryLeagueMemberArgs = {
  leagueId: Scalars['Int']['input'];
  userId: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryLeagueMemberByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryLeagueMembersArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<LeagueMemberCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LeagueMembersOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryLeagueMessageArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryLeagueMessageByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryLeagueMessagesArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<LeagueMessageCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LeagueMessagesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryLeaguesArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<LeagueCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LeaguesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryNodeArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryPlayerArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryPlayerByBrefIdArgs = {
  brefId: Scalars['String']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryPlayerByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryPlayersArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<PlayerCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PlayersOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QuerySeasonBattingArgs = {
  lgId: Scalars['String']['input'];
  playerId: Scalars['Int']['input'];
  season: Scalars['String']['input'];
  team: Scalars['String']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QuerySeasonBattingByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QuerySeasonBattingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<SeasonBattingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SeasonBattingsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QuerySeasonFieldingArgs = {
  lgId: Scalars['String']['input'];
  playerId: Scalars['Int']['input'];
  pos: Scalars['String']['input'];
  season: Scalars['String']['input'];
  team: Scalars['String']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QuerySeasonFieldingByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QuerySeasonFieldingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<SeasonFieldingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SeasonFieldingsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QuerySeasonPitchingArgs = {
  lgId: Scalars['String']['input'];
  playerId: Scalars['Int']['input'];
  season: Scalars['String']['input'];
  team: Scalars['String']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QuerySeasonPitchingByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QuerySeasonPitchingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<SeasonPitchingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SeasonPitchingsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryTeamArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryTeamByIdAndLeagueIdArgs = {
  id: Scalars['Int']['input'];
  leagueId: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryTeamByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryTeamsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<TeamCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TeamsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryUserArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryUserByEmailArgs = {
  email: Scalars['String']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryUserByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryUserByUsernameArgs = {
  username: Scalars['String']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryUsersArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<UserCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<UsersOrderBy>>;
};

export type SeasonBatting = Node & {
  __typename?: 'SeasonBatting';
  ab?: Maybe<Scalars['Int']['output']>;
  awardSummary?: Maybe<Scalars['String']['output']>;
  battingAvg?: Maybe<Scalars['Float']['output']>;
  bb?: Maybe<Scalars['Int']['output']>;
  cs?: Maybe<Scalars['Int']['output']>;
  doubles?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  gidp?: Maybe<Scalars['Int']['output']>;
  h?: Maybe<Scalars['Int']['output']>;
  hbp?: Maybe<Scalars['Int']['output']>;
  hr?: Maybe<Scalars['Int']['output']>;
  ibb?: Maybe<Scalars['Int']['output']>;
  lgId: Scalars['String']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  onbasePerc?: Maybe<Scalars['Float']['output']>;
  onbasePlusSlugging?: Maybe<Scalars['Float']['output']>;
  onbasePlusSluggingPlus?: Maybe<Scalars['Float']['output']>;
  pa?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `Player` that is related to this `SeasonBatting`. */
  player?: Maybe<Player>;
  playerId: Scalars['Int']['output'];
  posSeason?: Maybe<Scalars['String']['output']>;
  r?: Maybe<Scalars['Int']['output']>;
  rbi?: Maybe<Scalars['Int']['output']>;
  sb?: Maybe<Scalars['Int']['output']>;
  season: Scalars['String']['output'];
  sf?: Maybe<Scalars['String']['output']>;
  sh?: Maybe<Scalars['Int']['output']>;
  sluggingPerc?: Maybe<Scalars['Float']['output']>;
  so?: Maybe<Scalars['Int']['output']>;
  tb?: Maybe<Scalars['Int']['output']>;
  team: Scalars['String']['output'];
  triples?: Maybe<Scalars['Int']['output']>;
};

/**
 * A condition to be used against `SeasonBatting` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type SeasonBattingCondition = {
  /** Checks for equality with the object’s `ab` field. */
  ab?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `awardSummary` field. */
  awardSummary?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `battingAvg` field. */
  battingAvg?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `bb` field. */
  bb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `cs` field. */
  cs?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `doubles` field. */
  doubles?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `g` field. */
  g?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `gidp` field. */
  gidp?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `h` field. */
  h?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `hbp` field. */
  hbp?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `hr` field. */
  hr?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `ibb` field. */
  ibb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `lgId` field. */
  lgId?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `onbasePerc` field. */
  onbasePerc?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `onbasePlusSlugging` field. */
  onbasePlusSlugging?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `onbasePlusSluggingPlus` field. */
  onbasePlusSluggingPlus?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `pa` field. */
  pa?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `posSeason` field. */
  posSeason?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `r` field. */
  r?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `rbi` field. */
  rbi?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sb` field. */
  sb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `season` field. */
  season?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `sf` field. */
  sf?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `sh` field. */
  sh?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sluggingPerc` field. */
  sluggingPerc?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `so` field. */
  so?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `tb` field. */
  tb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `team` field. */
  team?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `triples` field. */
  triples?: InputMaybe<Scalars['Int']['input']>;
};

/** An input for mutations affecting `SeasonBatting` */
export type SeasonBattingInput = {
  ab?: InputMaybe<Scalars['Int']['input']>;
  awardSummary?: InputMaybe<Scalars['String']['input']>;
  battingAvg?: InputMaybe<Scalars['Float']['input']>;
  bb?: InputMaybe<Scalars['Int']['input']>;
  cs?: InputMaybe<Scalars['Int']['input']>;
  doubles?: InputMaybe<Scalars['Int']['input']>;
  g?: InputMaybe<Scalars['Int']['input']>;
  gidp?: InputMaybe<Scalars['Int']['input']>;
  h?: InputMaybe<Scalars['Int']['input']>;
  hbp?: InputMaybe<Scalars['Int']['input']>;
  hr?: InputMaybe<Scalars['Int']['input']>;
  ibb?: InputMaybe<Scalars['Int']['input']>;
  lgId: Scalars['String']['input'];
  onbasePerc?: InputMaybe<Scalars['Float']['input']>;
  onbasePlusSlugging?: InputMaybe<Scalars['Float']['input']>;
  onbasePlusSluggingPlus?: InputMaybe<Scalars['Float']['input']>;
  pa?: InputMaybe<Scalars['Int']['input']>;
  playerId: Scalars['Int']['input'];
  posSeason?: InputMaybe<Scalars['String']['input']>;
  r?: InputMaybe<Scalars['Int']['input']>;
  rbi?: InputMaybe<Scalars['Int']['input']>;
  sb?: InputMaybe<Scalars['Int']['input']>;
  season: Scalars['String']['input'];
  sf?: InputMaybe<Scalars['String']['input']>;
  sh?: InputMaybe<Scalars['Int']['input']>;
  sluggingPerc?: InputMaybe<Scalars['Float']['input']>;
  so?: InputMaybe<Scalars['Int']['input']>;
  tb?: InputMaybe<Scalars['Int']['input']>;
  team: Scalars['String']['input'];
  triples?: InputMaybe<Scalars['Int']['input']>;
};

/** Represents an update to a `SeasonBatting`. Fields that are set will be updated. */
export type SeasonBattingPatch = {
  ab?: InputMaybe<Scalars['Int']['input']>;
  awardSummary?: InputMaybe<Scalars['String']['input']>;
  battingAvg?: InputMaybe<Scalars['Float']['input']>;
  bb?: InputMaybe<Scalars['Int']['input']>;
  cs?: InputMaybe<Scalars['Int']['input']>;
  doubles?: InputMaybe<Scalars['Int']['input']>;
  g?: InputMaybe<Scalars['Int']['input']>;
  gidp?: InputMaybe<Scalars['Int']['input']>;
  h?: InputMaybe<Scalars['Int']['input']>;
  hbp?: InputMaybe<Scalars['Int']['input']>;
  hr?: InputMaybe<Scalars['Int']['input']>;
  ibb?: InputMaybe<Scalars['Int']['input']>;
  lgId?: InputMaybe<Scalars['String']['input']>;
  onbasePerc?: InputMaybe<Scalars['Float']['input']>;
  onbasePlusSlugging?: InputMaybe<Scalars['Float']['input']>;
  onbasePlusSluggingPlus?: InputMaybe<Scalars['Float']['input']>;
  pa?: InputMaybe<Scalars['Int']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  posSeason?: InputMaybe<Scalars['String']['input']>;
  r?: InputMaybe<Scalars['Int']['input']>;
  rbi?: InputMaybe<Scalars['Int']['input']>;
  sb?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['String']['input']>;
  sf?: InputMaybe<Scalars['String']['input']>;
  sh?: InputMaybe<Scalars['Int']['input']>;
  sluggingPerc?: InputMaybe<Scalars['Float']['input']>;
  so?: InputMaybe<Scalars['Int']['input']>;
  tb?: InputMaybe<Scalars['Int']['input']>;
  team?: InputMaybe<Scalars['String']['input']>;
  triples?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `SeasonBatting` values. */
export type SeasonBattingsConnection = {
  __typename?: 'SeasonBattingsConnection';
  /** A list of edges which contains the `SeasonBatting` and cursor to aid in pagination. */
  edges: Array<SeasonBattingsEdge>;
  /** A list of `SeasonBatting` objects. */
  nodes: Array<Maybe<SeasonBatting>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `SeasonBatting` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `SeasonBatting` edge in the connection. */
export type SeasonBattingsEdge = {
  __typename?: 'SeasonBattingsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `SeasonBatting` at the end of the edge. */
  node?: Maybe<SeasonBatting>;
};

/** Methods to use when ordering `SeasonBatting`. */
export enum SeasonBattingsOrderBy {
  AbAsc = 'AB_ASC',
  AbDesc = 'AB_DESC',
  AwardSummaryAsc = 'AWARD_SUMMARY_ASC',
  AwardSummaryDesc = 'AWARD_SUMMARY_DESC',
  BattingAvgAsc = 'BATTING_AVG_ASC',
  BattingAvgDesc = 'BATTING_AVG_DESC',
  BbAsc = 'BB_ASC',
  BbDesc = 'BB_DESC',
  CsAsc = 'CS_ASC',
  CsDesc = 'CS_DESC',
  DoublesAsc = 'DOUBLES_ASC',
  DoublesDesc = 'DOUBLES_DESC',
  GidpAsc = 'GIDP_ASC',
  GidpDesc = 'GIDP_DESC',
  GAsc = 'G_ASC',
  GDesc = 'G_DESC',
  HbpAsc = 'HBP_ASC',
  HbpDesc = 'HBP_DESC',
  HrAsc = 'HR_ASC',
  HrDesc = 'HR_DESC',
  HAsc = 'H_ASC',
  HDesc = 'H_DESC',
  IbbAsc = 'IBB_ASC',
  IbbDesc = 'IBB_DESC',
  LgIdAsc = 'LG_ID_ASC',
  LgIdDesc = 'LG_ID_DESC',
  Natural = 'NATURAL',
  OnbasePercAsc = 'ONBASE_PERC_ASC',
  OnbasePercDesc = 'ONBASE_PERC_DESC',
  OnbasePlusSluggingAsc = 'ONBASE_PLUS_SLUGGING_ASC',
  OnbasePlusSluggingDesc = 'ONBASE_PLUS_SLUGGING_DESC',
  OnbasePlusSluggingPlusAsc = 'ONBASE_PLUS_SLUGGING_PLUS_ASC',
  OnbasePlusSluggingPlusDesc = 'ONBASE_PLUS_SLUGGING_PLUS_DESC',
  PaAsc = 'PA_ASC',
  PaDesc = 'PA_DESC',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  PosSeasonAsc = 'POS_SEASON_ASC',
  PosSeasonDesc = 'POS_SEASON_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  RbiAsc = 'RBI_ASC',
  RbiDesc = 'RBI_DESC',
  RAsc = 'R_ASC',
  RDesc = 'R_DESC',
  SbAsc = 'SB_ASC',
  SbDesc = 'SB_DESC',
  SeasonAsc = 'SEASON_ASC',
  SeasonDesc = 'SEASON_DESC',
  SfAsc = 'SF_ASC',
  SfDesc = 'SF_DESC',
  ShAsc = 'SH_ASC',
  ShDesc = 'SH_DESC',
  SluggingPercAsc = 'SLUGGING_PERC_ASC',
  SluggingPercDesc = 'SLUGGING_PERC_DESC',
  SoAsc = 'SO_ASC',
  SoDesc = 'SO_DESC',
  TbAsc = 'TB_ASC',
  TbDesc = 'TB_DESC',
  TeamAsc = 'TEAM_ASC',
  TeamDesc = 'TEAM_DESC',
  TriplesAsc = 'TRIPLES_ASC',
  TriplesDesc = 'TRIPLES_DESC'
}

export type SeasonFielding = Node & {
  __typename?: 'SeasonFielding';
  a?: Maybe<Scalars['Int']['output']>;
  awardSummary?: Maybe<Scalars['String']['output']>;
  caughtStealingPerc?: Maybe<Scalars['Float']['output']>;
  caughtStealingPercLg?: Maybe<Scalars['Float']['output']>;
  cg?: Maybe<Scalars['Int']['output']>;
  chances?: Maybe<Scalars['Float']['output']>;
  cs?: Maybe<Scalars['Int']['output']>;
  dpDef?: Maybe<Scalars['Int']['output']>;
  eDef?: Maybe<Scalars['Int']['output']>;
  fieldingPerc?: Maybe<Scalars['Float']['output']>;
  fieldingPercLg?: Maybe<Scalars['Float']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  gOfParts?: Maybe<Scalars['Int']['output']>;
  gs?: Maybe<Scalars['Int']['output']>;
  innDef?: Maybe<Scalars['Float']['output']>;
  lgId: Scalars['String']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  pickoffs?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `Player` that is related to this `SeasonFielding`. */
  player?: Maybe<Player>;
  playerId: Scalars['Int']['output'];
  po?: Maybe<Scalars['Int']['output']>;
  pos: Scalars['String']['output'];
  rangeFactorPerGame?: Maybe<Scalars['Float']['output']>;
  rangeFactorPerGameLg?: Maybe<Scalars['Float']['output']>;
  rangeFactorPerNine?: Maybe<Scalars['Float']['output']>;
  rangeFactorPerNineLg?: Maybe<Scalars['Float']['output']>;
  sb?: Maybe<Scalars['Int']['output']>;
  season: Scalars['String']['output'];
  team: Scalars['String']['output'];
  wp?: Maybe<Scalars['Int']['output']>;
};

/**
 * A condition to be used against `SeasonFielding` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type SeasonFieldingCondition = {
  /** Checks for equality with the object’s `a` field. */
  a?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `awardSummary` field. */
  awardSummary?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `caughtStealingPerc` field. */
  caughtStealingPerc?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `caughtStealingPercLg` field. */
  caughtStealingPercLg?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `cg` field. */
  cg?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `chances` field. */
  chances?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `cs` field. */
  cs?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `dpDef` field. */
  dpDef?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `eDef` field. */
  eDef?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `fieldingPerc` field. */
  fieldingPerc?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `fieldingPercLg` field. */
  fieldingPercLg?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `g` field. */
  g?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `gOfParts` field. */
  gOfParts?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `gs` field. */
  gs?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `innDef` field. */
  innDef?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `lgId` field. */
  lgId?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `pickoffs` field. */
  pickoffs?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `po` field. */
  po?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `pos` field. */
  pos?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `rangeFactorPerGame` field. */
  rangeFactorPerGame?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `rangeFactorPerGameLg` field. */
  rangeFactorPerGameLg?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `rangeFactorPerNine` field. */
  rangeFactorPerNine?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `rangeFactorPerNineLg` field. */
  rangeFactorPerNineLg?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `sb` field. */
  sb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `season` field. */
  season?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `team` field. */
  team?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `wp` field. */
  wp?: InputMaybe<Scalars['Int']['input']>;
};

/** An input for mutations affecting `SeasonFielding` */
export type SeasonFieldingInput = {
  a?: InputMaybe<Scalars['Int']['input']>;
  awardSummary?: InputMaybe<Scalars['String']['input']>;
  caughtStealingPerc?: InputMaybe<Scalars['Float']['input']>;
  caughtStealingPercLg?: InputMaybe<Scalars['Float']['input']>;
  cg?: InputMaybe<Scalars['Int']['input']>;
  chances?: InputMaybe<Scalars['Float']['input']>;
  cs?: InputMaybe<Scalars['Int']['input']>;
  dpDef?: InputMaybe<Scalars['Int']['input']>;
  eDef?: InputMaybe<Scalars['Int']['input']>;
  fieldingPerc?: InputMaybe<Scalars['Float']['input']>;
  fieldingPercLg?: InputMaybe<Scalars['Float']['input']>;
  g?: InputMaybe<Scalars['Int']['input']>;
  gOfParts?: InputMaybe<Scalars['Int']['input']>;
  gs?: InputMaybe<Scalars['Int']['input']>;
  innDef?: InputMaybe<Scalars['Float']['input']>;
  lgId: Scalars['String']['input'];
  pickoffs?: InputMaybe<Scalars['Int']['input']>;
  playerId: Scalars['Int']['input'];
  po?: InputMaybe<Scalars['Int']['input']>;
  pos: Scalars['String']['input'];
  rangeFactorPerGame?: InputMaybe<Scalars['Float']['input']>;
  rangeFactorPerGameLg?: InputMaybe<Scalars['Float']['input']>;
  rangeFactorPerNine?: InputMaybe<Scalars['Float']['input']>;
  rangeFactorPerNineLg?: InputMaybe<Scalars['Float']['input']>;
  sb?: InputMaybe<Scalars['Int']['input']>;
  season: Scalars['String']['input'];
  team: Scalars['String']['input'];
  wp?: InputMaybe<Scalars['Int']['input']>;
};

/** Represents an update to a `SeasonFielding`. Fields that are set will be updated. */
export type SeasonFieldingPatch = {
  a?: InputMaybe<Scalars['Int']['input']>;
  awardSummary?: InputMaybe<Scalars['String']['input']>;
  caughtStealingPerc?: InputMaybe<Scalars['Float']['input']>;
  caughtStealingPercLg?: InputMaybe<Scalars['Float']['input']>;
  cg?: InputMaybe<Scalars['Int']['input']>;
  chances?: InputMaybe<Scalars['Float']['input']>;
  cs?: InputMaybe<Scalars['Int']['input']>;
  dpDef?: InputMaybe<Scalars['Int']['input']>;
  eDef?: InputMaybe<Scalars['Int']['input']>;
  fieldingPerc?: InputMaybe<Scalars['Float']['input']>;
  fieldingPercLg?: InputMaybe<Scalars['Float']['input']>;
  g?: InputMaybe<Scalars['Int']['input']>;
  gOfParts?: InputMaybe<Scalars['Int']['input']>;
  gs?: InputMaybe<Scalars['Int']['input']>;
  innDef?: InputMaybe<Scalars['Float']['input']>;
  lgId?: InputMaybe<Scalars['String']['input']>;
  pickoffs?: InputMaybe<Scalars['Int']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  po?: InputMaybe<Scalars['Int']['input']>;
  pos?: InputMaybe<Scalars['String']['input']>;
  rangeFactorPerGame?: InputMaybe<Scalars['Float']['input']>;
  rangeFactorPerGameLg?: InputMaybe<Scalars['Float']['input']>;
  rangeFactorPerNine?: InputMaybe<Scalars['Float']['input']>;
  rangeFactorPerNineLg?: InputMaybe<Scalars['Float']['input']>;
  sb?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['String']['input']>;
  team?: InputMaybe<Scalars['String']['input']>;
  wp?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `SeasonFielding` values. */
export type SeasonFieldingsConnection = {
  __typename?: 'SeasonFieldingsConnection';
  /** A list of edges which contains the `SeasonFielding` and cursor to aid in pagination. */
  edges: Array<SeasonFieldingsEdge>;
  /** A list of `SeasonFielding` objects. */
  nodes: Array<Maybe<SeasonFielding>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `SeasonFielding` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `SeasonFielding` edge in the connection. */
export type SeasonFieldingsEdge = {
  __typename?: 'SeasonFieldingsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `SeasonFielding` at the end of the edge. */
  node?: Maybe<SeasonFielding>;
};

/** Methods to use when ordering `SeasonFielding`. */
export enum SeasonFieldingsOrderBy {
  AwardSummaryAsc = 'AWARD_SUMMARY_ASC',
  AwardSummaryDesc = 'AWARD_SUMMARY_DESC',
  AAsc = 'A_ASC',
  ADesc = 'A_DESC',
  CaughtStealingPercAsc = 'CAUGHT_STEALING_PERC_ASC',
  CaughtStealingPercDesc = 'CAUGHT_STEALING_PERC_DESC',
  CaughtStealingPercLgAsc = 'CAUGHT_STEALING_PERC_LG_ASC',
  CaughtStealingPercLgDesc = 'CAUGHT_STEALING_PERC_LG_DESC',
  CgAsc = 'CG_ASC',
  CgDesc = 'CG_DESC',
  ChancesAsc = 'CHANCES_ASC',
  ChancesDesc = 'CHANCES_DESC',
  CsAsc = 'CS_ASC',
  CsDesc = 'CS_DESC',
  DpDefAsc = 'DP_DEF_ASC',
  DpDefDesc = 'DP_DEF_DESC',
  EDefAsc = 'E_DEF_ASC',
  EDefDesc = 'E_DEF_DESC',
  FieldingPercAsc = 'FIELDING_PERC_ASC',
  FieldingPercDesc = 'FIELDING_PERC_DESC',
  FieldingPercLgAsc = 'FIELDING_PERC_LG_ASC',
  FieldingPercLgDesc = 'FIELDING_PERC_LG_DESC',
  GsAsc = 'GS_ASC',
  GsDesc = 'GS_DESC',
  GAsc = 'G_ASC',
  GDesc = 'G_DESC',
  GOfPartsAsc = 'G_OF_PARTS_ASC',
  GOfPartsDesc = 'G_OF_PARTS_DESC',
  InnDefAsc = 'INN_DEF_ASC',
  InnDefDesc = 'INN_DEF_DESC',
  LgIdAsc = 'LG_ID_ASC',
  LgIdDesc = 'LG_ID_DESC',
  Natural = 'NATURAL',
  PickoffsAsc = 'PICKOFFS_ASC',
  PickoffsDesc = 'PICKOFFS_DESC',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  PosAsc = 'POS_ASC',
  PosDesc = 'POS_DESC',
  PoAsc = 'PO_ASC',
  PoDesc = 'PO_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  RangeFactorPerGameAsc = 'RANGE_FACTOR_PER_GAME_ASC',
  RangeFactorPerGameDesc = 'RANGE_FACTOR_PER_GAME_DESC',
  RangeFactorPerGameLgAsc = 'RANGE_FACTOR_PER_GAME_LG_ASC',
  RangeFactorPerGameLgDesc = 'RANGE_FACTOR_PER_GAME_LG_DESC',
  RangeFactorPerNineAsc = 'RANGE_FACTOR_PER_NINE_ASC',
  RangeFactorPerNineDesc = 'RANGE_FACTOR_PER_NINE_DESC',
  RangeFactorPerNineLgAsc = 'RANGE_FACTOR_PER_NINE_LG_ASC',
  RangeFactorPerNineLgDesc = 'RANGE_FACTOR_PER_NINE_LG_DESC',
  SbAsc = 'SB_ASC',
  SbDesc = 'SB_DESC',
  SeasonAsc = 'SEASON_ASC',
  SeasonDesc = 'SEASON_DESC',
  TeamAsc = 'TEAM_ASC',
  TeamDesc = 'TEAM_DESC',
  WpAsc = 'WP_ASC',
  WpDesc = 'WP_DESC'
}

export type SeasonPitching = Node & {
  __typename?: 'SeasonPitching';
  awardSummary?: Maybe<Scalars['String']['output']>;
  basesOnBallsPerNine?: Maybe<Scalars['Float']['output']>;
  battersFaced?: Maybe<Scalars['Int']['output']>;
  bb?: Maybe<Scalars['Int']['output']>;
  bk?: Maybe<Scalars['Int']['output']>;
  cg?: Maybe<Scalars['Int']['output']>;
  earnedRunAvg?: Maybe<Scalars['BigFloat']['output']>;
  earnedRunAvgPlus?: Maybe<Scalars['Float']['output']>;
  er?: Maybe<Scalars['Int']['output']>;
  fip?: Maybe<Scalars['Float']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  gf?: Maybe<Scalars['Int']['output']>;
  gs?: Maybe<Scalars['Int']['output']>;
  h?: Maybe<Scalars['Int']['output']>;
  hbp?: Maybe<Scalars['Int']['output']>;
  hitsPerNine?: Maybe<Scalars['Float']['output']>;
  homeRunsPerNine?: Maybe<Scalars['Float']['output']>;
  hr?: Maybe<Scalars['Int']['output']>;
  ibb?: Maybe<Scalars['Int']['output']>;
  ip?: Maybe<Scalars['Float']['output']>;
  l?: Maybe<Scalars['Int']['output']>;
  lgId: Scalars['String']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  playerId: Scalars['Int']['output'];
  r?: Maybe<Scalars['Int']['output']>;
  season: Scalars['String']['output'];
  sho?: Maybe<Scalars['Int']['output']>;
  so?: Maybe<Scalars['Int']['output']>;
  strikeoutsPerBaseOnBalls?: Maybe<Scalars['Float']['output']>;
  strikeoutsPerNine?: Maybe<Scalars['Float']['output']>;
  sv?: Maybe<Scalars['Int']['output']>;
  team: Scalars['String']['output'];
  w?: Maybe<Scalars['Int']['output']>;
  whip?: Maybe<Scalars['Float']['output']>;
  winLossPerc?: Maybe<Scalars['BigFloat']['output']>;
  wp?: Maybe<Scalars['Int']['output']>;
};

/**
 * A condition to be used against `SeasonPitching` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type SeasonPitchingCondition = {
  /** Checks for equality with the object’s `awardSummary` field. */
  awardSummary?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `basesOnBallsPerNine` field. */
  basesOnBallsPerNine?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `battersFaced` field. */
  battersFaced?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `bb` field. */
  bb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `bk` field. */
  bk?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `cg` field. */
  cg?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `earnedRunAvg` field. */
  earnedRunAvg?: InputMaybe<Scalars['BigFloat']['input']>;
  /** Checks for equality with the object’s `earnedRunAvgPlus` field. */
  earnedRunAvgPlus?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `er` field. */
  er?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `fip` field. */
  fip?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `g` field. */
  g?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `gf` field. */
  gf?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `gs` field. */
  gs?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `h` field. */
  h?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `hbp` field. */
  hbp?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `hitsPerNine` field. */
  hitsPerNine?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `homeRunsPerNine` field. */
  homeRunsPerNine?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `hr` field. */
  hr?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `ibb` field. */
  ibb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `ip` field. */
  ip?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `l` field. */
  l?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `lgId` field. */
  lgId?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `r` field. */
  r?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `season` field. */
  season?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `sho` field. */
  sho?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `so` field. */
  so?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `strikeoutsPerBaseOnBalls` field. */
  strikeoutsPerBaseOnBalls?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `strikeoutsPerNine` field. */
  strikeoutsPerNine?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `sv` field. */
  sv?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `team` field. */
  team?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `w` field. */
  w?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `whip` field. */
  whip?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `winLossPerc` field. */
  winLossPerc?: InputMaybe<Scalars['BigFloat']['input']>;
  /** Checks for equality with the object’s `wp` field. */
  wp?: InputMaybe<Scalars['Int']['input']>;
};

/** An input for mutations affecting `SeasonPitching` */
export type SeasonPitchingInput = {
  awardSummary?: InputMaybe<Scalars['String']['input']>;
  basesOnBallsPerNine?: InputMaybe<Scalars['Float']['input']>;
  battersFaced?: InputMaybe<Scalars['Int']['input']>;
  bb?: InputMaybe<Scalars['Int']['input']>;
  bk?: InputMaybe<Scalars['Int']['input']>;
  cg?: InputMaybe<Scalars['Int']['input']>;
  earnedRunAvg?: InputMaybe<Scalars['BigFloat']['input']>;
  earnedRunAvgPlus?: InputMaybe<Scalars['Float']['input']>;
  er?: InputMaybe<Scalars['Int']['input']>;
  fip?: InputMaybe<Scalars['Float']['input']>;
  g?: InputMaybe<Scalars['Int']['input']>;
  gf?: InputMaybe<Scalars['Int']['input']>;
  gs?: InputMaybe<Scalars['Int']['input']>;
  h?: InputMaybe<Scalars['Int']['input']>;
  hbp?: InputMaybe<Scalars['Int']['input']>;
  hitsPerNine?: InputMaybe<Scalars['Float']['input']>;
  homeRunsPerNine?: InputMaybe<Scalars['Float']['input']>;
  hr?: InputMaybe<Scalars['Int']['input']>;
  ibb?: InputMaybe<Scalars['Int']['input']>;
  ip?: InputMaybe<Scalars['Float']['input']>;
  l?: InputMaybe<Scalars['Int']['input']>;
  lgId: Scalars['String']['input'];
  playerId: Scalars['Int']['input'];
  r?: InputMaybe<Scalars['Int']['input']>;
  season: Scalars['String']['input'];
  sho?: InputMaybe<Scalars['Int']['input']>;
  so?: InputMaybe<Scalars['Int']['input']>;
  strikeoutsPerBaseOnBalls?: InputMaybe<Scalars['Float']['input']>;
  strikeoutsPerNine?: InputMaybe<Scalars['Float']['input']>;
  sv?: InputMaybe<Scalars['Int']['input']>;
  team: Scalars['String']['input'];
  w?: InputMaybe<Scalars['Int']['input']>;
  whip?: InputMaybe<Scalars['Float']['input']>;
  winLossPerc?: InputMaybe<Scalars['BigFloat']['input']>;
  wp?: InputMaybe<Scalars['Int']['input']>;
};

/** Represents an update to a `SeasonPitching`. Fields that are set will be updated. */
export type SeasonPitchingPatch = {
  awardSummary?: InputMaybe<Scalars['String']['input']>;
  basesOnBallsPerNine?: InputMaybe<Scalars['Float']['input']>;
  battersFaced?: InputMaybe<Scalars['Int']['input']>;
  bb?: InputMaybe<Scalars['Int']['input']>;
  bk?: InputMaybe<Scalars['Int']['input']>;
  cg?: InputMaybe<Scalars['Int']['input']>;
  earnedRunAvg?: InputMaybe<Scalars['BigFloat']['input']>;
  earnedRunAvgPlus?: InputMaybe<Scalars['Float']['input']>;
  er?: InputMaybe<Scalars['Int']['input']>;
  fip?: InputMaybe<Scalars['Float']['input']>;
  g?: InputMaybe<Scalars['Int']['input']>;
  gf?: InputMaybe<Scalars['Int']['input']>;
  gs?: InputMaybe<Scalars['Int']['input']>;
  h?: InputMaybe<Scalars['Int']['input']>;
  hbp?: InputMaybe<Scalars['Int']['input']>;
  hitsPerNine?: InputMaybe<Scalars['Float']['input']>;
  homeRunsPerNine?: InputMaybe<Scalars['Float']['input']>;
  hr?: InputMaybe<Scalars['Int']['input']>;
  ibb?: InputMaybe<Scalars['Int']['input']>;
  ip?: InputMaybe<Scalars['Float']['input']>;
  l?: InputMaybe<Scalars['Int']['input']>;
  lgId?: InputMaybe<Scalars['String']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  r?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['String']['input']>;
  sho?: InputMaybe<Scalars['Int']['input']>;
  so?: InputMaybe<Scalars['Int']['input']>;
  strikeoutsPerBaseOnBalls?: InputMaybe<Scalars['Float']['input']>;
  strikeoutsPerNine?: InputMaybe<Scalars['Float']['input']>;
  sv?: InputMaybe<Scalars['Int']['input']>;
  team?: InputMaybe<Scalars['String']['input']>;
  w?: InputMaybe<Scalars['Int']['input']>;
  whip?: InputMaybe<Scalars['Float']['input']>;
  winLossPerc?: InputMaybe<Scalars['BigFloat']['input']>;
  wp?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `SeasonPitching` values. */
export type SeasonPitchingsConnection = {
  __typename?: 'SeasonPitchingsConnection';
  /** A list of edges which contains the `SeasonPitching` and cursor to aid in pagination. */
  edges: Array<SeasonPitchingsEdge>;
  /** A list of `SeasonPitching` objects. */
  nodes: Array<Maybe<SeasonPitching>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `SeasonPitching` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `SeasonPitching` edge in the connection. */
export type SeasonPitchingsEdge = {
  __typename?: 'SeasonPitchingsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `SeasonPitching` at the end of the edge. */
  node?: Maybe<SeasonPitching>;
};

/** Methods to use when ordering `SeasonPitching`. */
export enum SeasonPitchingsOrderBy {
  AwardSummaryAsc = 'AWARD_SUMMARY_ASC',
  AwardSummaryDesc = 'AWARD_SUMMARY_DESC',
  BasesOnBallsPerNineAsc = 'BASES_ON_BALLS_PER_NINE_ASC',
  BasesOnBallsPerNineDesc = 'BASES_ON_BALLS_PER_NINE_DESC',
  BattersFacedAsc = 'BATTERS_FACED_ASC',
  BattersFacedDesc = 'BATTERS_FACED_DESC',
  BbAsc = 'BB_ASC',
  BbDesc = 'BB_DESC',
  BkAsc = 'BK_ASC',
  BkDesc = 'BK_DESC',
  CgAsc = 'CG_ASC',
  CgDesc = 'CG_DESC',
  EarnedRunAvgAsc = 'EARNED_RUN_AVG_ASC',
  EarnedRunAvgDesc = 'EARNED_RUN_AVG_DESC',
  EarnedRunAvgPlusAsc = 'EARNED_RUN_AVG_PLUS_ASC',
  EarnedRunAvgPlusDesc = 'EARNED_RUN_AVG_PLUS_DESC',
  ErAsc = 'ER_ASC',
  ErDesc = 'ER_DESC',
  FipAsc = 'FIP_ASC',
  FipDesc = 'FIP_DESC',
  GfAsc = 'GF_ASC',
  GfDesc = 'GF_DESC',
  GsAsc = 'GS_ASC',
  GsDesc = 'GS_DESC',
  GAsc = 'G_ASC',
  GDesc = 'G_DESC',
  HbpAsc = 'HBP_ASC',
  HbpDesc = 'HBP_DESC',
  HitsPerNineAsc = 'HITS_PER_NINE_ASC',
  HitsPerNineDesc = 'HITS_PER_NINE_DESC',
  HomeRunsPerNineAsc = 'HOME_RUNS_PER_NINE_ASC',
  HomeRunsPerNineDesc = 'HOME_RUNS_PER_NINE_DESC',
  HrAsc = 'HR_ASC',
  HrDesc = 'HR_DESC',
  HAsc = 'H_ASC',
  HDesc = 'H_DESC',
  IbbAsc = 'IBB_ASC',
  IbbDesc = 'IBB_DESC',
  IpAsc = 'IP_ASC',
  IpDesc = 'IP_DESC',
  LgIdAsc = 'LG_ID_ASC',
  LgIdDesc = 'LG_ID_DESC',
  LAsc = 'L_ASC',
  LDesc = 'L_DESC',
  Natural = 'NATURAL',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  RAsc = 'R_ASC',
  RDesc = 'R_DESC',
  SeasonAsc = 'SEASON_ASC',
  SeasonDesc = 'SEASON_DESC',
  ShoAsc = 'SHO_ASC',
  ShoDesc = 'SHO_DESC',
  SoAsc = 'SO_ASC',
  SoDesc = 'SO_DESC',
  StrikeoutsPerBaseOnBallsAsc = 'STRIKEOUTS_PER_BASE_ON_BALLS_ASC',
  StrikeoutsPerBaseOnBallsDesc = 'STRIKEOUTS_PER_BASE_ON_BALLS_DESC',
  StrikeoutsPerNineAsc = 'STRIKEOUTS_PER_NINE_ASC',
  StrikeoutsPerNineDesc = 'STRIKEOUTS_PER_NINE_DESC',
  SvAsc = 'SV_ASC',
  SvDesc = 'SV_DESC',
  TeamAsc = 'TEAM_ASC',
  TeamDesc = 'TEAM_DESC',
  WhipAsc = 'WHIP_ASC',
  WhipDesc = 'WHIP_DESC',
  WinLossPercAsc = 'WIN_LOSS_PERC_ASC',
  WinLossPercDesc = 'WIN_LOSS_PERC_DESC',
  WpAsc = 'WP_ASC',
  WpDesc = 'WP_DESC',
  WAsc = 'W_ASC',
  WDesc = 'W_DESC'
}

export type Team = Node & {
  __typename?: 'Team';
  /** Reads and enables pagination through a set of `DraftTeam`. */
  draftTeamsByTeamIdAndLeagueId: DraftTeamsConnection;
  id: Scalars['Int']['output'];
  /** Reads a single `League` that is related to this `Team`. */
  league?: Maybe<League>;
  leagueId: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
};


export type TeamDraftTeamsByTeamIdAndLeagueIdArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<DraftTeamCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<DraftTeamsOrderBy>>;
};

/** A condition to be used against `Team` object types. All fields are tested for equality and combined with a logical ‘and.’ */
export type TeamCondition = {
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `leagueId` field. */
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `name` field. */
  name?: InputMaybe<Scalars['String']['input']>;
};

/** An input for mutations affecting `Team` */
export type TeamInput = {
  id?: InputMaybe<Scalars['Int']['input']>;
  leagueId: Scalars['Int']['input'];
  name: Scalars['String']['input'];
};

/** Represents an update to a `Team`. Fields that are set will be updated. */
export type TeamPatch = {
  id?: InputMaybe<Scalars['Int']['input']>;
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};

/** A connection to a list of `Team` values. */
export type TeamsConnection = {
  __typename?: 'TeamsConnection';
  /** A list of edges which contains the `Team` and cursor to aid in pagination. */
  edges: Array<TeamsEdge>;
  /** A list of `Team` objects. */
  nodes: Array<Maybe<Team>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `Team` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `Team` edge in the connection. */
export type TeamsEdge = {
  __typename?: 'TeamsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `Team` at the end of the edge. */
  node?: Maybe<Team>;
};

/** Methods to use when ordering `Team`. */
export enum TeamsOrderBy {
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  LeagueIdAsc = 'LEAGUE_ID_ASC',
  LeagueIdDesc = 'LEAGUE_ID_DESC',
  NameAsc = 'NAME_ASC',
  NameDesc = 'NAME_DESC',
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC'
}

/** An input for mutations affecting `UpdateBattingStatsInputRecord` */
export type UpdateBattingStatsInputRecordInput = {
  _2B?: InputMaybe<Scalars['Int']['input']>;
  _3B?: InputMaybe<Scalars['Int']['input']>;
  ab?: InputMaybe<Scalars['Int']['input']>;
  awardSummary?: InputMaybe<Scalars['String']['input']>;
  battingAvg?: InputMaybe<Scalars['Float']['input']>;
  bb?: InputMaybe<Scalars['Int']['input']>;
  cs?: InputMaybe<Scalars['Int']['input']>;
  g?: InputMaybe<Scalars['Int']['input']>;
  gidp?: InputMaybe<Scalars['Int']['input']>;
  h?: InputMaybe<Scalars['Int']['input']>;
  hbp?: InputMaybe<Scalars['Int']['input']>;
  hr?: InputMaybe<Scalars['Int']['input']>;
  ibb?: InputMaybe<Scalars['Int']['input']>;
  onbasePerc?: InputMaybe<Scalars['Float']['input']>;
  onbasePlusSlugging?: InputMaybe<Scalars['Float']['input']>;
  onbasePlusSluggingPlus?: InputMaybe<Scalars['Float']['input']>;
  pa?: InputMaybe<Scalars['Int']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  posSeason?: InputMaybe<Scalars['String']['input']>;
  r?: InputMaybe<Scalars['Int']['input']>;
  rbi?: InputMaybe<Scalars['Int']['input']>;
  sb?: InputMaybe<Scalars['Int']['input']>;
  sf?: InputMaybe<Scalars['String']['input']>;
  sh?: InputMaybe<Scalars['Int']['input']>;
  sluggingPerc?: InputMaybe<Scalars['Float']['input']>;
  so?: InputMaybe<Scalars['Int']['input']>;
  tb?: InputMaybe<Scalars['Int']['input']>;
};

/** All input for the `updateDraftByNodeId` mutation. */
export type UpdateDraftByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `Draft` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `Draft` being updated. */
  patch: DraftPatch;
};

/** All input for the `updateDraft` mutation. */
export type UpdateDraftInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `Draft` being updated. */
  patch: DraftPatch;
};

/** The output of our update `Draft` mutation. */
export type UpdateDraftPayload = {
  __typename?: 'UpdateDraftPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `Draft` that was updated by this mutation. */
  draft?: Maybe<Draft>;
  /** An edge for our `Draft`. May be used by Relay 1. */
  draftEdge?: Maybe<DraftsEdge>;
  /** Reads a single `League` that is related to this `Draft`. */
  league?: Maybe<League>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our update `Draft` mutation. */
export type UpdateDraftPayloadDraftEdgeArgs = {
  orderBy?: InputMaybe<Array<DraftsOrderBy>>;
};

/** All input for the `updateDraftTeamByDraftIdAndDraftOrder` mutation. */
export type UpdateDraftTeamByDraftIdAndDraftOrderInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  draftId: Scalars['Int']['input'];
  draftOrder: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `DraftTeam` being updated. */
  patch: DraftTeamPatch;
};

/** All input for the `updateDraftTeamByNodeId` mutation. */
export type UpdateDraftTeamByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `DraftTeam` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `DraftTeam` being updated. */
  patch: DraftTeamPatch;
};

/** All input for the `updateDraftTeam` mutation. */
export type UpdateDraftTeamInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  draftId: Scalars['Int']['input'];
  leagueId: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `DraftTeam` being updated. */
  patch: DraftTeamPatch;
  teamId: Scalars['Int']['input'];
};

/** The output of our update `DraftTeam` mutation. */
export type UpdateDraftTeamPayload = {
  __typename?: 'UpdateDraftTeamPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Draft` that is related to this `DraftTeam`. */
  draft?: Maybe<Draft>;
  /** The `DraftTeam` that was updated by this mutation. */
  draftTeam?: Maybe<DraftTeam>;
  /** An edge for our `DraftTeam`. May be used by Relay 1. */
  draftTeamEdge?: Maybe<DraftTeamsEdge>;
  /** Reads a single `League` that is related to this `DraftTeam`. */
  league?: Maybe<League>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `Team` that is related to this `DraftTeam`. */
  teamLeague?: Maybe<Team>;
};


/** The output of our update `DraftTeam` mutation. */
export type UpdateDraftTeamPayloadDraftTeamEdgeArgs = {
  orderBy?: InputMaybe<Array<DraftTeamsOrderBy>>;
};

/** An input for mutations affecting `UpdateFieldingStatsInputRecord` */
export type UpdateFieldingStatsInputRecordInput = {
  a?: InputMaybe<Scalars['Int']['input']>;
  awardSummary?: InputMaybe<Scalars['String']['input']>;
  caughtStealingPerc?: InputMaybe<Scalars['Float']['input']>;
  caughtStealingPercLg?: InputMaybe<Scalars['Float']['input']>;
  cg?: InputMaybe<Scalars['Int']['input']>;
  chances?: InputMaybe<Scalars['Float']['input']>;
  cs?: InputMaybe<Scalars['Int']['input']>;
  dpDef?: InputMaybe<Scalars['Int']['input']>;
  eDef?: InputMaybe<Scalars['Int']['input']>;
  fieldingPerc?: InputMaybe<Scalars['Float']['input']>;
  fieldingPercLg?: InputMaybe<Scalars['Float']['input']>;
  g?: InputMaybe<Scalars['Int']['input']>;
  gOfParts?: InputMaybe<Scalars['Int']['input']>;
  gs?: InputMaybe<Scalars['Int']['input']>;
  innDef?: InputMaybe<Scalars['Float']['input']>;
  lgId?: InputMaybe<Scalars['String']['input']>;
  pickoffs?: InputMaybe<Scalars['Int']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  po?: InputMaybe<Scalars['Int']['input']>;
  pos?: InputMaybe<Scalars['String']['input']>;
  rangeFactorPerGame?: InputMaybe<Scalars['Float']['input']>;
  rangeFactorPerGameLg?: InputMaybe<Scalars['Float']['input']>;
  rangeFactorPerNine?: InputMaybe<Scalars['Float']['input']>;
  rangeFactorPerNineLg?: InputMaybe<Scalars['Float']['input']>;
  sb?: InputMaybe<Scalars['Int']['input']>;
  wp?: InputMaybe<Scalars['Int']['input']>;
};

/** All input for the `updateLeagueByNodeId` mutation. */
export type UpdateLeagueByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `League` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `League` being updated. */
  patch: LeaguePatch;
};

/** All input for the `updateLeague` mutation. */
export type UpdateLeagueInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `League` being updated. */
  patch: LeaguePatch;
};

/** All input for the `updateLeagueMemberByNodeId` mutation. */
export type UpdateLeagueMemberByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `LeagueMember` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `LeagueMember` being updated. */
  patch: LeagueMemberPatch;
};

/** All input for the `updateLeagueMember` mutation. */
export type UpdateLeagueMemberInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  leagueId: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `LeagueMember` being updated. */
  patch: LeagueMemberPatch;
  userId: Scalars['Int']['input'];
};

/** The output of our update `LeagueMember` mutation. */
export type UpdateLeagueMemberPayload = {
  __typename?: 'UpdateLeagueMemberPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `LeagueMember`. */
  league?: Maybe<League>;
  /** The `LeagueMember` that was updated by this mutation. */
  leagueMember?: Maybe<LeagueMember>;
  /** An edge for our `LeagueMember`. May be used by Relay 1. */
  leagueMemberEdge?: Maybe<LeagueMembersEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `User` that is related to this `LeagueMember`. */
  user?: Maybe<User>;
};


/** The output of our update `LeagueMember` mutation. */
export type UpdateLeagueMemberPayloadLeagueMemberEdgeArgs = {
  orderBy?: InputMaybe<Array<LeagueMembersOrderBy>>;
};

/** All input for the `updateLeagueMessageByNodeId` mutation. */
export type UpdateLeagueMessageByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `LeagueMessage` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `LeagueMessage` being updated. */
  patch: LeagueMessagePatch;
};

/** All input for the `updateLeagueMessage` mutation. */
export type UpdateLeagueMessageInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `LeagueMessage` being updated. */
  patch: LeagueMessagePatch;
};

/** The output of our update `LeagueMessage` mutation. */
export type UpdateLeagueMessagePayload = {
  __typename?: 'UpdateLeagueMessagePayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `LeagueMessage`. */
  league?: Maybe<League>;
  /** The `LeagueMessage` that was updated by this mutation. */
  leagueMessage?: Maybe<LeagueMessage>;
  /** An edge for our `LeagueMessage`. May be used by Relay 1. */
  leagueMessageEdge?: Maybe<LeagueMessagesEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `User` that is related to this `LeagueMessage`. */
  user?: Maybe<User>;
  /** Reads a single `LeagueMember` that is related to this `LeagueMessage`. */
  userLeague?: Maybe<LeagueMember>;
};


/** The output of our update `LeagueMessage` mutation. */
export type UpdateLeagueMessagePayloadLeagueMessageEdgeArgs = {
  orderBy?: InputMaybe<Array<LeagueMessagesOrderBy>>;
};

/** The output of our update `League` mutation. */
export type UpdateLeaguePayload = {
  __typename?: 'UpdateLeaguePayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `League` that was updated by this mutation. */
  league?: Maybe<League>;
  /** An edge for our `League`. May be used by Relay 1. */
  leagueEdge?: Maybe<LeaguesEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our update `League` mutation. */
export type UpdateLeaguePayloadLeagueEdgeArgs = {
  orderBy?: InputMaybe<Array<LeaguesOrderBy>>;
};

/** An input for mutations affecting `UpdatePitchingStatsInputRecord` */
export type UpdatePitchingStatsInputRecordInput = {
  awardSummary?: InputMaybe<Scalars['String']['input']>;
  basesOnBallsPerNine?: InputMaybe<Scalars['Float']['input']>;
  battersFaced?: InputMaybe<Scalars['Int']['input']>;
  bb?: InputMaybe<Scalars['Int']['input']>;
  bk?: InputMaybe<Scalars['Int']['input']>;
  cg?: InputMaybe<Scalars['Int']['input']>;
  earnedRunAvg?: InputMaybe<Scalars['Float']['input']>;
  earnedRunAvgPlus?: InputMaybe<Scalars['Float']['input']>;
  er?: InputMaybe<Scalars['Int']['input']>;
  fip?: InputMaybe<Scalars['Float']['input']>;
  g?: InputMaybe<Scalars['Int']['input']>;
  gf?: InputMaybe<Scalars['Int']['input']>;
  gs?: InputMaybe<Scalars['Int']['input']>;
  h?: InputMaybe<Scalars['Int']['input']>;
  hbp?: InputMaybe<Scalars['Int']['input']>;
  hitsPerNine?: InputMaybe<Scalars['Float']['input']>;
  homeRunsPerNine?: InputMaybe<Scalars['Float']['input']>;
  hr?: InputMaybe<Scalars['Int']['input']>;
  ibb?: InputMaybe<Scalars['Int']['input']>;
  ip?: InputMaybe<Scalars['Float']['input']>;
  l?: InputMaybe<Scalars['Int']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  r?: InputMaybe<Scalars['Int']['input']>;
  sho?: InputMaybe<Scalars['Int']['input']>;
  so?: InputMaybe<Scalars['Int']['input']>;
  strikeoutsPerBaseOnBalls?: InputMaybe<Scalars['Float']['input']>;
  strikeoutsPerNine?: InputMaybe<Scalars['Float']['input']>;
  sv?: InputMaybe<Scalars['Int']['input']>;
  w?: InputMaybe<Scalars['Int']['input']>;
  whip?: InputMaybe<Scalars['Float']['input']>;
  winLossPerc?: InputMaybe<Scalars['Float']['input']>;
  wp?: InputMaybe<Scalars['Int']['input']>;
};

/** All input for the `updatePlayerByBrefId` mutation. */
export type UpdatePlayerByBrefIdInput = {
  brefId: Scalars['String']['input'];
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** An object where the defined keys will be set on the `Player` being updated. */
  patch: PlayerPatch;
};

/** All input for the `updatePlayerByNodeId` mutation. */
export type UpdatePlayerByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `Player` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `Player` being updated. */
  patch: PlayerPatch;
};

/** All input for the `updatePlayer` mutation. */
export type UpdatePlayerInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `Player` being updated. */
  patch: PlayerPatch;
};

/** The output of our update `Player` mutation. */
export type UpdatePlayerPayload = {
  __typename?: 'UpdatePlayerPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `Player` that was updated by this mutation. */
  player?: Maybe<Player>;
  /** An edge for our `Player`. May be used by Relay 1. */
  playerEdge?: Maybe<PlayersEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our update `Player` mutation. */
export type UpdatePlayerPayloadPlayerEdgeArgs = {
  orderBy?: InputMaybe<Array<PlayersOrderBy>>;
};

/** All input for the `updateSeasonBattingByNodeId` mutation. */
export type UpdateSeasonBattingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `SeasonBatting` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `SeasonBatting` being updated. */
  patch: SeasonBattingPatch;
};

/** All input for the `updateSeasonBatting` mutation. */
export type UpdateSeasonBattingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  lgId: Scalars['String']['input'];
  /** An object where the defined keys will be set on the `SeasonBatting` being updated. */
  patch: SeasonBattingPatch;
  playerId: Scalars['Int']['input'];
  season: Scalars['String']['input'];
  team: Scalars['String']['input'];
};

/** The output of our update `SeasonBatting` mutation. */
export type UpdateSeasonBattingPayload = {
  __typename?: 'UpdateSeasonBattingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Player` that is related to this `SeasonBatting`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `SeasonBatting` that was updated by this mutation. */
  seasonBatting?: Maybe<SeasonBatting>;
  /** An edge for our `SeasonBatting`. May be used by Relay 1. */
  seasonBattingEdge?: Maybe<SeasonBattingsEdge>;
};


/** The output of our update `SeasonBatting` mutation. */
export type UpdateSeasonBattingPayloadSeasonBattingEdgeArgs = {
  orderBy?: InputMaybe<Array<SeasonBattingsOrderBy>>;
};

/** All input for the `updateSeasonFieldingByNodeId` mutation. */
export type UpdateSeasonFieldingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `SeasonFielding` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `SeasonFielding` being updated. */
  patch: SeasonFieldingPatch;
};

/** All input for the `updateSeasonFielding` mutation. */
export type UpdateSeasonFieldingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  lgId: Scalars['String']['input'];
  /** An object where the defined keys will be set on the `SeasonFielding` being updated. */
  patch: SeasonFieldingPatch;
  playerId: Scalars['Int']['input'];
  pos: Scalars['String']['input'];
  season: Scalars['String']['input'];
  team: Scalars['String']['input'];
};

/** The output of our update `SeasonFielding` mutation. */
export type UpdateSeasonFieldingPayload = {
  __typename?: 'UpdateSeasonFieldingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Player` that is related to this `SeasonFielding`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `SeasonFielding` that was updated by this mutation. */
  seasonFielding?: Maybe<SeasonFielding>;
  /** An edge for our `SeasonFielding`. May be used by Relay 1. */
  seasonFieldingEdge?: Maybe<SeasonFieldingsEdge>;
};


/** The output of our update `SeasonFielding` mutation. */
export type UpdateSeasonFieldingPayloadSeasonFieldingEdgeArgs = {
  orderBy?: InputMaybe<Array<SeasonFieldingsOrderBy>>;
};

/** All input for the `updateSeasonPitchingByNodeId` mutation. */
export type UpdateSeasonPitchingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `SeasonPitching` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `SeasonPitching` being updated. */
  patch: SeasonPitchingPatch;
};

/** All input for the `updateSeasonPitching` mutation. */
export type UpdateSeasonPitchingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  lgId: Scalars['String']['input'];
  /** An object where the defined keys will be set on the `SeasonPitching` being updated. */
  patch: SeasonPitchingPatch;
  playerId: Scalars['Int']['input'];
  season: Scalars['String']['input'];
  team: Scalars['String']['input'];
};

/** The output of our update `SeasonPitching` mutation. */
export type UpdateSeasonPitchingPayload = {
  __typename?: 'UpdateSeasonPitchingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `SeasonPitching` that was updated by this mutation. */
  seasonPitching?: Maybe<SeasonPitching>;
  /** An edge for our `SeasonPitching`. May be used by Relay 1. */
  seasonPitchingEdge?: Maybe<SeasonPitchingsEdge>;
};


/** The output of our update `SeasonPitching` mutation. */
export type UpdateSeasonPitchingPayloadSeasonPitchingEdgeArgs = {
  orderBy?: InputMaybe<Array<SeasonPitchingsOrderBy>>;
};

/** All input for the `updateTeamByIdAndLeagueId` mutation. */
export type UpdateTeamByIdAndLeagueIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  leagueId: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `Team` being updated. */
  patch: TeamPatch;
};

/** All input for the `updateTeamByNodeId` mutation. */
export type UpdateTeamByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `Team` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `Team` being updated. */
  patch: TeamPatch;
};

/** All input for the `updateTeam` mutation. */
export type UpdateTeamInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `Team` being updated. */
  patch: TeamPatch;
};

/** The output of our update `Team` mutation. */
export type UpdateTeamPayload = {
  __typename?: 'UpdateTeamPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `Team`. */
  league?: Maybe<League>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `Team` that was updated by this mutation. */
  team?: Maybe<Team>;
  /** An edge for our `Team`. May be used by Relay 1. */
  teamEdge?: Maybe<TeamsEdge>;
};


/** The output of our update `Team` mutation. */
export type UpdateTeamPayloadTeamEdgeArgs = {
  orderBy?: InputMaybe<Array<TeamsOrderBy>>;
};

/** All input for the `updateUserByEmail` mutation. */
export type UpdateUserByEmailInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  email: Scalars['String']['input'];
  /** An object where the defined keys will be set on the `User` being updated. */
  patch: UserPatch;
};

/** All input for the `updateUserByNodeId` mutation. */
export type UpdateUserByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `User` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `User` being updated. */
  patch: UserPatch;
};

/** All input for the `updateUserByUsername` mutation. */
export type UpdateUserByUsernameInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** An object where the defined keys will be set on the `User` being updated. */
  patch: UserPatch;
  username: Scalars['String']['input'];
};

/** All input for the `updateUser` mutation. */
export type UpdateUserInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `User` being updated. */
  patch: UserPatch;
};

/** The output of our update `User` mutation. */
export type UpdateUserPayload = {
  __typename?: 'UpdateUserPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `User` that was updated by this mutation. */
  user?: Maybe<User>;
  /** An edge for our `User`. May be used by Relay 1. */
  userEdge?: Maybe<UsersEdge>;
};


/** The output of our update `User` mutation. */
export type UpdateUserPayloadUserEdgeArgs = {
  orderBy?: InputMaybe<Array<UsersOrderBy>>;
};

/** All input for the upsert `Draft` mutation. */
export type UpsertDraftInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `Draft` to be upserted by this mutation. */
  draft: DraftInput;
};

/** The output of our upsert `Draft` mutation. */
export type UpsertDraftPayload = {
  __typename?: 'UpsertDraftPayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `Draft` that was upserted by this mutation. */
  draft?: Maybe<Draft>;
  /** An edge for our `Draft`. May be used by Relay 1. */
  draftEdge?: Maybe<DraftsEdge>;
  /** Reads a single `League` that is related to this `Draft`. */
  league?: Maybe<League>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our upsert `Draft` mutation. */
export type UpsertDraftPayloadDraftEdgeArgs = {
  orderBy?: InputMaybe<Array<DraftsOrderBy>>;
};

/** All input for the upsert `DraftTeam` mutation. */
export type UpsertDraftTeamInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `DraftTeam` to be upserted by this mutation. */
  draftTeam: DraftTeamInput;
};

/** The output of our upsert `DraftTeam` mutation. */
export type UpsertDraftTeamPayload = {
  __typename?: 'UpsertDraftTeamPayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Draft` that is related to this `DraftTeam`. */
  draft?: Maybe<Draft>;
  /** The `DraftTeam` that was upserted by this mutation. */
  draftTeam?: Maybe<DraftTeam>;
  /** An edge for our `DraftTeam`. May be used by Relay 1. */
  draftTeamEdge?: Maybe<DraftTeamsEdge>;
  /** Reads a single `League` that is related to this `DraftTeam`. */
  league?: Maybe<League>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `Team` that is related to this `DraftTeam`. */
  teamLeague?: Maybe<Team>;
};


/** The output of our upsert `DraftTeam` mutation. */
export type UpsertDraftTeamPayloadDraftTeamEdgeArgs = {
  orderBy?: InputMaybe<Array<DraftTeamsOrderBy>>;
};

/** Where conditions for the upsert `DraftTeam` mutation. */
export type UpsertDraftTeamWhere = {
  draftId?: InputMaybe<Scalars['Int']['input']>;
  draftOrder?: InputMaybe<Scalars['Int']['input']>;
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  teamId?: InputMaybe<Scalars['Int']['input']>;
};

/** Where conditions for the upsert `Draft` mutation. */
export type UpsertDraftWhere = {
  id?: InputMaybe<Scalars['Int']['input']>;
};

/** All input for the upsert `League` mutation. */
export type UpsertLeagueInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `League` to be upserted by this mutation. */
  league: LeagueInput;
};

/** All input for the upsert `LeagueMember` mutation. */
export type UpsertLeagueMemberInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `LeagueMember` to be upserted by this mutation. */
  leagueMember: LeagueMemberInput;
};

/** The output of our upsert `LeagueMember` mutation. */
export type UpsertLeagueMemberPayload = {
  __typename?: 'UpsertLeagueMemberPayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `LeagueMember`. */
  league?: Maybe<League>;
  /** The `LeagueMember` that was upserted by this mutation. */
  leagueMember?: Maybe<LeagueMember>;
  /** An edge for our `LeagueMember`. May be used by Relay 1. */
  leagueMemberEdge?: Maybe<LeagueMembersEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `User` that is related to this `LeagueMember`. */
  user?: Maybe<User>;
};


/** The output of our upsert `LeagueMember` mutation. */
export type UpsertLeagueMemberPayloadLeagueMemberEdgeArgs = {
  orderBy?: InputMaybe<Array<LeagueMembersOrderBy>>;
};

/** Where conditions for the upsert `LeagueMember` mutation. */
export type UpsertLeagueMemberWhere = {
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  userId?: InputMaybe<Scalars['Int']['input']>;
};

/** All input for the upsert `LeagueMessage` mutation. */
export type UpsertLeagueMessageInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `LeagueMessage` to be upserted by this mutation. */
  leagueMessage: LeagueMessageInput;
};

/** The output of our upsert `LeagueMessage` mutation. */
export type UpsertLeagueMessagePayload = {
  __typename?: 'UpsertLeagueMessagePayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `LeagueMessage`. */
  league?: Maybe<League>;
  /** The `LeagueMessage` that was upserted by this mutation. */
  leagueMessage?: Maybe<LeagueMessage>;
  /** An edge for our `LeagueMessage`. May be used by Relay 1. */
  leagueMessageEdge?: Maybe<LeagueMessagesEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `User` that is related to this `LeagueMessage`. */
  user?: Maybe<User>;
  /** Reads a single `LeagueMember` that is related to this `LeagueMessage`. */
  userLeague?: Maybe<LeagueMember>;
};


/** The output of our upsert `LeagueMessage` mutation. */
export type UpsertLeagueMessagePayloadLeagueMessageEdgeArgs = {
  orderBy?: InputMaybe<Array<LeagueMessagesOrderBy>>;
};

/** Where conditions for the upsert `LeagueMessage` mutation. */
export type UpsertLeagueMessageWhere = {
  id?: InputMaybe<Scalars['Int']['input']>;
};

/** The output of our upsert `League` mutation. */
export type UpsertLeaguePayload = {
  __typename?: 'UpsertLeaguePayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `League` that was upserted by this mutation. */
  league?: Maybe<League>;
  /** An edge for our `League`. May be used by Relay 1. */
  leagueEdge?: Maybe<LeaguesEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our upsert `League` mutation. */
export type UpsertLeaguePayloadLeagueEdgeArgs = {
  orderBy?: InputMaybe<Array<LeaguesOrderBy>>;
};

/** Where conditions for the upsert `League` mutation. */
export type UpsertLeagueWhere = {
  id?: InputMaybe<Scalars['Int']['input']>;
};

/** All input for the upsert `Player` mutation. */
export type UpsertPlayerInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `Player` to be upserted by this mutation. */
  player: PlayerInput;
};

/** The output of our upsert `Player` mutation. */
export type UpsertPlayerPayload = {
  __typename?: 'UpsertPlayerPayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `Player` that was upserted by this mutation. */
  player?: Maybe<Player>;
  /** An edge for our `Player`. May be used by Relay 1. */
  playerEdge?: Maybe<PlayersEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our upsert `Player` mutation. */
export type UpsertPlayerPayloadPlayerEdgeArgs = {
  orderBy?: InputMaybe<Array<PlayersOrderBy>>;
};

/** Where conditions for the upsert `Player` mutation. */
export type UpsertPlayerWhere = {
  brefId?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
};

/** All input for the upsert `SeasonBatting` mutation. */
export type UpsertSeasonBattingInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `SeasonBatting` to be upserted by this mutation. */
  seasonBatting: SeasonBattingInput;
};

/** The output of our upsert `SeasonBatting` mutation. */
export type UpsertSeasonBattingPayload = {
  __typename?: 'UpsertSeasonBattingPayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Player` that is related to this `SeasonBatting`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `SeasonBatting` that was upserted by this mutation. */
  seasonBatting?: Maybe<SeasonBatting>;
  /** An edge for our `SeasonBatting`. May be used by Relay 1. */
  seasonBattingEdge?: Maybe<SeasonBattingsEdge>;
};


/** The output of our upsert `SeasonBatting` mutation. */
export type UpsertSeasonBattingPayloadSeasonBattingEdgeArgs = {
  orderBy?: InputMaybe<Array<SeasonBattingsOrderBy>>;
};

/** Where conditions for the upsert `SeasonBatting` mutation. */
export type UpsertSeasonBattingWhere = {
  lgId?: InputMaybe<Scalars['String']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['String']['input']>;
  team?: InputMaybe<Scalars['String']['input']>;
};

/** All input for the upsert `SeasonFielding` mutation. */
export type UpsertSeasonFieldingInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `SeasonFielding` to be upserted by this mutation. */
  seasonFielding: SeasonFieldingInput;
};

/** The output of our upsert `SeasonFielding` mutation. */
export type UpsertSeasonFieldingPayload = {
  __typename?: 'UpsertSeasonFieldingPayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Player` that is related to this `SeasonFielding`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `SeasonFielding` that was upserted by this mutation. */
  seasonFielding?: Maybe<SeasonFielding>;
  /** An edge for our `SeasonFielding`. May be used by Relay 1. */
  seasonFieldingEdge?: Maybe<SeasonFieldingsEdge>;
};


/** The output of our upsert `SeasonFielding` mutation. */
export type UpsertSeasonFieldingPayloadSeasonFieldingEdgeArgs = {
  orderBy?: InputMaybe<Array<SeasonFieldingsOrderBy>>;
};

/** Where conditions for the upsert `SeasonFielding` mutation. */
export type UpsertSeasonFieldingWhere = {
  lgId?: InputMaybe<Scalars['String']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  pos?: InputMaybe<Scalars['String']['input']>;
  season?: InputMaybe<Scalars['String']['input']>;
  team?: InputMaybe<Scalars['String']['input']>;
};

/** All input for the upsert `SeasonPitching` mutation. */
export type UpsertSeasonPitchingInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `SeasonPitching` to be upserted by this mutation. */
  seasonPitching: SeasonPitchingInput;
};

/** The output of our upsert `SeasonPitching` mutation. */
export type UpsertSeasonPitchingPayload = {
  __typename?: 'UpsertSeasonPitchingPayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `SeasonPitching` that was upserted by this mutation. */
  seasonPitching?: Maybe<SeasonPitching>;
  /** An edge for our `SeasonPitching`. May be used by Relay 1. */
  seasonPitchingEdge?: Maybe<SeasonPitchingsEdge>;
};


/** The output of our upsert `SeasonPitching` mutation. */
export type UpsertSeasonPitchingPayloadSeasonPitchingEdgeArgs = {
  orderBy?: InputMaybe<Array<SeasonPitchingsOrderBy>>;
};

/** Where conditions for the upsert `SeasonPitching` mutation. */
export type UpsertSeasonPitchingWhere = {
  lgId?: InputMaybe<Scalars['String']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['String']['input']>;
  team?: InputMaybe<Scalars['String']['input']>;
};

/** All input for the upsert `Team` mutation. */
export type UpsertTeamInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `Team` to be upserted by this mutation. */
  team: TeamInput;
};

/** The output of our upsert `Team` mutation. */
export type UpsertTeamPayload = {
  __typename?: 'UpsertTeamPayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `Team`. */
  league?: Maybe<League>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `Team` that was upserted by this mutation. */
  team?: Maybe<Team>;
  /** An edge for our `Team`. May be used by Relay 1. */
  teamEdge?: Maybe<TeamsEdge>;
};


/** The output of our upsert `Team` mutation. */
export type UpsertTeamPayloadTeamEdgeArgs = {
  orderBy?: InputMaybe<Array<TeamsOrderBy>>;
};

/** Where conditions for the upsert `Team` mutation. */
export type UpsertTeamWhere = {
  id?: InputMaybe<Scalars['Int']['input']>;
  leagueId?: InputMaybe<Scalars['Int']['input']>;
};

/** All input for the `upsertTypeIntoTable` mutation. */
export type UpsertTypeIntoTableInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  inputValues: Scalars['String']['input'];
  pkField: Scalars['String']['input'];
  tableName: Scalars['String']['input'];
  typeName: Scalars['String']['input'];
};

/** The output of our `upsertTypeIntoTable` mutation. */
export type UpsertTypeIntoTablePayload = {
  __typename?: 'UpsertTypeIntoTablePayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};

/** All input for the upsert `User` mutation. */
export type UpsertUserInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `User` to be upserted by this mutation. */
  user: UserInput;
};

/** The output of our upsert `User` mutation. */
export type UpsertUserPayload = {
  __typename?: 'UpsertUserPayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** The `User` that was upserted by this mutation. */
  user?: Maybe<User>;
  /** An edge for our `User`. May be used by Relay 1. */
  userEdge?: Maybe<UsersEdge>;
};


/** The output of our upsert `User` mutation. */
export type UpsertUserPayloadUserEdgeArgs = {
  orderBy?: InputMaybe<Array<UsersOrderBy>>;
};

/** Where conditions for the upsert `User` mutation. */
export type UpsertUserWhere = {
  email?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  username?: InputMaybe<Scalars['String']['input']>;
};

export type User = Node & {
  __typename?: 'User';
  about?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['Datetime']['output'];
  email: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  isAdmin: Scalars['Boolean']['output'];
  /** Reads and enables pagination through a set of `LeagueMember`. */
  leagueMembers: LeagueMembersConnection;
  /** Reads and enables pagination through a set of `LeagueMessage`. */
  leagueMessages: LeagueMessagesConnection;
  name: Scalars['String']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  updatedAt: Scalars['Datetime']['output'];
  username: Scalars['String']['output'];
};


export type UserLeagueMembersArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<LeagueMemberCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LeagueMembersOrderBy>>;
};


export type UserLeagueMessagesArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<LeagueMessageCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LeagueMessagesOrderBy>>;
};

/** A condition to be used against `User` object types. All fields are tested for equality and combined with a logical ‘and.’ */
export type UserCondition = {
  /** Checks for equality with the object’s `about` field. */
  about?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `createdAt` field. */
  createdAt?: InputMaybe<Scalars['Datetime']['input']>;
  /** Checks for equality with the object’s `email` field. */
  email?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `isAdmin` field. */
  isAdmin?: InputMaybe<Scalars['Boolean']['input']>;
  /** Checks for equality with the object’s `name` field. */
  name?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `updatedAt` field. */
  updatedAt?: InputMaybe<Scalars['Datetime']['input']>;
  /** Checks for equality with the object’s `username` field. */
  username?: InputMaybe<Scalars['String']['input']>;
};

/** An input for mutations affecting `User` */
export type UserInput = {
  about?: InputMaybe<Scalars['String']['input']>;
  createdAt?: InputMaybe<Scalars['Datetime']['input']>;
  email: Scalars['String']['input'];
  id?: InputMaybe<Scalars['Int']['input']>;
  isAdmin?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
  updatedAt?: InputMaybe<Scalars['Datetime']['input']>;
  username: Scalars['String']['input'];
};

/** Represents an update to a `User`. Fields that are set will be updated. */
export type UserPatch = {
  about?: InputMaybe<Scalars['String']['input']>;
  createdAt?: InputMaybe<Scalars['Datetime']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  isAdmin?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  updatedAt?: InputMaybe<Scalars['Datetime']['input']>;
  username?: InputMaybe<Scalars['String']['input']>;
};

/** A connection to a list of `User` values. */
export type UsersConnection = {
  __typename?: 'UsersConnection';
  /** A list of edges which contains the `User` and cursor to aid in pagination. */
  edges: Array<UsersEdge>;
  /** A list of `User` objects. */
  nodes: Array<Maybe<User>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `User` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `User` edge in the connection. */
export type UsersEdge = {
  __typename?: 'UsersEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `User` at the end of the edge. */
  node?: Maybe<User>;
};

/** Methods to use when ordering `User`. */
export enum UsersOrderBy {
  AboutAsc = 'ABOUT_ASC',
  AboutDesc = 'ABOUT_DESC',
  CreatedAtAsc = 'CREATED_AT_ASC',
  CreatedAtDesc = 'CREATED_AT_DESC',
  EmailAsc = 'EMAIL_ASC',
  EmailDesc = 'EMAIL_DESC',
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  IsAdminAsc = 'IS_ADMIN_ASC',
  IsAdminDesc = 'IS_ADMIN_DESC',
  NameAsc = 'NAME_ASC',
  NameDesc = 'NAME_DESC',
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  UpdatedAtAsc = 'UPDATED_AT_ASC',
  UpdatedAtDesc = 'UPDATED_AT_DESC',
  UsernameAsc = 'USERNAME_ASC',
  UsernameDesc = 'USERNAME_DESC'
}

export type BulkUpdateStatsPayloadKeySpecifier = ('clientMutationId' | 'players' | 'query' | BulkUpdateStatsPayloadKeySpecifier)[];
export type BulkUpdateStatsPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	players?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateDraftPayloadKeySpecifier = ('clientMutationId' | 'draft' | 'draftEdge' | 'league' | 'query' | CreateDraftPayloadKeySpecifier)[];
export type CreateDraftPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateDraftTeamPayloadKeySpecifier = ('clientMutationId' | 'draft' | 'draftTeam' | 'draftTeamEdge' | 'league' | 'query' | 'teamLeague' | CreateDraftTeamPayloadKeySpecifier)[];
export type CreateDraftTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	teamLeague?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateLeagueAndTeamsPayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueEdge' | 'query' | CreateLeagueAndTeamsPayloadKeySpecifier)[];
export type CreateLeagueAndTeamsPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateLeagueMemberPayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueMember' | 'leagueMemberEdge' | 'query' | 'user' | CreateLeagueMemberPayloadKeySpecifier)[];
export type CreateLeagueMemberPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMemberEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateLeagueMessagePayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueMessage' | 'leagueMessageEdge' | 'query' | 'user' | 'userLeague' | CreateLeagueMessagePayloadKeySpecifier)[];
export type CreateLeagueMessagePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessageEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>,
	userLeague?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateLeaguePayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueEdge' | 'query' | CreateLeaguePayloadKeySpecifier)[];
export type CreateLeaguePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreatePlayerPayloadKeySpecifier = ('clientMutationId' | 'player' | 'playerEdge' | 'query' | CreatePlayerPayloadKeySpecifier)[];
export type CreatePlayerPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreatePlayersPayloadKeySpecifier = ('clientMutationId' | 'players' | 'query' | CreatePlayersPayloadKeySpecifier)[];
export type CreatePlayersPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	players?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateSeasonBattingPayloadKeySpecifier = ('clientMutationId' | 'player' | 'query' | 'seasonBatting' | 'seasonBattingEdge' | CreateSeasonBattingPayloadKeySpecifier)[];
export type CreateSeasonBattingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonBattingEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateSeasonFieldingPayloadKeySpecifier = ('clientMutationId' | 'player' | 'query' | 'seasonFielding' | 'seasonFieldingEdge' | CreateSeasonFieldingPayloadKeySpecifier)[];
export type CreateSeasonFieldingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonFieldingEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateSeasonPitchingPayloadKeySpecifier = ('clientMutationId' | 'query' | 'seasonPitching' | 'seasonPitchingEdge' | CreateSeasonPitchingPayloadKeySpecifier)[];
export type CreateSeasonPitchingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitchingEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateTeamPayloadKeySpecifier = ('clientMutationId' | 'league' | 'query' | 'team' | 'teamEdge' | CreateTeamPayloadKeySpecifier)[];
export type CreateTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	team?: FieldPolicy<any> | FieldReadFunction<any>,
	teamEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateUserPayloadKeySpecifier = ('clientMutationId' | 'query' | 'user' | 'userEdge' | CreateUserPayloadKeySpecifier)[];
export type CreateUserPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>,
	userEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteDraftPayloadKeySpecifier = ('clientMutationId' | 'deletedDraftNodeId' | 'draft' | 'draftEdge' | 'league' | 'query' | DeleteDraftPayloadKeySpecifier)[];
export type DeleteDraftPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedDraftNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteDraftTeamPayloadKeySpecifier = ('clientMutationId' | 'deletedDraftTeamNodeId' | 'draft' | 'draftTeam' | 'draftTeamEdge' | 'league' | 'query' | 'teamLeague' | DeleteDraftTeamPayloadKeySpecifier)[];
export type DeleteDraftTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedDraftTeamNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	teamLeague?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteLeagueMemberPayloadKeySpecifier = ('clientMutationId' | 'deletedLeagueMemberNodeId' | 'league' | 'leagueMember' | 'leagueMemberEdge' | 'query' | 'user' | DeleteLeagueMemberPayloadKeySpecifier)[];
export type DeleteLeagueMemberPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedLeagueMemberNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMemberEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteLeagueMessagePayloadKeySpecifier = ('clientMutationId' | 'deletedLeagueMessageNodeId' | 'league' | 'leagueMessage' | 'leagueMessageEdge' | 'query' | 'user' | 'userLeague' | DeleteLeagueMessagePayloadKeySpecifier)[];
export type DeleteLeagueMessagePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedLeagueMessageNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessageEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>,
	userLeague?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteLeaguePayloadKeySpecifier = ('clientMutationId' | 'deletedLeagueNodeId' | 'league' | 'leagueEdge' | 'query' | DeleteLeaguePayloadKeySpecifier)[];
export type DeleteLeaguePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedLeagueNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeletePlayerPayloadKeySpecifier = ('clientMutationId' | 'deletedPlayerNodeId' | 'player' | 'playerEdge' | 'query' | DeletePlayerPayloadKeySpecifier)[];
export type DeletePlayerPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedPlayerNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteSeasonBattingPayloadKeySpecifier = ('clientMutationId' | 'deletedSeasonBattingNodeId' | 'player' | 'query' | 'seasonBatting' | 'seasonBattingEdge' | DeleteSeasonBattingPayloadKeySpecifier)[];
export type DeleteSeasonBattingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedSeasonBattingNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonBattingEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteSeasonFieldingPayloadKeySpecifier = ('clientMutationId' | 'deletedSeasonFieldingNodeId' | 'player' | 'query' | 'seasonFielding' | 'seasonFieldingEdge' | DeleteSeasonFieldingPayloadKeySpecifier)[];
export type DeleteSeasonFieldingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedSeasonFieldingNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonFieldingEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteSeasonPitchingPayloadKeySpecifier = ('clientMutationId' | 'deletedSeasonPitchingNodeId' | 'query' | 'seasonPitching' | 'seasonPitchingEdge' | DeleteSeasonPitchingPayloadKeySpecifier)[];
export type DeleteSeasonPitchingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedSeasonPitchingNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitchingEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteTeamPayloadKeySpecifier = ('clientMutationId' | 'deletedTeamNodeId' | 'league' | 'query' | 'team' | 'teamEdge' | DeleteTeamPayloadKeySpecifier)[];
export type DeleteTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedTeamNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	team?: FieldPolicy<any> | FieldReadFunction<any>,
	teamEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteUserPayloadKeySpecifier = ('clientMutationId' | 'deletedUserNodeId' | 'query' | 'user' | 'userEdge' | DeleteUserPayloadKeySpecifier)[];
export type DeleteUserPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedUserNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>,
	userEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DraftKeySpecifier = ('date' | 'draftOrder' | 'draftTeams' | 'draftType' | 'id' | 'league' | 'leagueId' | 'nodeId' | DraftKeySpecifier)[];
export type DraftFieldPolicy = {
	date?: FieldPolicy<any> | FieldReadFunction<any>,
	draftOrder?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeams?: FieldPolicy<any> | FieldReadFunction<any>,
	draftType?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DraftTeamKeySpecifier = ('draft' | 'draftId' | 'draftOrder' | 'league' | 'leagueId' | 'nodeId' | 'teamId' | 'teamLeague' | DraftTeamKeySpecifier)[];
export type DraftTeamFieldPolicy = {
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftId?: FieldPolicy<any> | FieldReadFunction<any>,
	draftOrder?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	teamId?: FieldPolicy<any> | FieldReadFunction<any>,
	teamLeague?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DraftTeamsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | DraftTeamsConnectionKeySpecifier)[];
export type DraftTeamsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DraftTeamsEdgeKeySpecifier = ('cursor' | 'node' | DraftTeamsEdgeKeySpecifier)[];
export type DraftTeamsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DraftsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | DraftsConnectionKeySpecifier)[];
export type DraftsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DraftsEdgeKeySpecifier = ('cursor' | 'node' | DraftsEdgeKeySpecifier)[];
export type DraftsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type LeagueKeySpecifier = ('draftTeams' | 'drafts' | 'id' | 'leagueMembers' | 'leagueMessages' | 'name' | 'nodeId' | 'owner' | 'teams' | LeagueKeySpecifier)[];
export type LeagueFieldPolicy = {
	draftTeams?: FieldPolicy<any> | FieldReadFunction<any>,
	drafts?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMembers?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessages?: FieldPolicy<any> | FieldReadFunction<any>,
	name?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	owner?: FieldPolicy<any> | FieldReadFunction<any>,
	teams?: FieldPolicy<any> | FieldReadFunction<any>
};
export type LeagueMemberKeySpecifier = ('league' | 'leagueId' | 'leagueMessagesByUserIdAndLeagueId' | 'nodeId' | 'permissionLevel' | 'teamId' | 'user' | 'userId' | LeagueMemberKeySpecifier)[];
export type LeagueMemberFieldPolicy = {
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessagesByUserIdAndLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	permissionLevel?: FieldPolicy<any> | FieldReadFunction<any>,
	teamId?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>,
	userId?: FieldPolicy<any> | FieldReadFunction<any>
};
export type LeagueMembersConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | LeagueMembersConnectionKeySpecifier)[];
export type LeagueMembersConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type LeagueMembersEdgeKeySpecifier = ('cursor' | 'node' | LeagueMembersEdgeKeySpecifier)[];
export type LeagueMembersEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type LeagueMessageKeySpecifier = ('id' | 'league' | 'leagueId' | 'messageText' | 'nodeId' | 'timestamp' | 'user' | 'userId' | 'userLeague' | LeagueMessageKeySpecifier)[];
export type LeagueMessageFieldPolicy = {
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	messageText?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	timestamp?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>,
	userId?: FieldPolicy<any> | FieldReadFunction<any>,
	userLeague?: FieldPolicy<any> | FieldReadFunction<any>
};
export type LeagueMessagesConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | LeagueMessagesConnectionKeySpecifier)[];
export type LeagueMessagesConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type LeagueMessagesEdgeKeySpecifier = ('cursor' | 'node' | LeagueMessagesEdgeKeySpecifier)[];
export type LeagueMessagesEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type LeaguesConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | LeaguesConnectionKeySpecifier)[];
export type LeaguesConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type LeaguesEdgeKeySpecifier = ('cursor' | 'node' | LeaguesEdgeKeySpecifier)[];
export type LeaguesEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MutationKeySpecifier = ('bulkUpdateStats' | 'createDraft' | 'createDraftTeam' | 'createLeague' | 'createLeagueAndTeams' | 'createLeagueMember' | 'createLeagueMessage' | 'createPlayer' | 'createPlayers' | 'createSeasonBatting' | 'createSeasonFielding' | 'createSeasonPitching' | 'createTeam' | 'createUser' | 'deleteDraft' | 'deleteDraftByNodeId' | 'deleteDraftTeam' | 'deleteDraftTeamByDraftIdAndDraftOrder' | 'deleteDraftTeamByNodeId' | 'deleteLeague' | 'deleteLeagueByNodeId' | 'deleteLeagueMember' | 'deleteLeagueMemberByNodeId' | 'deleteLeagueMessage' | 'deleteLeagueMessageByNodeId' | 'deletePlayer' | 'deletePlayerByBrefId' | 'deletePlayerByNodeId' | 'deleteSeasonBatting' | 'deleteSeasonBattingByNodeId' | 'deleteSeasonFielding' | 'deleteSeasonFieldingByNodeId' | 'deleteSeasonPitching' | 'deleteSeasonPitchingByNodeId' | 'deleteTeam' | 'deleteTeamByIdAndLeagueId' | 'deleteTeamByNodeId' | 'deleteUser' | 'deleteUserByEmail' | 'deleteUserByNodeId' | 'deleteUserByUsername' | 'updateDraft' | 'updateDraftByNodeId' | 'updateDraftTeam' | 'updateDraftTeamByDraftIdAndDraftOrder' | 'updateDraftTeamByNodeId' | 'updateLeague' | 'updateLeagueByNodeId' | 'updateLeagueMember' | 'updateLeagueMemberByNodeId' | 'updateLeagueMessage' | 'updateLeagueMessageByNodeId' | 'updatePlayer' | 'updatePlayerByBrefId' | 'updatePlayerByNodeId' | 'updateSeasonBatting' | 'updateSeasonBattingByNodeId' | 'updateSeasonFielding' | 'updateSeasonFieldingByNodeId' | 'updateSeasonPitching' | 'updateSeasonPitchingByNodeId' | 'updateTeam' | 'updateTeamByIdAndLeagueId' | 'updateTeamByNodeId' | 'updateUser' | 'updateUserByEmail' | 'updateUserByNodeId' | 'updateUserByUsername' | 'upsertDraft' | 'upsertDraftTeam' | 'upsertLeague' | 'upsertLeagueMember' | 'upsertLeagueMessage' | 'upsertPlayer' | 'upsertSeasonBatting' | 'upsertSeasonFielding' | 'upsertSeasonPitching' | 'upsertTeam' | 'upsertTypeIntoTable' | 'upsertUser' | MutationKeySpecifier)[];
export type MutationFieldPolicy = {
	bulkUpdateStats?: FieldPolicy<any> | FieldReadFunction<any>,
	createDraft?: FieldPolicy<any> | FieldReadFunction<any>,
	createDraftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	createLeague?: FieldPolicy<any> | FieldReadFunction<any>,
	createLeagueAndTeams?: FieldPolicy<any> | FieldReadFunction<any>,
	createLeagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	createLeagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	createPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	createPlayers?: FieldPolicy<any> | FieldReadFunction<any>,
	createSeasonBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	createSeasonFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	createSeasonPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	createTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	createUser?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraft?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraftByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraftTeamByDraftIdAndDraftOrder?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraftTeamByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeague?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeagueByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeagueMemberByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeagueMessageByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletePlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	deletePlayerByBrefId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletePlayerByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteSeasonBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteSeasonBattingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteSeasonFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteSeasonFieldingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteSeasonPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteSeasonPitchingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteTeamByIdAndLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteTeamByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteUser?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteUserByEmail?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteUserByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteUserByUsername?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraft?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraftByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraftTeamByDraftIdAndDraftOrder?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraftTeamByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeague?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeagueByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeagueMemberByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeagueMessageByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updatePlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	updatePlayerByBrefId?: FieldPolicy<any> | FieldReadFunction<any>,
	updatePlayerByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateSeasonBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	updateSeasonBattingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateSeasonFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	updateSeasonFieldingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateSeasonPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	updateSeasonPitchingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	updateTeamByIdAndLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateTeamByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateUser?: FieldPolicy<any> | FieldReadFunction<any>,
	updateUserByEmail?: FieldPolicy<any> | FieldReadFunction<any>,
	updateUserByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateUserByUsername?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertDraft?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertDraftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertLeague?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertLeagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertLeagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertSeasonBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertSeasonFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertSeasonPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertTypeIntoTable?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertUser?: FieldPolicy<any> | FieldReadFunction<any>
};
export type NodeKeySpecifier = ('nodeId' | NodeKeySpecifier)[];
export type NodeFieldPolicy = {
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>
};
export type PageInfoKeySpecifier = ('endCursor' | 'hasNextPage' | 'hasPreviousPage' | 'startCursor' | PageInfoKeySpecifier)[];
export type PageInfoFieldPolicy = {
	endCursor?: FieldPolicy<any> | FieldReadFunction<any>,
	hasNextPage?: FieldPolicy<any> | FieldReadFunction<any>,
	hasPreviousPage?: FieldPolicy<any> | FieldReadFunction<any>,
	startCursor?: FieldPolicy<any> | FieldReadFunction<any>
};
export type PgAttributeKeySpecifier = ('attacl' | 'attalign' | 'attbyval' | 'attcacheoff' | 'attcollation' | 'attcompression' | 'attfdwoptions' | 'attgenerated' | 'atthasdef' | 'atthasmissing' | 'attidentity' | 'attinhcount' | 'attisdropped' | 'attislocal' | 'attlen' | 'attmissingval' | 'attname' | 'attndims' | 'attnotnull' | 'attnum' | 'attoptions' | 'attrelid' | 'attstattarget' | 'attstorage' | 'atttypid' | 'atttypmod' | PgAttributeKeySpecifier)[];
export type PgAttributeFieldPolicy = {
	attacl?: FieldPolicy<any> | FieldReadFunction<any>,
	attalign?: FieldPolicy<any> | FieldReadFunction<any>,
	attbyval?: FieldPolicy<any> | FieldReadFunction<any>,
	attcacheoff?: FieldPolicy<any> | FieldReadFunction<any>,
	attcollation?: FieldPolicy<any> | FieldReadFunction<any>,
	attcompression?: FieldPolicy<any> | FieldReadFunction<any>,
	attfdwoptions?: FieldPolicy<any> | FieldReadFunction<any>,
	attgenerated?: FieldPolicy<any> | FieldReadFunction<any>,
	atthasdef?: FieldPolicy<any> | FieldReadFunction<any>,
	atthasmissing?: FieldPolicy<any> | FieldReadFunction<any>,
	attidentity?: FieldPolicy<any> | FieldReadFunction<any>,
	attinhcount?: FieldPolicy<any> | FieldReadFunction<any>,
	attisdropped?: FieldPolicy<any> | FieldReadFunction<any>,
	attislocal?: FieldPolicy<any> | FieldReadFunction<any>,
	attlen?: FieldPolicy<any> | FieldReadFunction<any>,
	attmissingval?: FieldPolicy<any> | FieldReadFunction<any>,
	attname?: FieldPolicy<any> | FieldReadFunction<any>,
	attndims?: FieldPolicy<any> | FieldReadFunction<any>,
	attnotnull?: FieldPolicy<any> | FieldReadFunction<any>,
	attnum?: FieldPolicy<any> | FieldReadFunction<any>,
	attoptions?: FieldPolicy<any> | FieldReadFunction<any>,
	attrelid?: FieldPolicy<any> | FieldReadFunction<any>,
	attstattarget?: FieldPolicy<any> | FieldReadFunction<any>,
	attstorage?: FieldPolicy<any> | FieldReadFunction<any>,
	atttypid?: FieldPolicy<any> | FieldReadFunction<any>,
	atttypmod?: FieldPolicy<any> | FieldReadFunction<any>
};
export type PgAttributesConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | PgAttributesConnectionKeySpecifier)[];
export type PgAttributesConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type PgAttributesEdgeKeySpecifier = ('cursor' | 'node' | PgAttributesEdgeKeySpecifier)[];
export type PgAttributesEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type PlayerKeySpecifier = ('brefId' | 'id' | 'name' | 'nodeId' | 'seasonBattings' | 'seasonFieldings' | PlayerKeySpecifier)[];
export type PlayerFieldPolicy = {
	brefId?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	name?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonBattings?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonFieldings?: FieldPolicy<any> | FieldReadFunction<any>
};
export type PlayersConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | PlayersConnectionKeySpecifier)[];
export type PlayersConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type PlayersEdgeKeySpecifier = ('cursor' | 'node' | PlayersEdgeKeySpecifier)[];
export type PlayersEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type QueryKeySpecifier = ('draft' | 'draftByNodeId' | 'draftTeam' | 'draftTeamByDraftIdAndDraftOrder' | 'draftTeamByNodeId' | 'draftTeams' | 'drafts' | 'getColumnsForType' | 'league' | 'leagueByNodeId' | 'leagueMember' | 'leagueMemberByNodeId' | 'leagueMembers' | 'leagueMessage' | 'leagueMessageByNodeId' | 'leagueMessages' | 'leagues' | 'node' | 'nodeId' | 'player' | 'playerByBrefId' | 'playerByNodeId' | 'players' | 'query' | 'seasonBatting' | 'seasonBattingByNodeId' | 'seasonBattings' | 'seasonFielding' | 'seasonFieldingByNodeId' | 'seasonFieldings' | 'seasonPitching' | 'seasonPitchingByNodeId' | 'seasonPitchings' | 'team' | 'teamByIdAndLeagueId' | 'teamByNodeId' | 'teams' | 'user' | 'userByEmail' | 'userByNodeId' | 'userByUsername' | 'users' | QueryKeySpecifier)[];
export type QueryFieldPolicy = {
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamByDraftIdAndDraftOrder?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeams?: FieldPolicy<any> | FieldReadFunction<any>,
	drafts?: FieldPolicy<any> | FieldReadFunction<any>,
	getColumnsForType?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMemberByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMembers?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessageByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessages?: FieldPolicy<any> | FieldReadFunction<any>,
	leagues?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerByBrefId?: FieldPolicy<any> | FieldReadFunction<any>,
	playerByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	players?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonBattingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonBattings?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonFieldingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonFieldings?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitchingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitchings?: FieldPolicy<any> | FieldReadFunction<any>,
	team?: FieldPolicy<any> | FieldReadFunction<any>,
	teamByIdAndLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	teamByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	teams?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>,
	userByEmail?: FieldPolicy<any> | FieldReadFunction<any>,
	userByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	userByUsername?: FieldPolicy<any> | FieldReadFunction<any>,
	users?: FieldPolicy<any> | FieldReadFunction<any>
};
export type SeasonBattingKeySpecifier = ('ab' | 'awardSummary' | 'battingAvg' | 'bb' | 'cs' | 'doubles' | 'g' | 'gidp' | 'h' | 'hbp' | 'hr' | 'ibb' | 'lgId' | 'nodeId' | 'onbasePerc' | 'onbasePlusSlugging' | 'onbasePlusSluggingPlus' | 'pa' | 'player' | 'playerId' | 'posSeason' | 'r' | 'rbi' | 'sb' | 'season' | 'sf' | 'sh' | 'sluggingPerc' | 'so' | 'tb' | 'team' | 'triples' | SeasonBattingKeySpecifier)[];
export type SeasonBattingFieldPolicy = {
	ab?: FieldPolicy<any> | FieldReadFunction<any>,
	awardSummary?: FieldPolicy<any> | FieldReadFunction<any>,
	battingAvg?: FieldPolicy<any> | FieldReadFunction<any>,
	bb?: FieldPolicy<any> | FieldReadFunction<any>,
	cs?: FieldPolicy<any> | FieldReadFunction<any>,
	doubles?: FieldPolicy<any> | FieldReadFunction<any>,
	g?: FieldPolicy<any> | FieldReadFunction<any>,
	gidp?: FieldPolicy<any> | FieldReadFunction<any>,
	h?: FieldPolicy<any> | FieldReadFunction<any>,
	hbp?: FieldPolicy<any> | FieldReadFunction<any>,
	hr?: FieldPolicy<any> | FieldReadFunction<any>,
	ibb?: FieldPolicy<any> | FieldReadFunction<any>,
	lgId?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	onbasePerc?: FieldPolicy<any> | FieldReadFunction<any>,
	onbasePlusSlugging?: FieldPolicy<any> | FieldReadFunction<any>,
	onbasePlusSluggingPlus?: FieldPolicy<any> | FieldReadFunction<any>,
	pa?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	posSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	r?: FieldPolicy<any> | FieldReadFunction<any>,
	rbi?: FieldPolicy<any> | FieldReadFunction<any>,
	sb?: FieldPolicy<any> | FieldReadFunction<any>,
	season?: FieldPolicy<any> | FieldReadFunction<any>,
	sf?: FieldPolicy<any> | FieldReadFunction<any>,
	sh?: FieldPolicy<any> | FieldReadFunction<any>,
	sluggingPerc?: FieldPolicy<any> | FieldReadFunction<any>,
	so?: FieldPolicy<any> | FieldReadFunction<any>,
	tb?: FieldPolicy<any> | FieldReadFunction<any>,
	team?: FieldPolicy<any> | FieldReadFunction<any>,
	triples?: FieldPolicy<any> | FieldReadFunction<any>
};
export type SeasonBattingsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | SeasonBattingsConnectionKeySpecifier)[];
export type SeasonBattingsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type SeasonBattingsEdgeKeySpecifier = ('cursor' | 'node' | SeasonBattingsEdgeKeySpecifier)[];
export type SeasonBattingsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type SeasonFieldingKeySpecifier = ('a' | 'awardSummary' | 'caughtStealingPerc' | 'caughtStealingPercLg' | 'cg' | 'chances' | 'cs' | 'dpDef' | 'eDef' | 'fieldingPerc' | 'fieldingPercLg' | 'g' | 'gOfParts' | 'gs' | 'innDef' | 'lgId' | 'nodeId' | 'pickoffs' | 'player' | 'playerId' | 'po' | 'pos' | 'rangeFactorPerGame' | 'rangeFactorPerGameLg' | 'rangeFactorPerNine' | 'rangeFactorPerNineLg' | 'sb' | 'season' | 'team' | 'wp' | SeasonFieldingKeySpecifier)[];
export type SeasonFieldingFieldPolicy = {
	a?: FieldPolicy<any> | FieldReadFunction<any>,
	awardSummary?: FieldPolicy<any> | FieldReadFunction<any>,
	caughtStealingPerc?: FieldPolicy<any> | FieldReadFunction<any>,
	caughtStealingPercLg?: FieldPolicy<any> | FieldReadFunction<any>,
	cg?: FieldPolicy<any> | FieldReadFunction<any>,
	chances?: FieldPolicy<any> | FieldReadFunction<any>,
	cs?: FieldPolicy<any> | FieldReadFunction<any>,
	dpDef?: FieldPolicy<any> | FieldReadFunction<any>,
	eDef?: FieldPolicy<any> | FieldReadFunction<any>,
	fieldingPerc?: FieldPolicy<any> | FieldReadFunction<any>,
	fieldingPercLg?: FieldPolicy<any> | FieldReadFunction<any>,
	g?: FieldPolicy<any> | FieldReadFunction<any>,
	gOfParts?: FieldPolicy<any> | FieldReadFunction<any>,
	gs?: FieldPolicy<any> | FieldReadFunction<any>,
	innDef?: FieldPolicy<any> | FieldReadFunction<any>,
	lgId?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	pickoffs?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	po?: FieldPolicy<any> | FieldReadFunction<any>,
	pos?: FieldPolicy<any> | FieldReadFunction<any>,
	rangeFactorPerGame?: FieldPolicy<any> | FieldReadFunction<any>,
	rangeFactorPerGameLg?: FieldPolicy<any> | FieldReadFunction<any>,
	rangeFactorPerNine?: FieldPolicy<any> | FieldReadFunction<any>,
	rangeFactorPerNineLg?: FieldPolicy<any> | FieldReadFunction<any>,
	sb?: FieldPolicy<any> | FieldReadFunction<any>,
	season?: FieldPolicy<any> | FieldReadFunction<any>,
	team?: FieldPolicy<any> | FieldReadFunction<any>,
	wp?: FieldPolicy<any> | FieldReadFunction<any>
};
export type SeasonFieldingsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | SeasonFieldingsConnectionKeySpecifier)[];
export type SeasonFieldingsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type SeasonFieldingsEdgeKeySpecifier = ('cursor' | 'node' | SeasonFieldingsEdgeKeySpecifier)[];
export type SeasonFieldingsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type SeasonPitchingKeySpecifier = ('awardSummary' | 'basesOnBallsPerNine' | 'battersFaced' | 'bb' | 'bk' | 'cg' | 'earnedRunAvg' | 'earnedRunAvgPlus' | 'er' | 'fip' | 'g' | 'gf' | 'gs' | 'h' | 'hbp' | 'hitsPerNine' | 'homeRunsPerNine' | 'hr' | 'ibb' | 'ip' | 'l' | 'lgId' | 'nodeId' | 'playerId' | 'r' | 'season' | 'sho' | 'so' | 'strikeoutsPerBaseOnBalls' | 'strikeoutsPerNine' | 'sv' | 'team' | 'w' | 'whip' | 'winLossPerc' | 'wp' | SeasonPitchingKeySpecifier)[];
export type SeasonPitchingFieldPolicy = {
	awardSummary?: FieldPolicy<any> | FieldReadFunction<any>,
	basesOnBallsPerNine?: FieldPolicy<any> | FieldReadFunction<any>,
	battersFaced?: FieldPolicy<any> | FieldReadFunction<any>,
	bb?: FieldPolicy<any> | FieldReadFunction<any>,
	bk?: FieldPolicy<any> | FieldReadFunction<any>,
	cg?: FieldPolicy<any> | FieldReadFunction<any>,
	earnedRunAvg?: FieldPolicy<any> | FieldReadFunction<any>,
	earnedRunAvgPlus?: FieldPolicy<any> | FieldReadFunction<any>,
	er?: FieldPolicy<any> | FieldReadFunction<any>,
	fip?: FieldPolicy<any> | FieldReadFunction<any>,
	g?: FieldPolicy<any> | FieldReadFunction<any>,
	gf?: FieldPolicy<any> | FieldReadFunction<any>,
	gs?: FieldPolicy<any> | FieldReadFunction<any>,
	h?: FieldPolicy<any> | FieldReadFunction<any>,
	hbp?: FieldPolicy<any> | FieldReadFunction<any>,
	hitsPerNine?: FieldPolicy<any> | FieldReadFunction<any>,
	homeRunsPerNine?: FieldPolicy<any> | FieldReadFunction<any>,
	hr?: FieldPolicy<any> | FieldReadFunction<any>,
	ibb?: FieldPolicy<any> | FieldReadFunction<any>,
	ip?: FieldPolicy<any> | FieldReadFunction<any>,
	l?: FieldPolicy<any> | FieldReadFunction<any>,
	lgId?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	r?: FieldPolicy<any> | FieldReadFunction<any>,
	season?: FieldPolicy<any> | FieldReadFunction<any>,
	sho?: FieldPolicy<any> | FieldReadFunction<any>,
	so?: FieldPolicy<any> | FieldReadFunction<any>,
	strikeoutsPerBaseOnBalls?: FieldPolicy<any> | FieldReadFunction<any>,
	strikeoutsPerNine?: FieldPolicy<any> | FieldReadFunction<any>,
	sv?: FieldPolicy<any> | FieldReadFunction<any>,
	team?: FieldPolicy<any> | FieldReadFunction<any>,
	w?: FieldPolicy<any> | FieldReadFunction<any>,
	whip?: FieldPolicy<any> | FieldReadFunction<any>,
	winLossPerc?: FieldPolicy<any> | FieldReadFunction<any>,
	wp?: FieldPolicy<any> | FieldReadFunction<any>
};
export type SeasonPitchingsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | SeasonPitchingsConnectionKeySpecifier)[];
export type SeasonPitchingsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type SeasonPitchingsEdgeKeySpecifier = ('cursor' | 'node' | SeasonPitchingsEdgeKeySpecifier)[];
export type SeasonPitchingsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type TeamKeySpecifier = ('draftTeamsByTeamIdAndLeagueId' | 'id' | 'league' | 'leagueId' | 'name' | 'nodeId' | TeamKeySpecifier)[];
export type TeamFieldPolicy = {
	draftTeamsByTeamIdAndLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	name?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>
};
export type TeamsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | TeamsConnectionKeySpecifier)[];
export type TeamsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type TeamsEdgeKeySpecifier = ('cursor' | 'node' | TeamsEdgeKeySpecifier)[];
export type TeamsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateDraftPayloadKeySpecifier = ('clientMutationId' | 'draft' | 'draftEdge' | 'league' | 'query' | UpdateDraftPayloadKeySpecifier)[];
export type UpdateDraftPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateDraftTeamPayloadKeySpecifier = ('clientMutationId' | 'draft' | 'draftTeam' | 'draftTeamEdge' | 'league' | 'query' | 'teamLeague' | UpdateDraftTeamPayloadKeySpecifier)[];
export type UpdateDraftTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	teamLeague?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateLeagueMemberPayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueMember' | 'leagueMemberEdge' | 'query' | 'user' | UpdateLeagueMemberPayloadKeySpecifier)[];
export type UpdateLeagueMemberPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMemberEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateLeagueMessagePayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueMessage' | 'leagueMessageEdge' | 'query' | 'user' | 'userLeague' | UpdateLeagueMessagePayloadKeySpecifier)[];
export type UpdateLeagueMessagePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessageEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>,
	userLeague?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateLeaguePayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueEdge' | 'query' | UpdateLeaguePayloadKeySpecifier)[];
export type UpdateLeaguePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdatePlayerPayloadKeySpecifier = ('clientMutationId' | 'player' | 'playerEdge' | 'query' | UpdatePlayerPayloadKeySpecifier)[];
export type UpdatePlayerPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateSeasonBattingPayloadKeySpecifier = ('clientMutationId' | 'player' | 'query' | 'seasonBatting' | 'seasonBattingEdge' | UpdateSeasonBattingPayloadKeySpecifier)[];
export type UpdateSeasonBattingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonBattingEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateSeasonFieldingPayloadKeySpecifier = ('clientMutationId' | 'player' | 'query' | 'seasonFielding' | 'seasonFieldingEdge' | UpdateSeasonFieldingPayloadKeySpecifier)[];
export type UpdateSeasonFieldingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonFieldingEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateSeasonPitchingPayloadKeySpecifier = ('clientMutationId' | 'query' | 'seasonPitching' | 'seasonPitchingEdge' | UpdateSeasonPitchingPayloadKeySpecifier)[];
export type UpdateSeasonPitchingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitchingEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateTeamPayloadKeySpecifier = ('clientMutationId' | 'league' | 'query' | 'team' | 'teamEdge' | UpdateTeamPayloadKeySpecifier)[];
export type UpdateTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	team?: FieldPolicy<any> | FieldReadFunction<any>,
	teamEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateUserPayloadKeySpecifier = ('clientMutationId' | 'query' | 'user' | 'userEdge' | UpdateUserPayloadKeySpecifier)[];
export type UpdateUserPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>,
	userEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertDraftPayloadKeySpecifier = ('clientMutationId' | 'draft' | 'draftEdge' | 'league' | 'query' | UpsertDraftPayloadKeySpecifier)[];
export type UpsertDraftPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertDraftTeamPayloadKeySpecifier = ('clientMutationId' | 'draft' | 'draftTeam' | 'draftTeamEdge' | 'league' | 'query' | 'teamLeague' | UpsertDraftTeamPayloadKeySpecifier)[];
export type UpsertDraftTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	teamLeague?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertLeagueMemberPayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueMember' | 'leagueMemberEdge' | 'query' | 'user' | UpsertLeagueMemberPayloadKeySpecifier)[];
export type UpsertLeagueMemberPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMemberEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertLeagueMessagePayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueMessage' | 'leagueMessageEdge' | 'query' | 'user' | 'userLeague' | UpsertLeagueMessagePayloadKeySpecifier)[];
export type UpsertLeagueMessagePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessageEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>,
	userLeague?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertLeaguePayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueEdge' | 'query' | UpsertLeaguePayloadKeySpecifier)[];
export type UpsertLeaguePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertPlayerPayloadKeySpecifier = ('clientMutationId' | 'player' | 'playerEdge' | 'query' | UpsertPlayerPayloadKeySpecifier)[];
export type UpsertPlayerPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertSeasonBattingPayloadKeySpecifier = ('clientMutationId' | 'player' | 'query' | 'seasonBatting' | 'seasonBattingEdge' | UpsertSeasonBattingPayloadKeySpecifier)[];
export type UpsertSeasonBattingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonBattingEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertSeasonFieldingPayloadKeySpecifier = ('clientMutationId' | 'player' | 'query' | 'seasonFielding' | 'seasonFieldingEdge' | UpsertSeasonFieldingPayloadKeySpecifier)[];
export type UpsertSeasonFieldingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonFieldingEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertSeasonPitchingPayloadKeySpecifier = ('clientMutationId' | 'query' | 'seasonPitching' | 'seasonPitchingEdge' | UpsertSeasonPitchingPayloadKeySpecifier)[];
export type UpsertSeasonPitchingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitchingEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertTeamPayloadKeySpecifier = ('clientMutationId' | 'league' | 'query' | 'team' | 'teamEdge' | UpsertTeamPayloadKeySpecifier)[];
export type UpsertTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	team?: FieldPolicy<any> | FieldReadFunction<any>,
	teamEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertTypeIntoTablePayloadKeySpecifier = ('clientMutationId' | 'query' | UpsertTypeIntoTablePayloadKeySpecifier)[];
export type UpsertTypeIntoTablePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertUserPayloadKeySpecifier = ('clientMutationId' | 'query' | 'user' | 'userEdge' | UpsertUserPayloadKeySpecifier)[];
export type UpsertUserPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>,
	userEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UserKeySpecifier = ('about' | 'createdAt' | 'email' | 'id' | 'isAdmin' | 'leagueMembers' | 'leagueMessages' | 'name' | 'nodeId' | 'updatedAt' | 'username' | UserKeySpecifier)[];
export type UserFieldPolicy = {
	about?: FieldPolicy<any> | FieldReadFunction<any>,
	createdAt?: FieldPolicy<any> | FieldReadFunction<any>,
	email?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	isAdmin?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMembers?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessages?: FieldPolicy<any> | FieldReadFunction<any>,
	name?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updatedAt?: FieldPolicy<any> | FieldReadFunction<any>,
	username?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UsersConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | UsersConnectionKeySpecifier)[];
export type UsersConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UsersEdgeKeySpecifier = ('cursor' | 'node' | UsersEdgeKeySpecifier)[];
export type UsersEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type StrictTypedTypePolicies = {
	BulkUpdateStatsPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | BulkUpdateStatsPayloadKeySpecifier | (() => undefined | BulkUpdateStatsPayloadKeySpecifier),
		fields?: BulkUpdateStatsPayloadFieldPolicy,
	},
	CreateDraftPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateDraftPayloadKeySpecifier | (() => undefined | CreateDraftPayloadKeySpecifier),
		fields?: CreateDraftPayloadFieldPolicy,
	},
	CreateDraftTeamPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateDraftTeamPayloadKeySpecifier | (() => undefined | CreateDraftTeamPayloadKeySpecifier),
		fields?: CreateDraftTeamPayloadFieldPolicy,
	},
	CreateLeagueAndTeamsPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateLeagueAndTeamsPayloadKeySpecifier | (() => undefined | CreateLeagueAndTeamsPayloadKeySpecifier),
		fields?: CreateLeagueAndTeamsPayloadFieldPolicy,
	},
	CreateLeagueMemberPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateLeagueMemberPayloadKeySpecifier | (() => undefined | CreateLeagueMemberPayloadKeySpecifier),
		fields?: CreateLeagueMemberPayloadFieldPolicy,
	},
	CreateLeagueMessagePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateLeagueMessagePayloadKeySpecifier | (() => undefined | CreateLeagueMessagePayloadKeySpecifier),
		fields?: CreateLeagueMessagePayloadFieldPolicy,
	},
	CreateLeaguePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateLeaguePayloadKeySpecifier | (() => undefined | CreateLeaguePayloadKeySpecifier),
		fields?: CreateLeaguePayloadFieldPolicy,
	},
	CreatePlayerPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreatePlayerPayloadKeySpecifier | (() => undefined | CreatePlayerPayloadKeySpecifier),
		fields?: CreatePlayerPayloadFieldPolicy,
	},
	CreatePlayersPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreatePlayersPayloadKeySpecifier | (() => undefined | CreatePlayersPayloadKeySpecifier),
		fields?: CreatePlayersPayloadFieldPolicy,
	},
	CreateSeasonBattingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateSeasonBattingPayloadKeySpecifier | (() => undefined | CreateSeasonBattingPayloadKeySpecifier),
		fields?: CreateSeasonBattingPayloadFieldPolicy,
	},
	CreateSeasonFieldingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateSeasonFieldingPayloadKeySpecifier | (() => undefined | CreateSeasonFieldingPayloadKeySpecifier),
		fields?: CreateSeasonFieldingPayloadFieldPolicy,
	},
	CreateSeasonPitchingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateSeasonPitchingPayloadKeySpecifier | (() => undefined | CreateSeasonPitchingPayloadKeySpecifier),
		fields?: CreateSeasonPitchingPayloadFieldPolicy,
	},
	CreateTeamPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateTeamPayloadKeySpecifier | (() => undefined | CreateTeamPayloadKeySpecifier),
		fields?: CreateTeamPayloadFieldPolicy,
	},
	CreateUserPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateUserPayloadKeySpecifier | (() => undefined | CreateUserPayloadKeySpecifier),
		fields?: CreateUserPayloadFieldPolicy,
	},
	DeleteDraftPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteDraftPayloadKeySpecifier | (() => undefined | DeleteDraftPayloadKeySpecifier),
		fields?: DeleteDraftPayloadFieldPolicy,
	},
	DeleteDraftTeamPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteDraftTeamPayloadKeySpecifier | (() => undefined | DeleteDraftTeamPayloadKeySpecifier),
		fields?: DeleteDraftTeamPayloadFieldPolicy,
	},
	DeleteLeagueMemberPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteLeagueMemberPayloadKeySpecifier | (() => undefined | DeleteLeagueMemberPayloadKeySpecifier),
		fields?: DeleteLeagueMemberPayloadFieldPolicy,
	},
	DeleteLeagueMessagePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteLeagueMessagePayloadKeySpecifier | (() => undefined | DeleteLeagueMessagePayloadKeySpecifier),
		fields?: DeleteLeagueMessagePayloadFieldPolicy,
	},
	DeleteLeaguePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteLeaguePayloadKeySpecifier | (() => undefined | DeleteLeaguePayloadKeySpecifier),
		fields?: DeleteLeaguePayloadFieldPolicy,
	},
	DeletePlayerPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeletePlayerPayloadKeySpecifier | (() => undefined | DeletePlayerPayloadKeySpecifier),
		fields?: DeletePlayerPayloadFieldPolicy,
	},
	DeleteSeasonBattingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteSeasonBattingPayloadKeySpecifier | (() => undefined | DeleteSeasonBattingPayloadKeySpecifier),
		fields?: DeleteSeasonBattingPayloadFieldPolicy,
	},
	DeleteSeasonFieldingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteSeasonFieldingPayloadKeySpecifier | (() => undefined | DeleteSeasonFieldingPayloadKeySpecifier),
		fields?: DeleteSeasonFieldingPayloadFieldPolicy,
	},
	DeleteSeasonPitchingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteSeasonPitchingPayloadKeySpecifier | (() => undefined | DeleteSeasonPitchingPayloadKeySpecifier),
		fields?: DeleteSeasonPitchingPayloadFieldPolicy,
	},
	DeleteTeamPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteTeamPayloadKeySpecifier | (() => undefined | DeleteTeamPayloadKeySpecifier),
		fields?: DeleteTeamPayloadFieldPolicy,
	},
	DeleteUserPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteUserPayloadKeySpecifier | (() => undefined | DeleteUserPayloadKeySpecifier),
		fields?: DeleteUserPayloadFieldPolicy,
	},
	Draft?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DraftKeySpecifier | (() => undefined | DraftKeySpecifier),
		fields?: DraftFieldPolicy,
	},
	DraftTeam?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DraftTeamKeySpecifier | (() => undefined | DraftTeamKeySpecifier),
		fields?: DraftTeamFieldPolicy,
	},
	DraftTeamsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DraftTeamsConnectionKeySpecifier | (() => undefined | DraftTeamsConnectionKeySpecifier),
		fields?: DraftTeamsConnectionFieldPolicy,
	},
	DraftTeamsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DraftTeamsEdgeKeySpecifier | (() => undefined | DraftTeamsEdgeKeySpecifier),
		fields?: DraftTeamsEdgeFieldPolicy,
	},
	DraftsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DraftsConnectionKeySpecifier | (() => undefined | DraftsConnectionKeySpecifier),
		fields?: DraftsConnectionFieldPolicy,
	},
	DraftsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DraftsEdgeKeySpecifier | (() => undefined | DraftsEdgeKeySpecifier),
		fields?: DraftsEdgeFieldPolicy,
	},
	League?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | LeagueKeySpecifier | (() => undefined | LeagueKeySpecifier),
		fields?: LeagueFieldPolicy,
	},
	LeagueMember?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | LeagueMemberKeySpecifier | (() => undefined | LeagueMemberKeySpecifier),
		fields?: LeagueMemberFieldPolicy,
	},
	LeagueMembersConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | LeagueMembersConnectionKeySpecifier | (() => undefined | LeagueMembersConnectionKeySpecifier),
		fields?: LeagueMembersConnectionFieldPolicy,
	},
	LeagueMembersEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | LeagueMembersEdgeKeySpecifier | (() => undefined | LeagueMembersEdgeKeySpecifier),
		fields?: LeagueMembersEdgeFieldPolicy,
	},
	LeagueMessage?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | LeagueMessageKeySpecifier | (() => undefined | LeagueMessageKeySpecifier),
		fields?: LeagueMessageFieldPolicy,
	},
	LeagueMessagesConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | LeagueMessagesConnectionKeySpecifier | (() => undefined | LeagueMessagesConnectionKeySpecifier),
		fields?: LeagueMessagesConnectionFieldPolicy,
	},
	LeagueMessagesEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | LeagueMessagesEdgeKeySpecifier | (() => undefined | LeagueMessagesEdgeKeySpecifier),
		fields?: LeagueMessagesEdgeFieldPolicy,
	},
	LeaguesConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | LeaguesConnectionKeySpecifier | (() => undefined | LeaguesConnectionKeySpecifier),
		fields?: LeaguesConnectionFieldPolicy,
	},
	LeaguesEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | LeaguesEdgeKeySpecifier | (() => undefined | LeaguesEdgeKeySpecifier),
		fields?: LeaguesEdgeFieldPolicy,
	},
	Mutation?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MutationKeySpecifier | (() => undefined | MutationKeySpecifier),
		fields?: MutationFieldPolicy,
	},
	Node?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | NodeKeySpecifier | (() => undefined | NodeKeySpecifier),
		fields?: NodeFieldPolicy,
	},
	PageInfo?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | PageInfoKeySpecifier | (() => undefined | PageInfoKeySpecifier),
		fields?: PageInfoFieldPolicy,
	},
	PgAttribute?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | PgAttributeKeySpecifier | (() => undefined | PgAttributeKeySpecifier),
		fields?: PgAttributeFieldPolicy,
	},
	PgAttributesConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | PgAttributesConnectionKeySpecifier | (() => undefined | PgAttributesConnectionKeySpecifier),
		fields?: PgAttributesConnectionFieldPolicy,
	},
	PgAttributesEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | PgAttributesEdgeKeySpecifier | (() => undefined | PgAttributesEdgeKeySpecifier),
		fields?: PgAttributesEdgeFieldPolicy,
	},
	Player?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | PlayerKeySpecifier | (() => undefined | PlayerKeySpecifier),
		fields?: PlayerFieldPolicy,
	},
	PlayersConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | PlayersConnectionKeySpecifier | (() => undefined | PlayersConnectionKeySpecifier),
		fields?: PlayersConnectionFieldPolicy,
	},
	PlayersEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | PlayersEdgeKeySpecifier | (() => undefined | PlayersEdgeKeySpecifier),
		fields?: PlayersEdgeFieldPolicy,
	},
	Query?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | QueryKeySpecifier | (() => undefined | QueryKeySpecifier),
		fields?: QueryFieldPolicy,
	},
	SeasonBatting?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | SeasonBattingKeySpecifier | (() => undefined | SeasonBattingKeySpecifier),
		fields?: SeasonBattingFieldPolicy,
	},
	SeasonBattingsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | SeasonBattingsConnectionKeySpecifier | (() => undefined | SeasonBattingsConnectionKeySpecifier),
		fields?: SeasonBattingsConnectionFieldPolicy,
	},
	SeasonBattingsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | SeasonBattingsEdgeKeySpecifier | (() => undefined | SeasonBattingsEdgeKeySpecifier),
		fields?: SeasonBattingsEdgeFieldPolicy,
	},
	SeasonFielding?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | SeasonFieldingKeySpecifier | (() => undefined | SeasonFieldingKeySpecifier),
		fields?: SeasonFieldingFieldPolicy,
	},
	SeasonFieldingsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | SeasonFieldingsConnectionKeySpecifier | (() => undefined | SeasonFieldingsConnectionKeySpecifier),
		fields?: SeasonFieldingsConnectionFieldPolicy,
	},
	SeasonFieldingsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | SeasonFieldingsEdgeKeySpecifier | (() => undefined | SeasonFieldingsEdgeKeySpecifier),
		fields?: SeasonFieldingsEdgeFieldPolicy,
	},
	SeasonPitching?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | SeasonPitchingKeySpecifier | (() => undefined | SeasonPitchingKeySpecifier),
		fields?: SeasonPitchingFieldPolicy,
	},
	SeasonPitchingsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | SeasonPitchingsConnectionKeySpecifier | (() => undefined | SeasonPitchingsConnectionKeySpecifier),
		fields?: SeasonPitchingsConnectionFieldPolicy,
	},
	SeasonPitchingsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | SeasonPitchingsEdgeKeySpecifier | (() => undefined | SeasonPitchingsEdgeKeySpecifier),
		fields?: SeasonPitchingsEdgeFieldPolicy,
	},
	Team?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | TeamKeySpecifier | (() => undefined | TeamKeySpecifier),
		fields?: TeamFieldPolicy,
	},
	TeamsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | TeamsConnectionKeySpecifier | (() => undefined | TeamsConnectionKeySpecifier),
		fields?: TeamsConnectionFieldPolicy,
	},
	TeamsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | TeamsEdgeKeySpecifier | (() => undefined | TeamsEdgeKeySpecifier),
		fields?: TeamsEdgeFieldPolicy,
	},
	UpdateDraftPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateDraftPayloadKeySpecifier | (() => undefined | UpdateDraftPayloadKeySpecifier),
		fields?: UpdateDraftPayloadFieldPolicy,
	},
	UpdateDraftTeamPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateDraftTeamPayloadKeySpecifier | (() => undefined | UpdateDraftTeamPayloadKeySpecifier),
		fields?: UpdateDraftTeamPayloadFieldPolicy,
	},
	UpdateLeagueMemberPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateLeagueMemberPayloadKeySpecifier | (() => undefined | UpdateLeagueMemberPayloadKeySpecifier),
		fields?: UpdateLeagueMemberPayloadFieldPolicy,
	},
	UpdateLeagueMessagePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateLeagueMessagePayloadKeySpecifier | (() => undefined | UpdateLeagueMessagePayloadKeySpecifier),
		fields?: UpdateLeagueMessagePayloadFieldPolicy,
	},
	UpdateLeaguePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateLeaguePayloadKeySpecifier | (() => undefined | UpdateLeaguePayloadKeySpecifier),
		fields?: UpdateLeaguePayloadFieldPolicy,
	},
	UpdatePlayerPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdatePlayerPayloadKeySpecifier | (() => undefined | UpdatePlayerPayloadKeySpecifier),
		fields?: UpdatePlayerPayloadFieldPolicy,
	},
	UpdateSeasonBattingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateSeasonBattingPayloadKeySpecifier | (() => undefined | UpdateSeasonBattingPayloadKeySpecifier),
		fields?: UpdateSeasonBattingPayloadFieldPolicy,
	},
	UpdateSeasonFieldingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateSeasonFieldingPayloadKeySpecifier | (() => undefined | UpdateSeasonFieldingPayloadKeySpecifier),
		fields?: UpdateSeasonFieldingPayloadFieldPolicy,
	},
	UpdateSeasonPitchingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateSeasonPitchingPayloadKeySpecifier | (() => undefined | UpdateSeasonPitchingPayloadKeySpecifier),
		fields?: UpdateSeasonPitchingPayloadFieldPolicy,
	},
	UpdateTeamPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateTeamPayloadKeySpecifier | (() => undefined | UpdateTeamPayloadKeySpecifier),
		fields?: UpdateTeamPayloadFieldPolicy,
	},
	UpdateUserPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateUserPayloadKeySpecifier | (() => undefined | UpdateUserPayloadKeySpecifier),
		fields?: UpdateUserPayloadFieldPolicy,
	},
	UpsertDraftPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertDraftPayloadKeySpecifier | (() => undefined | UpsertDraftPayloadKeySpecifier),
		fields?: UpsertDraftPayloadFieldPolicy,
	},
	UpsertDraftTeamPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertDraftTeamPayloadKeySpecifier | (() => undefined | UpsertDraftTeamPayloadKeySpecifier),
		fields?: UpsertDraftTeamPayloadFieldPolicy,
	},
	UpsertLeagueMemberPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertLeagueMemberPayloadKeySpecifier | (() => undefined | UpsertLeagueMemberPayloadKeySpecifier),
		fields?: UpsertLeagueMemberPayloadFieldPolicy,
	},
	UpsertLeagueMessagePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertLeagueMessagePayloadKeySpecifier | (() => undefined | UpsertLeagueMessagePayloadKeySpecifier),
		fields?: UpsertLeagueMessagePayloadFieldPolicy,
	},
	UpsertLeaguePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertLeaguePayloadKeySpecifier | (() => undefined | UpsertLeaguePayloadKeySpecifier),
		fields?: UpsertLeaguePayloadFieldPolicy,
	},
	UpsertPlayerPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertPlayerPayloadKeySpecifier | (() => undefined | UpsertPlayerPayloadKeySpecifier),
		fields?: UpsertPlayerPayloadFieldPolicy,
	},
	UpsertSeasonBattingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertSeasonBattingPayloadKeySpecifier | (() => undefined | UpsertSeasonBattingPayloadKeySpecifier),
		fields?: UpsertSeasonBattingPayloadFieldPolicy,
	},
	UpsertSeasonFieldingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertSeasonFieldingPayloadKeySpecifier | (() => undefined | UpsertSeasonFieldingPayloadKeySpecifier),
		fields?: UpsertSeasonFieldingPayloadFieldPolicy,
	},
	UpsertSeasonPitchingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertSeasonPitchingPayloadKeySpecifier | (() => undefined | UpsertSeasonPitchingPayloadKeySpecifier),
		fields?: UpsertSeasonPitchingPayloadFieldPolicy,
	},
	UpsertTeamPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertTeamPayloadKeySpecifier | (() => undefined | UpsertTeamPayloadKeySpecifier),
		fields?: UpsertTeamPayloadFieldPolicy,
	},
	UpsertTypeIntoTablePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertTypeIntoTablePayloadKeySpecifier | (() => undefined | UpsertTypeIntoTablePayloadKeySpecifier),
		fields?: UpsertTypeIntoTablePayloadFieldPolicy,
	},
	UpsertUserPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertUserPayloadKeySpecifier | (() => undefined | UpsertUserPayloadKeySpecifier),
		fields?: UpsertUserPayloadFieldPolicy,
	},
	User?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UserKeySpecifier | (() => undefined | UserKeySpecifier),
		fields?: UserFieldPolicy,
	},
	UsersConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UsersConnectionKeySpecifier | (() => undefined | UsersConnectionKeySpecifier),
		fields?: UsersConnectionFieldPolicy,
	},
	UsersEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UsersEdgeKeySpecifier | (() => undefined | UsersEdgeKeySpecifier),
		fields?: UsersEdgeFieldPolicy,
	}
};
export type TypedTypePolicies = StrictTypedTypePolicies & TypePolicies;