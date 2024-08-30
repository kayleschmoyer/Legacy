import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
import { FieldPolicy, FieldReadFunction, TypePolicies, TypePolicy } from '@apollo/client/cache';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export const LeagueFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"League"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"League"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"owner"}}]}}]} as unknown as DocumentNode<LeagueFragment, unknown>;
export const UserFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"about"}},{"kind":"Field","name":{"kind":"Name","value":"isAdmin"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]} as unknown as DocumentNode<UserFragment, unknown>;
export const LeagueMemberFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"LeagueMember"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"LeagueMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"permissionLevel"}},{"kind":"Field","name":{"kind":"Name","value":"teamId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"userByUserId"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"about"}},{"kind":"Field","name":{"kind":"Name","value":"isAdmin"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]} as unknown as DocumentNode<LeagueMemberFragment, unknown>;
export const TeamFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Team"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Team"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]} as unknown as DocumentNode<TeamFragment, unknown>;
export const LeaguesWithTeamsAndMembersFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"LeaguesWithTeamsAndMembers"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"League"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"League"}},{"kind":"Field","name":{"kind":"Name","value":"leagueMembersByLeagueId"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"LeagueMember"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"teamsByLeagueId"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Team"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"about"}},{"kind":"Field","name":{"kind":"Name","value":"isAdmin"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"League"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"League"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"owner"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"LeagueMember"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"LeagueMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"permissionLevel"}},{"kind":"Field","name":{"kind":"Name","value":"teamId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"userByUserId"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Team"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Team"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]} as unknown as DocumentNode<LeaguesWithTeamsAndMembersFragment, unknown>;
export const GetLeagueById = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetLeagueById"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueById"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"LeaguesWithTeamsAndMembers"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"League"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"League"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"owner"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"about"}},{"kind":"Field","name":{"kind":"Name","value":"isAdmin"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"LeagueMember"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"LeagueMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"permissionLevel"}},{"kind":"Field","name":{"kind":"Name","value":"teamId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"userByUserId"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Team"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Team"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"LeaguesWithTeamsAndMembers"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"League"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"League"}},{"kind":"Field","name":{"kind":"Name","value":"leagueMembersByLeagueId"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"LeagueMember"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"teamsByLeagueId"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Team"}}]}}]}}]}}]} as unknown as DocumentNode<GetLeagueByIdQuery, GetLeagueByIdQueryVariables>;
export const CreateLeague = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateLeague"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateLeagueAndTeamsInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createLeagueAndTeams"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"league"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"LeaguesWithTeamsAndMembers"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"League"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"League"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"owner"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"about"}},{"kind":"Field","name":{"kind":"Name","value":"isAdmin"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"LeagueMember"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"LeagueMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"permissionLevel"}},{"kind":"Field","name":{"kind":"Name","value":"teamId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"userByUserId"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Team"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Team"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"LeaguesWithTeamsAndMembers"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"League"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"League"}},{"kind":"Field","name":{"kind":"Name","value":"leagueMembersByLeagueId"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"LeagueMember"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"teamsByLeagueId"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Team"}}]}}]}}]}}]} as unknown as DocumentNode<CreateLeagueMutation, CreateLeagueMutationVariables>;
export const GetUserByEmail = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetUserByEmail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userByEmail"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"about"}},{"kind":"Field","name":{"kind":"Name","value":"isAdmin"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]} as unknown as DocumentNode<GetUserByEmailQuery, GetUserByEmailQueryVariables>;
export const GetLeaguesForUser = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetLeaguesForUser"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userById"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueMembersByUserId"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueByLeagueId"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"League"}}]}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"League"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"League"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"owner"}}]}}]} as unknown as DocumentNode<GetLeaguesForUserQuery, GetLeaguesForUserQueryVariables>;
export const GetUserById = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetUserById"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userById"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"about"}},{"kind":"Field","name":{"kind":"Name","value":"isAdmin"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]} as unknown as DocumentNode<GetUserByIdQuery, GetUserByIdQueryVariables>;
export const CreateUser = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateUser"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateUserInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createUser"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"about"}},{"kind":"Field","name":{"kind":"Name","value":"isAdmin"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]} as unknown as DocumentNode<CreateUserMutation, CreateUserMutationVariables>;
export type LeagueFragment = { __typename?: 'League', id: number, name: string, owner: number };

export type LeagueMemberFragment = { __typename?: 'LeagueMember', leagueId: number, permissionLevel: LeaguePermissionLevel, teamId?: number | null, userId: number, userByUserId?: { __typename?: 'User', id: number, email: string, about?: string | null, isAdmin: boolean, name: string, username: string } | null };

export type LeaguesWithTeamsAndMembersFragment = { __typename?: 'League', id: number, name: string, owner: number, leagueMembersByLeagueId: { __typename?: 'LeagueMembersConnection', nodes: Array<{ __typename?: 'LeagueMember', leagueId: number, permissionLevel: LeaguePermissionLevel, teamId?: number | null, userId: number, userByUserId?: { __typename?: 'User', id: number, email: string, about?: string | null, isAdmin: boolean, name: string, username: string } | null } | null> }, teamsByLeagueId: { __typename?: 'TeamsConnection', nodes: Array<{ __typename?: 'Team', id: number, leagueId: number, name: string } | null> } };

export type GetLeagueByIdQueryVariables = Exact<{
  id: Scalars['Int']['input'];
}>;


export type GetLeagueByIdQuery = { __typename?: 'Query', leagueById?: { __typename?: 'League', id: number, name: string, owner: number, leagueMembersByLeagueId: { __typename?: 'LeagueMembersConnection', nodes: Array<{ __typename?: 'LeagueMember', leagueId: number, permissionLevel: LeaguePermissionLevel, teamId?: number | null, userId: number, userByUserId?: { __typename?: 'User', id: number, email: string, about?: string | null, isAdmin: boolean, name: string, username: string } | null } | null> }, teamsByLeagueId: { __typename?: 'TeamsConnection', nodes: Array<{ __typename?: 'Team', id: number, leagueId: number, name: string } | null> } } | null };

