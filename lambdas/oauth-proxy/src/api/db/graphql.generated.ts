import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
import { FieldPolicy, FieldReadFunction, TypePolicies, TypePolicy } from '@apollo/client/cache';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export const UserFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"about"}},{"kind":"Field","name":{"kind":"Name","value":"isAdmin"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]} as unknown as DocumentNode<UserFragment, unknown>;
export const GetUserByEmail = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetUserByEmail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userByEmail"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"about"}},{"kind":"Field","name":{"kind":"Name","value":"isAdmin"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]} as unknown as DocumentNode<GetUserByEmailQuery, GetUserByEmailQueryVariables>;
export const GetUserById = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetUserById"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"about"}},{"kind":"Field","name":{"kind":"Name","value":"isAdmin"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]} as unknown as DocumentNode<GetUserByIdQuery, GetUserByIdQueryVariables>;
export const CreateUser = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateUser"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateUserInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createUser"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"about"}},{"kind":"Field","name":{"kind":"Name","value":"isAdmin"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]} as unknown as DocumentNode<CreateUserMutation, CreateUserMutationVariables>;
export type UserFragment = { __typename?: 'User', id: number, email: string, createdAt: string, about?: string | null, isAdmin: boolean, name: string, username: string };

export type GetUserByEmailQueryVariables = Exact<{
  email: Scalars['String']['input'];
}>;


export type GetUserByEmailQuery = { __typename?: 'Query', userByEmail?: { __typename?: 'User', id: number, email: string, createdAt: string, about?: string | null, isAdmin: boolean, name: string, username: string } | null };

export type GetUserByIdQueryVariables = Exact<{
  id: Scalars['Int']['input'];
}>;


export type GetUserByIdQuery = { __typename?: 'Query', user?: { __typename?: 'User', id: number, email: string, createdAt: string, about?: string | null, isAdmin: boolean, name: string, username: string } | null };

export type CreateUserMutationVariables = Exact<{
  input: CreateUserInput;
}>;


export type CreateUserMutation = { __typename?: 'Mutation', createUser?: { __typename?: 'CreateUserPayload', user?: { __typename?: 'User', id: number, email: string, createdAt: string, about?: string | null, isAdmin: boolean, name: string, username: string } | null } | null };

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

export type CareerBatting = Node & {
  __typename?: 'CareerBatting';
  _2B?: Maybe<Scalars['Int']['output']>;
  _3B?: Maybe<Scalars['Int']['output']>;
  ab?: Maybe<Scalars['Int']['output']>;
  awardSummary?: Maybe<Scalars['String']['output']>;
  battingAvg?: Maybe<Scalars['Float']['output']>;
  bb?: Maybe<Scalars['Int']['output']>;
  cs?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  gidp?: Maybe<Scalars['Int']['output']>;
  h?: Maybe<Scalars['Int']['output']>;
  hbp?: Maybe<Scalars['Int']['output']>;
  hr?: Maybe<Scalars['Int']['output']>;
  ibb?: Maybe<Scalars['Int']['output']>;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  onbasePerc?: Maybe<Scalars['Float']['output']>;
  onbasePlusSlugging?: Maybe<Scalars['Float']['output']>;
  onbasePlusSluggingPlus?: Maybe<Scalars['Float']['output']>;
  pa?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `Player` that is related to this `CareerBatting`. */
  player?: Maybe<Player>;
  playerId: Scalars['Int']['output'];
  posSeason?: Maybe<Scalars['String']['output']>;
  r?: Maybe<Scalars['Int']['output']>;
  rbi?: Maybe<Scalars['Int']['output']>;
  sb?: Maybe<Scalars['Int']['output']>;
  sf?: Maybe<Scalars['String']['output']>;
  sh?: Maybe<Scalars['Int']['output']>;
  sluggingPerc?: Maybe<Scalars['Float']['output']>;
  so?: Maybe<Scalars['Int']['output']>;
  tb?: Maybe<Scalars['Int']['output']>;
};

/**
 * A condition to be used against `CareerBatting` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type CareerBattingCondition = {
  /** Checks for equality with the object’s `_2B` field. */
  _2B?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `_3B` field. */
  _3B?: InputMaybe<Scalars['Int']['input']>;
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
};