export type CreateLeagueMutationVariables = Exact<{
  input: CreateLeagueAndTeamsInput;
}>;


export type CreateLeagueMutation = { __typename?: 'Mutation', createLeagueAndTeams?: { __typename?: 'CreateLeagueAndTeamsPayload', league?: { __typename?: 'League', id: number, name: string, owner: number, leagueMembersByLeagueId: { __typename?: 'LeagueMembersConnection', nodes: Array<{ __typename?: 'LeagueMember', leagueId: number, permissionLevel: LeaguePermissionLevel, teamId?: number | null, userId: number, userByUserId?: { __typename?: 'User', id: number, email: string, about?: string | null, isAdmin: boolean, name: string, username: string } | null } | null> }, teamsByLeagueId: { __typename?: 'TeamsConnection', nodes: Array<{ __typename?: 'Team', id: number, leagueId: number, name: string } | null> } } | null } | null };

export type TeamFragment = { __typename?: 'Team', id: number, leagueId: number, name: string };

export type UserFragment = { __typename?: 'User', id: number, email: string, about?: string | null, isAdmin: boolean, name: string, username: string };

export type GetUserByEmailQueryVariables = Exact<{
  email: Scalars['String']['input'];
}>;


export type GetUserByEmailQuery = { __typename?: 'Query', userByEmail?: { __typename?: 'User', id: number, email: string, about?: string | null, isAdmin: boolean, name: string, username: string } | null };

export type GetLeaguesForUserQueryVariables = Exact<{
  id: Scalars['Int']['input'];
}>;


export type GetLeaguesForUserQuery = { __typename?: 'Query', userById?: { __typename?: 'User', leagueMembersByUserId: { __typename?: 'LeagueMembersConnection', nodes: Array<{ __typename?: 'LeagueMember', leagueByLeagueId?: { __typename?: 'League', id: number, name: string, owner: number } | null } | null> } } | null };

export type GetUserByIdQueryVariables = Exact<{
  id: Scalars['Int']['input'];
}>;


export type GetUserByIdQuery = { __typename?: 'Query', userById?: { __typename?: 'User', id: number, email: string, about?: string | null, isAdmin: boolean, name: string, username: string } | null };

export type CreateUserMutationVariables = Exact<{
  input: CreateUserInput;
}>;


export type CreateUserMutation = { __typename?: 'Mutation', createUser?: { __typename?: 'CreateUserPayload', user?: { __typename?: 'User', id: number, email: string, about?: string | null, isAdmin: boolean, name: string, username: string } | null } | null };

/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  Cursor: { input: string; output: string; }
  Date: { input: any; output: any; }
  Datetime: { input: string; output: string; }
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
  leagueByLeagueId?: Maybe<League>;
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
  draftByDraftId?: Maybe<Draft>;
  /** The `DraftTeam` that was created by this mutation. */
  draftTeam?: Maybe<DraftTeam>;
  /** An edge for our `DraftTeam`. May be used by Relay 1. */
  draftTeamEdge?: Maybe<DraftTeamsEdge>;
  /** Reads a single `League` that is related to this `DraftTeam`. */
  leagueByLeagueId?: Maybe<League>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `Team` that is related to this `DraftTeam`. */
  teamByTeamIdAndLeagueId?: Maybe<Team>;
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
  leagueByLeagueId?: Maybe<League>;
  /** The `LeagueMember` that was created by this mutation. */
  leagueMember?: Maybe<LeagueMember>;
  /** An edge for our `LeagueMember`. May be used by Relay 1. */
  leagueMemberEdge?: Maybe<LeagueMembersEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `User` that is related to this `LeagueMember`. */
  userByUserId?: Maybe<User>;
};


/** The output of our create `LeagueMember` mutation. */
export type CreateLeagueMemberPayloadLeagueMemberEdgeArgs = {
  orderBy?: InputMaybe<Array<LeagueMembersOrderBy>>;
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
  leagueByLeagueId?: Maybe<League>;
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

/** All input for the `deleteDraftById` mutation. */
export type DeleteDraftByIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
};

/** All input for the `deleteDraft` mutation. */
export type DeleteDraftInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `Draft` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** The output of our delete `Draft` mutation. */
export type DeleteDraftPayload = {
  __typename?: 'DeleteDraftPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedDraftId?: Maybe<Scalars['ID']['output']>;
  /** The `Draft` that was deleted by this mutation. */
  draft?: Maybe<Draft>;
  /** An edge for our `Draft`. May be used by Relay 1. */
  draftEdge?: Maybe<DraftsEdge>;
  /** Reads a single `League` that is related to this `Draft`. */
  leagueByLeagueId?: Maybe<League>;
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

/** All input for the `deleteDraftTeamByDraftIdAndLeagueIdAndTeamId` mutation. */
export type DeleteDraftTeamByDraftIdAndLeagueIdAndTeamIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  draftId: Scalars['Int']['input'];
  leagueId: Scalars['Int']['input'];
  teamId: Scalars['Int']['input'];
};

/** All input for the `deleteDraftTeam` mutation. */
export type DeleteDraftTeamInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `DraftTeam` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** The output of our delete `DraftTeam` mutation. */
export type DeleteDraftTeamPayload = {
  __typename?: 'DeleteDraftTeamPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedDraftTeamId?: Maybe<Scalars['ID']['output']>;
  /** Reads a single `Draft` that is related to this `DraftTeam`. */
  draftByDraftId?: Maybe<Draft>;
  /** The `DraftTeam` that was deleted by this mutation. */
  draftTeam?: Maybe<DraftTeam>;
  /** An edge for our `DraftTeam`. May be used by Relay 1. */
  draftTeamEdge?: Maybe<DraftTeamsEdge>;
  /** Reads a single `League` that is related to this `DraftTeam`. */
  leagueByLeagueId?: Maybe<League>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `Team` that is related to this `DraftTeam`. */
  teamByTeamIdAndLeagueId?: Maybe<Team>;
};


/** The output of our delete `DraftTeam` mutation. */
export type DeleteDraftTeamPayloadDraftTeamEdgeArgs = {
  orderBy?: InputMaybe<Array<DraftTeamsOrderBy>>;
};

/** All input for the `deleteLeagueById` mutation. */
export type DeleteLeagueByIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
};

/** All input for the `deleteLeague` mutation. */
export type DeleteLeagueInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `League` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteLeagueMemberByLeagueIdAndUserId` mutation. */
export type DeleteLeagueMemberByLeagueIdAndUserIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  leagueId: Scalars['Int']['input'];
  userId: Scalars['Int']['input'];
};

/** All input for the `deleteLeagueMember` mutation. */
export type DeleteLeagueMemberInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `LeagueMember` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** The output of our delete `LeagueMember` mutation. */
export type DeleteLeagueMemberPayload = {
  __typename?: 'DeleteLeagueMemberPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedLeagueMemberId?: Maybe<Scalars['ID']['output']>;
  /** Reads a single `League` that is related to this `LeagueMember`. */
  leagueByLeagueId?: Maybe<League>;
  /** The `LeagueMember` that was deleted by this mutation. */
  leagueMember?: Maybe<LeagueMember>;
  /** An edge for our `LeagueMember`. May be used by Relay 1. */
  leagueMemberEdge?: Maybe<LeagueMembersEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `User` that is related to this `LeagueMember`. */
  userByUserId?: Maybe<User>;
};


/** The output of our delete `LeagueMember` mutation. */
export type DeleteLeagueMemberPayloadLeagueMemberEdgeArgs = {
  orderBy?: InputMaybe<Array<LeagueMembersOrderBy>>;
};

/** The output of our delete `League` mutation. */
export type DeleteLeaguePayload = {
  __typename?: 'DeleteLeaguePayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedLeagueId?: Maybe<Scalars['ID']['output']>;
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

/** All input for the `deleteTeamById` mutation. */
export type DeleteTeamByIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
};

/** All input for the `deleteTeam` mutation. */
export type DeleteTeamInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `Team` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** The output of our delete `Team` mutation. */
export type DeleteTeamPayload = {
  __typename?: 'DeleteTeamPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedTeamId?: Maybe<Scalars['ID']['output']>;
  /** Reads a single `League` that is related to this `Team`. */
  leagueByLeagueId?: Maybe<League>;
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

/** All input for the `deleteUserById` mutation. */
export type DeleteUserByIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
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
  /** The globally unique `ID` which will identify a single `User` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** The output of our delete `User` mutation. */
export type DeleteUserPayload = {
  __typename?: 'DeleteUserPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedUserId?: Maybe<Scalars['ID']['output']>;
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
  draftTeamsByDraftId: DraftTeamsConnection;
  draftType: DraftType;
  id: Scalars['Int']['output'];
  /** Reads a single `League` that is related to this `Draft`. */
  leagueByLeagueId?: Maybe<League>;
  leagueId: Scalars['Int']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
};


export type DraftDraftTeamsByDraftIdArgs = {
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
  draftByDraftId?: Maybe<Draft>;
  draftId: Scalars['Int']['output'];
  draftOrder: Scalars['Int']['output'];
  /** Reads a single `League` that is related to this `DraftTeam`. */
  leagueByLeagueId?: Maybe<League>;
  leagueId: Scalars['Int']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  /** Reads a single `Team` that is related to this `DraftTeam`. */
  teamByTeamIdAndLeagueId?: Maybe<Team>;
  teamId: Scalars['Int']['output'];
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
  draftTeamsByLeagueId: DraftTeamsConnection;
  /** Reads and enables pagination through a set of `Draft`. */
  draftsByLeagueId: DraftsConnection;
  id: Scalars['Int']['output'];
  /** Reads and enables pagination through a set of `LeagueMember`. */
  leagueMembersByLeagueId: LeagueMembersConnection;
  name: Scalars['String']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  owner: Scalars['Int']['output'];
  /** Reads and enables pagination through a set of `Team`. */
  teamsByLeagueId: TeamsConnection;
};


export type LeagueDraftTeamsByLeagueIdArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<DraftTeamCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<DraftTeamsOrderBy>>;
};


export type LeagueDraftsByLeagueIdArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<DraftCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<DraftsOrderBy>>;
};


export type LeagueLeagueMembersByLeagueIdArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<LeagueMemberCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LeagueMembersOrderBy>>;
};


export type LeagueTeamsByLeagueIdArgs = {
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
  leagueByLeagueId?: Maybe<League>;
  leagueId: Scalars['Int']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  permissionLevel: LeaguePermissionLevel;
  teamId?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `User` that is related to this `LeagueMember`. */
  userByUserId?: Maybe<User>;
  userId: Scalars['Int']['output'];
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
  /** Creates a single `Draft`. */
  createDraft?: Maybe<CreateDraftPayload>;
  /** Creates a single `DraftTeam`. */
  createDraftTeam?: Maybe<CreateDraftTeamPayload>;
  /** Creates a single `League`. */
  createLeague?: Maybe<CreateLeaguePayload>;
  createLeagueAndTeams?: Maybe<CreateLeagueAndTeamsPayload>;
  /** Creates a single `LeagueMember`. */
  createLeagueMember?: Maybe<CreateLeagueMemberPayload>;
  /** Creates a single `Team`. */
  createTeam?: Maybe<CreateTeamPayload>;
  /** Creates a single `User`. */
  createUser?: Maybe<CreateUserPayload>;
  /** Deletes a single `Draft` using its globally unique id. */
  deleteDraft?: Maybe<DeleteDraftPayload>;
  /** Deletes a single `Draft` using a unique key. */
  deleteDraftById?: Maybe<DeleteDraftPayload>;
  /** Deletes a single `DraftTeam` using its globally unique id. */
  deleteDraftTeam?: Maybe<DeleteDraftTeamPayload>;
  /** Deletes a single `DraftTeam` using a unique key. */
  deleteDraftTeamByDraftIdAndDraftOrder?: Maybe<DeleteDraftTeamPayload>;
  /** Deletes a single `DraftTeam` using a unique key. */
  deleteDraftTeamByDraftIdAndLeagueIdAndTeamId?: Maybe<DeleteDraftTeamPayload>;
  /** Deletes a single `League` using its globally unique id. */
  deleteLeague?: Maybe<DeleteLeaguePayload>;
  /** Deletes a single `League` using a unique key. */
  deleteLeagueById?: Maybe<DeleteLeaguePayload>;
  /** Deletes a single `LeagueMember` using its globally unique id. */
  deleteLeagueMember?: Maybe<DeleteLeagueMemberPayload>;
  /** Deletes a single `LeagueMember` using a unique key. */
  deleteLeagueMemberByLeagueIdAndUserId?: Maybe<DeleteLeagueMemberPayload>;
  /** Deletes a single `Team` using its globally unique id. */
  deleteTeam?: Maybe<DeleteTeamPayload>;
  /** Deletes a single `Team` using a unique key. */
  deleteTeamById?: Maybe<DeleteTeamPayload>;
  /** Deletes a single `Team` using a unique key. */
  deleteTeamByIdAndLeagueId?: Maybe<DeleteTeamPayload>;
  /** Deletes a single `User` using its globally unique id. */
  deleteUser?: Maybe<DeleteUserPayload>;
  /** Deletes a single `User` using a unique key. */
  deleteUserByEmail?: Maybe<DeleteUserPayload>;
  /** Deletes a single `User` using a unique key. */
  deleteUserById?: Maybe<DeleteUserPayload>;
  /** Deletes a single `User` using a unique key. */
  deleteUserByUsername?: Maybe<DeleteUserPayload>;
  /** Updates a single `Draft` using its globally unique id and a patch. */
  updateDraft?: Maybe<UpdateDraftPayload>;
  /** Updates a single `Draft` using a unique key and a patch. */
  updateDraftById?: Maybe<UpdateDraftPayload>;
  /** Updates a single `DraftTeam` using its globally unique id and a patch. */
  updateDraftTeam?: Maybe<UpdateDraftTeamPayload>;
  /** Updates a single `DraftTeam` using a unique key and a patch. */
  updateDraftTeamByDraftIdAndDraftOrder?: Maybe<UpdateDraftTeamPayload>;
  /** Updates a single `DraftTeam` using a unique key and a patch. */
  updateDraftTeamByDraftIdAndLeagueIdAndTeamId?: Maybe<UpdateDraftTeamPayload>;
  /** Updates a single `League` using its globally unique id and a patch. */
  updateLeague?: Maybe<UpdateLeaguePayload>;
  /** Updates a single `League` using a unique key and a patch. */
  updateLeagueById?: Maybe<UpdateLeaguePayload>;
  /** Updates a single `LeagueMember` using its globally unique id and a patch. */
  updateLeagueMember?: Maybe<UpdateLeagueMemberPayload>;
  /** Updates a single `LeagueMember` using a unique key and a patch. */
  updateLeagueMemberByLeagueIdAndUserId?: Maybe<UpdateLeagueMemberPayload>;
  /** Updates a single `Team` using its globally unique id and a patch. */
  updateTeam?: Maybe<UpdateTeamPayload>;
  /** Updates a single `Team` using a unique key and a patch. */
  updateTeamById?: Maybe<UpdateTeamPayload>;
  /** Updates a single `Team` using a unique key and a patch. */
  updateTeamByIdAndLeagueId?: Maybe<UpdateTeamPayload>;
  /** Updates a single `User` using its globally unique id and a patch. */
  updateUser?: Maybe<UpdateUserPayload>;
  /** Updates a single `User` using a unique key and a patch. */
  updateUserByEmail?: Maybe<UpdateUserPayload>;
  /** Updates a single `User` using a unique key and a patch. */
  updateUserById?: Maybe<UpdateUserPayload>;
  /** Updates a single `User` using a unique key and a patch. */
  updateUserByUsername?: Maybe<UpdateUserPayload>;
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
export type MutationDeleteDraftByIdArgs = {
  input: DeleteDraftByIdInput;
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
export type MutationDeleteDraftTeamByDraftIdAndLeagueIdAndTeamIdArgs = {
  input: DeleteDraftTeamByDraftIdAndLeagueIdAndTeamIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteLeagueArgs = {
  input: DeleteLeagueInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteLeagueByIdArgs = {
  input: DeleteLeagueByIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteLeagueMemberArgs = {
  input: DeleteLeagueMemberInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteLeagueMemberByLeagueIdAndUserIdArgs = {
  input: DeleteLeagueMemberByLeagueIdAndUserIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteTeamArgs = {
  input: DeleteTeamInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteTeamByIdArgs = {
  input: DeleteTeamByIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteTeamByIdAndLeagueIdArgs = {
  input: DeleteTeamByIdAndLeagueIdInput;
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
export type MutationDeleteUserByIdArgs = {
  input: DeleteUserByIdInput;
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
export type MutationUpdateDraftByIdArgs = {
  input: UpdateDraftByIdInput;
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
export type MutationUpdateDraftTeamByDraftIdAndLeagueIdAndTeamIdArgs = {
  input: UpdateDraftTeamByDraftIdAndLeagueIdAndTeamIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateLeagueArgs = {
  input: UpdateLeagueInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateLeagueByIdArgs = {
  input: UpdateLeagueByIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateLeagueMemberArgs = {
  input: UpdateLeagueMemberInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateLeagueMemberByLeagueIdAndUserIdArgs = {
  input: UpdateLeagueMemberByLeagueIdAndUserIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateTeamArgs = {
  input: UpdateTeamInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateTeamByIdArgs = {
  input: UpdateTeamByIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateTeamByIdAndLeagueIdArgs = {
  input: UpdateTeamByIdAndLeagueIdInput;
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
export type MutationUpdateUserByIdArgs = {
  input: UpdateUserByIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateUserByUsernameArgs = {
  input: UpdateUserByUsernameInput;
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

/** The root query type which gives access points into the data universe. */
export type Query = Node & {
  __typename?: 'Query';
  /** Reads and enables pagination through a set of `DraftTeam`. */
  allDraftTeams?: Maybe<DraftTeamsConnection>;
  /** Reads and enables pagination through a set of `Draft`. */
  allDrafts?: Maybe<DraftsConnection>;
  /** Reads and enables pagination through a set of `LeagueMember`. */
  allLeagueMembers?: Maybe<LeagueMembersConnection>;
  /** Reads and enables pagination through a set of `League`. */
  allLeagues?: Maybe<LeaguesConnection>;
  /** Reads and enables pagination through a set of `Team`. */
  allTeams?: Maybe<TeamsConnection>;
  /** Reads and enables pagination through a set of `User`. */
  allUsers?: Maybe<UsersConnection>;
  /** Reads a single `Draft` using its globally unique `ID`. */
  draft?: Maybe<Draft>;
  draftById?: Maybe<Draft>;
  /** Reads a single `DraftTeam` using its globally unique `ID`. */
  draftTeam?: Maybe<DraftTeam>;
  draftTeamByDraftIdAndDraftOrder?: Maybe<DraftTeam>;
  draftTeamByDraftIdAndLeagueIdAndTeamId?: Maybe<DraftTeam>;
  /** Reads a single `League` using its globally unique `ID`. */
  league?: Maybe<League>;
  leagueById?: Maybe<League>;
  /** Reads a single `LeagueMember` using its globally unique `ID`. */
  leagueMember?: Maybe<LeagueMember>;
  leagueMemberByLeagueIdAndUserId?: Maybe<LeagueMember>;
  /** Fetches an object given its globally unique `ID`. */
  node?: Maybe<Node>;
  /** The root query type must be a `Node` to work well with Relay 1 mutations. This just resolves to `query`. */
  nodeId: Scalars['ID']['output'];
  /**
   * Exposes the root query type nested one level down. This is helpful for Relay 1
   * which can only query top level fields if they are in a particular form.
   */
  query: Query;
  /** Reads a single `Team` using its globally unique `ID`. */
  team?: Maybe<Team>;
  teamById?: Maybe<Team>;
  teamByIdAndLeagueId?: Maybe<Team>;
  /** Reads a single `User` using its globally unique `ID`. */
  user?: Maybe<User>;
  userByEmail?: Maybe<User>;
  userById?: Maybe<User>;
  userByUsername?: Maybe<User>;
};


/** The root query type which gives access points into the data universe. */
export type QueryAllDraftTeamsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<DraftTeamCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<DraftTeamsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryAllDraftsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<DraftCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<DraftsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryAllLeagueMembersArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<LeagueMemberCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LeagueMembersOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryAllLeaguesArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<LeagueCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LeaguesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryAllTeamsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<TeamCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TeamsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryAllUsersArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<UserCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<UsersOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryDraftArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryDraftByIdArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryDraftTeamArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryDraftTeamByDraftIdAndDraftOrderArgs = {
  draftId: Scalars['Int']['input'];
  draftOrder: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryDraftTeamByDraftIdAndLeagueIdAndTeamIdArgs = {
  draftId: Scalars['Int']['input'];
  leagueId: Scalars['Int']['input'];
  teamId: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryLeagueArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryLeagueByIdArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryLeagueMemberArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryLeagueMemberByLeagueIdAndUserIdArgs = {
  leagueId: Scalars['Int']['input'];
  userId: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryNodeArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryTeamArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryTeamByIdArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryTeamByIdAndLeagueIdArgs = {
  id: Scalars['Int']['input'];
  leagueId: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryUserArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryUserByEmailArgs = {
  email: Scalars['String']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryUserByIdArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryUserByUsernameArgs = {
  username: Scalars['String']['input'];
};

export type Team = Node & {
  __typename?: 'Team';
  /** Reads and enables pagination through a set of `DraftTeam`. */
  draftTeamsByTeamIdAndLeagueId: DraftTeamsConnection;
  id: Scalars['Int']['output'];
  /** Reads a single `League` that is related to this `Team`. */
  leagueByLeagueId?: Maybe<League>;
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

/** All input for the `updateDraftById` mutation. */
export type UpdateDraftByIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** An object where the defined keys will be set on the `Draft` being updated. */
  draftPatch: DraftPatch;
  id: Scalars['Int']['input'];
};

/** All input for the `updateDraft` mutation. */
export type UpdateDraftInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** An object where the defined keys will be set on the `Draft` being updated. */
  draftPatch: DraftPatch;
  /** The globally unique `ID` which will identify a single `Draft` to be updated. */
  nodeId: Scalars['ID']['input'];
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
  leagueByLeagueId?: Maybe<League>;
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
  draftTeamPatch: DraftTeamPatch;
};

/** All input for the `updateDraftTeamByDraftIdAndLeagueIdAndTeamId` mutation. */
export type UpdateDraftTeamByDraftIdAndLeagueIdAndTeamIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  draftId: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `DraftTeam` being updated. */
  draftTeamPatch: DraftTeamPatch;
  leagueId: Scalars['Int']['input'];
  teamId: Scalars['Int']['input'];
};

/** All input for the `updateDraftTeam` mutation. */
export type UpdateDraftTeamInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** An object where the defined keys will be set on the `DraftTeam` being updated. */
  draftTeamPatch: DraftTeamPatch;
  /** The globally unique `ID` which will identify a single `DraftTeam` to be updated. */
  nodeId: Scalars['ID']['input'];
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
  draftByDraftId?: Maybe<Draft>;
  /** The `DraftTeam` that was updated by this mutation. */
  draftTeam?: Maybe<DraftTeam>;
  /** An edge for our `DraftTeam`. May be used by Relay 1. */
  draftTeamEdge?: Maybe<DraftTeamsEdge>;
  /** Reads a single `League` that is related to this `DraftTeam`. */
  leagueByLeagueId?: Maybe<League>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `Team` that is related to this `DraftTeam`. */
  teamByTeamIdAndLeagueId?: Maybe<Team>;
};


/** The output of our update `DraftTeam` mutation. */
export type UpdateDraftTeamPayloadDraftTeamEdgeArgs = {
  orderBy?: InputMaybe<Array<DraftTeamsOrderBy>>;
};

/** All input for the `updateLeagueById` mutation. */
export type UpdateLeagueByIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `League` being updated. */
  leaguePatch: LeaguePatch;
};

/** All input for the `updateLeague` mutation. */
export type UpdateLeagueInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** An object where the defined keys will be set on the `League` being updated. */
  leaguePatch: LeaguePatch;
  /** The globally unique `ID` which will identify a single `League` to be updated. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `updateLeagueMemberByLeagueIdAndUserId` mutation. */
export type UpdateLeagueMemberByLeagueIdAndUserIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  leagueId: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `LeagueMember` being updated. */
  leagueMemberPatch: LeagueMemberPatch;
  userId: Scalars['Int']['input'];
};

/** All input for the `updateLeagueMember` mutation. */
export type UpdateLeagueMemberInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** An object where the defined keys will be set on the `LeagueMember` being updated. */
  leagueMemberPatch: LeagueMemberPatch;
  /** The globally unique `ID` which will identify a single `LeagueMember` to be updated. */
  nodeId: Scalars['ID']['input'];
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
  leagueByLeagueId?: Maybe<League>;
  /** The `LeagueMember` that was updated by this mutation. */
  leagueMember?: Maybe<LeagueMember>;
  /** An edge for our `LeagueMember`. May be used by Relay 1. */
  leagueMemberEdge?: Maybe<LeagueMembersEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `User` that is related to this `LeagueMember`. */
  userByUserId?: Maybe<User>;
};


/** The output of our update `LeagueMember` mutation. */
export type UpdateLeagueMemberPayloadLeagueMemberEdgeArgs = {
  orderBy?: InputMaybe<Array<LeagueMembersOrderBy>>;
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
  teamPatch: TeamPatch;
};

/** All input for the `updateTeamById` mutation. */
export type UpdateTeamByIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `Team` being updated. */
  teamPatch: TeamPatch;
};

/** All input for the `updateTeam` mutation. */
export type UpdateTeamInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `Team` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `Team` being updated. */
  teamPatch: TeamPatch;
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
  leagueByLeagueId?: Maybe<League>;
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
  userPatch: UserPatch;
};

/** All input for the `updateUserById` mutation. */
export type UpdateUserByIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `User` being updated. */
  userPatch: UserPatch;
};

/** All input for the `updateUserByUsername` mutation. */
export type UpdateUserByUsernameInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** An object where the defined keys will be set on the `User` being updated. */
  userPatch: UserPatch;
  username: Scalars['String']['input'];
};

/** All input for the `updateUser` mutation. */
export type UpdateUserInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `User` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `User` being updated. */
  userPatch: UserPatch;
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

export type User = Node & {
  __typename?: 'User';
  about?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['Datetime']['output'];
  email: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  isAdmin: Scalars['Boolean']['output'];
  /** Reads and enables pagination through a set of `LeagueMember`. */
  leagueMembersByUserId: LeagueMembersConnection;
  name: Scalars['String']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  updatedAt: Scalars['Datetime']['output'];
  username: Scalars['String']['output'];
};


export type UserLeagueMembersByUserIdArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<LeagueMemberCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LeagueMembersOrderBy>>;
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

export type CreateDraftPayloadKeySpecifier = ('clientMutationId' | 'draft' | 'draftEdge' | 'leagueByLeagueId' | 'query' | CreateDraftPayloadKeySpecifier)[];
export type CreateDraftPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateDraftTeamPayloadKeySpecifier = ('clientMutationId' | 'draftByDraftId' | 'draftTeam' | 'draftTeamEdge' | 'leagueByLeagueId' | 'query' | 'teamByTeamIdAndLeagueId' | CreateDraftTeamPayloadKeySpecifier)[];
export type CreateDraftTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	draftByDraftId?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	teamByTeamIdAndLeagueId?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateLeagueAndTeamsPayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueEdge' | 'query' | CreateLeagueAndTeamsPayloadKeySpecifier)[];
export type CreateLeagueAndTeamsPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateLeagueMemberPayloadKeySpecifier = ('clientMutationId' | 'leagueByLeagueId' | 'leagueMember' | 'leagueMemberEdge' | 'query' | 'userByUserId' | CreateLeagueMemberPayloadKeySpecifier)[];
export type CreateLeagueMemberPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMemberEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	userByUserId?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateLeaguePayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueEdge' | 'query' | CreateLeaguePayloadKeySpecifier)[];
export type CreateLeaguePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateTeamPayloadKeySpecifier = ('clientMutationId' | 'leagueByLeagueId' | 'query' | 'team' | 'teamEdge' | CreateTeamPayloadKeySpecifier)[];
export type CreateTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
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
export type DeleteDraftPayloadKeySpecifier = ('clientMutationId' | 'deletedDraftId' | 'draft' | 'draftEdge' | 'leagueByLeagueId' | 'query' | DeleteDraftPayloadKeySpecifier)[];
export type DeleteDraftPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedDraftId?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteDraftTeamPayloadKeySpecifier = ('clientMutationId' | 'deletedDraftTeamId' | 'draftByDraftId' | 'draftTeam' | 'draftTeamEdge' | 'leagueByLeagueId' | 'query' | 'teamByTeamIdAndLeagueId' | DeleteDraftTeamPayloadKeySpecifier)[];
export type DeleteDraftTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedDraftTeamId?: FieldPolicy<any> | FieldReadFunction<any>,
	draftByDraftId?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	teamByTeamIdAndLeagueId?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteLeagueMemberPayloadKeySpecifier = ('clientMutationId' | 'deletedLeagueMemberId' | 'leagueByLeagueId' | 'leagueMember' | 'leagueMemberEdge' | 'query' | 'userByUserId' | DeleteLeagueMemberPayloadKeySpecifier)[];
export type DeleteLeagueMemberPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedLeagueMemberId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMemberEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	userByUserId?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteLeaguePayloadKeySpecifier = ('clientMutationId' | 'deletedLeagueId' | 'league' | 'leagueEdge' | 'query' | DeleteLeaguePayloadKeySpecifier)[];
export type DeleteLeaguePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteTeamPayloadKeySpecifier = ('clientMutationId' | 'deletedTeamId' | 'leagueByLeagueId' | 'query' | 'team' | 'teamEdge' | DeleteTeamPayloadKeySpecifier)[];
export type DeleteTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedTeamId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	team?: FieldPolicy<any> | FieldReadFunction<any>,
	teamEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteUserPayloadKeySpecifier = ('clientMutationId' | 'deletedUserId' | 'query' | 'user' | 'userEdge' | DeleteUserPayloadKeySpecifier)[];
export type DeleteUserPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedUserId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>,
	userEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DraftKeySpecifier = ('date' | 'draftOrder' | 'draftTeamsByDraftId' | 'draftType' | 'id' | 'leagueByLeagueId' | 'leagueId' | 'nodeId' | DraftKeySpecifier)[];
export type DraftFieldPolicy = {
	date?: FieldPolicy<any> | FieldReadFunction<any>,
	draftOrder?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamsByDraftId?: FieldPolicy<any> | FieldReadFunction<any>,
	draftType?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DraftTeamKeySpecifier = ('draftByDraftId' | 'draftId' | 'draftOrder' | 'leagueByLeagueId' | 'leagueId' | 'nodeId' | 'teamByTeamIdAndLeagueId' | 'teamId' | DraftTeamKeySpecifier)[];
export type DraftTeamFieldPolicy = {
	draftByDraftId?: FieldPolicy<any> | FieldReadFunction<any>,
	draftId?: FieldPolicy<any> | FieldReadFunction<any>,
	draftOrder?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	teamByTeamIdAndLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	teamId?: FieldPolicy<any> | FieldReadFunction<any>
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
export type LeagueKeySpecifier = ('draftTeamsByLeagueId' | 'draftsByLeagueId' | 'id' | 'leagueMembersByLeagueId' | 'name' | 'nodeId' | 'owner' | 'teamsByLeagueId' | LeagueKeySpecifier)[];
export type LeagueFieldPolicy = {
	draftTeamsByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	draftsByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMembersByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	name?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	owner?: FieldPolicy<any> | FieldReadFunction<any>,
	teamsByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>
};
export type LeagueMemberKeySpecifier = ('leagueByLeagueId' | 'leagueId' | 'nodeId' | 'permissionLevel' | 'teamId' | 'userByUserId' | 'userId' | LeagueMemberKeySpecifier)[];
export type LeagueMemberFieldPolicy = {
	leagueByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	permissionLevel?: FieldPolicy<any> | FieldReadFunction<any>,
	teamId?: FieldPolicy<any> | FieldReadFunction<any>,
	userByUserId?: FieldPolicy<any> | FieldReadFunction<any>,
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
export type MutationKeySpecifier = ('createDraft' | 'createDraftTeam' | 'createLeague' | 'createLeagueAndTeams' | 'createLeagueMember' | 'createTeam' | 'createUser' | 'deleteDraft' | 'deleteDraftById' | 'deleteDraftTeam' | 'deleteDraftTeamByDraftIdAndDraftOrder' | 'deleteDraftTeamByDraftIdAndLeagueIdAndTeamId' | 'deleteLeague' | 'deleteLeagueById' | 'deleteLeagueMember' | 'deleteLeagueMemberByLeagueIdAndUserId' | 'deleteTeam' | 'deleteTeamById' | 'deleteTeamByIdAndLeagueId' | 'deleteUser' | 'deleteUserByEmail' | 'deleteUserById' | 'deleteUserByUsername' | 'updateDraft' | 'updateDraftById' | 'updateDraftTeam' | 'updateDraftTeamByDraftIdAndDraftOrder' | 'updateDraftTeamByDraftIdAndLeagueIdAndTeamId' | 'updateLeague' | 'updateLeagueById' | 'updateLeagueMember' | 'updateLeagueMemberByLeagueIdAndUserId' | 'updateTeam' | 'updateTeamById' | 'updateTeamByIdAndLeagueId' | 'updateUser' | 'updateUserByEmail' | 'updateUserById' | 'updateUserByUsername' | MutationKeySpecifier)[];
export type MutationFieldPolicy = {
	createDraft?: FieldPolicy<any> | FieldReadFunction<any>,
	createDraftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	createLeague?: FieldPolicy<any> | FieldReadFunction<any>,
	createLeagueAndTeams?: FieldPolicy<any> | FieldReadFunction<any>,
	createLeagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	createTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	createUser?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraft?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraftById?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraftTeamByDraftIdAndDraftOrder?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraftTeamByDraftIdAndLeagueIdAndTeamId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeague?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeagueById?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeagueMemberByLeagueIdAndUserId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteTeamById?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteTeamByIdAndLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteUser?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteUserByEmail?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteUserById?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteUserByUsername?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraft?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraftById?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraftTeamByDraftIdAndDraftOrder?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraftTeamByDraftIdAndLeagueIdAndTeamId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeague?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeagueById?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeagueMemberByLeagueIdAndUserId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	updateTeamById?: FieldPolicy<any> | FieldReadFunction<any>,
	updateTeamByIdAndLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateUser?: FieldPolicy<any> | FieldReadFunction<any>,
	updateUserByEmail?: FieldPolicy<any> | FieldReadFunction<any>,
	updateUserById?: FieldPolicy<any> | FieldReadFunction<any>,
	updateUserByUsername?: FieldPolicy<any> | FieldReadFunction<any>
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
export type QueryKeySpecifier = ('allDraftTeams' | 'allDrafts' | 'allLeagueMembers' | 'allLeagues' | 'allTeams' | 'allUsers' | 'draft' | 'draftById' | 'draftTeam' | 'draftTeamByDraftIdAndDraftOrder' | 'draftTeamByDraftIdAndLeagueIdAndTeamId' | 'league' | 'leagueById' | 'leagueMember' | 'leagueMemberByLeagueIdAndUserId' | 'node' | 'nodeId' | 'query' | 'team' | 'teamById' | 'teamByIdAndLeagueId' | 'user' | 'userByEmail' | 'userById' | 'userByUsername' | QueryKeySpecifier)[];
export type QueryFieldPolicy = {
	allDraftTeams?: FieldPolicy<any> | FieldReadFunction<any>,
	allDrafts?: FieldPolicy<any> | FieldReadFunction<any>,
	allLeagueMembers?: FieldPolicy<any> | FieldReadFunction<any>,
	allLeagues?: FieldPolicy<any> | FieldReadFunction<any>,
	allTeams?: FieldPolicy<any> | FieldReadFunction<any>,
	allUsers?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftById?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamByDraftIdAndDraftOrder?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamByDraftIdAndLeagueIdAndTeamId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueById?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMemberByLeagueIdAndUserId?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	team?: FieldPolicy<any> | FieldReadFunction<any>,
	teamById?: FieldPolicy<any> | FieldReadFunction<any>,
	teamByIdAndLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>,
	userByEmail?: FieldPolicy<any> | FieldReadFunction<any>,
	userById?: FieldPolicy<any> | FieldReadFunction<any>,
	userByUsername?: FieldPolicy<any> | FieldReadFunction<any>
};
export type TeamKeySpecifier = ('draftTeamsByTeamIdAndLeagueId' | 'id' | 'leagueByLeagueId' | 'leagueId' | 'name' | 'nodeId' | TeamKeySpecifier)[];
export type TeamFieldPolicy = {
	draftTeamsByTeamIdAndLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
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
export type UpdateDraftPayloadKeySpecifier = ('clientMutationId' | 'draft' | 'draftEdge' | 'leagueByLeagueId' | 'query' | UpdateDraftPayloadKeySpecifier)[];
export type UpdateDraftPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateDraftTeamPayloadKeySpecifier = ('clientMutationId' | 'draftByDraftId' | 'draftTeam' | 'draftTeamEdge' | 'leagueByLeagueId' | 'query' | 'teamByTeamIdAndLeagueId' | UpdateDraftTeamPayloadKeySpecifier)[];
export type UpdateDraftTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	draftByDraftId?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	teamByTeamIdAndLeagueId?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateLeagueMemberPayloadKeySpecifier = ('clientMutationId' | 'leagueByLeagueId' | 'leagueMember' | 'leagueMemberEdge' | 'query' | 'userByUserId' | UpdateLeagueMemberPayloadKeySpecifier)[];
export type UpdateLeagueMemberPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMemberEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	userByUserId?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateLeaguePayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueEdge' | 'query' | UpdateLeaguePayloadKeySpecifier)[];
export type UpdateLeaguePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateTeamPayloadKeySpecifier = ('clientMutationId' | 'leagueByLeagueId' | 'query' | 'team' | 'teamEdge' | UpdateTeamPayloadKeySpecifier)[];
export type UpdateTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueByLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
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
export type UserKeySpecifier = ('about' | 'createdAt' | 'email' | 'id' | 'isAdmin' | 'leagueMembersByUserId' | 'name' | 'nodeId' | 'updatedAt' | 'username' | UserKeySpecifier)[];
export type UserFieldPolicy = {
	about?: FieldPolicy<any> | FieldReadFunction<any>,
	createdAt?: FieldPolicy<any> | FieldReadFunction<any>,
	email?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	isAdmin?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMembersByUserId?: FieldPolicy<any> | FieldReadFunction<any>,
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
	CreateLeaguePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateLeaguePayloadKeySpecifier | (() => undefined | CreateLeaguePayloadKeySpecifier),
		fields?: CreateLeaguePayloadFieldPolicy,
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
	DeleteLeaguePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteLeaguePayloadKeySpecifier | (() => undefined | DeleteLeaguePayloadKeySpecifier),
		fields?: DeleteLeaguePayloadFieldPolicy,
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
	Query?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | QueryKeySpecifier | (() => undefined | QueryKeySpecifier),
		fields?: QueryFieldPolicy,
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
	UpdateLeaguePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateLeaguePayloadKeySpecifier | (() => undefined | UpdateLeaguePayloadKeySpecifier),
		fields?: UpdateLeaguePayloadFieldPolicy,
	},
	UpdateTeamPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateTeamPayloadKeySpecifier | (() => undefined | UpdateTeamPayloadKeySpecifier),
		fields?: UpdateTeamPayloadFieldPolicy,
	},
	UpdateUserPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateUserPayloadKeySpecifier | (() => undefined | UpdateUserPayloadKeySpecifier),
		fields?: UpdateUserPayloadFieldPolicy,
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