/** An input for mutations affecting `CareerBatting` */
export type CareerBattingInput = {
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
  playerId: Scalars['Int']['input'];
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

/** Represents an update to a `CareerBatting`. Fields that are set will be updated. */
export type CareerBattingPatch = {
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

/** A connection to a list of `CareerBatting` values. */
export type CareerBattingsConnection = {
  __typename?: 'CareerBattingsConnection';
  /** A list of edges which contains the `CareerBatting` and cursor to aid in pagination. */
  edges: Array<CareerBattingsEdge>;
  /** A list of `CareerBatting` objects. */
  nodes: Array<Maybe<CareerBatting>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `CareerBatting` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `CareerBatting` edge in the connection. */
export type CareerBattingsEdge = {
  __typename?: 'CareerBattingsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `CareerBatting` at the end of the edge. */
  node?: Maybe<CareerBatting>;
};

/** Methods to use when ordering `CareerBatting`. */
export enum CareerBattingsOrderBy {
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
  '2BAsc' = '_2_B_ASC',
  '2BDesc' = '_2_B_DESC',
  '3BAsc' = '_3_B_ASC',
  '3BDesc' = '_3_B_DESC'
}

export type CareerFielding = Node & {
  __typename?: 'CareerFielding';
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
  lgId?: Maybe<Scalars['String']['output']>;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  pickoffs?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `Player` that is related to this `CareerFielding`. */
  player?: Maybe<Player>;
  playerId: Scalars['Int']['output'];
  po?: Maybe<Scalars['Int']['output']>;
  pos?: Maybe<Scalars['String']['output']>;
  rangeFactorPerGame?: Maybe<Scalars['Float']['output']>;
  rangeFactorPerGameLg?: Maybe<Scalars['Float']['output']>;
  rangeFactorPerNine?: Maybe<Scalars['Float']['output']>;
  rangeFactorPerNineLg?: Maybe<Scalars['Float']['output']>;
  sb?: Maybe<Scalars['Int']['output']>;
  wp?: Maybe<Scalars['Int']['output']>;
};

/**
 * A condition to be used against `CareerFielding` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type CareerFieldingCondition = {
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
  /** Checks for equality with the object’s `wp` field. */
  wp?: InputMaybe<Scalars['Int']['input']>;
};

/** An input for mutations affecting `CareerFielding` */
export type CareerFieldingInput = {
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
  playerId: Scalars['Int']['input'];
  po?: InputMaybe<Scalars['Int']['input']>;
  pos?: InputMaybe<Scalars['String']['input']>;
  rangeFactorPerGame?: InputMaybe<Scalars['Float']['input']>;
  rangeFactorPerGameLg?: InputMaybe<Scalars['Float']['input']>;
  rangeFactorPerNine?: InputMaybe<Scalars['Float']['input']>;
  rangeFactorPerNineLg?: InputMaybe<Scalars['Float']['input']>;
  sb?: InputMaybe<Scalars['Int']['input']>;
  wp?: InputMaybe<Scalars['Int']['input']>;
};

/** Represents an update to a `CareerFielding`. Fields that are set will be updated. */
export type CareerFieldingPatch = {
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

/** A connection to a list of `CareerFielding` values. */
export type CareerFieldingsConnection = {
  __typename?: 'CareerFieldingsConnection';
  /** A list of edges which contains the `CareerFielding` and cursor to aid in pagination. */
  edges: Array<CareerFieldingsEdge>;
  /** A list of `CareerFielding` objects. */
  nodes: Array<Maybe<CareerFielding>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `CareerFielding` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `CareerFielding` edge in the connection. */
export type CareerFieldingsEdge = {
  __typename?: 'CareerFieldingsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `CareerFielding` at the end of the edge. */
  node?: Maybe<CareerFielding>;
};

/** Methods to use when ordering `CareerFielding`. */
export enum CareerFieldingsOrderBy {
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
  WpAsc = 'WP_ASC',
  WpDesc = 'WP_DESC'
}

export type CareerPitching = Node & {
  __typename?: 'CareerPitching';
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
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  /** Reads a single `Player` that is related to this `CareerPitching`. */
  player?: Maybe<Player>;
  playerId: Scalars['Int']['output'];
  r?: Maybe<Scalars['Int']['output']>;
  sho?: Maybe<Scalars['Int']['output']>;
  so?: Maybe<Scalars['Int']['output']>;
  strikeoutsPerBaseOnBalls?: Maybe<Scalars['Float']['output']>;
  strikeoutsPerNine?: Maybe<Scalars['Float']['output']>;
  sv?: Maybe<Scalars['Int']['output']>;
  w?: Maybe<Scalars['Int']['output']>;
  whip?: Maybe<Scalars['Float']['output']>;
  winLossPerc?: Maybe<Scalars['BigFloat']['output']>;
  wp?: Maybe<Scalars['Int']['output']>;
};

/**
 * A condition to be used against `CareerPitching` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type CareerPitchingCondition = {
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
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `r` field. */
  r?: InputMaybe<Scalars['Int']['input']>;
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
  /** Checks for equality with the object’s `w` field. */
  w?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `whip` field. */
  whip?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `winLossPerc` field. */
  winLossPerc?: InputMaybe<Scalars['BigFloat']['input']>;
  /** Checks for equality with the object’s `wp` field. */
  wp?: InputMaybe<Scalars['Int']['input']>;
};

/** An input for mutations affecting `CareerPitching` */
export type CareerPitchingInput = {
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
  playerId: Scalars['Int']['input'];
  r?: InputMaybe<Scalars['Int']['input']>;
  sho?: InputMaybe<Scalars['Int']['input']>;
  so?: InputMaybe<Scalars['Int']['input']>;
  strikeoutsPerBaseOnBalls?: InputMaybe<Scalars['Float']['input']>;
  strikeoutsPerNine?: InputMaybe<Scalars['Float']['input']>;
  sv?: InputMaybe<Scalars['Int']['input']>;
  w?: InputMaybe<Scalars['Int']['input']>;
  whip?: InputMaybe<Scalars['Float']['input']>;
  winLossPerc?: InputMaybe<Scalars['BigFloat']['input']>;
  wp?: InputMaybe<Scalars['Int']['input']>;
};

/** Represents an update to a `CareerPitching`. Fields that are set will be updated. */
export type CareerPitchingPatch = {
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
  playerId?: InputMaybe<Scalars['Int']['input']>;
  r?: InputMaybe<Scalars['Int']['input']>;
  sho?: InputMaybe<Scalars['Int']['input']>;
  so?: InputMaybe<Scalars['Int']['input']>;
  strikeoutsPerBaseOnBalls?: InputMaybe<Scalars['Float']['input']>;
  strikeoutsPerNine?: InputMaybe<Scalars['Float']['input']>;
  sv?: InputMaybe<Scalars['Int']['input']>;
  w?: InputMaybe<Scalars['Int']['input']>;
  whip?: InputMaybe<Scalars['Float']['input']>;
  winLossPerc?: InputMaybe<Scalars['BigFloat']['input']>;
  wp?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `CareerPitching` values. */
export type CareerPitchingsConnection = {
  __typename?: 'CareerPitchingsConnection';
  /** A list of edges which contains the `CareerPitching` and cursor to aid in pagination. */
  edges: Array<CareerPitchingsEdge>;
  /** A list of `CareerPitching` objects. */
  nodes: Array<Maybe<CareerPitching>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `CareerPitching` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `CareerPitching` edge in the connection. */
export type CareerPitchingsEdge = {
  __typename?: 'CareerPitchingsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `CareerPitching` at the end of the edge. */
  node?: Maybe<CareerPitching>;
};

/** Methods to use when ordering `CareerPitching`. */
export enum CareerPitchingsOrderBy {
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
  LAsc = 'L_ASC',
  LDesc = 'L_DESC',
  Natural = 'NATURAL',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  RAsc = 'R_ASC',
  RDesc = 'R_DESC',
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
  WhipAsc = 'WHIP_ASC',
  WhipDesc = 'WHIP_DESC',
  WinLossPercAsc = 'WIN_LOSS_PERC_ASC',
  WinLossPercDesc = 'WIN_LOSS_PERC_DESC',
  WpAsc = 'WP_ASC',
  WpDesc = 'WP_DESC',
  WAsc = 'W_ASC',
  WDesc = 'W_DESC'
}

/** All input for the create `CareerBatting` mutation. */
export type CreateCareerBattingInput = {
  /** The `CareerBatting` to be created by this mutation. */
  careerBatting: CareerBattingInput;
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
};

/** The output of our create `CareerBatting` mutation. */
export type CreateCareerBattingPayload = {
  __typename?: 'CreateCareerBattingPayload';
  /** The `CareerBatting` that was created by this mutation. */
  careerBatting?: Maybe<CareerBatting>;
  /** An edge for our `CareerBatting`. May be used by Relay 1. */
  careerBattingEdge?: Maybe<CareerBattingsEdge>;
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Player` that is related to this `CareerBatting`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our create `CareerBatting` mutation. */
export type CreateCareerBattingPayloadCareerBattingEdgeArgs = {
  orderBy?: InputMaybe<Array<CareerBattingsOrderBy>>;
};

/** All input for the create `CareerFielding` mutation. */
export type CreateCareerFieldingInput = {
  /** The `CareerFielding` to be created by this mutation. */
  careerFielding: CareerFieldingInput;
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
};

/** The output of our create `CareerFielding` mutation. */
export type CreateCareerFieldingPayload = {
  __typename?: 'CreateCareerFieldingPayload';
  /** The `CareerFielding` that was created by this mutation. */
  careerFielding?: Maybe<CareerFielding>;
  /** An edge for our `CareerFielding`. May be used by Relay 1. */
  careerFieldingEdge?: Maybe<CareerFieldingsEdge>;
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Player` that is related to this `CareerFielding`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our create `CareerFielding` mutation. */
export type CreateCareerFieldingPayloadCareerFieldingEdgeArgs = {
  orderBy?: InputMaybe<Array<CareerFieldingsOrderBy>>;
};

/** All input for the create `CareerPitching` mutation. */
export type CreateCareerPitchingInput = {
  /** The `CareerPitching` to be created by this mutation. */
  careerPitching: CareerPitchingInput;
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
};

/** The output of our create `CareerPitching` mutation. */
export type CreateCareerPitchingPayload = {
  __typename?: 'CreateCareerPitchingPayload';
  /** The `CareerPitching` that was created by this mutation. */
  careerPitching?: Maybe<CareerPitching>;
  /** An edge for our `CareerPitching`. May be used by Relay 1. */
  careerPitchingEdge?: Maybe<CareerPitchingsEdge>;
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Player` that is related to this `CareerPitching`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our create `CareerPitching` mutation. */
export type CreateCareerPitchingPayloadCareerPitchingEdgeArgs = {
  orderBy?: InputMaybe<Array<CareerPitchingsOrderBy>>;
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

/** All input for the `deleteCareerBattingByNodeId` mutation. */
export type DeleteCareerBattingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `CareerBatting` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteCareerBatting` mutation. */
export type DeleteCareerBattingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  playerId: Scalars['Int']['input'];
};

/** The output of our delete `CareerBatting` mutation. */
export type DeleteCareerBattingPayload = {
  __typename?: 'DeleteCareerBattingPayload';
  /** The `CareerBatting` that was deleted by this mutation. */
  careerBatting?: Maybe<CareerBatting>;
  /** An edge for our `CareerBatting`. May be used by Relay 1. */
  careerBattingEdge?: Maybe<CareerBattingsEdge>;
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedCareerBattingNodeId?: Maybe<Scalars['ID']['output']>;
  /** Reads a single `Player` that is related to this `CareerBatting`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our delete `CareerBatting` mutation. */
export type DeleteCareerBattingPayloadCareerBattingEdgeArgs = {
  orderBy?: InputMaybe<Array<CareerBattingsOrderBy>>;
};

/** All input for the `deleteCareerFieldingByNodeId` mutation. */
export type DeleteCareerFieldingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `CareerFielding` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteCareerFielding` mutation. */
export type DeleteCareerFieldingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  playerId: Scalars['Int']['input'];
};

/** The output of our delete `CareerFielding` mutation. */
export type DeleteCareerFieldingPayload = {
  __typename?: 'DeleteCareerFieldingPayload';
  /** The `CareerFielding` that was deleted by this mutation. */
  careerFielding?: Maybe<CareerFielding>;
  /** An edge for our `CareerFielding`. May be used by Relay 1. */
  careerFieldingEdge?: Maybe<CareerFieldingsEdge>;
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedCareerFieldingNodeId?: Maybe<Scalars['ID']['output']>;
  /** Reads a single `Player` that is related to this `CareerFielding`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our delete `CareerFielding` mutation. */
export type DeleteCareerFieldingPayloadCareerFieldingEdgeArgs = {
  orderBy?: InputMaybe<Array<CareerFieldingsOrderBy>>;
};

/** All input for the `deleteCareerPitchingByNodeId` mutation. */
export type DeleteCareerPitchingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `CareerPitching` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteCareerPitching` mutation. */
export type DeleteCareerPitchingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  playerId: Scalars['Int']['input'];
};

/** The output of our delete `CareerPitching` mutation. */
export type DeleteCareerPitchingPayload = {
  __typename?: 'DeleteCareerPitchingPayload';
  /** The `CareerPitching` that was deleted by this mutation. */
  careerPitching?: Maybe<CareerPitching>;
  /** An edge for our `CareerPitching`. May be used by Relay 1. */
  careerPitchingEdge?: Maybe<CareerPitchingsEdge>;
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedCareerPitchingNodeId?: Maybe<Scalars['ID']['output']>;
  /** Reads a single `Player` that is related to this `CareerPitching`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our delete `CareerPitching` mutation. */
export type DeleteCareerPitchingPayloadCareerPitchingEdgeArgs = {
  orderBy?: InputMaybe<Array<CareerPitchingsOrderBy>>;
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
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  permissionLevel: LeaguePermissionLevel;
  teamId?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `User` that is related to this `LeagueMember`. */
  user?: Maybe<User>;
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
  bulkUpdateStats?: Maybe<BulkUpdateStatsPayload>;
  /** Creates a single `CareerBatting`. */
  createCareerBatting?: Maybe<CreateCareerBattingPayload>;
  /** Creates a single `CareerFielding`. */
  createCareerFielding?: Maybe<CreateCareerFieldingPayload>;
  /** Creates a single `CareerPitching`. */
  createCareerPitching?: Maybe<CreateCareerPitchingPayload>;
  /** Creates a single `Draft`. */
  createDraft?: Maybe<CreateDraftPayload>;
  /** Creates a single `DraftTeam`. */
  createDraftTeam?: Maybe<CreateDraftTeamPayload>;
  /** Creates a single `League`. */
  createLeague?: Maybe<CreateLeaguePayload>;
  createLeagueAndTeams?: Maybe<CreateLeagueAndTeamsPayload>;
  /** Creates a single `LeagueMember`. */
  createLeagueMember?: Maybe<CreateLeagueMemberPayload>;
  /** Creates a single `Player`. */
  createPlayer?: Maybe<CreatePlayerPayload>;
  createPlayers?: Maybe<CreatePlayersPayload>;
  /** Creates a single `Team`. */
  createTeam?: Maybe<CreateTeamPayload>;
  /** Creates a single `User`. */
  createUser?: Maybe<CreateUserPayload>;
  /** Deletes a single `CareerBatting` using a unique key. */
  deleteCareerBatting?: Maybe<DeleteCareerBattingPayload>;
  /** Deletes a single `CareerBatting` using its globally unique id. */
  deleteCareerBattingByNodeId?: Maybe<DeleteCareerBattingPayload>;
  /** Deletes a single `CareerFielding` using a unique key. */
  deleteCareerFielding?: Maybe<DeleteCareerFieldingPayload>;
  /** Deletes a single `CareerFielding` using its globally unique id. */
  deleteCareerFieldingByNodeId?: Maybe<DeleteCareerFieldingPayload>;
  /** Deletes a single `CareerPitching` using a unique key. */
  deleteCareerPitching?: Maybe<DeleteCareerPitchingPayload>;
  /** Deletes a single `CareerPitching` using its globally unique id. */
  deleteCareerPitchingByNodeId?: Maybe<DeleteCareerPitchingPayload>;
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
  /** Deletes a single `Player` using a unique key. */
  deletePlayer?: Maybe<DeletePlayerPayload>;
  /** Deletes a single `Player` using a unique key. */
  deletePlayerByBrefId?: Maybe<DeletePlayerPayload>;
  /** Deletes a single `Player` using its globally unique id. */
  deletePlayerByNodeId?: Maybe<DeletePlayerPayload>;
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
  /** Updates a single `CareerBatting` using a unique key and a patch. */
  updateCareerBatting?: Maybe<UpdateCareerBattingPayload>;
  /** Updates a single `CareerBatting` using its globally unique id and a patch. */
  updateCareerBattingByNodeId?: Maybe<UpdateCareerBattingPayload>;
  /** Updates a single `CareerFielding` using a unique key and a patch. */
  updateCareerFielding?: Maybe<UpdateCareerFieldingPayload>;
  /** Updates a single `CareerFielding` using its globally unique id and a patch. */
  updateCareerFieldingByNodeId?: Maybe<UpdateCareerFieldingPayload>;
  /** Updates a single `CareerPitching` using a unique key and a patch. */
  updateCareerPitching?: Maybe<UpdateCareerPitchingPayload>;
  /** Updates a single `CareerPitching` using its globally unique id and a patch. */
  updateCareerPitchingByNodeId?: Maybe<UpdateCareerPitchingPayload>;
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
  /** Updates a single `Player` using a unique key and a patch. */
  updatePlayer?: Maybe<UpdatePlayerPayload>;
  /** Updates a single `Player` using a unique key and a patch. */
  updatePlayerByBrefId?: Maybe<UpdatePlayerPayload>;
  /** Updates a single `Player` using its globally unique id and a patch. */
  updatePlayerByNodeId?: Maybe<UpdatePlayerPayload>;
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
  upsertTypeIntoTable?: Maybe<UpsertTypeIntoTablePayload>;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationBulkUpdateStatsArgs = {
  input: BulkUpdateStatsInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateCareerBattingArgs = {
  input: CreateCareerBattingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateCareerFieldingArgs = {
  input: CreateCareerFieldingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateCareerPitchingArgs = {
  input: CreateCareerPitchingInput;
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
export type MutationCreatePlayerArgs = {
  input: CreatePlayerInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreatePlayersArgs = {
  input: CreatePlayersInput;
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
export type MutationDeleteCareerBattingArgs = {
  input: DeleteCareerBattingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteCareerBattingByNodeIdArgs = {
  input: DeleteCareerBattingByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteCareerFieldingArgs = {
  input: DeleteCareerFieldingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteCareerFieldingByNodeIdArgs = {
  input: DeleteCareerFieldingByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteCareerPitchingArgs = {
  input: DeleteCareerPitchingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteCareerPitchingByNodeIdArgs = {
  input: DeleteCareerPitchingByNodeIdInput;
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
export type MutationUpdateCareerBattingArgs = {
  input: UpdateCareerBattingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateCareerBattingByNodeIdArgs = {
  input: UpdateCareerBattingByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateCareerFieldingArgs = {
  input: UpdateCareerFieldingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateCareerFieldingByNodeIdArgs = {
  input: UpdateCareerFieldingByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateCareerPitchingArgs = {
  input: UpdateCareerPitchingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateCareerPitchingByNodeIdArgs = {
  input: UpdateCareerPitchingByNodeIdInput;
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
export type MutationUpsertTypeIntoTableArgs = {
  input: UpsertTypeIntoTableInput;
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
  /** Reads a single `CareerBatting` that is related to this `Player`. */
  careerBatting?: Maybe<CareerBatting>;
  /**
   * Reads and enables pagination through a set of `CareerBatting`.
   * @deprecated Please use careerBatting instead
   */
  careerBattings: CareerBattingsConnection;
  /** Reads a single `CareerFielding` that is related to this `Player`. */
  careerFielding?: Maybe<CareerFielding>;
  /**
   * Reads and enables pagination through a set of `CareerFielding`.
   * @deprecated Please use careerFielding instead
   */
  careerFieldings: CareerFieldingsConnection;
  /** Reads a single `CareerPitching` that is related to this `Player`. */
  careerPitching?: Maybe<CareerPitching>;
  /**
   * Reads and enables pagination through a set of `CareerPitching`.
   * @deprecated Please use careerPitching instead
   */
  careerPitchings: CareerPitchingsConnection;
  id: Scalars['Int']['output'];
  name?: Maybe<Scalars['String']['output']>;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
};


export type PlayerCareerBattingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<CareerBattingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<CareerBattingsOrderBy>>;
};


export type PlayerCareerFieldingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<CareerFieldingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<CareerFieldingsOrderBy>>;
};


export type PlayerCareerPitchingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<CareerPitchingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<CareerPitchingsOrderBy>>;
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
  careerBatting?: Maybe<CareerBatting>;
  /** Reads a single `CareerBatting` using its globally unique `ID`. */
  careerBattingByNodeId?: Maybe<CareerBatting>;
  /** Reads and enables pagination through a set of `CareerBatting`. */
  careerBattings?: Maybe<CareerBattingsConnection>;
  careerFielding?: Maybe<CareerFielding>;
  /** Reads a single `CareerFielding` using its globally unique `ID`. */
  careerFieldingByNodeId?: Maybe<CareerFielding>;
  /** Reads and enables pagination through a set of `CareerFielding`. */
  careerFieldings?: Maybe<CareerFieldingsConnection>;
  careerPitching?: Maybe<CareerPitching>;
  /** Reads a single `CareerPitching` using its globally unique `ID`. */
  careerPitchingByNodeId?: Maybe<CareerPitching>;
  /** Reads and enables pagination through a set of `CareerPitching`. */
  careerPitchings?: Maybe<CareerPitchingsConnection>;
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
export type QueryCareerBattingArgs = {
  playerId: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryCareerBattingByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryCareerBattingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<CareerBattingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<CareerBattingsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryCareerFieldingArgs = {
  playerId: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryCareerFieldingByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryCareerFieldingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<CareerFieldingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<CareerFieldingsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryCareerPitchingArgs = {
  playerId: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryCareerPitchingByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryCareerPitchingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<CareerPitchingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<CareerPitchingsOrderBy>>;
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

/** All input for the `updateCareerBattingByNodeId` mutation. */
export type UpdateCareerBattingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `CareerBatting` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `CareerBatting` being updated. */
  patch: CareerBattingPatch;
};

/** All input for the `updateCareerBatting` mutation. */
export type UpdateCareerBattingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** An object where the defined keys will be set on the `CareerBatting` being updated. */
  patch: CareerBattingPatch;
  playerId: Scalars['Int']['input'];
};

/** The output of our update `CareerBatting` mutation. */
export type UpdateCareerBattingPayload = {
  __typename?: 'UpdateCareerBattingPayload';
  /** The `CareerBatting` that was updated by this mutation. */
  careerBatting?: Maybe<CareerBatting>;
  /** An edge for our `CareerBatting`. May be used by Relay 1. */
  careerBattingEdge?: Maybe<CareerBattingsEdge>;
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Player` that is related to this `CareerBatting`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our update `CareerBatting` mutation. */
export type UpdateCareerBattingPayloadCareerBattingEdgeArgs = {
  orderBy?: InputMaybe<Array<CareerBattingsOrderBy>>;
};

/** All input for the `updateCareerFieldingByNodeId` mutation. */
export type UpdateCareerFieldingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `CareerFielding` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `CareerFielding` being updated. */
  patch: CareerFieldingPatch;
};

/** All input for the `updateCareerFielding` mutation. */
export type UpdateCareerFieldingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** An object where the defined keys will be set on the `CareerFielding` being updated. */
  patch: CareerFieldingPatch;
  playerId: Scalars['Int']['input'];
};

/** The output of our update `CareerFielding` mutation. */
export type UpdateCareerFieldingPayload = {
  __typename?: 'UpdateCareerFieldingPayload';
  /** The `CareerFielding` that was updated by this mutation. */
  careerFielding?: Maybe<CareerFielding>;
  /** An edge for our `CareerFielding`. May be used by Relay 1. */
  careerFieldingEdge?: Maybe<CareerFieldingsEdge>;
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Player` that is related to this `CareerFielding`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our update `CareerFielding` mutation. */
export type UpdateCareerFieldingPayloadCareerFieldingEdgeArgs = {
  orderBy?: InputMaybe<Array<CareerFieldingsOrderBy>>;
};

/** All input for the `updateCareerPitchingByNodeId` mutation. */
export type UpdateCareerPitchingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `CareerPitching` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `CareerPitching` being updated. */
  patch: CareerPitchingPatch;
};

/** All input for the `updateCareerPitching` mutation. */
export type UpdateCareerPitchingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** An object where the defined keys will be set on the `CareerPitching` being updated. */
  patch: CareerPitchingPatch;
  playerId: Scalars['Int']['input'];
};

/** The output of our update `CareerPitching` mutation. */
export type UpdateCareerPitchingPayload = {
  __typename?: 'UpdateCareerPitchingPayload';
  /** The `CareerPitching` that was updated by this mutation. */
  careerPitching?: Maybe<CareerPitching>;
  /** An edge for our `CareerPitching`. May be used by Relay 1. */
  careerPitchingEdge?: Maybe<CareerPitchingsEdge>;
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Player` that is related to this `CareerPitching`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our update `CareerPitching` mutation. */
export type UpdateCareerPitchingPayloadCareerPitchingEdgeArgs = {
  orderBy?: InputMaybe<Array<CareerPitchingsOrderBy>>;
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

export type User = Node & {
  __typename?: 'User';
  about?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['Datetime']['output'];
  email: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  isAdmin: Scalars['Boolean']['output'];
  /** Reads and enables pagination through a set of `LeagueMember`. */
  leagueMembers: LeagueMembersConnection;
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
export type CareerBattingKeySpecifier = ('_2B' | '_3B' | 'ab' | 'awardSummary' | 'battingAvg' | 'bb' | 'cs' | 'g' | 'gidp' | 'h' | 'hbp' | 'hr' | 'ibb' | 'nodeId' | 'onbasePerc' | 'onbasePlusSlugging' | 'onbasePlusSluggingPlus' | 'pa' | 'player' | 'playerId' | 'posSeason' | 'r' | 'rbi' | 'sb' | 'sf' | 'sh' | 'sluggingPerc' | 'so' | 'tb' | CareerBattingKeySpecifier)[];
export type CareerBattingFieldPolicy = {
	_2B?: FieldPolicy<any> | FieldReadFunction<any>,
	_3B?: FieldPolicy<any> | FieldReadFunction<any>,
	ab?: FieldPolicy<any> | FieldReadFunction<any>,
	awardSummary?: FieldPolicy<any> | FieldReadFunction<any>,
	battingAvg?: FieldPolicy<any> | FieldReadFunction<any>,
	bb?: FieldPolicy<any> | FieldReadFunction<any>,
	cs?: FieldPolicy<any> | FieldReadFunction<any>,
	g?: FieldPolicy<any> | FieldReadFunction<any>,
	gidp?: FieldPolicy<any> | FieldReadFunction<any>,
	h?: FieldPolicy<any> | FieldReadFunction<any>,
	hbp?: FieldPolicy<any> | FieldReadFunction<any>,
	hr?: FieldPolicy<any> | FieldReadFunction<any>,
	ibb?: FieldPolicy<any> | FieldReadFunction<any>,
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
	sf?: FieldPolicy<any> | FieldReadFunction<any>,
	sh?: FieldPolicy<any> | FieldReadFunction<any>,
	sluggingPerc?: FieldPolicy<any> | FieldReadFunction<any>,
	so?: FieldPolicy<any> | FieldReadFunction<any>,
	tb?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CareerBattingsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | CareerBattingsConnectionKeySpecifier)[];
export type CareerBattingsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CareerBattingsEdgeKeySpecifier = ('cursor' | 'node' | CareerBattingsEdgeKeySpecifier)[];
export type CareerBattingsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CareerFieldingKeySpecifier = ('a' | 'awardSummary' | 'caughtStealingPerc' | 'caughtStealingPercLg' | 'cg' | 'chances' | 'cs' | 'dpDef' | 'eDef' | 'fieldingPerc' | 'fieldingPercLg' | 'g' | 'gOfParts' | 'gs' | 'innDef' | 'lgId' | 'nodeId' | 'pickoffs' | 'player' | 'playerId' | 'po' | 'pos' | 'rangeFactorPerGame' | 'rangeFactorPerGameLg' | 'rangeFactorPerNine' | 'rangeFactorPerNineLg' | 'sb' | 'wp' | CareerFieldingKeySpecifier)[];
export type CareerFieldingFieldPolicy = {
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
	wp?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CareerFieldingsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | CareerFieldingsConnectionKeySpecifier)[];
export type CareerFieldingsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CareerFieldingsEdgeKeySpecifier = ('cursor' | 'node' | CareerFieldingsEdgeKeySpecifier)[];
export type CareerFieldingsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CareerPitchingKeySpecifier = ('awardSummary' | 'basesOnBallsPerNine' | 'battersFaced' | 'bb' | 'bk' | 'cg' | 'earnedRunAvg' | 'earnedRunAvgPlus' | 'er' | 'fip' | 'g' | 'gf' | 'gs' | 'h' | 'hbp' | 'hitsPerNine' | 'homeRunsPerNine' | 'hr' | 'ibb' | 'ip' | 'l' | 'nodeId' | 'player' | 'playerId' | 'r' | 'sho' | 'so' | 'strikeoutsPerBaseOnBalls' | 'strikeoutsPerNine' | 'sv' | 'w' | 'whip' | 'winLossPerc' | 'wp' | CareerPitchingKeySpecifier)[];
export type CareerPitchingFieldPolicy = {
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
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	r?: FieldPolicy<any> | FieldReadFunction<any>,
	sho?: FieldPolicy<any> | FieldReadFunction<any>,
	so?: FieldPolicy<any> | FieldReadFunction<any>,
	strikeoutsPerBaseOnBalls?: FieldPolicy<any> | FieldReadFunction<any>,
	strikeoutsPerNine?: FieldPolicy<any> | FieldReadFunction<any>,
	sv?: FieldPolicy<any> | FieldReadFunction<any>,
	w?: FieldPolicy<any> | FieldReadFunction<any>,
	whip?: FieldPolicy<any> | FieldReadFunction<any>,
	winLossPerc?: FieldPolicy<any> | FieldReadFunction<any>,
	wp?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CareerPitchingsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | CareerPitchingsConnectionKeySpecifier)[];
export type CareerPitchingsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CareerPitchingsEdgeKeySpecifier = ('cursor' | 'node' | CareerPitchingsEdgeKeySpecifier)[];
export type CareerPitchingsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateCareerBattingPayloadKeySpecifier = ('careerBatting' | 'careerBattingEdge' | 'clientMutationId' | 'player' | 'query' | CreateCareerBattingPayloadKeySpecifier)[];
export type CreateCareerBattingPayloadFieldPolicy = {
	careerBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	careerBattingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateCareerFieldingPayloadKeySpecifier = ('careerFielding' | 'careerFieldingEdge' | 'clientMutationId' | 'player' | 'query' | CreateCareerFieldingPayloadKeySpecifier)[];
export type CreateCareerFieldingPayloadFieldPolicy = {
	careerFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	careerFieldingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateCareerPitchingPayloadKeySpecifier = ('careerPitching' | 'careerPitchingEdge' | 'clientMutationId' | 'player' | 'query' | CreateCareerPitchingPayloadKeySpecifier)[];
export type CreateCareerPitchingPayloadFieldPolicy = {
	careerPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	careerPitchingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
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
export type DeleteCareerBattingPayloadKeySpecifier = ('careerBatting' | 'careerBattingEdge' | 'clientMutationId' | 'deletedCareerBattingNodeId' | 'player' | 'query' | DeleteCareerBattingPayloadKeySpecifier)[];
export type DeleteCareerBattingPayloadFieldPolicy = {
	careerBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	careerBattingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedCareerBattingNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteCareerFieldingPayloadKeySpecifier = ('careerFielding' | 'careerFieldingEdge' | 'clientMutationId' | 'deletedCareerFieldingNodeId' | 'player' | 'query' | DeleteCareerFieldingPayloadKeySpecifier)[];
export type DeleteCareerFieldingPayloadFieldPolicy = {
	careerFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	careerFieldingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedCareerFieldingNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteCareerPitchingPayloadKeySpecifier = ('careerPitching' | 'careerPitchingEdge' | 'clientMutationId' | 'deletedCareerPitchingNodeId' | 'player' | 'query' | DeleteCareerPitchingPayloadKeySpecifier)[];
export type DeleteCareerPitchingPayloadFieldPolicy = {
	careerPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	careerPitchingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedCareerPitchingNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
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
export type LeagueKeySpecifier = ('draftTeams' | 'drafts' | 'id' | 'leagueMembers' | 'name' | 'nodeId' | 'owner' | 'teams' | LeagueKeySpecifier)[];
export type LeagueFieldPolicy = {
	draftTeams?: FieldPolicy<any> | FieldReadFunction<any>,
	drafts?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMembers?: FieldPolicy<any> | FieldReadFunction<any>,
	name?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	owner?: FieldPolicy<any> | FieldReadFunction<any>,
	teams?: FieldPolicy<any> | FieldReadFunction<any>
};
export type LeagueMemberKeySpecifier = ('league' | 'leagueId' | 'nodeId' | 'permissionLevel' | 'teamId' | 'user' | 'userId' | LeagueMemberKeySpecifier)[];
export type LeagueMemberFieldPolicy = {
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueId?: FieldPolicy<any> | FieldReadFunction<any>,
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
export type MutationKeySpecifier = ('bulkUpdateStats' | 'createCareerBatting' | 'createCareerFielding' | 'createCareerPitching' | 'createDraft' | 'createDraftTeam' | 'createLeague' | 'createLeagueAndTeams' | 'createLeagueMember' | 'createPlayer' | 'createPlayers' | 'createTeam' | 'createUser' | 'deleteCareerBatting' | 'deleteCareerBattingByNodeId' | 'deleteCareerFielding' | 'deleteCareerFieldingByNodeId' | 'deleteCareerPitching' | 'deleteCareerPitchingByNodeId' | 'deleteDraft' | 'deleteDraftByNodeId' | 'deleteDraftTeam' | 'deleteDraftTeamByDraftIdAndDraftOrder' | 'deleteDraftTeamByNodeId' | 'deleteLeague' | 'deleteLeagueByNodeId' | 'deleteLeagueMember' | 'deleteLeagueMemberByNodeId' | 'deletePlayer' | 'deletePlayerByBrefId' | 'deletePlayerByNodeId' | 'deleteTeam' | 'deleteTeamByIdAndLeagueId' | 'deleteTeamByNodeId' | 'deleteUser' | 'deleteUserByEmail' | 'deleteUserByNodeId' | 'deleteUserByUsername' | 'updateCareerBatting' | 'updateCareerBattingByNodeId' | 'updateCareerFielding' | 'updateCareerFieldingByNodeId' | 'updateCareerPitching' | 'updateCareerPitchingByNodeId' | 'updateDraft' | 'updateDraftByNodeId' | 'updateDraftTeam' | 'updateDraftTeamByDraftIdAndDraftOrder' | 'updateDraftTeamByNodeId' | 'updateLeague' | 'updateLeagueByNodeId' | 'updateLeagueMember' | 'updateLeagueMemberByNodeId' | 'updatePlayer' | 'updatePlayerByBrefId' | 'updatePlayerByNodeId' | 'updateTeam' | 'updateTeamByIdAndLeagueId' | 'updateTeamByNodeId' | 'updateUser' | 'updateUserByEmail' | 'updateUserByNodeId' | 'updateUserByUsername' | 'upsertTypeIntoTable' | MutationKeySpecifier)[];
export type MutationFieldPolicy = {
	bulkUpdateStats?: FieldPolicy<any> | FieldReadFunction<any>,
	createCareerBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	createCareerFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	createCareerPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	createDraft?: FieldPolicy<any> | FieldReadFunction<any>,
	createDraftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	createLeague?: FieldPolicy<any> | FieldReadFunction<any>,
	createLeagueAndTeams?: FieldPolicy<any> | FieldReadFunction<any>,
	createLeagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	createPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	createPlayers?: FieldPolicy<any> | FieldReadFunction<any>,
	createTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	createUser?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteCareerBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteCareerBattingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteCareerFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteCareerFieldingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteCareerPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteCareerPitchingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraft?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraftByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraftTeamByDraftIdAndDraftOrder?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraftTeamByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeague?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeagueByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeagueMemberByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletePlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	deletePlayerByBrefId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletePlayerByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteTeamByIdAndLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteTeamByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteUser?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteUserByEmail?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteUserByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteUserByUsername?: FieldPolicy<any> | FieldReadFunction<any>,
	updateCareerBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	updateCareerBattingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateCareerFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	updateCareerFieldingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateCareerPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	updateCareerPitchingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraft?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraftByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraftTeamByDraftIdAndDraftOrder?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraftTeamByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeague?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeagueByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeagueMemberByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updatePlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	updatePlayerByBrefId?: FieldPolicy<any> | FieldReadFunction<any>,
	updatePlayerByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	updateTeamByIdAndLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateTeamByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateUser?: FieldPolicy<any> | FieldReadFunction<any>,
	updateUserByEmail?: FieldPolicy<any> | FieldReadFunction<any>,
	updateUserByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateUserByUsername?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertTypeIntoTable?: FieldPolicy<any> | FieldReadFunction<any>
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
export type PlayerKeySpecifier = ('brefId' | 'careerBatting' | 'careerBattings' | 'careerFielding' | 'careerFieldings' | 'careerPitching' | 'careerPitchings' | 'id' | 'name' | 'nodeId' | PlayerKeySpecifier)[];
export type PlayerFieldPolicy = {
	brefId?: FieldPolicy<any> | FieldReadFunction<any>,
	careerBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	careerBattings?: FieldPolicy<any> | FieldReadFunction<any>,
	careerFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	careerFieldings?: FieldPolicy<any> | FieldReadFunction<any>,
	careerPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	careerPitchings?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	name?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>
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
export type QueryKeySpecifier = ('careerBatting' | 'careerBattingByNodeId' | 'careerBattings' | 'careerFielding' | 'careerFieldingByNodeId' | 'careerFieldings' | 'careerPitching' | 'careerPitchingByNodeId' | 'careerPitchings' | 'draft' | 'draftByNodeId' | 'draftTeam' | 'draftTeamByDraftIdAndDraftOrder' | 'draftTeamByNodeId' | 'draftTeams' | 'drafts' | 'getColumnsForType' | 'league' | 'leagueByNodeId' | 'leagueMember' | 'leagueMemberByNodeId' | 'leagueMembers' | 'leagues' | 'node' | 'nodeId' | 'player' | 'playerByBrefId' | 'playerByNodeId' | 'players' | 'query' | 'team' | 'teamByIdAndLeagueId' | 'teamByNodeId' | 'teams' | 'user' | 'userByEmail' | 'userByNodeId' | 'userByUsername' | 'users' | QueryKeySpecifier)[];
export type QueryFieldPolicy = {
	careerBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	careerBattingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	careerBattings?: FieldPolicy<any> | FieldReadFunction<any>,
	careerFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	careerFieldingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	careerFieldings?: FieldPolicy<any> | FieldReadFunction<any>,
	careerPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	careerPitchingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	careerPitchings?: FieldPolicy<any> | FieldReadFunction<any>,
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
	leagues?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerByBrefId?: FieldPolicy<any> | FieldReadFunction<any>,
	playerByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	players?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
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
export type UpdateCareerBattingPayloadKeySpecifier = ('careerBatting' | 'careerBattingEdge' | 'clientMutationId' | 'player' | 'query' | UpdateCareerBattingPayloadKeySpecifier)[];
export type UpdateCareerBattingPayloadFieldPolicy = {
	careerBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	careerBattingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateCareerFieldingPayloadKeySpecifier = ('careerFielding' | 'careerFieldingEdge' | 'clientMutationId' | 'player' | 'query' | UpdateCareerFieldingPayloadKeySpecifier)[];
export type UpdateCareerFieldingPayloadFieldPolicy = {
	careerFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	careerFieldingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateCareerPitchingPayloadKeySpecifier = ('careerPitching' | 'careerPitchingEdge' | 'clientMutationId' | 'player' | 'query' | UpdateCareerPitchingPayloadKeySpecifier)[];
export type UpdateCareerPitchingPayloadFieldPolicy = {
	careerPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	careerPitchingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
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
export type UpsertTypeIntoTablePayloadKeySpecifier = ('clientMutationId' | 'query' | UpsertTypeIntoTablePayloadKeySpecifier)[];
export type UpsertTypeIntoTablePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UserKeySpecifier = ('about' | 'createdAt' | 'email' | 'id' | 'isAdmin' | 'leagueMembers' | 'name' | 'nodeId' | 'updatedAt' | 'username' | UserKeySpecifier)[];
export type UserFieldPolicy = {
	about?: FieldPolicy<any> | FieldReadFunction<any>,
	createdAt?: FieldPolicy<any> | FieldReadFunction<any>,
	email?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	isAdmin?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMembers?: FieldPolicy<any> | FieldReadFunction<any>,
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
	CareerBatting?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CareerBattingKeySpecifier | (() => undefined | CareerBattingKeySpecifier),
		fields?: CareerBattingFieldPolicy,
	},
	CareerBattingsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CareerBattingsConnectionKeySpecifier | (() => undefined | CareerBattingsConnectionKeySpecifier),
		fields?: CareerBattingsConnectionFieldPolicy,
	},
	CareerBattingsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CareerBattingsEdgeKeySpecifier | (() => undefined | CareerBattingsEdgeKeySpecifier),
		fields?: CareerBattingsEdgeFieldPolicy,
	},
	CareerFielding?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CareerFieldingKeySpecifier | (() => undefined | CareerFieldingKeySpecifier),
		fields?: CareerFieldingFieldPolicy,
	},
	CareerFieldingsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CareerFieldingsConnectionKeySpecifier | (() => undefined | CareerFieldingsConnectionKeySpecifier),
		fields?: CareerFieldingsConnectionFieldPolicy,
	},
	CareerFieldingsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CareerFieldingsEdgeKeySpecifier | (() => undefined | CareerFieldingsEdgeKeySpecifier),
		fields?: CareerFieldingsEdgeFieldPolicy,
	},
	CareerPitching?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CareerPitchingKeySpecifier | (() => undefined | CareerPitchingKeySpecifier),
		fields?: CareerPitchingFieldPolicy,
	},
	CareerPitchingsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CareerPitchingsConnectionKeySpecifier | (() => undefined | CareerPitchingsConnectionKeySpecifier),
		fields?: CareerPitchingsConnectionFieldPolicy,
	},
	CareerPitchingsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CareerPitchingsEdgeKeySpecifier | (() => undefined | CareerPitchingsEdgeKeySpecifier),
		fields?: CareerPitchingsEdgeFieldPolicy,
	},
	CreateCareerBattingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateCareerBattingPayloadKeySpecifier | (() => undefined | CreateCareerBattingPayloadKeySpecifier),
		fields?: CreateCareerBattingPayloadFieldPolicy,
	},
	CreateCareerFieldingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateCareerFieldingPayloadKeySpecifier | (() => undefined | CreateCareerFieldingPayloadKeySpecifier),
		fields?: CreateCareerFieldingPayloadFieldPolicy,
	},
	CreateCareerPitchingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateCareerPitchingPayloadKeySpecifier | (() => undefined | CreateCareerPitchingPayloadKeySpecifier),
		fields?: CreateCareerPitchingPayloadFieldPolicy,
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
	CreateTeamPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateTeamPayloadKeySpecifier | (() => undefined | CreateTeamPayloadKeySpecifier),
		fields?: CreateTeamPayloadFieldPolicy,
	},
	CreateUserPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateUserPayloadKeySpecifier | (() => undefined | CreateUserPayloadKeySpecifier),
		fields?: CreateUserPayloadFieldPolicy,
	},
	DeleteCareerBattingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteCareerBattingPayloadKeySpecifier | (() => undefined | DeleteCareerBattingPayloadKeySpecifier),
		fields?: DeleteCareerBattingPayloadFieldPolicy,
	},
	DeleteCareerFieldingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteCareerFieldingPayloadKeySpecifier | (() => undefined | DeleteCareerFieldingPayloadKeySpecifier),
		fields?: DeleteCareerFieldingPayloadFieldPolicy,
	},
	DeleteCareerPitchingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteCareerPitchingPayloadKeySpecifier | (() => undefined | DeleteCareerPitchingPayloadKeySpecifier),
		fields?: DeleteCareerPitchingPayloadFieldPolicy,
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
	DeletePlayerPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeletePlayerPayloadKeySpecifier | (() => undefined | DeletePlayerPayloadKeySpecifier),
		fields?: DeletePlayerPayloadFieldPolicy,
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
	UpdateCareerBattingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateCareerBattingPayloadKeySpecifier | (() => undefined | UpdateCareerBattingPayloadKeySpecifier),
		fields?: UpdateCareerBattingPayloadFieldPolicy,
	},
	UpdateCareerFieldingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateCareerFieldingPayloadKeySpecifier | (() => undefined | UpdateCareerFieldingPayloadKeySpecifier),
		fields?: UpdateCareerFieldingPayloadFieldPolicy,
	},
	UpdateCareerPitchingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateCareerPitchingPayloadKeySpecifier | (() => undefined | UpdateCareerPitchingPayloadKeySpecifier),
		fields?: UpdateCareerPitchingPayloadFieldPolicy,
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
	UpdatePlayerPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdatePlayerPayloadKeySpecifier | (() => undefined | UpdatePlayerPayloadKeySpecifier),
		fields?: UpdatePlayerPayloadFieldPolicy,
	},
	UpdateTeamPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateTeamPayloadKeySpecifier | (() => undefined | UpdateTeamPayloadKeySpecifier),
		fields?: UpdateTeamPayloadFieldPolicy,
	},
	UpdateUserPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateUserPayloadKeySpecifier | (() => undefined | UpdateUserPayloadKeySpecifier),
		fields?: UpdateUserPayloadFieldPolicy,
	},
	UpsertTypeIntoTablePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertTypeIntoTablePayloadKeySpecifier | (() => undefined | UpsertTypeIntoTablePayloadKeySpecifier),
		fields?: UpsertTypeIntoTablePayloadFieldPolicy,
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