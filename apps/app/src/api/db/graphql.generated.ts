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
export const UserFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]} as unknown as DocumentNode<UserFragment, unknown>;
export const LeagueMemberFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"LeagueMember"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"LeagueMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"permissionLevel"}},{"kind":"Field","name":{"kind":"Name","value":"teamId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]} as unknown as DocumentNode<LeagueMemberFragment, unknown>;
export const MatchupFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Matchup"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Matchup"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"weekNumber"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"numberOfGames"}}]}}]} as unknown as DocumentNode<MatchupFragment, unknown>;
export const TeamFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Team"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Team"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]} as unknown as DocumentNode<TeamFragment, unknown>;
export const LeagueFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"League"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"League"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"owner"}},{"kind":"Field","name":{"kind":"Name","value":"currentMatchup"}},{"kind":"Field","name":{"kind":"Name","value":"leagueMembers"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withMembers"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"LeagueMember"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"matchupByCurrentMatchup"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withMatchup"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Matchup"}}]}},{"kind":"Field","name":{"kind":"Name","value":"teams"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withTeams"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Team"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"LeagueMember"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"LeagueMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"permissionLevel"}},{"kind":"Field","name":{"kind":"Name","value":"teamId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Matchup"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Matchup"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"weekNumber"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"numberOfGames"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Team"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Team"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]} as unknown as DocumentNode<LeagueFragment, unknown>;
export const LeaguePositionFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"LeaguePosition"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"LeaguePosition"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"positionType"}}]}}]} as unknown as DocumentNode<LeaguePositionFragment, unknown>;
export const LeagueMessageFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"LeagueMessage"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"LeagueMessage"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"messageText"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}}]} as unknown as DocumentNode<LeagueMessageFragment, unknown>;
export const MatchupBattingStatsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MatchupBattingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MatchupBatting"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"ab"}},{"kind":"Field","name":{"kind":"Name","value":"bb"}},{"kind":"Field","name":{"kind":"Name","value":"cs"}},{"kind":"Field","name":{"kind":"Name","value":"doubles"}},{"kind":"Field","name":{"kind":"Name","value":"gidp"}},{"kind":"Field","name":{"kind":"Name","value":"h"}},{"kind":"Field","name":{"kind":"Name","value":"hbp"}},{"kind":"Field","name":{"kind":"Name","value":"hr"}},{"kind":"Field","name":{"kind":"Name","value":"ibb"}},{"kind":"Field","name":{"kind":"Name","value":"pa"}},{"kind":"Field","name":{"kind":"Name","value":"r"}},{"kind":"Field","name":{"kind":"Name","value":"rbi"}},{"kind":"Field","name":{"kind":"Name","value":"sb"}},{"kind":"Field","name":{"kind":"Name","value":"sh"}},{"kind":"Field","name":{"kind":"Name","value":"so"}},{"kind":"Field","name":{"kind":"Name","value":"triples"}}]}}]} as unknown as DocumentNode<MatchupBattingStatsFragment, unknown>;
export const MatchupFieldingStatsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MatchupFieldingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MatchupFielding"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"a"}},{"kind":"Field","name":{"kind":"Name","value":"chances"}},{"kind":"Field","name":{"kind":"Name","value":"dpDef"}},{"kind":"Field","name":{"kind":"Name","value":"eDef"}},{"kind":"Field","name":{"kind":"Name","value":"innDef"}},{"kind":"Field","name":{"kind":"Name","value":"po"}}]}}]} as unknown as DocumentNode<MatchupFieldingStatsFragment, unknown>;
export const MatchupPitchingStatsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MatchupPitchingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MatchupPitching"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"battersFaced"}},{"kind":"Field","name":{"kind":"Name","value":"bb"}},{"kind":"Field","name":{"kind":"Name","value":"cg"}},{"kind":"Field","name":{"kind":"Name","value":"er"}},{"kind":"Field","name":{"kind":"Name","value":"gf"}},{"kind":"Field","name":{"kind":"Name","value":"gs"}},{"kind":"Field","name":{"kind":"Name","value":"h"}},{"kind":"Field","name":{"kind":"Name","value":"hbp"}},{"kind":"Field","name":{"kind":"Name","value":"hr"}},{"kind":"Field","name":{"kind":"Name","value":"ibb"}},{"kind":"Field","name":{"kind":"Name","value":"l"}},{"kind":"Field","name":{"kind":"Name","value":"outsRecorded"}},{"kind":"Field","name":{"kind":"Name","value":"r"}},{"kind":"Field","name":{"kind":"Name","value":"sho"}},{"kind":"Field","name":{"kind":"Name","value":"so"}},{"kind":"Field","name":{"kind":"Name","value":"sv"}},{"kind":"Field","name":{"kind":"Name","value":"w"}}]}}]} as unknown as DocumentNode<MatchupPitchingStatsFragment, unknown>;
export const AggregateSeasonBattingStatsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"AggregateSeasonBattingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"AggregateSeasonBatting"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"ab"}},{"kind":"Field","name":{"kind":"Name","value":"bb"}},{"kind":"Field","name":{"kind":"Name","value":"cs"}},{"kind":"Field","name":{"kind":"Name","value":"doubles"}},{"kind":"Field","name":{"kind":"Name","value":"g"}},{"kind":"Field","name":{"kind":"Name","value":"gidp"}},{"kind":"Field","name":{"kind":"Name","value":"h"}},{"kind":"Field","name":{"kind":"Name","value":"hbp"}},{"kind":"Field","name":{"kind":"Name","value":"hr"}},{"kind":"Field","name":{"kind":"Name","value":"ibb"}},{"kind":"Field","name":{"kind":"Name","value":"pa"}},{"kind":"Field","name":{"kind":"Name","value":"r"}},{"kind":"Field","name":{"kind":"Name","value":"rbi"}},{"kind":"Field","name":{"kind":"Name","value":"sb"}},{"kind":"Field","name":{"kind":"Name","value":"sh"}},{"kind":"Field","name":{"kind":"Name","value":"so"}},{"kind":"Field","name":{"kind":"Name","value":"tb"}},{"kind":"Field","name":{"kind":"Name","value":"triples"}}]}}]} as unknown as DocumentNode<AggregateSeasonBattingStatsFragment, unknown>;
export const AggregateSeasonFieldingStatsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"AggregateSeasonFieldingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"AggregateSeasonFielding"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"a"}},{"kind":"Field","name":{"kind":"Name","value":"cg"}},{"kind":"Field","name":{"kind":"Name","value":"chances"}},{"kind":"Field","name":{"kind":"Name","value":"cs"}},{"kind":"Field","name":{"kind":"Name","value":"dpDef"}},{"kind":"Field","name":{"kind":"Name","value":"eDef"}},{"kind":"Field","name":{"kind":"Name","value":"g"}},{"kind":"Field","name":{"kind":"Name","value":"gs"}},{"kind":"Field","name":{"kind":"Name","value":"innDef"}},{"kind":"Field","name":{"kind":"Name","value":"pickoffs"}},{"kind":"Field","name":{"kind":"Name","value":"po"}},{"kind":"Field","name":{"kind":"Name","value":"sb"}},{"kind":"Field","name":{"kind":"Name","value":"wp"}}]}}]} as unknown as DocumentNode<AggregateSeasonFieldingStatsFragment, unknown>;
export const AggregateSeasonPitchingStatsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"AggregateSeasonPitchingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"AggregateSeasonPitching"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"battersFaced"}},{"kind":"Field","name":{"kind":"Name","value":"bb"}},{"kind":"Field","name":{"kind":"Name","value":"bk"}},{"kind":"Field","name":{"kind":"Name","value":"cg"}},{"kind":"Field","name":{"kind":"Name","value":"er"}},{"kind":"Field","name":{"kind":"Name","value":"g"}},{"kind":"Field","name":{"kind":"Name","value":"gf"}},{"kind":"Field","name":{"kind":"Name","value":"gs"}},{"kind":"Field","name":{"kind":"Name","value":"h"}},{"kind":"Field","name":{"kind":"Name","value":"hbp"}},{"kind":"Field","name":{"kind":"Name","value":"hr"}},{"kind":"Field","name":{"kind":"Name","value":"ibb"}},{"kind":"Field","name":{"kind":"Name","value":"l"}},{"kind":"Field","name":{"kind":"Name","value":"outsRecorded"}},{"kind":"Field","name":{"kind":"Name","value":"r"}},{"kind":"Field","name":{"kind":"Name","value":"sho"}},{"kind":"Field","name":{"kind":"Name","value":"so"}},{"kind":"Field","name":{"kind":"Name","value":"sv"}},{"kind":"Field","name":{"kind":"Name","value":"w"}},{"kind":"Field","name":{"kind":"Name","value":"wp"}}]}}]} as unknown as DocumentNode<AggregateSeasonPitchingStatsFragment, unknown>;
export const CareerBattingStatsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CareerBattingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CareerBatting"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"ab"}},{"kind":"Field","name":{"kind":"Name","value":"bb"}},{"kind":"Field","name":{"kind":"Name","value":"cs"}},{"kind":"Field","name":{"kind":"Name","value":"doubles"}},{"kind":"Field","name":{"kind":"Name","value":"g"}},{"kind":"Field","name":{"kind":"Name","value":"gidp"}},{"kind":"Field","name":{"kind":"Name","value":"h"}},{"kind":"Field","name":{"kind":"Name","value":"hbp"}},{"kind":"Field","name":{"kind":"Name","value":"hr"}},{"kind":"Field","name":{"kind":"Name","value":"ibb"}},{"kind":"Field","name":{"kind":"Name","value":"pa"}},{"kind":"Field","name":{"kind":"Name","value":"r"}},{"kind":"Field","name":{"kind":"Name","value":"rbi"}},{"kind":"Field","name":{"kind":"Name","value":"sb"}},{"kind":"Field","name":{"kind":"Name","value":"sh"}},{"kind":"Field","name":{"kind":"Name","value":"so"}},{"kind":"Field","name":{"kind":"Name","value":"tb"}},{"kind":"Field","name":{"kind":"Name","value":"triples"}}]}}]} as unknown as DocumentNode<CareerBattingStatsFragment, unknown>;
export const PlayerFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Player"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Player"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"brefId"}}]}}]} as unknown as DocumentNode<PlayerFragment, unknown>;
export const CareerBattingStatsWithPlayerFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CareerBattingStatsWithPlayer"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CareerBatting"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CareerBattingStats"}},{"kind":"Field","name":{"kind":"Name","value":"player"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Player"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CareerBattingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CareerBatting"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"ab"}},{"kind":"Field","name":{"kind":"Name","value":"bb"}},{"kind":"Field","name":{"kind":"Name","value":"cs"}},{"kind":"Field","name":{"kind":"Name","value":"doubles"}},{"kind":"Field","name":{"kind":"Name","value":"g"}},{"kind":"Field","name":{"kind":"Name","value":"gidp"}},{"kind":"Field","name":{"kind":"Name","value":"h"}},{"kind":"Field","name":{"kind":"Name","value":"hbp"}},{"kind":"Field","name":{"kind":"Name","value":"hr"}},{"kind":"Field","name":{"kind":"Name","value":"ibb"}},{"kind":"Field","name":{"kind":"Name","value":"pa"}},{"kind":"Field","name":{"kind":"Name","value":"r"}},{"kind":"Field","name":{"kind":"Name","value":"rbi"}},{"kind":"Field","name":{"kind":"Name","value":"sb"}},{"kind":"Field","name":{"kind":"Name","value":"sh"}},{"kind":"Field","name":{"kind":"Name","value":"so"}},{"kind":"Field","name":{"kind":"Name","value":"tb"}},{"kind":"Field","name":{"kind":"Name","value":"triples"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Player"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Player"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"brefId"}}]}}]} as unknown as DocumentNode<CareerBattingStatsWithPlayerFragment, unknown>;
export const CareerPitchingStatsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CareerPitchingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CareerPitching"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"battersFaced"}},{"kind":"Field","name":{"kind":"Name","value":"bb"}},{"kind":"Field","name":{"kind":"Name","value":"bk"}},{"kind":"Field","name":{"kind":"Name","value":"cg"}},{"kind":"Field","name":{"kind":"Name","value":"er"}},{"kind":"Field","name":{"kind":"Name","value":"era"}},{"kind":"Field","name":{"kind":"Name","value":"g"}},{"kind":"Field","name":{"kind":"Name","value":"gf"}},{"kind":"Field","name":{"kind":"Name","value":"gs"}},{"kind":"Field","name":{"kind":"Name","value":"h"}},{"kind":"Field","name":{"kind":"Name","value":"hbp"}},{"kind":"Field","name":{"kind":"Name","value":"hr"}},{"kind":"Field","name":{"kind":"Name","value":"ibb"}},{"kind":"Field","name":{"kind":"Name","value":"l"}},{"kind":"Field","name":{"kind":"Name","value":"outRate"}},{"kind":"Field","name":{"kind":"Name","value":"outsRecorded"}},{"kind":"Field","name":{"kind":"Name","value":"r"}},{"kind":"Field","name":{"kind":"Name","value":"sho"}},{"kind":"Field","name":{"kind":"Name","value":"so"}},{"kind":"Field","name":{"kind":"Name","value":"sv"}},{"kind":"Field","name":{"kind":"Name","value":"w"}},{"kind":"Field","name":{"kind":"Name","value":"wp"}}]}}]} as unknown as DocumentNode<CareerPitchingStatsFragment, unknown>;
export const CareerPitchingStatsWithPlayerFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CareerPitchingStatsWithPlayer"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CareerPitching"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CareerPitchingStats"}},{"kind":"Field","name":{"kind":"Name","value":"player"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Player"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CareerPitchingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CareerPitching"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"battersFaced"}},{"kind":"Field","name":{"kind":"Name","value":"bb"}},{"kind":"Field","name":{"kind":"Name","value":"bk"}},{"kind":"Field","name":{"kind":"Name","value":"cg"}},{"kind":"Field","name":{"kind":"Name","value":"er"}},{"kind":"Field","name":{"kind":"Name","value":"era"}},{"kind":"Field","name":{"kind":"Name","value":"g"}},{"kind":"Field","name":{"kind":"Name","value":"gf"}},{"kind":"Field","name":{"kind":"Name","value":"gs"}},{"kind":"Field","name":{"kind":"Name","value":"h"}},{"kind":"Field","name":{"kind":"Name","value":"hbp"}},{"kind":"Field","name":{"kind":"Name","value":"hr"}},{"kind":"Field","name":{"kind":"Name","value":"ibb"}},{"kind":"Field","name":{"kind":"Name","value":"l"}},{"kind":"Field","name":{"kind":"Name","value":"outRate"}},{"kind":"Field","name":{"kind":"Name","value":"outsRecorded"}},{"kind":"Field","name":{"kind":"Name","value":"r"}},{"kind":"Field","name":{"kind":"Name","value":"sho"}},{"kind":"Field","name":{"kind":"Name","value":"so"}},{"kind":"Field","name":{"kind":"Name","value":"sv"}},{"kind":"Field","name":{"kind":"Name","value":"w"}},{"kind":"Field","name":{"kind":"Name","value":"wp"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Player"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Player"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"brefId"}}]}}]} as unknown as DocumentNode<CareerPitchingStatsWithPlayerFragment, unknown>;
export const CareerFieldingStatsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CareerFieldingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CareerFielding"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"a"}},{"kind":"Field","name":{"kind":"Name","value":"cg"}},{"kind":"Field","name":{"kind":"Name","value":"chances"}},{"kind":"Field","name":{"kind":"Name","value":"cs"}},{"kind":"Field","name":{"kind":"Name","value":"dpDef"}},{"kind":"Field","name":{"kind":"Name","value":"eDef"}},{"kind":"Field","name":{"kind":"Name","value":"g"}},{"kind":"Field","name":{"kind":"Name","value":"gs"}},{"kind":"Field","name":{"kind":"Name","value":"innDef"}},{"kind":"Field","name":{"kind":"Name","value":"pickoffs"}},{"kind":"Field","name":{"kind":"Name","value":"po"}},{"kind":"Field","name":{"kind":"Name","value":"pos"}},{"kind":"Field","name":{"kind":"Name","value":"sb"}},{"kind":"Field","name":{"kind":"Name","value":"wp"}}]}}]} as unknown as DocumentNode<CareerFieldingStatsFragment, unknown>;
export const CareerFieldingStatsWithPlayerFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CareerFieldingStatsWithPlayer"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CareerFielding"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CareerFieldingStats"}},{"kind":"Field","name":{"kind":"Name","value":"player"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Player"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CareerFieldingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CareerFielding"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"a"}},{"kind":"Field","name":{"kind":"Name","value":"cg"}},{"kind":"Field","name":{"kind":"Name","value":"chances"}},{"kind":"Field","name":{"kind":"Name","value":"cs"}},{"kind":"Field","name":{"kind":"Name","value":"dpDef"}},{"kind":"Field","name":{"kind":"Name","value":"eDef"}},{"kind":"Field","name":{"kind":"Name","value":"g"}},{"kind":"Field","name":{"kind":"Name","value":"gs"}},{"kind":"Field","name":{"kind":"Name","value":"innDef"}},{"kind":"Field","name":{"kind":"Name","value":"pickoffs"}},{"kind":"Field","name":{"kind":"Name","value":"po"}},{"kind":"Field","name":{"kind":"Name","value":"pos"}},{"kind":"Field","name":{"kind":"Name","value":"sb"}},{"kind":"Field","name":{"kind":"Name","value":"wp"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Player"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Player"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"brefId"}}]}}]} as unknown as DocumentNode<CareerFieldingStatsWithPlayerFragment, unknown>;
export const TeamMemberFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TeamMember"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TeamMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"playerId"}},{"kind":"Field","name":{"kind":"Name","value":"positionId"}},{"kind":"Field","name":{"kind":"Name","value":"teamId"}}]}}]} as unknown as DocumentNode<TeamMemberFragment, unknown>;
export const PlayerEligiblePositionFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PlayerEligiblePosition"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PlayerEligiblePosition"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"playerId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}}]}}]} as unknown as DocumentNode<PlayerEligiblePositionFragment, unknown>;
export const TeamMemberWithPositionsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TeamMemberWithPositions"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TeamMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TeamMember"}},{"kind":"Field","name":{"kind":"Name","value":"player"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withPositions"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Player"}},{"kind":"Field","name":{"kind":"Name","value":"playerEligiblePositions"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withPositions"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PlayerEligiblePosition"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TeamMember"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TeamMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"playerId"}},{"kind":"Field","name":{"kind":"Name","value":"positionId"}},{"kind":"Field","name":{"kind":"Name","value":"teamId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Player"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Player"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"brefId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PlayerEligiblePosition"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PlayerEligiblePosition"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"playerId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}}]}}]} as unknown as DocumentNode<TeamMemberWithPositionsFragment, unknown>;
export const GetLeagueById = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetLeagueById"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"withMembers"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}},"defaultValue":{"kind":"BooleanValue","value":false}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"withTeams"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}},"defaultValue":{"kind":"BooleanValue","value":false}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"withMatchup"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}},"defaultValue":{"kind":"BooleanValue","value":false}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"league"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"League"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"LeagueMember"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"LeagueMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"permissionLevel"}},{"kind":"Field","name":{"kind":"Name","value":"teamId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Matchup"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Matchup"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"weekNumber"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"numberOfGames"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Team"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Team"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"League"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"League"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"owner"}},{"kind":"Field","name":{"kind":"Name","value":"currentMatchup"}},{"kind":"Field","name":{"kind":"Name","value":"leagueMembers"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withMembers"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"LeagueMember"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"matchupByCurrentMatchup"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withMatchup"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Matchup"}}]}},{"kind":"Field","name":{"kind":"Name","value":"teams"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withTeams"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Team"}}]}}]}}]}}]} as unknown as DocumentNode<GetLeagueByIdQuery, GetLeagueByIdQueryVariables>;
export const CreateLeague = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateLeague"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateLeagueAndTeamsInput"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"withMembers"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}},"defaultValue":{"kind":"BooleanValue","value":false}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"withTeams"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}},"defaultValue":{"kind":"BooleanValue","value":false}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"withMatchup"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}},"defaultValue":{"kind":"BooleanValue","value":false}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createLeagueAndTeams"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"league"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"League"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"LeagueMember"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"LeagueMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"permissionLevel"}},{"kind":"Field","name":{"kind":"Name","value":"teamId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Matchup"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Matchup"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"weekNumber"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"numberOfGames"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Team"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Team"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"League"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"League"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"owner"}},{"kind":"Field","name":{"kind":"Name","value":"currentMatchup"}},{"kind":"Field","name":{"kind":"Name","value":"leagueMembers"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withMembers"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"LeagueMember"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"matchupByCurrentMatchup"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withMatchup"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Matchup"}}]}},{"kind":"Field","name":{"kind":"Name","value":"teams"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withTeams"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Team"}}]}}]}}]}}]} as unknown as DocumentNode<CreateLeagueMutation, CreateLeagueMutationVariables>;
export const GetPositionsForLeague = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetPositionsForLeague"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"leagueId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leaguePositions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"condition"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"leagueId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"leagueId"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"LeaguePosition"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"LeaguePosition"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"LeaguePosition"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"positionType"}}]}}]} as unknown as DocumentNode<GetPositionsForLeagueQuery, GetPositionsForLeagueQueryVariables>;
export const GetMatchupStats = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetMatchupStats"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"matchupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"withMatchupStats"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}},"defaultValue":{"kind":"BooleanValue","value":false}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"withProjections"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}},"defaultValue":{"kind":"BooleanValue","value":false}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"matchupPlayers"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"condition"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"matchupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"matchupId"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"playerId"}},{"kind":"Field","name":{"kind":"Name","value":"aggregateSeasonPitchingByPlayerIdAndSeason"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withProjections"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"AggregateSeasonPitchingStats"}}]}},{"kind":"Field","name":{"kind":"Name","value":"aggregateSeasonFieldingByPlayerIdAndSeason"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withProjections"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"AggregateSeasonFieldingStats"}}]}},{"kind":"Field","name":{"kind":"Name","value":"aggregateSeasonBattingByPlayerIdAndSeason"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withProjections"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"AggregateSeasonBattingStats"}}]}},{"kind":"Field","name":{"kind":"Name","value":"matchupBatting"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withMatchupStats"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MatchupBattingStats"}}]}},{"kind":"Field","name":{"kind":"Name","value":"matchupFielding"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withMatchupStats"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MatchupFieldingStats"}}]}},{"kind":"Field","name":{"kind":"Name","value":"matchupPitching"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withMatchupStats"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MatchupPitchingStats"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"AggregateSeasonPitchingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"AggregateSeasonPitching"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"battersFaced"}},{"kind":"Field","name":{"kind":"Name","value":"bb"}},{"kind":"Field","name":{"kind":"Name","value":"bk"}},{"kind":"Field","name":{"kind":"Name","value":"cg"}},{"kind":"Field","name":{"kind":"Name","value":"er"}},{"kind":"Field","name":{"kind":"Name","value":"g"}},{"kind":"Field","name":{"kind":"Name","value":"gf"}},{"kind":"Field","name":{"kind":"Name","value":"gs"}},{"kind":"Field","name":{"kind":"Name","value":"h"}},{"kind":"Field","name":{"kind":"Name","value":"hbp"}},{"kind":"Field","name":{"kind":"Name","value":"hr"}},{"kind":"Field","name":{"kind":"Name","value":"ibb"}},{"kind":"Field","name":{"kind":"Name","value":"l"}},{"kind":"Field","name":{"kind":"Name","value":"outsRecorded"}},{"kind":"Field","name":{"kind":"Name","value":"r"}},{"kind":"Field","name":{"kind":"Name","value":"sho"}},{"kind":"Field","name":{"kind":"Name","value":"so"}},{"kind":"Field","name":{"kind":"Name","value":"sv"}},{"kind":"Field","name":{"kind":"Name","value":"w"}},{"kind":"Field","name":{"kind":"Name","value":"wp"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"AggregateSeasonFieldingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"AggregateSeasonFielding"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"a"}},{"kind":"Field","name":{"kind":"Name","value":"cg"}},{"kind":"Field","name":{"kind":"Name","value":"chances"}},{"kind":"Field","name":{"kind":"Name","value":"cs"}},{"kind":"Field","name":{"kind":"Name","value":"dpDef"}},{"kind":"Field","name":{"kind":"Name","value":"eDef"}},{"kind":"Field","name":{"kind":"Name","value":"g"}},{"kind":"Field","name":{"kind":"Name","value":"gs"}},{"kind":"Field","name":{"kind":"Name","value":"innDef"}},{"kind":"Field","name":{"kind":"Name","value":"pickoffs"}},{"kind":"Field","name":{"kind":"Name","value":"po"}},{"kind":"Field","name":{"kind":"Name","value":"sb"}},{"kind":"Field","name":{"kind":"Name","value":"wp"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"AggregateSeasonBattingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"AggregateSeasonBatting"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"ab"}},{"kind":"Field","name":{"kind":"Name","value":"bb"}},{"kind":"Field","name":{"kind":"Name","value":"cs"}},{"kind":"Field","name":{"kind":"Name","value":"doubles"}},{"kind":"Field","name":{"kind":"Name","value":"g"}},{"kind":"Field","name":{"kind":"Name","value":"gidp"}},{"kind":"Field","name":{"kind":"Name","value":"h"}},{"kind":"Field","name":{"kind":"Name","value":"hbp"}},{"kind":"Field","name":{"kind":"Name","value":"hr"}},{"kind":"Field","name":{"kind":"Name","value":"ibb"}},{"kind":"Field","name":{"kind":"Name","value":"pa"}},{"kind":"Field","name":{"kind":"Name","value":"r"}},{"kind":"Field","name":{"kind":"Name","value":"rbi"}},{"kind":"Field","name":{"kind":"Name","value":"sb"}},{"kind":"Field","name":{"kind":"Name","value":"sh"}},{"kind":"Field","name":{"kind":"Name","value":"so"}},{"kind":"Field","name":{"kind":"Name","value":"tb"}},{"kind":"Field","name":{"kind":"Name","value":"triples"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MatchupBattingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MatchupBatting"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"ab"}},{"kind":"Field","name":{"kind":"Name","value":"bb"}},{"kind":"Field","name":{"kind":"Name","value":"cs"}},{"kind":"Field","name":{"kind":"Name","value":"doubles"}},{"kind":"Field","name":{"kind":"Name","value":"gidp"}},{"kind":"Field","name":{"kind":"Name","value":"h"}},{"kind":"Field","name":{"kind":"Name","value":"hbp"}},{"kind":"Field","name":{"kind":"Name","value":"hr"}},{"kind":"Field","name":{"kind":"Name","value":"ibb"}},{"kind":"Field","name":{"kind":"Name","value":"pa"}},{"kind":"Field","name":{"kind":"Name","value":"r"}},{"kind":"Field","name":{"kind":"Name","value":"rbi"}},{"kind":"Field","name":{"kind":"Name","value":"sb"}},{"kind":"Field","name":{"kind":"Name","value":"sh"}},{"kind":"Field","name":{"kind":"Name","value":"so"}},{"kind":"Field","name":{"kind":"Name","value":"triples"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MatchupFieldingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MatchupFielding"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"a"}},{"kind":"Field","name":{"kind":"Name","value":"chances"}},{"kind":"Field","name":{"kind":"Name","value":"dpDef"}},{"kind":"Field","name":{"kind":"Name","value":"eDef"}},{"kind":"Field","name":{"kind":"Name","value":"innDef"}},{"kind":"Field","name":{"kind":"Name","value":"po"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MatchupPitchingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MatchupPitching"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"battersFaced"}},{"kind":"Field","name":{"kind":"Name","value":"bb"}},{"kind":"Field","name":{"kind":"Name","value":"cg"}},{"kind":"Field","name":{"kind":"Name","value":"er"}},{"kind":"Field","name":{"kind":"Name","value":"gf"}},{"kind":"Field","name":{"kind":"Name","value":"gs"}},{"kind":"Field","name":{"kind":"Name","value":"h"}},{"kind":"Field","name":{"kind":"Name","value":"hbp"}},{"kind":"Field","name":{"kind":"Name","value":"hr"}},{"kind":"Field","name":{"kind":"Name","value":"ibb"}},{"kind":"Field","name":{"kind":"Name","value":"l"}},{"kind":"Field","name":{"kind":"Name","value":"outsRecorded"}},{"kind":"Field","name":{"kind":"Name","value":"r"}},{"kind":"Field","name":{"kind":"Name","value":"sho"}},{"kind":"Field","name":{"kind":"Name","value":"so"}},{"kind":"Field","name":{"kind":"Name","value":"sv"}},{"kind":"Field","name":{"kind":"Name","value":"w"}}]}}]} as unknown as DocumentNode<GetMatchupStatsQuery, GetMatchupStatsQueryVariables>;
export const GetMessagesForLeague = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetMessagesForLeague"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orderBy"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"LeagueMessagesOrderBy"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"condition"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"LeagueMessageCondition"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueMessages"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orderBy"}}},{"kind":"Argument","name":{"kind":"Name","value":"condition"},"value":{"kind":"Variable","name":{"kind":"Name","value":"condition"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"LeagueMessage"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"LeagueMessage"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"LeagueMessage"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"messageText"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}}]} as unknown as DocumentNode<GetMessagesForLeagueQuery, GetMessagesForLeagueQueryVariables>;
export const SendLeagueMessage = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SendLeagueMessage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateLeagueMessageInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createLeagueMessage"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueMessage"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"LeagueMessage"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"LeagueMessage"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"LeagueMessage"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"messageText"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}}]} as unknown as DocumentNode<SendLeagueMessageMutation, SendLeagueMessageMutationVariables>;
export const GetCareerBattingStats = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetCareerBattingStats"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orderBy"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CareerBattingsOrderBy"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"careerBattings"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orderBy"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CareerBattingStatsWithPlayer"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CareerBattingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CareerBatting"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"ab"}},{"kind":"Field","name":{"kind":"Name","value":"bb"}},{"kind":"Field","name":{"kind":"Name","value":"cs"}},{"kind":"Field","name":{"kind":"Name","value":"doubles"}},{"kind":"Field","name":{"kind":"Name","value":"g"}},{"kind":"Field","name":{"kind":"Name","value":"gidp"}},{"kind":"Field","name":{"kind":"Name","value":"h"}},{"kind":"Field","name":{"kind":"Name","value":"hbp"}},{"kind":"Field","name":{"kind":"Name","value":"hr"}},{"kind":"Field","name":{"kind":"Name","value":"ibb"}},{"kind":"Field","name":{"kind":"Name","value":"pa"}},{"kind":"Field","name":{"kind":"Name","value":"r"}},{"kind":"Field","name":{"kind":"Name","value":"rbi"}},{"kind":"Field","name":{"kind":"Name","value":"sb"}},{"kind":"Field","name":{"kind":"Name","value":"sh"}},{"kind":"Field","name":{"kind":"Name","value":"so"}},{"kind":"Field","name":{"kind":"Name","value":"tb"}},{"kind":"Field","name":{"kind":"Name","value":"triples"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Player"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Player"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"brefId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CareerBattingStatsWithPlayer"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CareerBatting"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CareerBattingStats"}},{"kind":"Field","name":{"kind":"Name","value":"player"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Player"}}]}}]}}]} as unknown as DocumentNode<GetCareerBattingStatsQuery, GetCareerBattingStatsQueryVariables>;
export const GetCareerFieldingStats = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetCareerFieldingStats"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orderBy"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CareerFieldingsOrderBy"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"careerFieldings"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orderBy"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CareerFieldingStatsWithPlayer"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CareerFieldingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CareerFielding"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"a"}},{"kind":"Field","name":{"kind":"Name","value":"cg"}},{"kind":"Field","name":{"kind":"Name","value":"chances"}},{"kind":"Field","name":{"kind":"Name","value":"cs"}},{"kind":"Field","name":{"kind":"Name","value":"dpDef"}},{"kind":"Field","name":{"kind":"Name","value":"eDef"}},{"kind":"Field","name":{"kind":"Name","value":"g"}},{"kind":"Field","name":{"kind":"Name","value":"gs"}},{"kind":"Field","name":{"kind":"Name","value":"innDef"}},{"kind":"Field","name":{"kind":"Name","value":"pickoffs"}},{"kind":"Field","name":{"kind":"Name","value":"po"}},{"kind":"Field","name":{"kind":"Name","value":"pos"}},{"kind":"Field","name":{"kind":"Name","value":"sb"}},{"kind":"Field","name":{"kind":"Name","value":"wp"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Player"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Player"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"brefId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CareerFieldingStatsWithPlayer"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CareerFielding"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CareerFieldingStats"}},{"kind":"Field","name":{"kind":"Name","value":"player"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Player"}}]}}]}}]} as unknown as DocumentNode<GetCareerFieldingStatsQuery, GetCareerFieldingStatsQueryVariables>;
export const GetCareerPitchingStats = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetCareerPitchingStats"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orderBy"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CareerPitchingsOrderBy"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"careerPitchings"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orderBy"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CareerPitchingStatsWithPlayer"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CareerPitchingStats"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CareerPitching"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"battersFaced"}},{"kind":"Field","name":{"kind":"Name","value":"bb"}},{"kind":"Field","name":{"kind":"Name","value":"bk"}},{"kind":"Field","name":{"kind":"Name","value":"cg"}},{"kind":"Field","name":{"kind":"Name","value":"er"}},{"kind":"Field","name":{"kind":"Name","value":"era"}},{"kind":"Field","name":{"kind":"Name","value":"g"}},{"kind":"Field","name":{"kind":"Name","value":"gf"}},{"kind":"Field","name":{"kind":"Name","value":"gs"}},{"kind":"Field","name":{"kind":"Name","value":"h"}},{"kind":"Field","name":{"kind":"Name","value":"hbp"}},{"kind":"Field","name":{"kind":"Name","value":"hr"}},{"kind":"Field","name":{"kind":"Name","value":"ibb"}},{"kind":"Field","name":{"kind":"Name","value":"l"}},{"kind":"Field","name":{"kind":"Name","value":"outRate"}},{"kind":"Field","name":{"kind":"Name","value":"outsRecorded"}},{"kind":"Field","name":{"kind":"Name","value":"r"}},{"kind":"Field","name":{"kind":"Name","value":"sho"}},{"kind":"Field","name":{"kind":"Name","value":"so"}},{"kind":"Field","name":{"kind":"Name","value":"sv"}},{"kind":"Field","name":{"kind":"Name","value":"w"}},{"kind":"Field","name":{"kind":"Name","value":"wp"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Player"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Player"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"brefId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CareerPitchingStatsWithPlayer"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CareerPitching"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CareerPitchingStats"}},{"kind":"Field","name":{"kind":"Name","value":"player"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Player"}}]}}]}}]} as unknown as DocumentNode<GetCareerPitchingStatsQuery, GetCareerPitchingStatsQueryVariables>;
export const GetTeamById = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetTeamById"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"teamId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"withPositions"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}},"defaultValue":{"kind":"BooleanValue","value":false}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"team"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"teamId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"teamMembers"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TeamMemberWithPositions"}}]}}]}},{"kind":"FragmentSpread","name":{"kind":"Name","value":"Team"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TeamMember"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TeamMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"playerId"}},{"kind":"Field","name":{"kind":"Name","value":"positionId"}},{"kind":"Field","name":{"kind":"Name","value":"teamId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Player"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Player"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"brefId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PlayerEligiblePosition"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PlayerEligiblePosition"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"playerId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TeamMemberWithPositions"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TeamMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TeamMember"}},{"kind":"Field","name":{"kind":"Name","value":"player"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withPositions"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Player"}},{"kind":"Field","name":{"kind":"Name","value":"playerEligiblePositions"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withPositions"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PlayerEligiblePosition"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Team"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Team"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]} as unknown as DocumentNode<GetTeamByIdQuery, GetTeamByIdQueryVariables>;
export const UpdateTeamMemberPosition = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateTeamMemberPosition"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"teamMemberId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"positionId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateTeamMember"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"patch"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"positionId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"positionId"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"teamMemberId"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"teamMember"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"playerId"}},{"kind":"Field","name":{"kind":"Name","value":"positionId"}}]}}]}}]}}]} as unknown as DocumentNode<UpdateTeamMemberPositionMutation, UpdateTeamMemberPositionMutationVariables>;
export const GetUserByEmail = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetUserByEmail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userByEmail"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]} as unknown as DocumentNode<GetUserByEmailQuery, GetUserByEmailQueryVariables>;
export const GetLeaguesForUser = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetLeaguesForUser"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"withMembers"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}},"defaultValue":{"kind":"BooleanValue","value":false}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"withMatchup"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}},"defaultValue":{"kind":"BooleanValue","value":false}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"withTeams"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}},"defaultValue":{"kind":"BooleanValue","value":false}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueMembers"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"league"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"League"}}]}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"LeagueMember"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"LeagueMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"permissionLevel"}},{"kind":"Field","name":{"kind":"Name","value":"teamId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Matchup"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Matchup"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"weekNumber"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"numberOfGames"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Team"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Team"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"leagueId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"League"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"League"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"owner"}},{"kind":"Field","name":{"kind":"Name","value":"currentMatchup"}},{"kind":"Field","name":{"kind":"Name","value":"leagueMembers"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withMembers"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"LeagueMember"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"matchupByCurrentMatchup"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withMatchup"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Matchup"}}]}},{"kind":"Field","name":{"kind":"Name","value":"teams"},"directives":[{"kind":"Directive","name":{"kind":"Name","value":"include"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"if"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withTeams"}}}]}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Team"}}]}}]}}]}}]} as unknown as DocumentNode<GetLeaguesForUserQuery, GetLeaguesForUserQueryVariables>;
export const GetUserById = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetUserById"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]} as unknown as DocumentNode<GetUserByIdQuery, GetUserByIdQueryVariables>;
export const CreateUser = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateUser"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateUserInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createUser"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"User"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"User"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]} as unknown as DocumentNode<CreateUserMutation, CreateUserMutationVariables>;
export type LeagueFragment = { __typename?: 'League', id: number, name: string, owner: number, currentMatchup?: number | null, leagueMembers?: { __typename?: 'LeagueMembersConnection', nodes: Array<{ __typename?: 'LeagueMember', leagueId: number, permissionLevel: LeaguePermissionLevel, teamId?: number | null, userId: number, user?: { __typename?: 'User', id: number, email?: string | null, username?: string | null } | null } | null> }, matchupByCurrentMatchup?: { __typename?: 'Matchup', id: number, weekNumber: number, leagueId: number, numberOfGames: number } | null, teams?: { __typename?: 'TeamsConnection', nodes: Array<{ __typename?: 'Team', id: number, leagueId: number, name: string } | null> } };

export type LeagueMemberFragment = { __typename?: 'LeagueMember', leagueId: number, permissionLevel: LeaguePermissionLevel, teamId?: number | null, userId: number, user?: { __typename?: 'User', id: number, email?: string | null, username?: string | null } | null };

export type LeaguePositionFragment = { __typename?: 'LeaguePosition', id: number, leagueId: number, positionType: PositionSlot };

export type GetLeagueByIdQueryVariables = Exact<{
  id: Scalars['Int']['input'];
  withMembers?: InputMaybe<Scalars['Boolean']['input']>;
  withTeams?: InputMaybe<Scalars['Boolean']['input']>;
  withMatchup?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type GetLeagueByIdQuery = { __typename?: 'Query', league?: { __typename?: 'League', id: number, name: string, owner: number, currentMatchup?: number | null, leagueMembers?: { __typename?: 'LeagueMembersConnection', nodes: Array<{ __typename?: 'LeagueMember', leagueId: number, permissionLevel: LeaguePermissionLevel, teamId?: number | null, userId: number, user?: { __typename?: 'User', id: number, email?: string | null, username?: string | null } | null } | null> }, matchupByCurrentMatchup?: { __typename?: 'Matchup', id: number, weekNumber: number, leagueId: number, numberOfGames: number } | null, teams?: { __typename?: 'TeamsConnection', nodes: Array<{ __typename?: 'Team', id: number, leagueId: number, name: string } | null> } } | null };

export type CreateLeagueMutationVariables = Exact<{
  input: CreateLeagueAndTeamsInput;
  withMembers?: InputMaybe<Scalars['Boolean']['input']>;
  withTeams?: InputMaybe<Scalars['Boolean']['input']>;
  withMatchup?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type CreateLeagueMutation = { __typename?: 'Mutation', createLeagueAndTeams?: { __typename?: 'CreateLeagueAndTeamsPayload', league?: { __typename?: 'League', id: number, name: string, owner: number, currentMatchup?: number | null, leagueMembers?: { __typename?: 'LeagueMembersConnection', nodes: Array<{ __typename?: 'LeagueMember', leagueId: number, permissionLevel: LeaguePermissionLevel, teamId?: number | null, userId: number, user?: { __typename?: 'User', id: number, email?: string | null, username?: string | null } | null } | null> }, matchupByCurrentMatchup?: { __typename?: 'Matchup', id: number, weekNumber: number, leagueId: number, numberOfGames: number } | null, teams?: { __typename?: 'TeamsConnection', nodes: Array<{ __typename?: 'Team', id: number, leagueId: number, name: string } | null> } } | null } | null };

export type GetPositionsForLeagueQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;


export type GetPositionsForLeagueQuery = { __typename?: 'Query', leaguePositions?: { __typename?: 'LeaguePositionsConnection', nodes: Array<{ __typename?: 'LeaguePosition', id: number, leagueId: number, positionType: PositionSlot } | null> } | null };

export type MatchupFragment = { __typename?: 'Matchup', id: number, weekNumber: number, leagueId: number, numberOfGames: number };

export type GetMatchupStatsQueryVariables = Exact<{
  matchupId: Scalars['Int']['input'];
  withMatchupStats?: InputMaybe<Scalars['Boolean']['input']>;
  withProjections?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type GetMatchupStatsQuery = { __typename?: 'Query', matchupPlayers?: { __typename?: 'MatchupPlayersConnection', nodes: Array<{ __typename?: 'MatchupPlayer', playerId: number, aggregateSeasonPitchingByPlayerIdAndSeason?: { __typename?: 'AggregateSeasonPitching', battersFaced?: number | null, bb?: number | null, bk?: number | null, cg?: number | null, er?: number | null, g?: number | null, gf?: number | null, gs?: number | null, h?: number | null, hbp?: number | null, hr?: number | null, ibb?: number | null, l?: number | null, outsRecorded?: number | null, r?: number | null, sho?: number | null, so?: number | null, sv?: number | null, w?: number | null, wp?: number | null } | null, aggregateSeasonFieldingByPlayerIdAndSeason?: { __typename?: 'AggregateSeasonFielding', a?: number | null, cg?: number | null, chances?: number | null, cs?: number | null, dpDef?: number | null, eDef?: number | null, g?: number | null, gs?: number | null, innDef?: number | null, pickoffs?: number | null, po?: number | null, sb?: number | null, wp?: number | null } | null, aggregateSeasonBattingByPlayerIdAndSeason?: { __typename?: 'AggregateSeasonBatting', ab?: number | null, bb?: number | null, cs?: number | null, doubles?: number | null, g?: number | null, gidp?: number | null, h?: number | null, hbp?: number | null, hr?: number | null, ibb?: number | null, pa?: number | null, r?: number | null, rbi?: number | null, sb?: number | null, sh?: number | null, so?: number | null, tb?: number | null, triples?: number | null } | null, matchupBatting?: { __typename?: 'MatchupBatting', ab?: number | null, bb?: number | null, cs?: number | null, doubles?: number | null, gidp?: number | null, h?: number | null, hbp?: number | null, hr?: number | null, ibb?: number | null, pa?: number | null, r?: number | null, rbi?: number | null, sb?: number | null, sh?: number | null, so?: number | null, triples?: number | null } | null, matchupFielding?: { __typename?: 'MatchupFielding', a?: number | null, chances?: number | null, dpDef?: number | null, eDef?: number | null, innDef?: number | null, po?: number | null } | null, matchupPitching?: { __typename?: 'MatchupPitching', battersFaced?: number | null, bb?: number | null, cg?: number | null, er?: number | null, gf?: number | null, gs?: number | null, h?: number | null, hbp?: number | null, hr?: number | null, ibb?: number | null, l?: number | null, outsRecorded?: number | null, r?: number | null, sho?: number | null, so?: number | null, sv?: number | null, w?: number | null } | null } | null> } | null };

export type LeagueMessageFragment = { __typename?: 'LeagueMessage', leagueId: number, messageText: string, timestamp?: string | null, user?: { __typename?: 'User', id: number, username?: string | null } | null };

export type GetMessagesForLeagueQueryVariables = Exact<{
  orderBy?: InputMaybe<Array<LeagueMessagesOrderBy> | LeagueMessagesOrderBy>;
  condition: LeagueMessageCondition;
}>;


export type GetMessagesForLeagueQuery = { __typename?: 'Query', leagueMessages?: { __typename?: 'LeagueMessagesConnection', nodes: Array<{ __typename?: 'LeagueMessage', leagueId: number, messageText: string, timestamp?: string | null, user?: { __typename?: 'User', id: number, username?: string | null } | null } | null> } | null };

export type SendLeagueMessageMutationVariables = Exact<{
  input: CreateLeagueMessageInput;
}>;


export type SendLeagueMessageMutation = { __typename?: 'Mutation', createLeagueMessage?: { __typename?: 'CreateLeagueMessagePayload', leagueMessage?: { __typename?: 'LeagueMessage', leagueId: number, messageText: string, timestamp?: string | null, user?: { __typename?: 'User', id: number, username?: string | null } | null } | null } | null };

export type PlayerFragment = { __typename?: 'Player', id: number, name: string, brefId: string };

export type PlayerEligiblePositionFragment = { __typename?: 'PlayerEligiblePosition', playerId?: number | null, position?: string | null };

export type MatchupBattingStatsFragment = { __typename?: 'MatchupBatting', ab?: number | null, bb?: number | null, cs?: number | null, doubles?: number | null, gidp?: number | null, h?: number | null, hbp?: number | null, hr?: number | null, ibb?: number | null, pa?: number | null, r?: number | null, rbi?: number | null, sb?: number | null, sh?: number | null, so?: number | null, triples?: number | null };

export type MatchupFieldingStatsFragment = { __typename?: 'MatchupFielding', a?: number | null, chances?: number | null, dpDef?: number | null, eDef?: number | null, innDef?: number | null, po?: number | null };

export type MatchupPitchingStatsFragment = { __typename?: 'MatchupPitching', battersFaced?: number | null, bb?: number | null, cg?: number | null, er?: number | null, gf?: number | null, gs?: number | null, h?: number | null, hbp?: number | null, hr?: number | null, ibb?: number | null, l?: number | null, outsRecorded?: number | null, r?: number | null, sho?: number | null, so?: number | null, sv?: number | null, w?: number | null };

export type AggregateSeasonBattingStatsFragment = { __typename?: 'AggregateSeasonBatting', ab?: number | null, bb?: number | null, cs?: number | null, doubles?: number | null, g?: number | null, gidp?: number | null, h?: number | null, hbp?: number | null, hr?: number | null, ibb?: number | null, pa?: number | null, r?: number | null, rbi?: number | null, sb?: number | null, sh?: number | null, so?: number | null, tb?: number | null, triples?: number | null };

export type AggregateSeasonFieldingStatsFragment = { __typename?: 'AggregateSeasonFielding', a?: number | null, cg?: number | null, chances?: number | null, cs?: number | null, dpDef?: number | null, eDef?: number | null, g?: number | null, gs?: number | null, innDef?: number | null, pickoffs?: number | null, po?: number | null, sb?: number | null, wp?: number | null };

export type AggregateSeasonPitchingStatsFragment = { __typename?: 'AggregateSeasonPitching', battersFaced?: number | null, bb?: number | null, bk?: number | null, cg?: number | null, er?: number | null, g?: number | null, gf?: number | null, gs?: number | null, h?: number | null, hbp?: number | null, hr?: number | null, ibb?: number | null, l?: number | null, outsRecorded?: number | null, r?: number | null, sho?: number | null, so?: number | null, sv?: number | null, w?: number | null, wp?: number | null };

export type CareerBattingStatsFragment = { __typename?: 'CareerBatting', ab?: string | null, bb?: string | null, cs?: string | null, doubles?: string | null, g?: string | null, gidp?: string | null, h?: string | null, hbp?: string | null, hr?: string | null, ibb?: string | null, pa?: string | null, r?: string | null, rbi?: string | null, sb?: string | null, sh?: string | null, so?: string | null, tb?: string | null, triples?: string | null };

export type CareerFieldingStatsFragment = { __typename?: 'CareerFielding', a?: string | null, cg?: string | null, chances?: number | null, cs?: string | null, dpDef?: string | null, eDef?: string | null, g?: string | null, gs?: string | null, innDef?: number | null, pickoffs?: string | null, po?: string | null, pos?: string | null, sb?: string | null, wp?: string | null };

export type CareerPitchingStatsFragment = { __typename?: 'CareerPitching', battersFaced?: string | null, bb?: string | null, bk?: string | null, cg?: string | null, er?: string | null, era?: any | null, g?: string | null, gf?: string | null, gs?: string | null, h?: string | null, hbp?: string | null, hr?: string | null, ibb?: string | null, l?: string | null, outRate?: string | null, outsRecorded?: string | null, r?: string | null, sho?: string | null, so?: string | null, sv?: string | null, w?: string | null, wp?: string | null };

export type CareerBattingStatsWithPlayerFragment = { __typename?: 'CareerBatting', ab?: string | null, bb?: string | null, cs?: string | null, doubles?: string | null, g?: string | null, gidp?: string | null, h?: string | null, hbp?: string | null, hr?: string | null, ibb?: string | null, pa?: string | null, r?: string | null, rbi?: string | null, sb?: string | null, sh?: string | null, so?: string | null, tb?: string | null, triples?: string | null, player?: { __typename?: 'Player', id: number, name: string, brefId: string } | null };

export type CareerPitchingStatsWithPlayerFragment = { __typename?: 'CareerPitching', battersFaced?: string | null, bb?: string | null, bk?: string | null, cg?: string | null, er?: string | null, era?: any | null, g?: string | null, gf?: string | null, gs?: string | null, h?: string | null, hbp?: string | null, hr?: string | null, ibb?: string | null, l?: string | null, outRate?: string | null, outsRecorded?: string | null, r?: string | null, sho?: string | null, so?: string | null, sv?: string | null, w?: string | null, wp?: string | null, player?: { __typename?: 'Player', id: number, name: string, brefId: string } | null };

export type CareerFieldingStatsWithPlayerFragment = { __typename?: 'CareerFielding', a?: string | null, cg?: string | null, chances?: number | null, cs?: string | null, dpDef?: string | null, eDef?: string | null, g?: string | null, gs?: string | null, innDef?: number | null, pickoffs?: string | null, po?: string | null, pos?: string | null, sb?: string | null, wp?: string | null, player?: { __typename?: 'Player', id: number, name: string, brefId: string } | null };

export type GetCareerBattingStatsQueryVariables = Exact<{
  orderBy?: InputMaybe<Array<CareerBattingsOrderBy> | CareerBattingsOrderBy>;
  first?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GetCareerBattingStatsQuery = { __typename?: 'Query', careerBattings?: { __typename?: 'CareerBattingsConnection', nodes: Array<{ __typename?: 'CareerBatting', ab?: string | null, bb?: string | null, cs?: string | null, doubles?: string | null, g?: string | null, gidp?: string | null, h?: string | null, hbp?: string | null, hr?: string | null, ibb?: string | null, pa?: string | null, r?: string | null, rbi?: string | null, sb?: string | null, sh?: string | null, so?: string | null, tb?: string | null, triples?: string | null, player?: { __typename?: 'Player', id: number, name: string, brefId: string } | null } | null> } | null };

export type GetCareerFieldingStatsQueryVariables = Exact<{
  orderBy?: InputMaybe<Array<CareerFieldingsOrderBy> | CareerFieldingsOrderBy>;
  first?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GetCareerFieldingStatsQuery = { __typename?: 'Query', careerFieldings?: { __typename?: 'CareerFieldingsConnection', nodes: Array<{ __typename?: 'CareerFielding', a?: string | null, cg?: string | null, chances?: number | null, cs?: string | null, dpDef?: string | null, eDef?: string | null, g?: string | null, gs?: string | null, innDef?: number | null, pickoffs?: string | null, po?: string | null, pos?: string | null, sb?: string | null, wp?: string | null, player?: { __typename?: 'Player', id: number, name: string, brefId: string } | null } | null> } | null };

export type GetCareerPitchingStatsQueryVariables = Exact<{
  orderBy?: InputMaybe<Array<CareerPitchingsOrderBy> | CareerPitchingsOrderBy>;
  first?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GetCareerPitchingStatsQuery = { __typename?: 'Query', careerPitchings?: { __typename?: 'CareerPitchingsConnection', nodes: Array<{ __typename?: 'CareerPitching', battersFaced?: string | null, bb?: string | null, bk?: string | null, cg?: string | null, er?: string | null, era?: any | null, g?: string | null, gf?: string | null, gs?: string | null, h?: string | null, hbp?: string | null, hr?: string | null, ibb?: string | null, l?: string | null, outRate?: string | null, outsRecorded?: string | null, r?: string | null, sho?: string | null, so?: string | null, sv?: string | null, w?: string | null, wp?: string | null, player?: { __typename?: 'Player', id: number, name: string, brefId: string } | null } | null> } | null };

export type TeamFragment = { __typename?: 'Team', id: number, leagueId: number, name: string };

export type TeamMemberFragment = { __typename?: 'TeamMember', id: number, playerId: number, positionId?: number | null, teamId?: number | null };

export type TeamMemberWithPositionsFragment = { __typename?: 'TeamMember', id: number, playerId: number, positionId?: number | null, teamId?: number | null, player?: { __typename?: 'Player', id: number, name: string, brefId: string, playerEligiblePositions?: { __typename?: 'PlayerEligiblePositionsConnection', nodes: Array<{ __typename?: 'PlayerEligiblePosition', playerId?: number | null, position?: string | null } | null> } } | null };

export type GetTeamByIdQueryVariables = Exact<{
  teamId: Scalars['Int']['input'];
  withPositions?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type GetTeamByIdQuery = { __typename?: 'Query', team?: { __typename?: 'Team', id: number, leagueId: number, name: string, teamMembers: { __typename?: 'TeamMembersConnection', nodes: Array<{ __typename?: 'TeamMember', id: number, playerId: number, positionId?: number | null, teamId?: number | null, player?: { __typename?: 'Player', id: number, name: string, brefId: string, playerEligiblePositions?: { __typename?: 'PlayerEligiblePositionsConnection', nodes: Array<{ __typename?: 'PlayerEligiblePosition', playerId?: number | null, position?: string | null } | null> } } | null } | null> } } | null };

export type UpdateTeamMemberPositionMutationVariables = Exact<{
  teamMemberId: Scalars['Int']['input'];
  positionId?: InputMaybe<Scalars['Int']['input']>;
}>;


export type UpdateTeamMemberPositionMutation = { __typename?: 'Mutation', updateTeamMember?: { __typename?: 'UpdateTeamMemberPayload', teamMember?: { __typename?: 'TeamMember', id: number, leagueId: number, playerId: number, positionId?: number | null } | null } | null };

export type UserFragment = { __typename?: 'User', id: number, email?: string | null, username?: string | null };

export type GetUserByEmailQueryVariables = Exact<{
  email: Scalars['String']['input'];
}>;


export type GetUserByEmailQuery = { __typename?: 'Query', userByEmail?: { __typename?: 'User', id: number, email?: string | null, username?: string | null } | null };

export type GetLeaguesForUserQueryVariables = Exact<{
  id: Scalars['Int']['input'];
  withMembers?: InputMaybe<Scalars['Boolean']['input']>;
  withMatchup?: InputMaybe<Scalars['Boolean']['input']>;
  withTeams?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type GetLeaguesForUserQuery = { __typename?: 'Query', user?: { __typename?: 'User', leagueMembers: { __typename?: 'LeagueMembersConnection', nodes: Array<{ __typename?: 'LeagueMember', league?: { __typename?: 'League', id: number, name: string, owner: number, currentMatchup?: number | null, leagueMembers?: { __typename?: 'LeagueMembersConnection', nodes: Array<{ __typename?: 'LeagueMember', leagueId: number, permissionLevel: LeaguePermissionLevel, teamId?: number | null, userId: number, user?: { __typename?: 'User', id: number, email?: string | null, username?: string | null } | null } | null> }, matchupByCurrentMatchup?: { __typename?: 'Matchup', id: number, weekNumber: number, leagueId: number, numberOfGames: number } | null, teams?: { __typename?: 'TeamsConnection', nodes: Array<{ __typename?: 'Team', id: number, leagueId: number, name: string } | null> } } | null } | null> } } | null };

export type GetUserByIdQueryVariables = Exact<{
  id: Scalars['Int']['input'];
}>;


export type GetUserByIdQuery = { __typename?: 'Query', user?: { __typename?: 'User', id: number, email?: string | null, username?: string | null } | null };

export type CreateUserMutationVariables = Exact<{
  input: CreateUserInput;
}>;


export type CreateUserMutation = { __typename?: 'Mutation', createUser?: { __typename?: 'CreateUserPayload', user?: { __typename?: 'User', id: number, email?: string | null, username?: string | null } | null } | null };

/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  BigFloat: { input: any; output: any; }
  BigInt: { input: string; output: string; }
  Cursor: { input: string; output: string; }
  Date: { input: any; output: any; }
  Datetime: { input: string; output: string; }
};

export enum AccessLevel {
  Admin = 'ADMIN',
  None = 'NONE'
}

export type AggregateSeasonBatting = {
  __typename?: 'AggregateSeasonBatting';
  ab?: Maybe<Scalars['Int']['output']>;
  bb?: Maybe<Scalars['Int']['output']>;
  cs?: Maybe<Scalars['Int']['output']>;
  doubles?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  gidp?: Maybe<Scalars['Int']['output']>;
  h?: Maybe<Scalars['Int']['output']>;
  hbp?: Maybe<Scalars['Int']['output']>;
  hr?: Maybe<Scalars['Int']['output']>;
  ibb?: Maybe<Scalars['Int']['output']>;
  /** Reads and enables pagination through a set of `MatchupPlayer`. */
  matchupPlayersByPlayerIdAndSeason: MatchupPlayersConnection;
  pa?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `Player` that is related to this `AggregateSeasonBatting`. */
  player?: Maybe<Player>;
  playerId?: Maybe<Scalars['Int']['output']>;
  r?: Maybe<Scalars['Int']['output']>;
  rbi?: Maybe<Scalars['Int']['output']>;
  sb?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  sf?: Maybe<Scalars['Int']['output']>;
  sh?: Maybe<Scalars['Int']['output']>;
  so?: Maybe<Scalars['Int']['output']>;
  tb?: Maybe<Scalars['Int']['output']>;
  triples?: Maybe<Scalars['Int']['output']>;
};


export type AggregateSeasonBattingMatchupPlayersByPlayerIdAndSeasonArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<MatchupPlayerCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MatchupPlayersOrderBy>>;
};

/**
 * A condition to be used against `AggregateSeasonBatting` object types. All fields
 * are tested for equality and combined with a logical ‘and.’
 */
export type AggregateSeasonBattingCondition = {
  /** Checks for equality with the object’s `ab` field. */
  ab?: InputMaybe<Scalars['Int']['input']>;
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
  /** Checks for equality with the object’s `pa` field. */
  pa?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `r` field. */
  r?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `rbi` field. */
  rbi?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sb` field. */
  sb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `season` field. */
  season?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sf` field. */
  sf?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sh` field. */
  sh?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `so` field. */
  so?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `tb` field. */
  tb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `triples` field. */
  triples?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `AggregateSeasonBatting` values. */
export type AggregateSeasonBattingsConnection = {
  __typename?: 'AggregateSeasonBattingsConnection';
  /** A list of edges which contains the `AggregateSeasonBatting` and cursor to aid in pagination. */
  edges: Array<AggregateSeasonBattingsEdge>;
  /** A list of `AggregateSeasonBatting` objects. */
  nodes: Array<Maybe<AggregateSeasonBatting>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `AggregateSeasonBatting` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `AggregateSeasonBatting` edge in the connection. */
export type AggregateSeasonBattingsEdge = {
  __typename?: 'AggregateSeasonBattingsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `AggregateSeasonBatting` at the end of the edge. */
  node?: Maybe<AggregateSeasonBatting>;
};

/** Methods to use when ordering `AggregateSeasonBatting`. */
export enum AggregateSeasonBattingsOrderBy {
  AbAsc = 'AB_ASC',
  AbDesc = 'AB_DESC',
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
  Natural = 'NATURAL',
  PaAsc = 'PA_ASC',
  PaDesc = 'PA_DESC',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
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
  SoAsc = 'SO_ASC',
  SoDesc = 'SO_DESC',
  TbAsc = 'TB_ASC',
  TbDesc = 'TB_DESC',
  TriplesAsc = 'TRIPLES_ASC',
  TriplesDesc = 'TRIPLES_DESC'
}

export type AggregateSeasonFielding = {
  __typename?: 'AggregateSeasonFielding';
  a?: Maybe<Scalars['Int']['output']>;
  cg?: Maybe<Scalars['Int']['output']>;
  chances?: Maybe<Scalars['Int']['output']>;
  cs?: Maybe<Scalars['Int']['output']>;
  dpDef?: Maybe<Scalars['Int']['output']>;
  eDef?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  gs?: Maybe<Scalars['Int']['output']>;
  innDef?: Maybe<Scalars['Int']['output']>;
  /** Reads and enables pagination through a set of `MatchupPlayer`. */
  matchupPlayersByPlayerIdAndSeason: MatchupPlayersConnection;
  pickoffs?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `Player` that is related to this `AggregateSeasonFielding`. */
  player?: Maybe<Player>;
  playerId?: Maybe<Scalars['Int']['output']>;
  po?: Maybe<Scalars['Int']['output']>;
  sb?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  wp?: Maybe<Scalars['Int']['output']>;
};


export type AggregateSeasonFieldingMatchupPlayersByPlayerIdAndSeasonArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<MatchupPlayerCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MatchupPlayersOrderBy>>;
};

export type AggregateSeasonFieldingByPo = {
  __typename?: 'AggregateSeasonFieldingByPo';
  a?: Maybe<Scalars['Int']['output']>;
  cg?: Maybe<Scalars['Int']['output']>;
  chances?: Maybe<Scalars['Int']['output']>;
  cs?: Maybe<Scalars['Int']['output']>;
  dpDef?: Maybe<Scalars['Int']['output']>;
  eDef?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  gs?: Maybe<Scalars['Int']['output']>;
  innDef?: Maybe<Scalars['Int']['output']>;
  pickoffs?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `Player` that is related to this `AggregateSeasonFieldingByPo`. */
  player?: Maybe<Player>;
  playerId?: Maybe<Scalars['Int']['output']>;
  po?: Maybe<Scalars['Int']['output']>;
  pos?: Maybe<Scalars['String']['output']>;
  sb?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  wp?: Maybe<Scalars['Int']['output']>;
};

/**
 * A condition to be used against `AggregateSeasonFieldingByPo` object types. All
 * fields are tested for equality and combined with a logical ‘and.’
 */
export type AggregateSeasonFieldingByPoCondition = {
  /** Checks for equality with the object’s `a` field. */
  a?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `cg` field. */
  cg?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `chances` field. */
  chances?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `cs` field. */
  cs?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `dpDef` field. */
  dpDef?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `eDef` field. */
  eDef?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `g` field. */
  g?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `gs` field. */
  gs?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `innDef` field. */
  innDef?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `pickoffs` field. */
  pickoffs?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `po` field. */
  po?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `pos` field. */
  pos?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `sb` field. */
  sb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `season` field. */
  season?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `wp` field. */
  wp?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `AggregateSeasonFieldingByPo` values. */
export type AggregateSeasonFieldingByPosConnection = {
  __typename?: 'AggregateSeasonFieldingByPosConnection';
  /** A list of edges which contains the `AggregateSeasonFieldingByPo` and cursor to aid in pagination. */
  edges: Array<AggregateSeasonFieldingByPosEdge>;
  /** A list of `AggregateSeasonFieldingByPo` objects. */
  nodes: Array<Maybe<AggregateSeasonFieldingByPo>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `AggregateSeasonFieldingByPo` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `AggregateSeasonFieldingByPo` edge in the connection. */
export type AggregateSeasonFieldingByPosEdge = {
  __typename?: 'AggregateSeasonFieldingByPosEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `AggregateSeasonFieldingByPo` at the end of the edge. */
  node?: Maybe<AggregateSeasonFieldingByPo>;
};

/** Methods to use when ordering `AggregateSeasonFieldingByPo`. */
export enum AggregateSeasonFieldingByPosOrderBy {
  AAsc = 'A_ASC',
  ADesc = 'A_DESC',
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
  GsAsc = 'GS_ASC',
  GsDesc = 'GS_DESC',
  GAsc = 'G_ASC',
  GDesc = 'G_DESC',
  InnDefAsc = 'INN_DEF_ASC',
  InnDefDesc = 'INN_DEF_DESC',
  Natural = 'NATURAL',
  PickoffsAsc = 'PICKOFFS_ASC',
  PickoffsDesc = 'PICKOFFS_DESC',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  PosAsc = 'POS_ASC',
  PosDesc = 'POS_DESC',
  PoAsc = 'PO_ASC',
  PoDesc = 'PO_DESC',
  SbAsc = 'SB_ASC',
  SbDesc = 'SB_DESC',
  SeasonAsc = 'SEASON_ASC',
  SeasonDesc = 'SEASON_DESC',
  WpAsc = 'WP_ASC',
  WpDesc = 'WP_DESC'
}

/**
 * A condition to be used against `AggregateSeasonFielding` object types. All
 * fields are tested for equality and combined with a logical ‘and.’
 */
export type AggregateSeasonFieldingCondition = {
  /** Checks for equality with the object’s `a` field. */
  a?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `cg` field. */
  cg?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `chances` field. */
  chances?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `cs` field. */
  cs?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `dpDef` field. */
  dpDef?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `eDef` field. */
  eDef?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `g` field. */
  g?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `gs` field. */
  gs?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `innDef` field. */
  innDef?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `pickoffs` field. */
  pickoffs?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `po` field. */
  po?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sb` field. */
  sb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `season` field. */
  season?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `wp` field. */
  wp?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `AggregateSeasonFielding` values. */
export type AggregateSeasonFieldingsConnection = {
  __typename?: 'AggregateSeasonFieldingsConnection';
  /** A list of edges which contains the `AggregateSeasonFielding` and cursor to aid in pagination. */
  edges: Array<AggregateSeasonFieldingsEdge>;
  /** A list of `AggregateSeasonFielding` objects. */
  nodes: Array<Maybe<AggregateSeasonFielding>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `AggregateSeasonFielding` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `AggregateSeasonFielding` edge in the connection. */
export type AggregateSeasonFieldingsEdge = {
  __typename?: 'AggregateSeasonFieldingsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `AggregateSeasonFielding` at the end of the edge. */
  node?: Maybe<AggregateSeasonFielding>;
};

/** Methods to use when ordering `AggregateSeasonFielding`. */
export enum AggregateSeasonFieldingsOrderBy {
  AAsc = 'A_ASC',
  ADesc = 'A_DESC',
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
  GsAsc = 'GS_ASC',
  GsDesc = 'GS_DESC',
  GAsc = 'G_ASC',
  GDesc = 'G_DESC',
  InnDefAsc = 'INN_DEF_ASC',
  InnDefDesc = 'INN_DEF_DESC',
  Natural = 'NATURAL',
  PickoffsAsc = 'PICKOFFS_ASC',
  PickoffsDesc = 'PICKOFFS_DESC',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  PoAsc = 'PO_ASC',
  PoDesc = 'PO_DESC',
  SbAsc = 'SB_ASC',
  SbDesc = 'SB_DESC',
  SeasonAsc = 'SEASON_ASC',
  SeasonDesc = 'SEASON_DESC',
  WpAsc = 'WP_ASC',
  WpDesc = 'WP_DESC'
}

export type AggregateSeasonPitching = {
  __typename?: 'AggregateSeasonPitching';
  battersFaced?: Maybe<Scalars['Int']['output']>;
  bb?: Maybe<Scalars['Int']['output']>;
  bk?: Maybe<Scalars['Int']['output']>;
  cg?: Maybe<Scalars['Int']['output']>;
  er?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  gf?: Maybe<Scalars['Int']['output']>;
  gs?: Maybe<Scalars['Int']['output']>;
  h?: Maybe<Scalars['Int']['output']>;
  hbp?: Maybe<Scalars['Int']['output']>;
  hr?: Maybe<Scalars['Int']['output']>;
  ibb?: Maybe<Scalars['Int']['output']>;
  l?: Maybe<Scalars['Int']['output']>;
  /** Reads and enables pagination through a set of `MatchupPlayer`. */
  matchupPlayersByPlayerIdAndSeason: MatchupPlayersConnection;
  outsRecorded?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `Player` that is related to this `AggregateSeasonPitching`. */
  player?: Maybe<Player>;
  playerId?: Maybe<Scalars['Int']['output']>;
  r?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  sho?: Maybe<Scalars['Int']['output']>;
  so?: Maybe<Scalars['Int']['output']>;
  sv?: Maybe<Scalars['Int']['output']>;
  w?: Maybe<Scalars['Int']['output']>;
  wp?: Maybe<Scalars['Int']['output']>;
};


export type AggregateSeasonPitchingMatchupPlayersByPlayerIdAndSeasonArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<MatchupPlayerCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MatchupPlayersOrderBy>>;
};

/**
 * A condition to be used against `AggregateSeasonPitching` object types. All
 * fields are tested for equality and combined with a logical ‘and.’
 */
export type AggregateSeasonPitchingCondition = {
  /** Checks for equality with the object’s `battersFaced` field. */
  battersFaced?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `bb` field. */
  bb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `bk` field. */
  bk?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `cg` field. */
  cg?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `er` field. */
  er?: InputMaybe<Scalars['Int']['input']>;
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
  /** Checks for equality with the object’s `hr` field. */
  hr?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `ibb` field. */
  ibb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `l` field. */
  l?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `outsRecorded` field. */
  outsRecorded?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `r` field. */
  r?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `season` field. */
  season?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sho` field. */
  sho?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `so` field. */
  so?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sv` field. */
  sv?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `w` field. */
  w?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `wp` field. */
  wp?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `AggregateSeasonPitching` values. */
export type AggregateSeasonPitchingsConnection = {
  __typename?: 'AggregateSeasonPitchingsConnection';
  /** A list of edges which contains the `AggregateSeasonPitching` and cursor to aid in pagination. */
  edges: Array<AggregateSeasonPitchingsEdge>;
  /** A list of `AggregateSeasonPitching` objects. */
  nodes: Array<Maybe<AggregateSeasonPitching>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `AggregateSeasonPitching` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `AggregateSeasonPitching` edge in the connection. */
export type AggregateSeasonPitchingsEdge = {
  __typename?: 'AggregateSeasonPitchingsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `AggregateSeasonPitching` at the end of the edge. */
  node?: Maybe<AggregateSeasonPitching>;
};

/** Methods to use when ordering `AggregateSeasonPitching`. */
export enum AggregateSeasonPitchingsOrderBy {
  BattersFacedAsc = 'BATTERS_FACED_ASC',
  BattersFacedDesc = 'BATTERS_FACED_DESC',
  BbAsc = 'BB_ASC',
  BbDesc = 'BB_DESC',
  BkAsc = 'BK_ASC',
  BkDesc = 'BK_DESC',
  CgAsc = 'CG_ASC',
  CgDesc = 'CG_DESC',
  ErAsc = 'ER_ASC',
  ErDesc = 'ER_DESC',
  GfAsc = 'GF_ASC',
  GfDesc = 'GF_DESC',
  GsAsc = 'GS_ASC',
  GsDesc = 'GS_DESC',
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
  LAsc = 'L_ASC',
  LDesc = 'L_DESC',
  Natural = 'NATURAL',
  OutsRecordedAsc = 'OUTS_RECORDED_ASC',
  OutsRecordedDesc = 'OUTS_RECORDED_DESC',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  RAsc = 'R_ASC',
  RDesc = 'R_DESC',
  SeasonAsc = 'SEASON_ASC',
  SeasonDesc = 'SEASON_DESC',
  ShoAsc = 'SHO_ASC',
  ShoDesc = 'SHO_DESC',
  SoAsc = 'SO_ASC',
  SoDesc = 'SO_DESC',
  SvAsc = 'SV_ASC',
  SvDesc = 'SV_DESC',
  WpAsc = 'WP_ASC',
  WpDesc = 'WP_DESC',
  WAsc = 'W_ASC',
  WDesc = 'W_DESC'
}

export type CareerBatting = {
  __typename?: 'CareerBatting';
  ab?: Maybe<Scalars['BigInt']['output']>;
  bb?: Maybe<Scalars['BigInt']['output']>;
  cs?: Maybe<Scalars['BigInt']['output']>;
  doubles?: Maybe<Scalars['BigInt']['output']>;
  g?: Maybe<Scalars['BigInt']['output']>;
  gidp?: Maybe<Scalars['BigInt']['output']>;
  h?: Maybe<Scalars['BigInt']['output']>;
  hbp?: Maybe<Scalars['BigInt']['output']>;
  hr?: Maybe<Scalars['BigInt']['output']>;
  ibb?: Maybe<Scalars['BigInt']['output']>;
  pa?: Maybe<Scalars['BigInt']['output']>;
  /** Reads a single `Player` that is related to this `CareerBatting`. */
  player?: Maybe<Player>;
  playerId?: Maybe<Scalars['Int']['output']>;
  r?: Maybe<Scalars['BigInt']['output']>;
  rbi?: Maybe<Scalars['BigInt']['output']>;
  sb?: Maybe<Scalars['BigInt']['output']>;
  sh?: Maybe<Scalars['BigInt']['output']>;
  so?: Maybe<Scalars['BigInt']['output']>;
  tb?: Maybe<Scalars['BigInt']['output']>;
  triples?: Maybe<Scalars['BigInt']['output']>;
};

/**
 * A condition to be used against `CareerBatting` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type CareerBattingCondition = {
  /** Checks for equality with the object’s `ab` field. */
  ab?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `bb` field. */
  bb?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `cs` field. */
  cs?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `doubles` field. */
  doubles?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `g` field. */
  g?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `gidp` field. */
  gidp?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `h` field. */
  h?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `hbp` field. */
  hbp?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `hr` field. */
  hr?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `ibb` field. */
  ibb?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `pa` field. */
  pa?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `r` field. */
  r?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `rbi` field. */
  rbi?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `sb` field. */
  sb?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `sh` field. */
  sh?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `so` field. */
  so?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `tb` field. */
  tb?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `triples` field. */
  triples?: InputMaybe<Scalars['BigInt']['input']>;
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
  Natural = 'NATURAL',
  PaAsc = 'PA_ASC',
  PaDesc = 'PA_DESC',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  RbiAsc = 'RBI_ASC',
  RbiDesc = 'RBI_DESC',
  RAsc = 'R_ASC',
  RDesc = 'R_DESC',
  SbAsc = 'SB_ASC',
  SbDesc = 'SB_DESC',
  ShAsc = 'SH_ASC',
  ShDesc = 'SH_DESC',
  SoAsc = 'SO_ASC',
  SoDesc = 'SO_DESC',
  TbAsc = 'TB_ASC',
  TbDesc = 'TB_DESC',
  TriplesAsc = 'TRIPLES_ASC',
  TriplesDesc = 'TRIPLES_DESC'
}

export type CareerFielding = {
  __typename?: 'CareerFielding';
  a?: Maybe<Scalars['BigInt']['output']>;
  cg?: Maybe<Scalars['BigInt']['output']>;
  chances?: Maybe<Scalars['Float']['output']>;
  cs?: Maybe<Scalars['BigInt']['output']>;
  dpDef?: Maybe<Scalars['BigInt']['output']>;
  eDef?: Maybe<Scalars['BigInt']['output']>;
  g?: Maybe<Scalars['BigInt']['output']>;
  gs?: Maybe<Scalars['BigInt']['output']>;
  innDef?: Maybe<Scalars['Float']['output']>;
  pickoffs?: Maybe<Scalars['BigInt']['output']>;
  /** Reads a single `Player` that is related to this `CareerFielding`. */
  player?: Maybe<Player>;
  playerId?: Maybe<Scalars['Int']['output']>;
  po?: Maybe<Scalars['BigInt']['output']>;
  pos?: Maybe<Scalars['String']['output']>;
  sb?: Maybe<Scalars['BigInt']['output']>;
  wp?: Maybe<Scalars['BigInt']['output']>;
};

export type CareerFieldingByPosition = {
  __typename?: 'CareerFieldingByPosition';
  a?: Maybe<Scalars['BigInt']['output']>;
  cg?: Maybe<Scalars['BigInt']['output']>;
  chances?: Maybe<Scalars['Float']['output']>;
  cs?: Maybe<Scalars['BigInt']['output']>;
  dpDef?: Maybe<Scalars['BigInt']['output']>;
  eDef?: Maybe<Scalars['BigInt']['output']>;
  g?: Maybe<Scalars['BigInt']['output']>;
  gs?: Maybe<Scalars['BigInt']['output']>;
  innDef?: Maybe<Scalars['Float']['output']>;
  pickoffs?: Maybe<Scalars['BigInt']['output']>;
  /** Reads a single `Player` that is related to this `CareerFieldingByPosition`. */
  player?: Maybe<Player>;
  playerId?: Maybe<Scalars['Int']['output']>;
  po?: Maybe<Scalars['BigInt']['output']>;
  pos?: Maybe<Scalars['String']['output']>;
  sb?: Maybe<Scalars['BigInt']['output']>;
  wp?: Maybe<Scalars['BigInt']['output']>;
};

/**
 * A condition to be used against `CareerFieldingByPosition` object types. All
 * fields are tested for equality and combined with a logical ‘and.’
 */
export type CareerFieldingByPositionCondition = {
  /** Checks for equality with the object’s `a` field. */
  a?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `cg` field. */
  cg?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `chances` field. */
  chances?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `cs` field. */
  cs?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `dpDef` field. */
  dpDef?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `eDef` field. */
  eDef?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `g` field. */
  g?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `gs` field. */
  gs?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `innDef` field. */
  innDef?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `pickoffs` field. */
  pickoffs?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `po` field. */
  po?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `pos` field. */
  pos?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `sb` field. */
  sb?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `wp` field. */
  wp?: InputMaybe<Scalars['BigInt']['input']>;
};

/** A connection to a list of `CareerFieldingByPosition` values. */
export type CareerFieldingByPositionsConnection = {
  __typename?: 'CareerFieldingByPositionsConnection';
  /** A list of edges which contains the `CareerFieldingByPosition` and cursor to aid in pagination. */
  edges: Array<CareerFieldingByPositionsEdge>;
  /** A list of `CareerFieldingByPosition` objects. */
  nodes: Array<Maybe<CareerFieldingByPosition>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `CareerFieldingByPosition` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `CareerFieldingByPosition` edge in the connection. */
export type CareerFieldingByPositionsEdge = {
  __typename?: 'CareerFieldingByPositionsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `CareerFieldingByPosition` at the end of the edge. */
  node?: Maybe<CareerFieldingByPosition>;
};

/** Methods to use when ordering `CareerFieldingByPosition`. */
export enum CareerFieldingByPositionsOrderBy {
  AAsc = 'A_ASC',
  ADesc = 'A_DESC',
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
  GsAsc = 'GS_ASC',
  GsDesc = 'GS_DESC',
  GAsc = 'G_ASC',
  GDesc = 'G_DESC',
  InnDefAsc = 'INN_DEF_ASC',
  InnDefDesc = 'INN_DEF_DESC',
  Natural = 'NATURAL',
  PickoffsAsc = 'PICKOFFS_ASC',
  PickoffsDesc = 'PICKOFFS_DESC',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  PosAsc = 'POS_ASC',
  PosDesc = 'POS_DESC',
  PoAsc = 'PO_ASC',
  PoDesc = 'PO_DESC',
  SbAsc = 'SB_ASC',
  SbDesc = 'SB_DESC',
  WpAsc = 'WP_ASC',
  WpDesc = 'WP_DESC'
}

/**
 * A condition to be used against `CareerFielding` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type CareerFieldingCondition = {
  /** Checks for equality with the object’s `a` field. */
  a?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `cg` field. */
  cg?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `chances` field. */
  chances?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `cs` field. */
  cs?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `dpDef` field. */
  dpDef?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `eDef` field. */
  eDef?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `g` field. */
  g?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `gs` field. */
  gs?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `innDef` field. */
  innDef?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `pickoffs` field. */
  pickoffs?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `po` field. */
  po?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `pos` field. */
  pos?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `sb` field. */
  sb?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `wp` field. */
  wp?: InputMaybe<Scalars['BigInt']['input']>;
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
  AAsc = 'A_ASC',
  ADesc = 'A_DESC',
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
  GsAsc = 'GS_ASC',
  GsDesc = 'GS_DESC',
  GAsc = 'G_ASC',
  GDesc = 'G_DESC',
  InnDefAsc = 'INN_DEF_ASC',
  InnDefDesc = 'INN_DEF_DESC',
  Natural = 'NATURAL',
  PickoffsAsc = 'PICKOFFS_ASC',
  PickoffsDesc = 'PICKOFFS_DESC',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  PosAsc = 'POS_ASC',
  PosDesc = 'POS_DESC',
  PoAsc = 'PO_ASC',
  PoDesc = 'PO_DESC',
  SbAsc = 'SB_ASC',
  SbDesc = 'SB_DESC',
  WpAsc = 'WP_ASC',
  WpDesc = 'WP_DESC'
}

export type CareerPitching = {
  __typename?: 'CareerPitching';
  battersFaced?: Maybe<Scalars['BigInt']['output']>;
  bb?: Maybe<Scalars['BigInt']['output']>;
  bk?: Maybe<Scalars['BigInt']['output']>;
  cg?: Maybe<Scalars['BigInt']['output']>;
  er?: Maybe<Scalars['BigInt']['output']>;
  era?: Maybe<Scalars['BigFloat']['output']>;
  g?: Maybe<Scalars['BigInt']['output']>;
  gf?: Maybe<Scalars['BigInt']['output']>;
  gs?: Maybe<Scalars['BigInt']['output']>;
  h?: Maybe<Scalars['BigInt']['output']>;
  hbp?: Maybe<Scalars['BigInt']['output']>;
  hr?: Maybe<Scalars['BigInt']['output']>;
  ibb?: Maybe<Scalars['BigInt']['output']>;
  l?: Maybe<Scalars['BigInt']['output']>;
  outRate?: Maybe<Scalars['BigInt']['output']>;
  outsRecorded?: Maybe<Scalars['BigInt']['output']>;
  /** Reads a single `Player` that is related to this `CareerPitching`. */
  player?: Maybe<Player>;
  playerId?: Maybe<Scalars['Int']['output']>;
  r?: Maybe<Scalars['BigInt']['output']>;
  sho?: Maybe<Scalars['BigInt']['output']>;
  so?: Maybe<Scalars['BigInt']['output']>;
  sv?: Maybe<Scalars['BigInt']['output']>;
  w?: Maybe<Scalars['BigInt']['output']>;
  wp?: Maybe<Scalars['BigInt']['output']>;
};

/**
 * A condition to be used against `CareerPitching` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type CareerPitchingCondition = {
  /** Checks for equality with the object’s `battersFaced` field. */
  battersFaced?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `bb` field. */
  bb?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `bk` field. */
  bk?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `cg` field. */
  cg?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `er` field. */
  er?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `era` field. */
  era?: InputMaybe<Scalars['BigFloat']['input']>;
  /** Checks for equality with the object’s `g` field. */
  g?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `gf` field. */
  gf?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `gs` field. */
  gs?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `h` field. */
  h?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `hbp` field. */
  hbp?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `hr` field. */
  hr?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `ibb` field. */
  ibb?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `l` field. */
  l?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `outRate` field. */
  outRate?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `outsRecorded` field. */
  outsRecorded?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `r` field. */
  r?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `sho` field. */
  sho?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `so` field. */
  so?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `sv` field. */
  sv?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `w` field. */
  w?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `wp` field. */
  wp?: InputMaybe<Scalars['BigInt']['input']>;
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
  BattersFacedAsc = 'BATTERS_FACED_ASC',
  BattersFacedDesc = 'BATTERS_FACED_DESC',
  BbAsc = 'BB_ASC',
  BbDesc = 'BB_DESC',
  BkAsc = 'BK_ASC',
  BkDesc = 'BK_DESC',
  CgAsc = 'CG_ASC',
  CgDesc = 'CG_DESC',
  EraAsc = 'ERA_ASC',
  EraDesc = 'ERA_DESC',
  ErAsc = 'ER_ASC',
  ErDesc = 'ER_DESC',
  GfAsc = 'GF_ASC',
  GfDesc = 'GF_DESC',
  GsAsc = 'GS_ASC',
  GsDesc = 'GS_DESC',
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
  LAsc = 'L_ASC',
  LDesc = 'L_DESC',
  Natural = 'NATURAL',
  OutsRecordedAsc = 'OUTS_RECORDED_ASC',
  OutsRecordedDesc = 'OUTS_RECORDED_DESC',
  OutRateAsc = 'OUT_RATE_ASC',
  OutRateDesc = 'OUT_RATE_DESC',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  RAsc = 'R_ASC',
  RDesc = 'R_DESC',
  ShoAsc = 'SHO_ASC',
  ShoDesc = 'SHO_DESC',
  SoAsc = 'SO_ASC',
  SoDesc = 'SO_DESC',
  SvAsc = 'SV_ASC',
  SvDesc = 'SV_DESC',
  WpAsc = 'WP_ASC',
  WpDesc = 'WP_DESC',
  WAsc = 'W_ASC',
  WDesc = 'W_DESC'
}

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
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `Team` that is related to this `DraftTeam`. */
  teamLeague?: Maybe<Team>;
};


/** The output of our create `DraftTeam` mutation. */
export type CreateDraftTeamPayloadDraftTeamEdgeArgs = {
  orderBy?: InputMaybe<Array<DraftTeamsOrderBy>>;
};

/** All input for the create `GameBatting` mutation. */
export type CreateGameBattingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `GameBatting` to be created by this mutation. */
  gameBatting: GameBattingInput;
};

/** The output of our create `GameBatting` mutation. */
export type CreateGameBattingPayload = {
  __typename?: 'CreateGameBattingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `GameBatting` that was created by this mutation. */
  gameBatting?: Maybe<GameBatting>;
  /** An edge for our `GameBatting`. May be used by Relay 1. */
  gameBattingEdge?: Maybe<GameBattingsEdge>;
  /** Reads a single `Player` that is related to this `GameBatting`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our create `GameBatting` mutation. */
export type CreateGameBattingPayloadGameBattingEdgeArgs = {
  orderBy?: InputMaybe<Array<GameBattingsOrderBy>>;
};

/** All input for the create `GameFielding` mutation. */
export type CreateGameFieldingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `GameFielding` to be created by this mutation. */
  gameFielding: GameFieldingInput;
};

/** The output of our create `GameFielding` mutation. */
export type CreateGameFieldingPayload = {
  __typename?: 'CreateGameFieldingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `GameFielding` that was created by this mutation. */
  gameFielding?: Maybe<GameFielding>;
  /** An edge for our `GameFielding`. May be used by Relay 1. */
  gameFieldingEdge?: Maybe<GameFieldingsEdge>;
  /** Reads a single `Player` that is related to this `GameFielding`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our create `GameFielding` mutation. */
export type CreateGameFieldingPayloadGameFieldingEdgeArgs = {
  orderBy?: InputMaybe<Array<GameFieldingsOrderBy>>;
};

/** All input for the create `GamePitching` mutation. */
export type CreateGamePitchingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `GamePitching` to be created by this mutation. */
  gamePitching: GamePitchingInput;
};

/** The output of our create `GamePitching` mutation. */
export type CreateGamePitchingPayload = {
  __typename?: 'CreateGamePitchingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `GamePitching` that was created by this mutation. */
  gamePitching?: Maybe<GamePitching>;
  /** An edge for our `GamePitching`. May be used by Relay 1. */
  gamePitchingEdge?: Maybe<GamePitchingsEdge>;
  /** Reads a single `Player` that is related to this `GamePitching`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our create `GamePitching` mutation. */
export type CreateGamePitchingPayloadGamePitchingEdgeArgs = {
  orderBy?: InputMaybe<Array<GamePitchingsOrderBy>>;
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
  /** Reads a single `Matchup` that is related to this `League`. */
  matchupByCurrentMatchup?: Maybe<Matchup>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `User` that is related to this `League`. */
  userByOwner?: Maybe<User>;
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
  /** Reads a single `Matchup` that is related to this `League`. */
  matchupByCurrentMatchup?: Maybe<Matchup>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `User` that is related to this `League`. */
  userByOwner?: Maybe<User>;
};


/** The output of our create `League` mutation. */
export type CreateLeaguePayloadLeagueEdgeArgs = {
  orderBy?: InputMaybe<Array<LeaguesOrderBy>>;
};

/** All input for the create `LeaguePosition` mutation. */
export type CreateLeaguePositionInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `LeaguePosition` to be created by this mutation. */
  leaguePosition: LeaguePositionInput;
};

/** The output of our create `LeaguePosition` mutation. */
export type CreateLeaguePositionPayload = {
  __typename?: 'CreateLeaguePositionPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `LeaguePosition`. */
  league?: Maybe<League>;
  /** The `LeaguePosition` that was created by this mutation. */
  leaguePosition?: Maybe<LeaguePosition>;
  /** An edge for our `LeaguePosition`. May be used by Relay 1. */
  leaguePositionEdge?: Maybe<LeaguePositionsEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our create `LeaguePosition` mutation. */
export type CreateLeaguePositionPayloadLeaguePositionEdgeArgs = {
  orderBy?: InputMaybe<Array<LeaguePositionsOrderBy>>;
};

/** All input for the create `Matchup` mutation. */
export type CreateMatchupInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `Matchup` to be created by this mutation. */
  matchup: MatchupInput;
};

/** The output of our create `Matchup` mutation. */
export type CreateMatchupPayload = {
  __typename?: 'CreateMatchupPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `Matchup`. */
  leagueById?: Maybe<League>;
  /** The `Matchup` that was created by this mutation. */
  matchup?: Maybe<Matchup>;
  /** An edge for our `Matchup`. May be used by Relay 1. */
  matchupEdge?: Maybe<MatchupsEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our create `Matchup` mutation. */
export type CreateMatchupPayloadMatchupEdgeArgs = {
  orderBy?: InputMaybe<Array<MatchupsOrderBy>>;
};

/** All input for the create `MatchupPlayerGame` mutation. */
export type CreateMatchupPlayerGameInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `MatchupPlayerGame` to be created by this mutation. */
  matchupPlayerGame: MatchupPlayerGameInput;
};

/** The output of our create `MatchupPlayerGame` mutation. */
export type CreateMatchupPlayerGamePayload = {
  __typename?: 'CreateMatchupPlayerGamePayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `MatchupPlayer` that is related to this `MatchupPlayerGame`. */
  matchupPlayer?: Maybe<MatchupPlayer>;
  /** The `MatchupPlayerGame` that was created by this mutation. */
  matchupPlayerGame?: Maybe<MatchupPlayerGame>;
  /** An edge for our `MatchupPlayerGame`. May be used by Relay 1. */
  matchupPlayerGameEdge?: Maybe<MatchupPlayerGamesEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our create `MatchupPlayerGame` mutation. */
export type CreateMatchupPlayerGamePayloadMatchupPlayerGameEdgeArgs = {
  orderBy?: InputMaybe<Array<MatchupPlayerGamesOrderBy>>;
};

/** All input for the create `MatchupPlayer` mutation. */
export type CreateMatchupPlayerInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `MatchupPlayer` to be created by this mutation. */
  matchupPlayer: MatchupPlayerInput;
};

/** The output of our create `MatchupPlayer` mutation. */
export type CreateMatchupPlayerPayload = {
  __typename?: 'CreateMatchupPlayerPayload';
  /** Reads a single `AggregateSeasonBatting` that is related to this `MatchupPlayer`. */
  aggregateSeasonBattingByPlayerIdAndSeason?: Maybe<AggregateSeasonBatting>;
  /** Reads a single `AggregateSeasonFielding` that is related to this `MatchupPlayer`. */
  aggregateSeasonFieldingByPlayerIdAndSeason?: Maybe<AggregateSeasonFielding>;
  /** Reads a single `AggregateSeasonPitching` that is related to this `MatchupPlayer`. */
  aggregateSeasonPitchingByPlayerIdAndSeason?: Maybe<AggregateSeasonPitching>;
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Matchup` that is related to this `MatchupPlayer`. */
  matchup?: Maybe<Matchup>;
  /** The `MatchupPlayer` that was created by this mutation. */
  matchupPlayer?: Maybe<MatchupPlayer>;
  /** An edge for our `MatchupPlayer`. May be used by Relay 1. */
  matchupPlayerEdge?: Maybe<MatchupPlayersEdge>;
  /** Reads a single `Player` that is related to this `MatchupPlayer`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our create `MatchupPlayer` mutation. */
export type CreateMatchupPlayerPayloadMatchupPlayerEdgeArgs = {
  orderBy?: InputMaybe<Array<MatchupPlayersOrderBy>>;
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
  /** Reads a single `Player` that is related to this `SeasonPitching`. */
  player?: Maybe<Player>;
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

/** All input for the create `TeamMember` mutation. */
export type CreateTeamMemberInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `TeamMember` to be created by this mutation. */
  teamMember: TeamMemberInput;
};

/** The output of our create `TeamMember` mutation. */
export type CreateTeamMemberPayload = {
  __typename?: 'CreateTeamMemberPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `TeamMember`. */
  league?: Maybe<League>;
  /** Reads a single `Player` that is related to this `TeamMember`. */
  player?: Maybe<Player>;
  /** Reads a single `LeaguePosition` that is related to this `TeamMember`. */
  position?: Maybe<LeaguePosition>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `Team` that is related to this `TeamMember`. */
  team?: Maybe<Team>;
  /** The `TeamMember` that was created by this mutation. */
  teamMember?: Maybe<TeamMember>;
  /** An edge for our `TeamMember`. May be used by Relay 1. */
  teamMemberEdge?: Maybe<TeamMembersEdge>;
};


/** The output of our create `TeamMember` mutation. */
export type CreateTeamMemberPayloadTeamMemberEdgeArgs = {
  orderBy?: InputMaybe<Array<TeamMembersOrderBy>>;
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
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `Team` that is related to this `DraftTeam`. */
  teamLeague?: Maybe<Team>;
};


/** The output of our delete `DraftTeam` mutation. */
export type DeleteDraftTeamPayloadDraftTeamEdgeArgs = {
  orderBy?: InputMaybe<Array<DraftTeamsOrderBy>>;
};

/** All input for the `deleteGameBattingByNodeId` mutation. */
export type DeleteGameBattingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `GameBatting` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteGameBatting` mutation. */
export type DeleteGameBattingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  gameNumber: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
};

/** The output of our delete `GameBatting` mutation. */
export type DeleteGameBattingPayload = {
  __typename?: 'DeleteGameBattingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedGameBattingNodeId?: Maybe<Scalars['ID']['output']>;
  /** The `GameBatting` that was deleted by this mutation. */
  gameBatting?: Maybe<GameBatting>;
  /** An edge for our `GameBatting`. May be used by Relay 1. */
  gameBattingEdge?: Maybe<GameBattingsEdge>;
  /** Reads a single `Player` that is related to this `GameBatting`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our delete `GameBatting` mutation. */
export type DeleteGameBattingPayloadGameBattingEdgeArgs = {
  orderBy?: InputMaybe<Array<GameBattingsOrderBy>>;
};

/** All input for the `deleteGameFieldingByNodeId` mutation. */
export type DeleteGameFieldingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `GameFielding` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteGameFielding` mutation. */
export type DeleteGameFieldingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  gameNum: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
};

/** The output of our delete `GameFielding` mutation. */
export type DeleteGameFieldingPayload = {
  __typename?: 'DeleteGameFieldingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedGameFieldingNodeId?: Maybe<Scalars['ID']['output']>;
  /** The `GameFielding` that was deleted by this mutation. */
  gameFielding?: Maybe<GameFielding>;
  /** An edge for our `GameFielding`. May be used by Relay 1. */
  gameFieldingEdge?: Maybe<GameFieldingsEdge>;
  /** Reads a single `Player` that is related to this `GameFielding`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our delete `GameFielding` mutation. */
export type DeleteGameFieldingPayloadGameFieldingEdgeArgs = {
  orderBy?: InputMaybe<Array<GameFieldingsOrderBy>>;
};

/** All input for the `deleteGamePitchingByNodeId` mutation. */
export type DeleteGamePitchingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `GamePitching` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteGamePitching` mutation. */
export type DeleteGamePitchingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  gameNum: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
};

/** The output of our delete `GamePitching` mutation. */
export type DeleteGamePitchingPayload = {
  __typename?: 'DeleteGamePitchingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedGamePitchingNodeId?: Maybe<Scalars['ID']['output']>;
  /** The `GamePitching` that was deleted by this mutation. */
  gamePitching?: Maybe<GamePitching>;
  /** An edge for our `GamePitching`. May be used by Relay 1. */
  gamePitchingEdge?: Maybe<GamePitchingsEdge>;
  /** Reads a single `Player` that is related to this `GamePitching`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our delete `GamePitching` mutation. */
export type DeleteGamePitchingPayloadGamePitchingEdgeArgs = {
  orderBy?: InputMaybe<Array<GamePitchingsOrderBy>>;
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
  /** Reads a single `Matchup` that is related to this `League`. */
  matchupByCurrentMatchup?: Maybe<Matchup>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `User` that is related to this `League`. */
  userByOwner?: Maybe<User>;
};


/** The output of our delete `League` mutation. */
export type DeleteLeaguePayloadLeagueEdgeArgs = {
  orderBy?: InputMaybe<Array<LeaguesOrderBy>>;
};

/** All input for the `deleteLeaguePositionByNodeId` mutation. */
export type DeleteLeaguePositionByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `LeaguePosition` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteLeaguePosition` mutation. */
export type DeleteLeaguePositionInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
};

/** The output of our delete `LeaguePosition` mutation. */
export type DeleteLeaguePositionPayload = {
  __typename?: 'DeleteLeaguePositionPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedLeaguePositionNodeId?: Maybe<Scalars['ID']['output']>;
  /** Reads a single `League` that is related to this `LeaguePosition`. */
  league?: Maybe<League>;
  /** The `LeaguePosition` that was deleted by this mutation. */
  leaguePosition?: Maybe<LeaguePosition>;
  /** An edge for our `LeaguePosition`. May be used by Relay 1. */
  leaguePositionEdge?: Maybe<LeaguePositionsEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our delete `LeaguePosition` mutation. */
export type DeleteLeaguePositionPayloadLeaguePositionEdgeArgs = {
  orderBy?: InputMaybe<Array<LeaguePositionsOrderBy>>;
};

/** All input for the `deleteMatchupByLeagueIdAndWeekNumber` mutation. */
export type DeleteMatchupByLeagueIdAndWeekNumberInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  leagueId: Scalars['Int']['input'];
  weekNumber: Scalars['Int']['input'];
};

/** All input for the `deleteMatchupByNodeId` mutation. */
export type DeleteMatchupByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `Matchup` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteMatchup` mutation. */
export type DeleteMatchupInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
};

/** The output of our delete `Matchup` mutation. */
export type DeleteMatchupPayload = {
  __typename?: 'DeleteMatchupPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedMatchupNodeId?: Maybe<Scalars['ID']['output']>;
  /** Reads a single `League` that is related to this `Matchup`. */
  leagueById?: Maybe<League>;
  /** The `Matchup` that was deleted by this mutation. */
  matchup?: Maybe<Matchup>;
  /** An edge for our `Matchup`. May be used by Relay 1. */
  matchupEdge?: Maybe<MatchupsEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our delete `Matchup` mutation. */
export type DeleteMatchupPayloadMatchupEdgeArgs = {
  orderBy?: InputMaybe<Array<MatchupsOrderBy>>;
};

/** All input for the `deleteMatchupPlayerByMatchupIdAndPlayerId` mutation. */
export type DeleteMatchupPlayerByMatchupIdAndPlayerIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  matchupId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
};

/** All input for the `deleteMatchupPlayerByNodeId` mutation. */
export type DeleteMatchupPlayerByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `MatchupPlayer` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteMatchupPlayerGameByNodeId` mutation. */
export type DeleteMatchupPlayerGameByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `MatchupPlayerGame` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteMatchupPlayerGame` mutation. */
export type DeleteMatchupPlayerGameInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
};

/** The output of our delete `MatchupPlayerGame` mutation. */
export type DeleteMatchupPlayerGamePayload = {
  __typename?: 'DeleteMatchupPlayerGamePayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedMatchupPlayerGameNodeId?: Maybe<Scalars['ID']['output']>;
  /** Reads a single `MatchupPlayer` that is related to this `MatchupPlayerGame`. */
  matchupPlayer?: Maybe<MatchupPlayer>;
  /** The `MatchupPlayerGame` that was deleted by this mutation. */
  matchupPlayerGame?: Maybe<MatchupPlayerGame>;
  /** An edge for our `MatchupPlayerGame`. May be used by Relay 1. */
  matchupPlayerGameEdge?: Maybe<MatchupPlayerGamesEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our delete `MatchupPlayerGame` mutation. */
export type DeleteMatchupPlayerGamePayloadMatchupPlayerGameEdgeArgs = {
  orderBy?: InputMaybe<Array<MatchupPlayerGamesOrderBy>>;
};

/** All input for the `deleteMatchupPlayer` mutation. */
export type DeleteMatchupPlayerInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
};

/** The output of our delete `MatchupPlayer` mutation. */
export type DeleteMatchupPlayerPayload = {
  __typename?: 'DeleteMatchupPlayerPayload';
  /** Reads a single `AggregateSeasonBatting` that is related to this `MatchupPlayer`. */
  aggregateSeasonBattingByPlayerIdAndSeason?: Maybe<AggregateSeasonBatting>;
  /** Reads a single `AggregateSeasonFielding` that is related to this `MatchupPlayer`. */
  aggregateSeasonFieldingByPlayerIdAndSeason?: Maybe<AggregateSeasonFielding>;
  /** Reads a single `AggregateSeasonPitching` that is related to this `MatchupPlayer`. */
  aggregateSeasonPitchingByPlayerIdAndSeason?: Maybe<AggregateSeasonPitching>;
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedMatchupPlayerNodeId?: Maybe<Scalars['ID']['output']>;
  /** Reads a single `Matchup` that is related to this `MatchupPlayer`. */
  matchup?: Maybe<Matchup>;
  /** The `MatchupPlayer` that was deleted by this mutation. */
  matchupPlayer?: Maybe<MatchupPlayer>;
  /** An edge for our `MatchupPlayer`. May be used by Relay 1. */
  matchupPlayerEdge?: Maybe<MatchupPlayersEdge>;
  /** Reads a single `Player` that is related to this `MatchupPlayer`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our delete `MatchupPlayer` mutation. */
export type DeleteMatchupPlayerPayloadMatchupPlayerEdgeArgs = {
  orderBy?: InputMaybe<Array<MatchupPlayersOrderBy>>;
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
  playerId: Scalars['Int']['input'];
  rowId: Scalars['String']['input'];
  season: Scalars['Int']['input'];
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
  playerId: Scalars['Int']['input'];
  pos: Scalars['String']['input'];
  rowId: Scalars['String']['input'];
  season: Scalars['Int']['input'];
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
  playerId: Scalars['Int']['input'];
  rowId: Scalars['String']['input'];
  season: Scalars['Int']['input'];
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
  /** Reads a single `Player` that is related to this `SeasonPitching`. */
  player?: Maybe<Player>;
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

/** All input for the `deleteTeamMemberByNodeId` mutation. */
export type DeleteTeamMemberByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `TeamMember` to be deleted. */
  nodeId: Scalars['ID']['input'];
};

/** All input for the `deleteTeamMember` mutation. */
export type DeleteTeamMemberInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
};

/** The output of our delete `TeamMember` mutation. */
export type DeleteTeamMemberPayload = {
  __typename?: 'DeleteTeamMemberPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  deletedTeamMemberNodeId?: Maybe<Scalars['ID']['output']>;
  /** Reads a single `League` that is related to this `TeamMember`. */
  league?: Maybe<League>;
  /** Reads a single `Player` that is related to this `TeamMember`. */
  player?: Maybe<Player>;
  /** Reads a single `LeaguePosition` that is related to this `TeamMember`. */
  position?: Maybe<LeaguePosition>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `Team` that is related to this `TeamMember`. */
  team?: Maybe<Team>;
  /** The `TeamMember` that was deleted by this mutation. */
  teamMember?: Maybe<TeamMember>;
  /** An edge for our `TeamMember`. May be used by Relay 1. */
  teamMemberEdge?: Maybe<TeamMembersEdge>;
};


/** The output of our delete `TeamMember` mutation. */
export type DeleteTeamMemberPayloadTeamMemberEdgeArgs = {
  orderBy?: InputMaybe<Array<TeamMembersOrderBy>>;
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

export type GameBatting = Node & {
  __typename?: 'GameBatting';
  ab?: Maybe<Scalars['Int']['output']>;
  bb?: Maybe<Scalars['Int']['output']>;
  cs?: Maybe<Scalars['Int']['output']>;
  doubles?: Maybe<Scalars['Int']['output']>;
  gameIdentifier: Scalars['String']['output'];
  gameNumber: Scalars['Int']['output'];
  gidp?: Maybe<Scalars['Int']['output']>;
  h?: Maybe<Scalars['Int']['output']>;
  hbp?: Maybe<Scalars['Int']['output']>;
  hr?: Maybe<Scalars['Int']['output']>;
  ibb?: Maybe<Scalars['Int']['output']>;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  pa?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `Player` that is related to this `GameBatting`. */
  player?: Maybe<Player>;
  playerId: Scalars['Int']['output'];
  r?: Maybe<Scalars['Int']['output']>;
  rbi?: Maybe<Scalars['Int']['output']>;
  sb?: Maybe<Scalars['Int']['output']>;
  season: Scalars['Int']['output'];
  sf?: Maybe<Scalars['Int']['output']>;
  sh?: Maybe<Scalars['Int']['output']>;
  so?: Maybe<Scalars['Int']['output']>;
  triples?: Maybe<Scalars['Int']['output']>;
};

/**
 * A condition to be used against `GameBatting` object types. All fields are tested
 * for equality and combined with a logical ‘and.’
 */
export type GameBattingCondition = {
  /** Checks for equality with the object’s `ab` field. */
  ab?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `bb` field. */
  bb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `cs` field. */
  cs?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `doubles` field. */
  doubles?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `gameIdentifier` field. */
  gameIdentifier?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `gameNumber` field. */
  gameNumber?: InputMaybe<Scalars['Int']['input']>;
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
  /** Checks for equality with the object’s `pa` field. */
  pa?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `r` field. */
  r?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `rbi` field. */
  rbi?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sb` field. */
  sb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `season` field. */
  season?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sf` field. */
  sf?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sh` field. */
  sh?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `so` field. */
  so?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `triples` field. */
  triples?: InputMaybe<Scalars['Int']['input']>;
};

/** An input for mutations affecting `GameBatting` */
export type GameBattingInput = {
  ab?: InputMaybe<Scalars['Int']['input']>;
  bb?: InputMaybe<Scalars['Int']['input']>;
  cs?: InputMaybe<Scalars['Int']['input']>;
  doubles?: InputMaybe<Scalars['Int']['input']>;
  gameIdentifier: Scalars['String']['input'];
  gameNumber: Scalars['Int']['input'];
  gidp?: InputMaybe<Scalars['Int']['input']>;
  h?: InputMaybe<Scalars['Int']['input']>;
  hbp?: InputMaybe<Scalars['Int']['input']>;
  hr?: InputMaybe<Scalars['Int']['input']>;
  ibb?: InputMaybe<Scalars['Int']['input']>;
  pa?: InputMaybe<Scalars['Int']['input']>;
  playerId: Scalars['Int']['input'];
  r?: InputMaybe<Scalars['Int']['input']>;
  rbi?: InputMaybe<Scalars['Int']['input']>;
  sb?: InputMaybe<Scalars['Int']['input']>;
  season: Scalars['Int']['input'];
  sf?: InputMaybe<Scalars['Int']['input']>;
  sh?: InputMaybe<Scalars['Int']['input']>;
  so?: InputMaybe<Scalars['Int']['input']>;
  triples?: InputMaybe<Scalars['Int']['input']>;
};

/** Represents an update to a `GameBatting`. Fields that are set will be updated. */
export type GameBattingPatch = {
  ab?: InputMaybe<Scalars['Int']['input']>;
  bb?: InputMaybe<Scalars['Int']['input']>;
  cs?: InputMaybe<Scalars['Int']['input']>;
  doubles?: InputMaybe<Scalars['Int']['input']>;
  gameIdentifier?: InputMaybe<Scalars['String']['input']>;
  gameNumber?: InputMaybe<Scalars['Int']['input']>;
  gidp?: InputMaybe<Scalars['Int']['input']>;
  h?: InputMaybe<Scalars['Int']['input']>;
  hbp?: InputMaybe<Scalars['Int']['input']>;
  hr?: InputMaybe<Scalars['Int']['input']>;
  ibb?: InputMaybe<Scalars['Int']['input']>;
  pa?: InputMaybe<Scalars['Int']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  r?: InputMaybe<Scalars['Int']['input']>;
  rbi?: InputMaybe<Scalars['Int']['input']>;
  sb?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['Int']['input']>;
  sf?: InputMaybe<Scalars['Int']['input']>;
  sh?: InputMaybe<Scalars['Int']['input']>;
  so?: InputMaybe<Scalars['Int']['input']>;
  triples?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `GameBatting` values. */
export type GameBattingsConnection = {
  __typename?: 'GameBattingsConnection';
  /** A list of edges which contains the `GameBatting` and cursor to aid in pagination. */
  edges: Array<GameBattingsEdge>;
  /** A list of `GameBatting` objects. */
  nodes: Array<Maybe<GameBatting>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `GameBatting` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `GameBatting` edge in the connection. */
export type GameBattingsEdge = {
  __typename?: 'GameBattingsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `GameBatting` at the end of the edge. */
  node?: Maybe<GameBatting>;
};

/** Methods to use when ordering `GameBatting`. */
export enum GameBattingsOrderBy {
  AbAsc = 'AB_ASC',
  AbDesc = 'AB_DESC',
  BbAsc = 'BB_ASC',
  BbDesc = 'BB_DESC',
  CsAsc = 'CS_ASC',
  CsDesc = 'CS_DESC',
  DoublesAsc = 'DOUBLES_ASC',
  DoublesDesc = 'DOUBLES_DESC',
  GameIdentifierAsc = 'GAME_IDENTIFIER_ASC',
  GameIdentifierDesc = 'GAME_IDENTIFIER_DESC',
  GameNumberAsc = 'GAME_NUMBER_ASC',
  GameNumberDesc = 'GAME_NUMBER_DESC',
  GidpAsc = 'GIDP_ASC',
  GidpDesc = 'GIDP_DESC',
  HbpAsc = 'HBP_ASC',
  HbpDesc = 'HBP_DESC',
  HrAsc = 'HR_ASC',
  HrDesc = 'HR_DESC',
  HAsc = 'H_ASC',
  HDesc = 'H_DESC',
  IbbAsc = 'IBB_ASC',
  IbbDesc = 'IBB_DESC',
  Natural = 'NATURAL',
  PaAsc = 'PA_ASC',
  PaDesc = 'PA_DESC',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
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
  SoAsc = 'SO_ASC',
  SoDesc = 'SO_DESC',
  TriplesAsc = 'TRIPLES_ASC',
  TriplesDesc = 'TRIPLES_DESC'
}

export type GameFielding = Node & {
  __typename?: 'GameFielding';
  a?: Maybe<Scalars['Int']['output']>;
  chances?: Maybe<Scalars['Float']['output']>;
  dpDef?: Maybe<Scalars['Int']['output']>;
  eDef?: Maybe<Scalars['Int']['output']>;
  gameIdentifier: Scalars['String']['output'];
  gameNum: Scalars['Int']['output'];
  innDef?: Maybe<Scalars['Float']['output']>;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  /** Reads a single `Player` that is related to this `GameFielding`. */
  player?: Maybe<Player>;
  playerId: Scalars['Int']['output'];
  po?: Maybe<Scalars['Int']['output']>;
  season: Scalars['Int']['output'];
};

/**
 * A condition to be used against `GameFielding` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type GameFieldingCondition = {
  /** Checks for equality with the object’s `a` field. */
  a?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `chances` field. */
  chances?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `dpDef` field. */
  dpDef?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `eDef` field. */
  eDef?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `gameIdentifier` field. */
  gameIdentifier?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `gameNum` field. */
  gameNum?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `innDef` field. */
  innDef?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `po` field. */
  po?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `season` field. */
  season?: InputMaybe<Scalars['Int']['input']>;
};

/** An input for mutations affecting `GameFielding` */
export type GameFieldingInput = {
  a?: InputMaybe<Scalars['Int']['input']>;
  chances?: InputMaybe<Scalars['Float']['input']>;
  dpDef?: InputMaybe<Scalars['Int']['input']>;
  eDef?: InputMaybe<Scalars['Int']['input']>;
  gameIdentifier: Scalars['String']['input'];
  gameNum: Scalars['Int']['input'];
  innDef?: InputMaybe<Scalars['Float']['input']>;
  playerId: Scalars['Int']['input'];
  po?: InputMaybe<Scalars['Int']['input']>;
  season: Scalars['Int']['input'];
};

/** Represents an update to a `GameFielding`. Fields that are set will be updated. */
export type GameFieldingPatch = {
  a?: InputMaybe<Scalars['Int']['input']>;
  chances?: InputMaybe<Scalars['Float']['input']>;
  dpDef?: InputMaybe<Scalars['Int']['input']>;
  eDef?: InputMaybe<Scalars['Int']['input']>;
  gameIdentifier?: InputMaybe<Scalars['String']['input']>;
  gameNum?: InputMaybe<Scalars['Int']['input']>;
  innDef?: InputMaybe<Scalars['Float']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  po?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `GameFielding` values. */
export type GameFieldingsConnection = {
  __typename?: 'GameFieldingsConnection';
  /** A list of edges which contains the `GameFielding` and cursor to aid in pagination. */
  edges: Array<GameFieldingsEdge>;
  /** A list of `GameFielding` objects. */
  nodes: Array<Maybe<GameFielding>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `GameFielding` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `GameFielding` edge in the connection. */
export type GameFieldingsEdge = {
  __typename?: 'GameFieldingsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `GameFielding` at the end of the edge. */
  node?: Maybe<GameFielding>;
};

/** Methods to use when ordering `GameFielding`. */
export enum GameFieldingsOrderBy {
  AAsc = 'A_ASC',
  ADesc = 'A_DESC',
  ChancesAsc = 'CHANCES_ASC',
  ChancesDesc = 'CHANCES_DESC',
  DpDefAsc = 'DP_DEF_ASC',
  DpDefDesc = 'DP_DEF_DESC',
  EDefAsc = 'E_DEF_ASC',
  EDefDesc = 'E_DEF_DESC',
  GameIdentifierAsc = 'GAME_IDENTIFIER_ASC',
  GameIdentifierDesc = 'GAME_IDENTIFIER_DESC',
  GameNumAsc = 'GAME_NUM_ASC',
  GameNumDesc = 'GAME_NUM_DESC',
  InnDefAsc = 'INN_DEF_ASC',
  InnDefDesc = 'INN_DEF_DESC',
  Natural = 'NATURAL',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  PoAsc = 'PO_ASC',
  PoDesc = 'PO_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  SeasonAsc = 'SEASON_ASC',
  SeasonDesc = 'SEASON_DESC'
}

export type GamePitching = Node & {
  __typename?: 'GamePitching';
  battersFaced?: Maybe<Scalars['Int']['output']>;
  bb?: Maybe<Scalars['Int']['output']>;
  cg?: Maybe<Scalars['Int']['output']>;
  er?: Maybe<Scalars['Int']['output']>;
  gameIdentifier: Scalars['String']['output'];
  gameNum: Scalars['Int']['output'];
  gf?: Maybe<Scalars['Int']['output']>;
  gs?: Maybe<Scalars['Int']['output']>;
  h?: Maybe<Scalars['Int']['output']>;
  hbp?: Maybe<Scalars['Int']['output']>;
  hr?: Maybe<Scalars['Int']['output']>;
  ibb?: Maybe<Scalars['Int']['output']>;
  ip?: Maybe<Scalars['Float']['output']>;
  l?: Maybe<Scalars['Int']['output']>;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  outsRecorded?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `Player` that is related to this `GamePitching`. */
  player?: Maybe<Player>;
  playerId: Scalars['Int']['output'];
  r?: Maybe<Scalars['Int']['output']>;
  season: Scalars['Int']['output'];
  sho?: Maybe<Scalars['Int']['output']>;
  so?: Maybe<Scalars['Int']['output']>;
  sv?: Maybe<Scalars['Int']['output']>;
  w?: Maybe<Scalars['Int']['output']>;
};

/**
 * A condition to be used against `GamePitching` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type GamePitchingCondition = {
  /** Checks for equality with the object’s `battersFaced` field. */
  battersFaced?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `bb` field. */
  bb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `cg` field. */
  cg?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `er` field. */
  er?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `gameIdentifier` field. */
  gameIdentifier?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `gameNum` field. */
  gameNum?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `gf` field. */
  gf?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `gs` field. */
  gs?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `h` field. */
  h?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `hbp` field. */
  hbp?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `hr` field. */
  hr?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `ibb` field. */
  ibb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `ip` field. */
  ip?: InputMaybe<Scalars['Float']['input']>;
  /** Checks for equality with the object’s `l` field. */
  l?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `outsRecorded` field. */
  outsRecorded?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `r` field. */
  r?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `season` field. */
  season?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sho` field. */
  sho?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `so` field. */
  so?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sv` field. */
  sv?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `w` field. */
  w?: InputMaybe<Scalars['Int']['input']>;
};

/** An input for mutations affecting `GamePitching` */
export type GamePitchingInput = {
  battersFaced?: InputMaybe<Scalars['Int']['input']>;
  bb?: InputMaybe<Scalars['Int']['input']>;
  cg?: InputMaybe<Scalars['Int']['input']>;
  er?: InputMaybe<Scalars['Int']['input']>;
  gameIdentifier: Scalars['String']['input'];
  gameNum: Scalars['Int']['input'];
  gf?: InputMaybe<Scalars['Int']['input']>;
  gs?: InputMaybe<Scalars['Int']['input']>;
  h?: InputMaybe<Scalars['Int']['input']>;
  hbp?: InputMaybe<Scalars['Int']['input']>;
  hr?: InputMaybe<Scalars['Int']['input']>;
  ibb?: InputMaybe<Scalars['Int']['input']>;
  ip?: InputMaybe<Scalars['Float']['input']>;
  l?: InputMaybe<Scalars['Int']['input']>;
  outsRecorded?: InputMaybe<Scalars['Int']['input']>;
  playerId: Scalars['Int']['input'];
  r?: InputMaybe<Scalars['Int']['input']>;
  season: Scalars['Int']['input'];
  sho?: InputMaybe<Scalars['Int']['input']>;
  so?: InputMaybe<Scalars['Int']['input']>;
  sv?: InputMaybe<Scalars['Int']['input']>;
  w?: InputMaybe<Scalars['Int']['input']>;
};

/** Represents an update to a `GamePitching`. Fields that are set will be updated. */
export type GamePitchingPatch = {
  battersFaced?: InputMaybe<Scalars['Int']['input']>;
  bb?: InputMaybe<Scalars['Int']['input']>;
  cg?: InputMaybe<Scalars['Int']['input']>;
  er?: InputMaybe<Scalars['Int']['input']>;
  gameIdentifier?: InputMaybe<Scalars['String']['input']>;
  gameNum?: InputMaybe<Scalars['Int']['input']>;
  gf?: InputMaybe<Scalars['Int']['input']>;
  gs?: InputMaybe<Scalars['Int']['input']>;
  h?: InputMaybe<Scalars['Int']['input']>;
  hbp?: InputMaybe<Scalars['Int']['input']>;
  hr?: InputMaybe<Scalars['Int']['input']>;
  ibb?: InputMaybe<Scalars['Int']['input']>;
  ip?: InputMaybe<Scalars['Float']['input']>;
  l?: InputMaybe<Scalars['Int']['input']>;
  outsRecorded?: InputMaybe<Scalars['Int']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  r?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['Int']['input']>;
  sho?: InputMaybe<Scalars['Int']['input']>;
  so?: InputMaybe<Scalars['Int']['input']>;
  sv?: InputMaybe<Scalars['Int']['input']>;
  w?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `GamePitching` values. */
export type GamePitchingsConnection = {
  __typename?: 'GamePitchingsConnection';
  /** A list of edges which contains the `GamePitching` and cursor to aid in pagination. */
  edges: Array<GamePitchingsEdge>;
  /** A list of `GamePitching` objects. */
  nodes: Array<Maybe<GamePitching>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `GamePitching` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `GamePitching` edge in the connection. */
export type GamePitchingsEdge = {
  __typename?: 'GamePitchingsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `GamePitching` at the end of the edge. */
  node?: Maybe<GamePitching>;
};

/** Methods to use when ordering `GamePitching`. */
export enum GamePitchingsOrderBy {
  BattersFacedAsc = 'BATTERS_FACED_ASC',
  BattersFacedDesc = 'BATTERS_FACED_DESC',
  BbAsc = 'BB_ASC',
  BbDesc = 'BB_DESC',
  CgAsc = 'CG_ASC',
  CgDesc = 'CG_DESC',
  ErAsc = 'ER_ASC',
  ErDesc = 'ER_DESC',
  GameIdentifierAsc = 'GAME_IDENTIFIER_ASC',
  GameIdentifierDesc = 'GAME_IDENTIFIER_DESC',
  GameNumAsc = 'GAME_NUM_ASC',
  GameNumDesc = 'GAME_NUM_DESC',
  GfAsc = 'GF_ASC',
  GfDesc = 'GF_DESC',
  GsAsc = 'GS_ASC',
  GsDesc = 'GS_DESC',
  HbpAsc = 'HBP_ASC',
  HbpDesc = 'HBP_DESC',
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
  OutsRecordedAsc = 'OUTS_RECORDED_ASC',
  OutsRecordedDesc = 'OUTS_RECORDED_DESC',
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
  SvAsc = 'SV_ASC',
  SvDesc = 'SV_DESC',
  WAsc = 'W_ASC',
  WDesc = 'W_DESC'
}

/** All input for the `isMajorLeague` mutation. */
export type IsMajorLeagueInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  lgId?: InputMaybe<Scalars['String']['input']>;
};

/** The output of our `isMajorLeague` mutation. */
export type IsMajorLeaguePayload = {
  __typename?: 'IsMajorLeaguePayload';
  boolean?: Maybe<Scalars['Boolean']['output']>;
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};

export type League = Node & {
  __typename?: 'League';
  currentMatchup?: Maybe<Scalars['Int']['output']>;
  /** Reads and enables pagination through a set of `Draft`. */
  drafts: DraftsConnection;
  id: Scalars['Int']['output'];
  /** Reads and enables pagination through a set of `LeagueMember`. */
  leagueMembers: LeagueMembersConnection;
  /** Reads and enables pagination through a set of `LeagueMessage`. */
  leagueMessages: LeagueMessagesConnection;
  /** Reads and enables pagination through a set of `LeaguePosition`. */
  leaguePositions: LeaguePositionsConnection;
  /** Reads a single `Matchup` that is related to this `League`. */
  matchupByCurrentMatchup?: Maybe<Matchup>;
  /** Reads a single `Matchup` that is related to this `League`. */
  matchupById?: Maybe<Matchup>;
  maxRosterSize: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  owner: Scalars['Int']['output'];
  /** Reads and enables pagination through a set of `TeamMember`. */
  teamMembers: TeamMembersConnection;
  /** Reads and enables pagination through a set of `Team`. */
  teams: TeamsConnection;
  /** Reads a single `User` that is related to this `League`. */
  userByOwner?: Maybe<User>;
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


export type LeagueLeaguePositionsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<LeaguePositionCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LeaguePositionsOrderBy>>;
};


export type LeagueTeamMembersArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<TeamMemberCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TeamMembersOrderBy>>;
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
  /** Checks for equality with the object’s `currentMatchup` field. */
  currentMatchup?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `maxRosterSize` field. */
  maxRosterSize?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `name` field. */
  name?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `owner` field. */
  owner?: InputMaybe<Scalars['Int']['input']>;
};

/** An input for mutations affecting `League` */
export type LeagueInput = {
  currentMatchup?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  maxRosterSize?: InputMaybe<Scalars['Int']['input']>;
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
  currentMatchup?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  maxRosterSize?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  owner?: InputMaybe<Scalars['Int']['input']>;
};

export enum LeaguePermissionLevel {
  Commissioner = 'COMMISSIONER',
  Owner = 'OWNER'
}

export type LeaguePosition = Node & {
  __typename?: 'LeaguePosition';
  id: Scalars['Int']['output'];
  /** Reads a single `League` that is related to this `LeaguePosition`. */
  league?: Maybe<League>;
  leagueId: Scalars['Int']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  positionType: PositionSlot;
  /** Reads and enables pagination through a set of `TeamMember`. */
  teamMembersByPositionId: TeamMembersConnection;
};


export type LeaguePositionTeamMembersByPositionIdArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<TeamMemberCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TeamMembersOrderBy>>;
};

/**
 * A condition to be used against `LeaguePosition` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type LeaguePositionCondition = {
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `leagueId` field. */
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `positionType` field. */
  positionType?: InputMaybe<PositionSlot>;
};

/** An input for mutations affecting `LeaguePosition` */
export type LeaguePositionInput = {
  id?: InputMaybe<Scalars['Int']['input']>;
  leagueId: Scalars['Int']['input'];
  positionType: PositionSlot;
};

/** Represents an update to a `LeaguePosition`. Fields that are set will be updated. */
export type LeaguePositionPatch = {
  id?: InputMaybe<Scalars['Int']['input']>;
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  positionType?: InputMaybe<PositionSlot>;
};

/** A connection to a list of `LeaguePosition` values. */
export type LeaguePositionsConnection = {
  __typename?: 'LeaguePositionsConnection';
  /** A list of edges which contains the `LeaguePosition` and cursor to aid in pagination. */
  edges: Array<LeaguePositionsEdge>;
  /** A list of `LeaguePosition` objects. */
  nodes: Array<Maybe<LeaguePosition>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `LeaguePosition` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `LeaguePosition` edge in the connection. */
export type LeaguePositionsEdge = {
  __typename?: 'LeaguePositionsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `LeaguePosition` at the end of the edge. */
  node?: Maybe<LeaguePosition>;
};

/** Methods to use when ordering `LeaguePosition`. */
export enum LeaguePositionsOrderBy {
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  LeagueIdAsc = 'LEAGUE_ID_ASC',
  LeagueIdDesc = 'LEAGUE_ID_DESC',
  Natural = 'NATURAL',
  PositionTypeAsc = 'POSITION_TYPE_ASC',
  PositionTypeDesc = 'POSITION_TYPE_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC'
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
  CurrentMatchupAsc = 'CURRENT_MATCHUP_ASC',
  CurrentMatchupDesc = 'CURRENT_MATCHUP_DESC',
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  MaxRosterSizeAsc = 'MAX_ROSTER_SIZE_ASC',
  MaxRosterSizeDesc = 'MAX_ROSTER_SIZE_DESC',
  NameAsc = 'NAME_ASC',
  NameDesc = 'NAME_DESC',
  Natural = 'NATURAL',
  OwnerAsc = 'OWNER_ASC',
  OwnerDesc = 'OWNER_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC'
}

export type Matchup = Node & {
  __typename?: 'Matchup';
  id: Scalars['Int']['output'];
  /** Reads a single `League` that is related to this `Matchup`. */
  leagueById?: Maybe<League>;
  leagueId: Scalars['Int']['output'];
  /** Reads and enables pagination through a set of `League`. */
  leaguesByCurrentMatchup: LeaguesConnection;
  /** Reads and enables pagination through a set of `MatchupPlayer`. */
  matchupPlayers: MatchupPlayersConnection;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  numberOfGames: Scalars['Int']['output'];
  weekNumber: Scalars['Int']['output'];
};


export type MatchupLeaguesByCurrentMatchupArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<LeagueCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LeaguesOrderBy>>;
};


export type MatchupMatchupPlayersArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<MatchupPlayerCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MatchupPlayersOrderBy>>;
};

export type MatchupBatting = {
  __typename?: 'MatchupBatting';
  ab?: Maybe<Scalars['Int']['output']>;
  bb?: Maybe<Scalars['Int']['output']>;
  cs?: Maybe<Scalars['Int']['output']>;
  doubles?: Maybe<Scalars['Int']['output']>;
  gidp?: Maybe<Scalars['Int']['output']>;
  h?: Maybe<Scalars['Int']['output']>;
  hbp?: Maybe<Scalars['Int']['output']>;
  hr?: Maybe<Scalars['Int']['output']>;
  ibb?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `MatchupPlayer` that is related to this `MatchupBatting`. */
  matchupPlayer?: Maybe<MatchupPlayer>;
  matchupPlayerId?: Maybe<Scalars['Int']['output']>;
  pa?: Maybe<Scalars['Int']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  r?: Maybe<Scalars['Int']['output']>;
  rbi?: Maybe<Scalars['Int']['output']>;
  sb?: Maybe<Scalars['Int']['output']>;
  sf?: Maybe<Scalars['Int']['output']>;
  sh?: Maybe<Scalars['Int']['output']>;
  so?: Maybe<Scalars['Int']['output']>;
  triples?: Maybe<Scalars['Int']['output']>;
};

/**
 * A condition to be used against `MatchupBatting` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type MatchupBattingCondition = {
  /** Checks for equality with the object’s `ab` field. */
  ab?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `bb` field. */
  bb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `cs` field. */
  cs?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `doubles` field. */
  doubles?: InputMaybe<Scalars['Int']['input']>;
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
  /** Checks for equality with the object’s `matchupPlayerId` field. */
  matchupPlayerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `pa` field. */
  pa?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `r` field. */
  r?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `rbi` field. */
  rbi?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sb` field. */
  sb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sf` field. */
  sf?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sh` field. */
  sh?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `so` field. */
  so?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `triples` field. */
  triples?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `MatchupBatting` values. */
export type MatchupBattingsConnection = {
  __typename?: 'MatchupBattingsConnection';
  /** A list of edges which contains the `MatchupBatting` and cursor to aid in pagination. */
  edges: Array<MatchupBattingsEdge>;
  /** A list of `MatchupBatting` objects. */
  nodes: Array<Maybe<MatchupBatting>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `MatchupBatting` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `MatchupBatting` edge in the connection. */
export type MatchupBattingsEdge = {
  __typename?: 'MatchupBattingsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `MatchupBatting` at the end of the edge. */
  node?: Maybe<MatchupBatting>;
};

/** Methods to use when ordering `MatchupBatting`. */
export enum MatchupBattingsOrderBy {
  AbAsc = 'AB_ASC',
  AbDesc = 'AB_DESC',
  BbAsc = 'BB_ASC',
  BbDesc = 'BB_DESC',
  CsAsc = 'CS_ASC',
  CsDesc = 'CS_DESC',
  DoublesAsc = 'DOUBLES_ASC',
  DoublesDesc = 'DOUBLES_DESC',
  GidpAsc = 'GIDP_ASC',
  GidpDesc = 'GIDP_DESC',
  HbpAsc = 'HBP_ASC',
  HbpDesc = 'HBP_DESC',
  HrAsc = 'HR_ASC',
  HrDesc = 'HR_DESC',
  HAsc = 'H_ASC',
  HDesc = 'H_DESC',
  IbbAsc = 'IBB_ASC',
  IbbDesc = 'IBB_DESC',
  MatchupPlayerIdAsc = 'MATCHUP_PLAYER_ID_ASC',
  MatchupPlayerIdDesc = 'MATCHUP_PLAYER_ID_DESC',
  Natural = 'NATURAL',
  PaAsc = 'PA_ASC',
  PaDesc = 'PA_DESC',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
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
  SoAsc = 'SO_ASC',
  SoDesc = 'SO_DESC',
  TriplesAsc = 'TRIPLES_ASC',
  TriplesDesc = 'TRIPLES_DESC'
}

/** A condition to be used against `Matchup` object types. All fields are tested for equality and combined with a logical ‘and.’ */
export type MatchupCondition = {
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `leagueId` field. */
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `numberOfGames` field. */
  numberOfGames?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `weekNumber` field. */
  weekNumber?: InputMaybe<Scalars['Int']['input']>;
};

export type MatchupFielding = {
  __typename?: 'MatchupFielding';
  a?: Maybe<Scalars['Int']['output']>;
  chances?: Maybe<Scalars['Int']['output']>;
  dpDef?: Maybe<Scalars['Int']['output']>;
  eDef?: Maybe<Scalars['Int']['output']>;
  innDef?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `MatchupPlayer` that is related to this `MatchupFielding`. */
  matchupPlayer?: Maybe<MatchupPlayer>;
  matchupPlayerId?: Maybe<Scalars['Int']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  po?: Maybe<Scalars['Int']['output']>;
};

/**
 * A condition to be used against `MatchupFielding` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type MatchupFieldingCondition = {
  /** Checks for equality with the object’s `a` field. */
  a?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `chances` field. */
  chances?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `dpDef` field. */
  dpDef?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `eDef` field. */
  eDef?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `innDef` field. */
  innDef?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `matchupPlayerId` field. */
  matchupPlayerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `po` field. */
  po?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `MatchupFielding` values. */
export type MatchupFieldingsConnection = {
  __typename?: 'MatchupFieldingsConnection';
  /** A list of edges which contains the `MatchupFielding` and cursor to aid in pagination. */
  edges: Array<MatchupFieldingsEdge>;
  /** A list of `MatchupFielding` objects. */
  nodes: Array<Maybe<MatchupFielding>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `MatchupFielding` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `MatchupFielding` edge in the connection. */
export type MatchupFieldingsEdge = {
  __typename?: 'MatchupFieldingsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `MatchupFielding` at the end of the edge. */
  node?: Maybe<MatchupFielding>;
};

/** Methods to use when ordering `MatchupFielding`. */
export enum MatchupFieldingsOrderBy {
  AAsc = 'A_ASC',
  ADesc = 'A_DESC',
  ChancesAsc = 'CHANCES_ASC',
  ChancesDesc = 'CHANCES_DESC',
  DpDefAsc = 'DP_DEF_ASC',
  DpDefDesc = 'DP_DEF_DESC',
  EDefAsc = 'E_DEF_ASC',
  EDefDesc = 'E_DEF_DESC',
  InnDefAsc = 'INN_DEF_ASC',
  InnDefDesc = 'INN_DEF_DESC',
  MatchupPlayerIdAsc = 'MATCHUP_PLAYER_ID_ASC',
  MatchupPlayerIdDesc = 'MATCHUP_PLAYER_ID_DESC',
  Natural = 'NATURAL',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  PoAsc = 'PO_ASC',
  PoDesc = 'PO_DESC'
}

/** An input for mutations affecting `Matchup` */
export type MatchupInput = {
  id?: InputMaybe<Scalars['Int']['input']>;
  leagueId: Scalars['Int']['input'];
  numberOfGames: Scalars['Int']['input'];
  weekNumber: Scalars['Int']['input'];
};

/** Represents an update to a `Matchup`. Fields that are set will be updated. */
export type MatchupPatch = {
  id?: InputMaybe<Scalars['Int']['input']>;
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  numberOfGames?: InputMaybe<Scalars['Int']['input']>;
  weekNumber?: InputMaybe<Scalars['Int']['input']>;
};

export type MatchupPitching = {
  __typename?: 'MatchupPitching';
  battersFaced?: Maybe<Scalars['Int']['output']>;
  bb?: Maybe<Scalars['Int']['output']>;
  cg?: Maybe<Scalars['Int']['output']>;
  er?: Maybe<Scalars['Int']['output']>;
  gf?: Maybe<Scalars['Int']['output']>;
  gs?: Maybe<Scalars['Int']['output']>;
  h?: Maybe<Scalars['Int']['output']>;
  hbp?: Maybe<Scalars['Int']['output']>;
  hr?: Maybe<Scalars['Int']['output']>;
  ibb?: Maybe<Scalars['Int']['output']>;
  ip?: Maybe<Scalars['Int']['output']>;
  l?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `MatchupPlayer` that is related to this `MatchupPitching`. */
  matchupPlayer?: Maybe<MatchupPlayer>;
  matchupPlayerId?: Maybe<Scalars['Int']['output']>;
  outsRecorded?: Maybe<Scalars['Int']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  r?: Maybe<Scalars['Int']['output']>;
  sho?: Maybe<Scalars['Int']['output']>;
  so?: Maybe<Scalars['Int']['output']>;
  sv?: Maybe<Scalars['Int']['output']>;
  w?: Maybe<Scalars['Int']['output']>;
};

/**
 * A condition to be used against `MatchupPitching` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type MatchupPitchingCondition = {
  /** Checks for equality with the object’s `battersFaced` field. */
  battersFaced?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `bb` field. */
  bb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `cg` field. */
  cg?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `er` field. */
  er?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `gf` field. */
  gf?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `gs` field. */
  gs?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `h` field. */
  h?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `hbp` field. */
  hbp?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `hr` field. */
  hr?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `ibb` field. */
  ibb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `ip` field. */
  ip?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `l` field. */
  l?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `matchupPlayerId` field. */
  matchupPlayerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `outsRecorded` field. */
  outsRecorded?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `r` field. */
  r?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sho` field. */
  sho?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `so` field. */
  so?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sv` field. */
  sv?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `w` field. */
  w?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `MatchupPitching` values. */
export type MatchupPitchingsConnection = {
  __typename?: 'MatchupPitchingsConnection';
  /** A list of edges which contains the `MatchupPitching` and cursor to aid in pagination. */
  edges: Array<MatchupPitchingsEdge>;
  /** A list of `MatchupPitching` objects. */
  nodes: Array<Maybe<MatchupPitching>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `MatchupPitching` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `MatchupPitching` edge in the connection. */
export type MatchupPitchingsEdge = {
  __typename?: 'MatchupPitchingsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `MatchupPitching` at the end of the edge. */
  node?: Maybe<MatchupPitching>;
};

/** Methods to use when ordering `MatchupPitching`. */
export enum MatchupPitchingsOrderBy {
  BattersFacedAsc = 'BATTERS_FACED_ASC',
  BattersFacedDesc = 'BATTERS_FACED_DESC',
  BbAsc = 'BB_ASC',
  BbDesc = 'BB_DESC',
  CgAsc = 'CG_ASC',
  CgDesc = 'CG_DESC',
  ErAsc = 'ER_ASC',
  ErDesc = 'ER_DESC',
  GfAsc = 'GF_ASC',
  GfDesc = 'GF_DESC',
  GsAsc = 'GS_ASC',
  GsDesc = 'GS_DESC',
  HbpAsc = 'HBP_ASC',
  HbpDesc = 'HBP_DESC',
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
  MatchupPlayerIdAsc = 'MATCHUP_PLAYER_ID_ASC',
  MatchupPlayerIdDesc = 'MATCHUP_PLAYER_ID_DESC',
  Natural = 'NATURAL',
  OutsRecordedAsc = 'OUTS_RECORDED_ASC',
  OutsRecordedDesc = 'OUTS_RECORDED_DESC',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  RAsc = 'R_ASC',
  RDesc = 'R_DESC',
  ShoAsc = 'SHO_ASC',
  ShoDesc = 'SHO_DESC',
  SoAsc = 'SO_ASC',
  SoDesc = 'SO_DESC',
  SvAsc = 'SV_ASC',
  SvDesc = 'SV_DESC',
  WAsc = 'W_ASC',
  WDesc = 'W_DESC'
}

export type MatchupPlayer = Node & {
  __typename?: 'MatchupPlayer';
  /** Reads a single `AggregateSeasonBatting` that is related to this `MatchupPlayer`. */
  aggregateSeasonBattingByPlayerIdAndSeason?: Maybe<AggregateSeasonBatting>;
  /** Reads a single `AggregateSeasonFielding` that is related to this `MatchupPlayer`. */
  aggregateSeasonFieldingByPlayerIdAndSeason?: Maybe<AggregateSeasonFielding>;
  /** Reads a single `AggregateSeasonPitching` that is related to this `MatchupPlayer`. */
  aggregateSeasonPitchingByPlayerIdAndSeason?: Maybe<AggregateSeasonPitching>;
  id: Scalars['Int']['output'];
  /** Reads a single `Matchup` that is related to this `MatchupPlayer`. */
  matchup?: Maybe<Matchup>;
  /** Reads a single `MatchupBatting` that is related to this `MatchupPlayer`. */
  matchupBatting?: Maybe<MatchupBatting>;
  /** Reads a single `MatchupFielding` that is related to this `MatchupPlayer`. */
  matchupFielding?: Maybe<MatchupFielding>;
  matchupId: Scalars['Int']['output'];
  /** Reads a single `MatchupPitching` that is related to this `MatchupPlayer`. */
  matchupPitching?: Maybe<MatchupPitching>;
  /** Reads and enables pagination through a set of `MatchupPlayerGame`. */
  matchupPlayerGames: MatchupPlayerGamesConnection;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  /** Reads a single `Player` that is related to this `MatchupPlayer`. */
  player?: Maybe<Player>;
  playerId: Scalars['Int']['output'];
  season: Scalars['Int']['output'];
};


export type MatchupPlayerMatchupPlayerGamesArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<MatchupPlayerGameCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MatchupPlayerGamesOrderBy>>;
};

/**
 * A condition to be used against `MatchupPlayer` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type MatchupPlayerCondition = {
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `matchupId` field. */
  matchupId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `season` field. */
  season?: InputMaybe<Scalars['Int']['input']>;
};

export type MatchupPlayerGame = Node & {
  __typename?: 'MatchupPlayerGame';
  battingGameNum?: Maybe<Scalars['Int']['output']>;
  fieldingGameNum?: Maybe<Scalars['Int']['output']>;
  fieldingGamePos?: Maybe<Scalars['String']['output']>;
  gameNum: Scalars['Int']['output'];
  id: Scalars['Int']['output'];
  /** Reads a single `MatchupPlayer` that is related to this `MatchupPlayerGame`. */
  matchupPlayer?: Maybe<MatchupPlayer>;
  matchupPlayerId: Scalars['Int']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  pitchingGameNum?: Maybe<Scalars['Int']['output']>;
};

/**
 * A condition to be used against `MatchupPlayerGame` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type MatchupPlayerGameCondition = {
  /** Checks for equality with the object’s `battingGameNum` field. */
  battingGameNum?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `fieldingGameNum` field. */
  fieldingGameNum?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `fieldingGamePos` field. */
  fieldingGamePos?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `gameNum` field. */
  gameNum?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `matchupPlayerId` field. */
  matchupPlayerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `pitchingGameNum` field. */
  pitchingGameNum?: InputMaybe<Scalars['Int']['input']>;
};

/** An input for mutations affecting `MatchupPlayerGame` */
export type MatchupPlayerGameInput = {
  battingGameNum?: InputMaybe<Scalars['Int']['input']>;
  fieldingGameNum?: InputMaybe<Scalars['Int']['input']>;
  fieldingGamePos?: InputMaybe<Scalars['String']['input']>;
  gameNum: Scalars['Int']['input'];
  id?: InputMaybe<Scalars['Int']['input']>;
  matchupPlayerId: Scalars['Int']['input'];
  pitchingGameNum?: InputMaybe<Scalars['Int']['input']>;
};

/** Represents an update to a `MatchupPlayerGame`. Fields that are set will be updated. */
export type MatchupPlayerGamePatch = {
  battingGameNum?: InputMaybe<Scalars['Int']['input']>;
  fieldingGameNum?: InputMaybe<Scalars['Int']['input']>;
  fieldingGamePos?: InputMaybe<Scalars['String']['input']>;
  gameNum?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  matchupPlayerId?: InputMaybe<Scalars['Int']['input']>;
  pitchingGameNum?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `MatchupPlayerGame` values. */
export type MatchupPlayerGamesConnection = {
  __typename?: 'MatchupPlayerGamesConnection';
  /** A list of edges which contains the `MatchupPlayerGame` and cursor to aid in pagination. */
  edges: Array<MatchupPlayerGamesEdge>;
  /** A list of `MatchupPlayerGame` objects. */
  nodes: Array<Maybe<MatchupPlayerGame>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `MatchupPlayerGame` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `MatchupPlayerGame` edge in the connection. */
export type MatchupPlayerGamesEdge = {
  __typename?: 'MatchupPlayerGamesEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `MatchupPlayerGame` at the end of the edge. */
  node?: Maybe<MatchupPlayerGame>;
};

/** Methods to use when ordering `MatchupPlayerGame`. */
export enum MatchupPlayerGamesOrderBy {
  BattingGameNumAsc = 'BATTING_GAME_NUM_ASC',
  BattingGameNumDesc = 'BATTING_GAME_NUM_DESC',
  FieldingGameNumAsc = 'FIELDING_GAME_NUM_ASC',
  FieldingGameNumDesc = 'FIELDING_GAME_NUM_DESC',
  FieldingGamePosAsc = 'FIELDING_GAME_POS_ASC',
  FieldingGamePosDesc = 'FIELDING_GAME_POS_DESC',
  GameNumAsc = 'GAME_NUM_ASC',
  GameNumDesc = 'GAME_NUM_DESC',
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  MatchupPlayerIdAsc = 'MATCHUP_PLAYER_ID_ASC',
  MatchupPlayerIdDesc = 'MATCHUP_PLAYER_ID_DESC',
  Natural = 'NATURAL',
  PitchingGameNumAsc = 'PITCHING_GAME_NUM_ASC',
  PitchingGameNumDesc = 'PITCHING_GAME_NUM_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC'
}

/** An input for mutations affecting `MatchupPlayer` */
export type MatchupPlayerInput = {
  id?: InputMaybe<Scalars['Int']['input']>;
  matchupId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
};

/** Represents an update to a `MatchupPlayer`. Fields that are set will be updated. */
export type MatchupPlayerPatch = {
  id?: InputMaybe<Scalars['Int']['input']>;
  matchupId?: InputMaybe<Scalars['Int']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `MatchupPlayer` values. */
export type MatchupPlayersConnection = {
  __typename?: 'MatchupPlayersConnection';
  /** A list of edges which contains the `MatchupPlayer` and cursor to aid in pagination. */
  edges: Array<MatchupPlayersEdge>;
  /** A list of `MatchupPlayer` objects. */
  nodes: Array<Maybe<MatchupPlayer>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `MatchupPlayer` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `MatchupPlayer` edge in the connection. */
export type MatchupPlayersEdge = {
  __typename?: 'MatchupPlayersEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `MatchupPlayer` at the end of the edge. */
  node?: Maybe<MatchupPlayer>;
};

/** Methods to use when ordering `MatchupPlayer`. */
export enum MatchupPlayersOrderBy {
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  MatchupIdAsc = 'MATCHUP_ID_ASC',
  MatchupIdDesc = 'MATCHUP_ID_DESC',
  Natural = 'NATURAL',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  SeasonAsc = 'SEASON_ASC',
  SeasonDesc = 'SEASON_DESC'
}

/** A connection to a list of `Matchup` values. */
export type MatchupsConnection = {
  __typename?: 'MatchupsConnection';
  /** A list of edges which contains the `Matchup` and cursor to aid in pagination. */
  edges: Array<MatchupsEdge>;
  /** A list of `Matchup` objects. */
  nodes: Array<Maybe<Matchup>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `Matchup` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `Matchup` edge in the connection. */
export type MatchupsEdge = {
  __typename?: 'MatchupsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `Matchup` at the end of the edge. */
  node?: Maybe<Matchup>;
};

/** Methods to use when ordering `Matchup`. */
export enum MatchupsOrderBy {
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  LeagueIdAsc = 'LEAGUE_ID_ASC',
  LeagueIdDesc = 'LEAGUE_ID_DESC',
  Natural = 'NATURAL',
  NumberOfGamesAsc = 'NUMBER_OF_GAMES_ASC',
  NumberOfGamesDesc = 'NUMBER_OF_GAMES_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  WeekNumberAsc = 'WEEK_NUMBER_ASC',
  WeekNumberDesc = 'WEEK_NUMBER_DESC'
}

/** The root mutation type which contains root level fields which mutate data. */
export type Mutation = {
  __typename?: 'Mutation';
  /** Creates a single `Draft`. */
  createDraft?: Maybe<CreateDraftPayload>;
  /** Creates a single `DraftTeam`. */
  createDraftTeam?: Maybe<CreateDraftTeamPayload>;
  /** Creates a single `GameBatting`. */
  createGameBatting?: Maybe<CreateGameBattingPayload>;
  /** Creates a single `GameFielding`. */
  createGameFielding?: Maybe<CreateGameFieldingPayload>;
  /** Creates a single `GamePitching`. */
  createGamePitching?: Maybe<CreateGamePitchingPayload>;
  /** Creates a single `League`. */
  createLeague?: Maybe<CreateLeaguePayload>;
  createLeagueAndTeams?: Maybe<CreateLeagueAndTeamsPayload>;
  /** Creates a single `LeagueMember`. */
  createLeagueMember?: Maybe<CreateLeagueMemberPayload>;
  /** Creates a single `LeagueMessage`. */
  createLeagueMessage?: Maybe<CreateLeagueMessagePayload>;
  /** Creates a single `LeaguePosition`. */
  createLeaguePosition?: Maybe<CreateLeaguePositionPayload>;
  /** Creates a single `Matchup`. */
  createMatchup?: Maybe<CreateMatchupPayload>;
  /** Creates a single `MatchupPlayer`. */
  createMatchupPlayer?: Maybe<CreateMatchupPlayerPayload>;
  /** Creates a single `MatchupPlayerGame`. */
  createMatchupPlayerGame?: Maybe<CreateMatchupPlayerGamePayload>;
  /** Creates a single `Player`. */
  createPlayer?: Maybe<CreatePlayerPayload>;
  /** Creates a single `SeasonBatting`. */
  createSeasonBatting?: Maybe<CreateSeasonBattingPayload>;
  /** Creates a single `SeasonFielding`. */
  createSeasonFielding?: Maybe<CreateSeasonFieldingPayload>;
  /** Creates a single `SeasonPitching`. */
  createSeasonPitching?: Maybe<CreateSeasonPitchingPayload>;
  /** Creates a single `Team`. */
  createTeam?: Maybe<CreateTeamPayload>;
  /** Creates a single `TeamMember`. */
  createTeamMember?: Maybe<CreateTeamMemberPayload>;
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
  /** Deletes a single `GameBatting` using a unique key. */
  deleteGameBatting?: Maybe<DeleteGameBattingPayload>;
  /** Deletes a single `GameBatting` using its globally unique id. */
  deleteGameBattingByNodeId?: Maybe<DeleteGameBattingPayload>;
  /** Deletes a single `GameFielding` using a unique key. */
  deleteGameFielding?: Maybe<DeleteGameFieldingPayload>;
  /** Deletes a single `GameFielding` using its globally unique id. */
  deleteGameFieldingByNodeId?: Maybe<DeleteGameFieldingPayload>;
  /** Deletes a single `GamePitching` using a unique key. */
  deleteGamePitching?: Maybe<DeleteGamePitchingPayload>;
  /** Deletes a single `GamePitching` using its globally unique id. */
  deleteGamePitchingByNodeId?: Maybe<DeleteGamePitchingPayload>;
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
  /** Deletes a single `LeaguePosition` using a unique key. */
  deleteLeaguePosition?: Maybe<DeleteLeaguePositionPayload>;
  /** Deletes a single `LeaguePosition` using its globally unique id. */
  deleteLeaguePositionByNodeId?: Maybe<DeleteLeaguePositionPayload>;
  /** Deletes a single `Matchup` using a unique key. */
  deleteMatchup?: Maybe<DeleteMatchupPayload>;
  /** Deletes a single `Matchup` using a unique key. */
  deleteMatchupByLeagueIdAndWeekNumber?: Maybe<DeleteMatchupPayload>;
  /** Deletes a single `Matchup` using its globally unique id. */
  deleteMatchupByNodeId?: Maybe<DeleteMatchupPayload>;
  /** Deletes a single `MatchupPlayer` using a unique key. */
  deleteMatchupPlayer?: Maybe<DeleteMatchupPlayerPayload>;
  /** Deletes a single `MatchupPlayer` using a unique key. */
  deleteMatchupPlayerByMatchupIdAndPlayerId?: Maybe<DeleteMatchupPlayerPayload>;
  /** Deletes a single `MatchupPlayer` using its globally unique id. */
  deleteMatchupPlayerByNodeId?: Maybe<DeleteMatchupPlayerPayload>;
  /** Deletes a single `MatchupPlayerGame` using a unique key. */
  deleteMatchupPlayerGame?: Maybe<DeleteMatchupPlayerGamePayload>;
  /** Deletes a single `MatchupPlayerGame` using its globally unique id. */
  deleteMatchupPlayerGameByNodeId?: Maybe<DeleteMatchupPlayerGamePayload>;
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
  /** Deletes a single `TeamMember` using a unique key. */
  deleteTeamMember?: Maybe<DeleteTeamMemberPayload>;
  /** Deletes a single `TeamMember` using its globally unique id. */
  deleteTeamMemberByNodeId?: Maybe<DeleteTeamMemberPayload>;
  /** Deletes a single `User` using a unique key. */
  deleteUser?: Maybe<DeleteUserPayload>;
  /** Deletes a single `User` using a unique key. */
  deleteUserByEmail?: Maybe<DeleteUserPayload>;
  /** Deletes a single `User` using its globally unique id. */
  deleteUserByNodeId?: Maybe<DeleteUserPayload>;
  isMajorLeague?: Maybe<IsMajorLeaguePayload>;
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
  /** Updates a single `GameBatting` using a unique key and a patch. */
  updateGameBatting?: Maybe<UpdateGameBattingPayload>;
  /** Updates a single `GameBatting` using its globally unique id and a patch. */
  updateGameBattingByNodeId?: Maybe<UpdateGameBattingPayload>;
  /** Updates a single `GameFielding` using a unique key and a patch. */
  updateGameFielding?: Maybe<UpdateGameFieldingPayload>;
  /** Updates a single `GameFielding` using its globally unique id and a patch. */
  updateGameFieldingByNodeId?: Maybe<UpdateGameFieldingPayload>;
  /** Updates a single `GamePitching` using a unique key and a patch. */
  updateGamePitching?: Maybe<UpdateGamePitchingPayload>;
  /** Updates a single `GamePitching` using its globally unique id and a patch. */
  updateGamePitchingByNodeId?: Maybe<UpdateGamePitchingPayload>;
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
  /** Updates a single `LeaguePosition` using a unique key and a patch. */
  updateLeaguePosition?: Maybe<UpdateLeaguePositionPayload>;
  /** Updates a single `LeaguePosition` using its globally unique id and a patch. */
  updateLeaguePositionByNodeId?: Maybe<UpdateLeaguePositionPayload>;
  /** Updates a single `Matchup` using a unique key and a patch. */
  updateMatchup?: Maybe<UpdateMatchupPayload>;
  /** Updates a single `Matchup` using a unique key and a patch. */
  updateMatchupByLeagueIdAndWeekNumber?: Maybe<UpdateMatchupPayload>;
  /** Updates a single `Matchup` using its globally unique id and a patch. */
  updateMatchupByNodeId?: Maybe<UpdateMatchupPayload>;
  /** Updates a single `MatchupPlayer` using a unique key and a patch. */
  updateMatchupPlayer?: Maybe<UpdateMatchupPlayerPayload>;
  /** Updates a single `MatchupPlayer` using a unique key and a patch. */
  updateMatchupPlayerByMatchupIdAndPlayerId?: Maybe<UpdateMatchupPlayerPayload>;
  /** Updates a single `MatchupPlayer` using its globally unique id and a patch. */
  updateMatchupPlayerByNodeId?: Maybe<UpdateMatchupPlayerPayload>;
  /** Updates a single `MatchupPlayerGame` using a unique key and a patch. */
  updateMatchupPlayerGame?: Maybe<UpdateMatchupPlayerGamePayload>;
  /** Updates a single `MatchupPlayerGame` using its globally unique id and a patch. */
  updateMatchupPlayerGameByNodeId?: Maybe<UpdateMatchupPlayerGamePayload>;
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
  /** Updates a single `TeamMember` using a unique key and a patch. */
  updateTeamMember?: Maybe<UpdateTeamMemberPayload>;
  /** Updates a single `TeamMember` using its globally unique id and a patch. */
  updateTeamMemberByNodeId?: Maybe<UpdateTeamMemberPayload>;
  /** Updates a single `User` using a unique key and a patch. */
  updateUser?: Maybe<UpdateUserPayload>;
  /** Updates a single `User` using a unique key and a patch. */
  updateUserByEmail?: Maybe<UpdateUserPayload>;
  /** Updates a single `User` using its globally unique id and a patch. */
  updateUserByNodeId?: Maybe<UpdateUserPayload>;
  /** Upserts a single `Draft`. */
  upsertDraft?: Maybe<UpsertDraftPayload>;
  /** Upserts a single `DraftTeam`. */
  upsertDraftTeam?: Maybe<UpsertDraftTeamPayload>;
  /** Upserts a single `GameBatting`. */
  upsertGameBatting?: Maybe<UpsertGameBattingPayload>;
  /** Upserts a single `GameFielding`. */
  upsertGameFielding?: Maybe<UpsertGameFieldingPayload>;
  /** Upserts a single `GamePitching`. */
  upsertGamePitching?: Maybe<UpsertGamePitchingPayload>;
  /** Upserts a single `League`. */
  upsertLeague?: Maybe<UpsertLeaguePayload>;
  /** Upserts a single `LeagueMember`. */
  upsertLeagueMember?: Maybe<UpsertLeagueMemberPayload>;
  /** Upserts a single `LeagueMessage`. */
  upsertLeagueMessage?: Maybe<UpsertLeagueMessagePayload>;
  /** Upserts a single `LeaguePosition`. */
  upsertLeaguePosition?: Maybe<UpsertLeaguePositionPayload>;
  /** Upserts a single `Matchup`. */
  upsertMatchup?: Maybe<UpsertMatchupPayload>;
  /** Upserts a single `MatchupPlayer`. */
  upsertMatchupPlayer?: Maybe<UpsertMatchupPlayerPayload>;
  /** Upserts a single `MatchupPlayerGame`. */
  upsertMatchupPlayerGame?: Maybe<UpsertMatchupPlayerGamePayload>;
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
  /** Upserts a single `TeamMember`. */
  upsertTeamMember?: Maybe<UpsertTeamMemberPayload>;
  /** Upserts a single `User`. */
  upsertUser?: Maybe<UpsertUserPayload>;
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
export type MutationCreateGameBattingArgs = {
  input: CreateGameBattingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateGameFieldingArgs = {
  input: CreateGameFieldingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateGamePitchingArgs = {
  input: CreateGamePitchingInput;
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
export type MutationCreateLeaguePositionArgs = {
  input: CreateLeaguePositionInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateMatchupArgs = {
  input: CreateMatchupInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateMatchupPlayerArgs = {
  input: CreateMatchupPlayerInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreateMatchupPlayerGameArgs = {
  input: CreateMatchupPlayerGameInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationCreatePlayerArgs = {
  input: CreatePlayerInput;
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
export type MutationCreateTeamMemberArgs = {
  input: CreateTeamMemberInput;
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
export type MutationDeleteGameBattingArgs = {
  input: DeleteGameBattingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteGameBattingByNodeIdArgs = {
  input: DeleteGameBattingByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteGameFieldingArgs = {
  input: DeleteGameFieldingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteGameFieldingByNodeIdArgs = {
  input: DeleteGameFieldingByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteGamePitchingArgs = {
  input: DeleteGamePitchingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteGamePitchingByNodeIdArgs = {
  input: DeleteGamePitchingByNodeIdInput;
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
export type MutationDeleteLeaguePositionArgs = {
  input: DeleteLeaguePositionInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteLeaguePositionByNodeIdArgs = {
  input: DeleteLeaguePositionByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteMatchupArgs = {
  input: DeleteMatchupInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteMatchupByLeagueIdAndWeekNumberArgs = {
  input: DeleteMatchupByLeagueIdAndWeekNumberInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteMatchupByNodeIdArgs = {
  input: DeleteMatchupByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteMatchupPlayerArgs = {
  input: DeleteMatchupPlayerInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteMatchupPlayerByMatchupIdAndPlayerIdArgs = {
  input: DeleteMatchupPlayerByMatchupIdAndPlayerIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteMatchupPlayerByNodeIdArgs = {
  input: DeleteMatchupPlayerByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteMatchupPlayerGameArgs = {
  input: DeleteMatchupPlayerGameInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteMatchupPlayerGameByNodeIdArgs = {
  input: DeleteMatchupPlayerGameByNodeIdInput;
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
export type MutationDeleteTeamMemberArgs = {
  input: DeleteTeamMemberInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationDeleteTeamMemberByNodeIdArgs = {
  input: DeleteTeamMemberByNodeIdInput;
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
export type MutationIsMajorLeagueArgs = {
  input: IsMajorLeagueInput;
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
export type MutationUpdateGameBattingArgs = {
  input: UpdateGameBattingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateGameBattingByNodeIdArgs = {
  input: UpdateGameBattingByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateGameFieldingArgs = {
  input: UpdateGameFieldingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateGameFieldingByNodeIdArgs = {
  input: UpdateGameFieldingByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateGamePitchingArgs = {
  input: UpdateGamePitchingInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateGamePitchingByNodeIdArgs = {
  input: UpdateGamePitchingByNodeIdInput;
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
export type MutationUpdateLeaguePositionArgs = {
  input: UpdateLeaguePositionInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateLeaguePositionByNodeIdArgs = {
  input: UpdateLeaguePositionByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateMatchupArgs = {
  input: UpdateMatchupInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateMatchupByLeagueIdAndWeekNumberArgs = {
  input: UpdateMatchupByLeagueIdAndWeekNumberInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateMatchupByNodeIdArgs = {
  input: UpdateMatchupByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateMatchupPlayerArgs = {
  input: UpdateMatchupPlayerInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateMatchupPlayerByMatchupIdAndPlayerIdArgs = {
  input: UpdateMatchupPlayerByMatchupIdAndPlayerIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateMatchupPlayerByNodeIdArgs = {
  input: UpdateMatchupPlayerByNodeIdInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateMatchupPlayerGameArgs = {
  input: UpdateMatchupPlayerGameInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateMatchupPlayerGameByNodeIdArgs = {
  input: UpdateMatchupPlayerGameByNodeIdInput;
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
export type MutationUpdateTeamMemberArgs = {
  input: UpdateTeamMemberInput;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpdateTeamMemberByNodeIdArgs = {
  input: UpdateTeamMemberByNodeIdInput;
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
export type MutationUpsertGameBattingArgs = {
  input: UpsertGameBattingInput;
  where?: InputMaybe<UpsertGameBattingWhere>;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpsertGameFieldingArgs = {
  input: UpsertGameFieldingInput;
  where?: InputMaybe<UpsertGameFieldingWhere>;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpsertGamePitchingArgs = {
  input: UpsertGamePitchingInput;
  where?: InputMaybe<UpsertGamePitchingWhere>;
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
export type MutationUpsertLeaguePositionArgs = {
  input: UpsertLeaguePositionInput;
  where?: InputMaybe<UpsertLeaguePositionWhere>;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpsertMatchupArgs = {
  input: UpsertMatchupInput;
  where?: InputMaybe<UpsertMatchupWhere>;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpsertMatchupPlayerArgs = {
  input: UpsertMatchupPlayerInput;
  where?: InputMaybe<UpsertMatchupPlayerWhere>;
};


/** The root mutation type which contains root level fields which mutate data. */
export type MutationUpsertMatchupPlayerGameArgs = {
  input: UpsertMatchupPlayerGameInput;
  where?: InputMaybe<UpsertMatchupPlayerGameWhere>;
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
export type MutationUpsertTeamMemberArgs = {
  input: UpsertTeamMemberInput;
  where?: InputMaybe<UpsertTeamMemberWhere>;
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

export type Player = Node & {
  __typename?: 'Player';
  /** Reads and enables pagination through a set of `AggregateSeasonBatting`. */
  aggregateSeasonBattings: AggregateSeasonBattingsConnection;
  /** Reads and enables pagination through a set of `AggregateSeasonFieldingByPo`. */
  aggregateSeasonFieldingByPos: AggregateSeasonFieldingByPosConnection;
  /** Reads and enables pagination through a set of `AggregateSeasonFielding`. */
  aggregateSeasonFieldings: AggregateSeasonFieldingsConnection;
  /** Reads and enables pagination through a set of `AggregateSeasonPitching`. */
  aggregateSeasonPitchings: AggregateSeasonPitchingsConnection;
  brefId: Scalars['String']['output'];
  /** Reads and enables pagination through a set of `CareerBatting`. */
  careerBattings: CareerBattingsConnection;
  /** Reads and enables pagination through a set of `CareerFieldingByPosition`. */
  careerFieldingByPositions: CareerFieldingByPositionsConnection;
  /** Reads and enables pagination through a set of `CareerFielding`. */
  careerFieldings: CareerFieldingsConnection;
  /** Reads and enables pagination through a set of `CareerPitching`. */
  careerPitchings: CareerPitchingsConnection;
  /** Reads and enables pagination through a set of `GameBatting`. */
  gameBattings: GameBattingsConnection;
  /** Reads and enables pagination through a set of `GameFielding`. */
  gameFieldings: GameFieldingsConnection;
  /** Reads and enables pagination through a set of `GamePitching`. */
  gamePitchings: GamePitchingsConnection;
  id: Scalars['Int']['output'];
  /** Reads and enables pagination through a set of `MatchupPlayer`. */
  matchupPlayers: MatchupPlayersConnection;
  name: Scalars['String']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  /** Reads and enables pagination through a set of `PlayerEligiblePosition`. */
  playerEligiblePositions: PlayerEligiblePositionsConnection;
  /** Reads and enables pagination through a set of `SeasonBatting`. */
  seasonBattings: SeasonBattingsConnection;
  /** Reads and enables pagination through a set of `SeasonFielding`. */
  seasonFieldings: SeasonFieldingsConnection;
  /** Reads and enables pagination through a set of `SeasonPitching`. */
  seasonPitchings: SeasonPitchingsConnection;
  /** Reads and enables pagination through a set of `TeamMember`. */
  teamMembers: TeamMembersConnection;
};


export type PlayerAggregateSeasonBattingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<AggregateSeasonBattingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<AggregateSeasonBattingsOrderBy>>;
};


export type PlayerAggregateSeasonFieldingByPosArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<AggregateSeasonFieldingByPoCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<AggregateSeasonFieldingByPosOrderBy>>;
};


export type PlayerAggregateSeasonFieldingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<AggregateSeasonFieldingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<AggregateSeasonFieldingsOrderBy>>;
};


export type PlayerAggregateSeasonPitchingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<AggregateSeasonPitchingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<AggregateSeasonPitchingsOrderBy>>;
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


export type PlayerCareerFieldingByPositionsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<CareerFieldingByPositionCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<CareerFieldingByPositionsOrderBy>>;
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


export type PlayerGameBattingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<GameBattingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<GameBattingsOrderBy>>;
};


export type PlayerGameFieldingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<GameFieldingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<GameFieldingsOrderBy>>;
};


export type PlayerGamePitchingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<GamePitchingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<GamePitchingsOrderBy>>;
};


export type PlayerMatchupPlayersArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<MatchupPlayerCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MatchupPlayersOrderBy>>;
};


export type PlayerPlayerEligiblePositionsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<PlayerEligiblePositionCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PlayerEligiblePositionsOrderBy>>;
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


export type PlayerSeasonPitchingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<SeasonPitchingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SeasonPitchingsOrderBy>>;
};


export type PlayerTeamMembersArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<TeamMemberCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TeamMembersOrderBy>>;
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

export type PlayerEligiblePosition = {
  __typename?: 'PlayerEligiblePosition';
  /** Reads a single `Player` that is related to this `PlayerEligiblePosition`. */
  player?: Maybe<Player>;
  playerId?: Maybe<Scalars['Int']['output']>;
  position?: Maybe<Scalars['String']['output']>;
};

/**
 * A condition to be used against `PlayerEligiblePosition` object types. All fields
 * are tested for equality and combined with a logical ‘and.’
 */
export type PlayerEligiblePositionCondition = {
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `position` field. */
  position?: InputMaybe<Scalars['String']['input']>;
};

/** A connection to a list of `PlayerEligiblePosition` values. */
export type PlayerEligiblePositionsConnection = {
  __typename?: 'PlayerEligiblePositionsConnection';
  /** A list of edges which contains the `PlayerEligiblePosition` and cursor to aid in pagination. */
  edges: Array<PlayerEligiblePositionsEdge>;
  /** A list of `PlayerEligiblePosition` objects. */
  nodes: Array<Maybe<PlayerEligiblePosition>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `PlayerEligiblePosition` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `PlayerEligiblePosition` edge in the connection. */
export type PlayerEligiblePositionsEdge = {
  __typename?: 'PlayerEligiblePositionsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `PlayerEligiblePosition` at the end of the edge. */
  node?: Maybe<PlayerEligiblePosition>;
};

/** Methods to use when ordering `PlayerEligiblePosition`. */
export enum PlayerEligiblePositionsOrderBy {
  Natural = 'NATURAL',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  PositionAsc = 'POSITION_ASC',
  PositionDesc = 'POSITION_DESC'
}

/** An input for mutations affecting `Player` */
export type PlayerInput = {
  brefId: Scalars['String']['input'];
  id?: InputMaybe<Scalars['Int']['input']>;
  name: Scalars['String']['input'];
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

export enum PositionSlot {
  C = 'C',
  Cf = 'CF',
  Dh = 'DH',
  If = 'IF',
  Lf = 'LF',
  Of = 'OF',
  Rf = 'RF',
  Rp = 'RP',
  Sp = 'SP',
  Ss = 'SS',
  Xdh = 'XDH',
  '1B' = '_1_B',
  '2B' = '_2_B',
  '3B' = '_3_B'
}

/** The root query type which gives access points into the data universe. */
export type Query = Node & {
  __typename?: 'Query';
  /** Reads and enables pagination through a set of `AggregateSeasonBatting`. */
  aggregateSeasonBattings?: Maybe<AggregateSeasonBattingsConnection>;
  /** Reads and enables pagination through a set of `AggregateSeasonFieldingByPo`. */
  aggregateSeasonFieldingByPos?: Maybe<AggregateSeasonFieldingByPosConnection>;
  /** Reads and enables pagination through a set of `AggregateSeasonFielding`. */
  aggregateSeasonFieldings?: Maybe<AggregateSeasonFieldingsConnection>;
  /** Reads and enables pagination through a set of `AggregateSeasonPitching`. */
  aggregateSeasonPitchings?: Maybe<AggregateSeasonPitchingsConnection>;
  /** Reads and enables pagination through a set of `CareerBatting`. */
  careerBattings?: Maybe<CareerBattingsConnection>;
  /** Reads and enables pagination through a set of `CareerFieldingByPosition`. */
  careerFieldingByPositions?: Maybe<CareerFieldingByPositionsConnection>;
  /** Reads and enables pagination through a set of `CareerFielding`. */
  careerFieldings?: Maybe<CareerFieldingsConnection>;
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
  gameBatting?: Maybe<GameBatting>;
  /** Reads a single `GameBatting` using its globally unique `ID`. */
  gameBattingByNodeId?: Maybe<GameBatting>;
  /** Reads and enables pagination through a set of `GameBatting`. */
  gameBattings?: Maybe<GameBattingsConnection>;
  gameFielding?: Maybe<GameFielding>;
  /** Reads a single `GameFielding` using its globally unique `ID`. */
  gameFieldingByNodeId?: Maybe<GameFielding>;
  /** Reads and enables pagination through a set of `GameFielding`. */
  gameFieldings?: Maybe<GameFieldingsConnection>;
  gamePitching?: Maybe<GamePitching>;
  /** Reads a single `GamePitching` using its globally unique `ID`. */
  gamePitchingByNodeId?: Maybe<GamePitching>;
  /** Reads and enables pagination through a set of `GamePitching`. */
  gamePitchings?: Maybe<GamePitchingsConnection>;
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
  leaguePosition?: Maybe<LeaguePosition>;
  /** Reads a single `LeaguePosition` using its globally unique `ID`. */
  leaguePositionByNodeId?: Maybe<LeaguePosition>;
  /** Reads and enables pagination through a set of `LeaguePosition`. */
  leaguePositions?: Maybe<LeaguePositionsConnection>;
  /** Reads and enables pagination through a set of `League`. */
  leagues?: Maybe<LeaguesConnection>;
  matchup?: Maybe<Matchup>;
  matchupBattingByMatchupPlayerId?: Maybe<MatchupBatting>;
  /** Reads and enables pagination through a set of `MatchupBatting`. */
  matchupBattings?: Maybe<MatchupBattingsConnection>;
  matchupByLeagueIdAndWeekNumber?: Maybe<Matchup>;
  /** Reads a single `Matchup` using its globally unique `ID`. */
  matchupByNodeId?: Maybe<Matchup>;
  matchupFieldingByMatchupPlayerId?: Maybe<MatchupFielding>;
  /** Reads and enables pagination through a set of `MatchupFielding`. */
  matchupFieldings?: Maybe<MatchupFieldingsConnection>;
  matchupPitchingByMatchupPlayerId?: Maybe<MatchupPitching>;
  /** Reads and enables pagination through a set of `MatchupPitching`. */
  matchupPitchings?: Maybe<MatchupPitchingsConnection>;
  matchupPlayer?: Maybe<MatchupPlayer>;
  matchupPlayerByMatchupIdAndPlayerId?: Maybe<MatchupPlayer>;
  /** Reads a single `MatchupPlayer` using its globally unique `ID`. */
  matchupPlayerByNodeId?: Maybe<MatchupPlayer>;
  matchupPlayerGame?: Maybe<MatchupPlayerGame>;
  /** Reads a single `MatchupPlayerGame` using its globally unique `ID`. */
  matchupPlayerGameByNodeId?: Maybe<MatchupPlayerGame>;
  /** Reads and enables pagination through a set of `MatchupPlayerGame`. */
  matchupPlayerGames?: Maybe<MatchupPlayerGamesConnection>;
  /** Reads and enables pagination through a set of `MatchupPlayer`. */
  matchupPlayers?: Maybe<MatchupPlayersConnection>;
  /** Reads and enables pagination through a set of `Matchup`. */
  matchups?: Maybe<MatchupsConnection>;
  /** Fetches an object given its globally unique `ID`. */
  node?: Maybe<Node>;
  /** The root query type must be a `Node` to work well with Relay 1 mutations. This just resolves to `query`. */
  nodeId: Scalars['ID']['output'];
  player?: Maybe<Player>;
  playerByBrefId?: Maybe<Player>;
  /** Reads a single `Player` using its globally unique `ID`. */
  playerByNodeId?: Maybe<Player>;
  /** Reads and enables pagination through a set of `PlayerEligiblePosition`. */
  playerEligiblePositions?: Maybe<PlayerEligiblePositionsConnection>;
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
  teamMember?: Maybe<TeamMember>;
  /** Reads a single `TeamMember` using its globally unique `ID`. */
  teamMemberByNodeId?: Maybe<TeamMember>;
  /** Reads and enables pagination through a set of `TeamMember`. */
  teamMembers?: Maybe<TeamMembersConnection>;
  /** Reads and enables pagination through a set of `Team`. */
  teams?: Maybe<TeamsConnection>;
  user?: Maybe<User>;
  userByEmail?: Maybe<User>;
  /** Reads a single `User` using its globally unique `ID`. */
  userByNodeId?: Maybe<User>;
  /** Reads and enables pagination through a set of `User`. */
  users?: Maybe<UsersConnection>;
};


/** The root query type which gives access points into the data universe. */
export type QueryAggregateSeasonBattingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<AggregateSeasonBattingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<AggregateSeasonBattingsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryAggregateSeasonFieldingByPosArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<AggregateSeasonFieldingByPoCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<AggregateSeasonFieldingByPosOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryAggregateSeasonFieldingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<AggregateSeasonFieldingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<AggregateSeasonFieldingsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryAggregateSeasonPitchingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<AggregateSeasonPitchingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<AggregateSeasonPitchingsOrderBy>>;
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
export type QueryCareerFieldingByPositionsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<CareerFieldingByPositionCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<CareerFieldingByPositionsOrderBy>>;
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
export type QueryGameBattingArgs = {
  gameNumber: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryGameBattingByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryGameBattingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<GameBattingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<GameBattingsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryGameFieldingArgs = {
  gameNum: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryGameFieldingByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryGameFieldingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<GameFieldingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<GameFieldingsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryGamePitchingArgs = {
  gameNum: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryGamePitchingByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryGamePitchingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<GamePitchingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<GamePitchingsOrderBy>>;
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
export type QueryLeaguePositionArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryLeaguePositionByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryLeaguePositionsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<LeaguePositionCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LeaguePositionsOrderBy>>;
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
export type QueryMatchupArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryMatchupBattingByMatchupPlayerIdArgs = {
  matchupPlayerId: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryMatchupBattingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<MatchupBattingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MatchupBattingsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryMatchupByLeagueIdAndWeekNumberArgs = {
  leagueId: Scalars['Int']['input'];
  weekNumber: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryMatchupByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryMatchupFieldingByMatchupPlayerIdArgs = {
  matchupPlayerId: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryMatchupFieldingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<MatchupFieldingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MatchupFieldingsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryMatchupPitchingByMatchupPlayerIdArgs = {
  matchupPlayerId: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryMatchupPitchingsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<MatchupPitchingCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MatchupPitchingsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryMatchupPlayerArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryMatchupPlayerByMatchupIdAndPlayerIdArgs = {
  matchupId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryMatchupPlayerByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryMatchupPlayerGameArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryMatchupPlayerGameByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryMatchupPlayerGamesArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<MatchupPlayerGameCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MatchupPlayerGamesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryMatchupPlayersArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<MatchupPlayerCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MatchupPlayersOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryMatchupsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<MatchupCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MatchupsOrderBy>>;
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
export type QueryPlayerEligiblePositionsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<PlayerEligiblePositionCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PlayerEligiblePositionsOrderBy>>;
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
  playerId: Scalars['Int']['input'];
  rowId: Scalars['String']['input'];
  season: Scalars['Int']['input'];
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
  playerId: Scalars['Int']['input'];
  pos: Scalars['String']['input'];
  rowId: Scalars['String']['input'];
  season: Scalars['Int']['input'];
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
  playerId: Scalars['Int']['input'];
  rowId: Scalars['String']['input'];
  season: Scalars['Int']['input'];
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
export type QueryTeamMemberArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryTeamMemberByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryTeamMembersArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<TeamMemberCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TeamMembersOrderBy>>;
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
  lgId?: Maybe<Scalars['String']['output']>;
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
  rowId: Scalars['String']['output'];
  sb?: Maybe<Scalars['Int']['output']>;
  season: Scalars['Int']['output'];
  sf?: Maybe<Scalars['Int']['output']>;
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
  /** Checks for equality with the object’s `rowId` field. */
  rowId?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `sb` field. */
  sb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `season` field. */
  season?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sf` field. */
  sf?: InputMaybe<Scalars['Int']['input']>;
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
  lgId?: InputMaybe<Scalars['String']['input']>;
  onbasePerc?: InputMaybe<Scalars['Float']['input']>;
  onbasePlusSlugging?: InputMaybe<Scalars['Float']['input']>;
  onbasePlusSluggingPlus?: InputMaybe<Scalars['Float']['input']>;
  pa?: InputMaybe<Scalars['Int']['input']>;
  playerId: Scalars['Int']['input'];
  posSeason?: InputMaybe<Scalars['String']['input']>;
  r?: InputMaybe<Scalars['Int']['input']>;
  rbi?: InputMaybe<Scalars['Int']['input']>;
  rowId: Scalars['String']['input'];
  sb?: InputMaybe<Scalars['Int']['input']>;
  season: Scalars['Int']['input'];
  sf?: InputMaybe<Scalars['Int']['input']>;
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
  rowId?: InputMaybe<Scalars['String']['input']>;
  sb?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['Int']['input']>;
  sf?: InputMaybe<Scalars['Int']['input']>;
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
  RowIdAsc = 'ROW_ID_ASC',
  RowIdDesc = 'ROW_ID_DESC',
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
  lgId?: Maybe<Scalars['String']['output']>;
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
  rowId: Scalars['String']['output'];
  sb?: Maybe<Scalars['Int']['output']>;
  season: Scalars['Int']['output'];
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
  /** Checks for equality with the object’s `rowId` field. */
  rowId?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `sb` field. */
  sb?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `season` field. */
  season?: InputMaybe<Scalars['Int']['input']>;
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
  lgId?: InputMaybe<Scalars['String']['input']>;
  pickoffs?: InputMaybe<Scalars['Int']['input']>;
  playerId: Scalars['Int']['input'];
  po?: InputMaybe<Scalars['Int']['input']>;
  pos: Scalars['String']['input'];
  rangeFactorPerGame?: InputMaybe<Scalars['Float']['input']>;
  rangeFactorPerGameLg?: InputMaybe<Scalars['Float']['input']>;
  rangeFactorPerNine?: InputMaybe<Scalars['Float']['input']>;
  rangeFactorPerNineLg?: InputMaybe<Scalars['Float']['input']>;
  rowId: Scalars['String']['input'];
  sb?: InputMaybe<Scalars['Int']['input']>;
  season: Scalars['Int']['input'];
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
  rowId?: InputMaybe<Scalars['String']['input']>;
  sb?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['Int']['input']>;
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
  RowIdAsc = 'ROW_ID_ASC',
  RowIdDesc = 'ROW_ID_DESC',
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
  lgId?: Maybe<Scalars['String']['output']>;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  outsRecorded?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `Player` that is related to this `SeasonPitching`. */
  player?: Maybe<Player>;
  playerId: Scalars['Int']['output'];
  r?: Maybe<Scalars['Int']['output']>;
  rowId: Scalars['String']['output'];
  season: Scalars['Int']['output'];
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
  /** Checks for equality with the object’s `outsRecorded` field. */
  outsRecorded?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `r` field. */
  r?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `rowId` field. */
  rowId?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `season` field. */
  season?: InputMaybe<Scalars['Int']['input']>;
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
  lgId?: InputMaybe<Scalars['String']['input']>;
  outsRecorded?: InputMaybe<Scalars['Int']['input']>;
  playerId: Scalars['Int']['input'];
  r?: InputMaybe<Scalars['Int']['input']>;
  rowId: Scalars['String']['input'];
  season: Scalars['Int']['input'];
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
  outsRecorded?: InputMaybe<Scalars['Int']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  r?: InputMaybe<Scalars['Int']['input']>;
  rowId?: InputMaybe<Scalars['String']['input']>;
  season?: InputMaybe<Scalars['Int']['input']>;
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
  OutsRecordedAsc = 'OUTS_RECORDED_ASC',
  OutsRecordedDesc = 'OUTS_RECORDED_DESC',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  RowIdAsc = 'ROW_ID_ASC',
  RowIdDesc = 'ROW_ID_DESC',
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
  /** Reads and enables pagination through a set of `TeamMember`. */
  teamMembers: TeamMembersConnection;
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


export type TeamTeamMembersArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<TeamMemberCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TeamMembersOrderBy>>;
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

export type TeamMember = Node & {
  __typename?: 'TeamMember';
  id: Scalars['Int']['output'];
  /** Reads a single `League` that is related to this `TeamMember`. */
  league?: Maybe<League>;
  leagueId: Scalars['Int']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  /** Reads a single `Player` that is related to this `TeamMember`. */
  player?: Maybe<Player>;
  playerId: Scalars['Int']['output'];
  /** Reads a single `LeaguePosition` that is related to this `TeamMember`. */
  position?: Maybe<LeaguePosition>;
  positionId?: Maybe<Scalars['Int']['output']>;
  /** Reads a single `Team` that is related to this `TeamMember`. */
  team?: Maybe<Team>;
  teamId?: Maybe<Scalars['Int']['output']>;
};

/**
 * A condition to be used against `TeamMember` object types. All fields are tested
 * for equality and combined with a logical ‘and.’
 */
export type TeamMemberCondition = {
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `leagueId` field. */
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `playerId` field. */
  playerId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `positionId` field. */
  positionId?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `teamId` field. */
  teamId?: InputMaybe<Scalars['Int']['input']>;
};

/** An input for mutations affecting `TeamMember` */
export type TeamMemberInput = {
  id?: InputMaybe<Scalars['Int']['input']>;
  leagueId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
  positionId?: InputMaybe<Scalars['Int']['input']>;
  teamId?: InputMaybe<Scalars['Int']['input']>;
};

/** Represents an update to a `TeamMember`. Fields that are set will be updated. */
export type TeamMemberPatch = {
  id?: InputMaybe<Scalars['Int']['input']>;
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  positionId?: InputMaybe<Scalars['Int']['input']>;
  teamId?: InputMaybe<Scalars['Int']['input']>;
};

/** A connection to a list of `TeamMember` values. */
export type TeamMembersConnection = {
  __typename?: 'TeamMembersConnection';
  /** A list of edges which contains the `TeamMember` and cursor to aid in pagination. */
  edges: Array<TeamMembersEdge>;
  /** A list of `TeamMember` objects. */
  nodes: Array<Maybe<TeamMember>>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `TeamMember` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `TeamMember` edge in the connection. */
export type TeamMembersEdge = {
  __typename?: 'TeamMembersEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `TeamMember` at the end of the edge. */
  node?: Maybe<TeamMember>;
};

/** Methods to use when ordering `TeamMember`. */
export enum TeamMembersOrderBy {
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  LeagueIdAsc = 'LEAGUE_ID_ASC',
  LeagueIdDesc = 'LEAGUE_ID_DESC',
  Natural = 'NATURAL',
  PlayerIdAsc = 'PLAYER_ID_ASC',
  PlayerIdDesc = 'PLAYER_ID_DESC',
  PositionIdAsc = 'POSITION_ID_ASC',
  PositionIdDesc = 'POSITION_ID_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  TeamIdAsc = 'TEAM_ID_ASC',
  TeamIdDesc = 'TEAM_ID_DESC'
}

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
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `Team` that is related to this `DraftTeam`. */
  teamLeague?: Maybe<Team>;
};


/** The output of our update `DraftTeam` mutation. */
export type UpdateDraftTeamPayloadDraftTeamEdgeArgs = {
  orderBy?: InputMaybe<Array<DraftTeamsOrderBy>>;
};

/** All input for the `updateGameBattingByNodeId` mutation. */
export type UpdateGameBattingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `GameBatting` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `GameBatting` being updated. */
  patch: GameBattingPatch;
};

/** All input for the `updateGameBatting` mutation. */
export type UpdateGameBattingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  gameNumber: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `GameBatting` being updated. */
  patch: GameBattingPatch;
  playerId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
};

/** The output of our update `GameBatting` mutation. */
export type UpdateGameBattingPayload = {
  __typename?: 'UpdateGameBattingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `GameBatting` that was updated by this mutation. */
  gameBatting?: Maybe<GameBatting>;
  /** An edge for our `GameBatting`. May be used by Relay 1. */
  gameBattingEdge?: Maybe<GameBattingsEdge>;
  /** Reads a single `Player` that is related to this `GameBatting`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our update `GameBatting` mutation. */
export type UpdateGameBattingPayloadGameBattingEdgeArgs = {
  orderBy?: InputMaybe<Array<GameBattingsOrderBy>>;
};

/** All input for the `updateGameFieldingByNodeId` mutation. */
export type UpdateGameFieldingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `GameFielding` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `GameFielding` being updated. */
  patch: GameFieldingPatch;
};

/** All input for the `updateGameFielding` mutation. */
export type UpdateGameFieldingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  gameNum: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `GameFielding` being updated. */
  patch: GameFieldingPatch;
  playerId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
};

/** The output of our update `GameFielding` mutation. */
export type UpdateGameFieldingPayload = {
  __typename?: 'UpdateGameFieldingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `GameFielding` that was updated by this mutation. */
  gameFielding?: Maybe<GameFielding>;
  /** An edge for our `GameFielding`. May be used by Relay 1. */
  gameFieldingEdge?: Maybe<GameFieldingsEdge>;
  /** Reads a single `Player` that is related to this `GameFielding`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our update `GameFielding` mutation. */
export type UpdateGameFieldingPayloadGameFieldingEdgeArgs = {
  orderBy?: InputMaybe<Array<GameFieldingsOrderBy>>;
};

/** All input for the `updateGamePitchingByNodeId` mutation. */
export type UpdateGamePitchingByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `GamePitching` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `GamePitching` being updated. */
  patch: GamePitchingPatch;
};

/** All input for the `updateGamePitching` mutation. */
export type UpdateGamePitchingInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  gameNum: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `GamePitching` being updated. */
  patch: GamePitchingPatch;
  playerId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
};

/** The output of our update `GamePitching` mutation. */
export type UpdateGamePitchingPayload = {
  __typename?: 'UpdateGamePitchingPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `GamePitching` that was updated by this mutation. */
  gamePitching?: Maybe<GamePitching>;
  /** An edge for our `GamePitching`. May be used by Relay 1. */
  gamePitchingEdge?: Maybe<GamePitchingsEdge>;
  /** Reads a single `Player` that is related to this `GamePitching`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our update `GamePitching` mutation. */
export type UpdateGamePitchingPayloadGamePitchingEdgeArgs = {
  orderBy?: InputMaybe<Array<GamePitchingsOrderBy>>;
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
  /** Reads a single `Matchup` that is related to this `League`. */
  matchupByCurrentMatchup?: Maybe<Matchup>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `User` that is related to this `League`. */
  userByOwner?: Maybe<User>;
};


/** The output of our update `League` mutation. */
export type UpdateLeaguePayloadLeagueEdgeArgs = {
  orderBy?: InputMaybe<Array<LeaguesOrderBy>>;
};

/** All input for the `updateLeaguePositionByNodeId` mutation. */
export type UpdateLeaguePositionByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `LeaguePosition` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `LeaguePosition` being updated. */
  patch: LeaguePositionPatch;
};

/** All input for the `updateLeaguePosition` mutation. */
export type UpdateLeaguePositionInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `LeaguePosition` being updated. */
  patch: LeaguePositionPatch;
};

/** The output of our update `LeaguePosition` mutation. */
export type UpdateLeaguePositionPayload = {
  __typename?: 'UpdateLeaguePositionPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `LeaguePosition`. */
  league?: Maybe<League>;
  /** The `LeaguePosition` that was updated by this mutation. */
  leaguePosition?: Maybe<LeaguePosition>;
  /** An edge for our `LeaguePosition`. May be used by Relay 1. */
  leaguePositionEdge?: Maybe<LeaguePositionsEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our update `LeaguePosition` mutation. */
export type UpdateLeaguePositionPayloadLeaguePositionEdgeArgs = {
  orderBy?: InputMaybe<Array<LeaguePositionsOrderBy>>;
};

/** All input for the `updateMatchupByLeagueIdAndWeekNumber` mutation. */
export type UpdateMatchupByLeagueIdAndWeekNumberInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  leagueId: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `Matchup` being updated. */
  patch: MatchupPatch;
  weekNumber: Scalars['Int']['input'];
};

/** All input for the `updateMatchupByNodeId` mutation. */
export type UpdateMatchupByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `Matchup` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `Matchup` being updated. */
  patch: MatchupPatch;
};

/** All input for the `updateMatchup` mutation. */
export type UpdateMatchupInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `Matchup` being updated. */
  patch: MatchupPatch;
};

/** The output of our update `Matchup` mutation. */
export type UpdateMatchupPayload = {
  __typename?: 'UpdateMatchupPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `Matchup`. */
  leagueById?: Maybe<League>;
  /** The `Matchup` that was updated by this mutation. */
  matchup?: Maybe<Matchup>;
  /** An edge for our `Matchup`. May be used by Relay 1. */
  matchupEdge?: Maybe<MatchupsEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our update `Matchup` mutation. */
export type UpdateMatchupPayloadMatchupEdgeArgs = {
  orderBy?: InputMaybe<Array<MatchupsOrderBy>>;
};

/** All input for the `updateMatchupPlayerByMatchupIdAndPlayerId` mutation. */
export type UpdateMatchupPlayerByMatchupIdAndPlayerIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  matchupId: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `MatchupPlayer` being updated. */
  patch: MatchupPlayerPatch;
  playerId: Scalars['Int']['input'];
};

/** All input for the `updateMatchupPlayerByNodeId` mutation. */
export type UpdateMatchupPlayerByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `MatchupPlayer` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `MatchupPlayer` being updated. */
  patch: MatchupPlayerPatch;
};

/** All input for the `updateMatchupPlayerGameByNodeId` mutation. */
export type UpdateMatchupPlayerGameByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `MatchupPlayerGame` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `MatchupPlayerGame` being updated. */
  patch: MatchupPlayerGamePatch;
};

/** All input for the `updateMatchupPlayerGame` mutation. */
export type UpdateMatchupPlayerGameInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `MatchupPlayerGame` being updated. */
  patch: MatchupPlayerGamePatch;
};

/** The output of our update `MatchupPlayerGame` mutation. */
export type UpdateMatchupPlayerGamePayload = {
  __typename?: 'UpdateMatchupPlayerGamePayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `MatchupPlayer` that is related to this `MatchupPlayerGame`. */
  matchupPlayer?: Maybe<MatchupPlayer>;
  /** The `MatchupPlayerGame` that was updated by this mutation. */
  matchupPlayerGame?: Maybe<MatchupPlayerGame>;
  /** An edge for our `MatchupPlayerGame`. May be used by Relay 1. */
  matchupPlayerGameEdge?: Maybe<MatchupPlayerGamesEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our update `MatchupPlayerGame` mutation. */
export type UpdateMatchupPlayerGamePayloadMatchupPlayerGameEdgeArgs = {
  orderBy?: InputMaybe<Array<MatchupPlayerGamesOrderBy>>;
};

/** All input for the `updateMatchupPlayer` mutation. */
export type UpdateMatchupPlayerInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `MatchupPlayer` being updated. */
  patch: MatchupPlayerPatch;
};

/** The output of our update `MatchupPlayer` mutation. */
export type UpdateMatchupPlayerPayload = {
  __typename?: 'UpdateMatchupPlayerPayload';
  /** Reads a single `AggregateSeasonBatting` that is related to this `MatchupPlayer`. */
  aggregateSeasonBattingByPlayerIdAndSeason?: Maybe<AggregateSeasonBatting>;
  /** Reads a single `AggregateSeasonFielding` that is related to this `MatchupPlayer`. */
  aggregateSeasonFieldingByPlayerIdAndSeason?: Maybe<AggregateSeasonFielding>;
  /** Reads a single `AggregateSeasonPitching` that is related to this `MatchupPlayer`. */
  aggregateSeasonPitchingByPlayerIdAndSeason?: Maybe<AggregateSeasonPitching>;
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Matchup` that is related to this `MatchupPlayer`. */
  matchup?: Maybe<Matchup>;
  /** The `MatchupPlayer` that was updated by this mutation. */
  matchupPlayer?: Maybe<MatchupPlayer>;
  /** An edge for our `MatchupPlayer`. May be used by Relay 1. */
  matchupPlayerEdge?: Maybe<MatchupPlayersEdge>;
  /** Reads a single `Player` that is related to this `MatchupPlayer`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our update `MatchupPlayer` mutation. */
export type UpdateMatchupPlayerPayloadMatchupPlayerEdgeArgs = {
  orderBy?: InputMaybe<Array<MatchupPlayersOrderBy>>;
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
  /** An object where the defined keys will be set on the `SeasonBatting` being updated. */
  patch: SeasonBattingPatch;
  playerId: Scalars['Int']['input'];
  rowId: Scalars['String']['input'];
  season: Scalars['Int']['input'];
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
  /** An object where the defined keys will be set on the `SeasonFielding` being updated. */
  patch: SeasonFieldingPatch;
  playerId: Scalars['Int']['input'];
  pos: Scalars['String']['input'];
  rowId: Scalars['String']['input'];
  season: Scalars['Int']['input'];
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
  /** An object where the defined keys will be set on the `SeasonPitching` being updated. */
  patch: SeasonPitchingPatch;
  playerId: Scalars['Int']['input'];
  rowId: Scalars['String']['input'];
  season: Scalars['Int']['input'];
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
  /** Reads a single `Player` that is related to this `SeasonPitching`. */
  player?: Maybe<Player>;
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

/** All input for the `updateTeamMemberByNodeId` mutation. */
export type UpdateTeamMemberByNodeIdInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The globally unique `ID` which will identify a single `TeamMember` to be updated. */
  nodeId: Scalars['ID']['input'];
  /** An object where the defined keys will be set on the `TeamMember` being updated. */
  patch: TeamMemberPatch;
};

/** All input for the `updateTeamMember` mutation. */
export type UpdateTeamMemberInput = {
  /**
   * An arbitrary string value with no semantic meaning. Will be included in the
   * payload verbatim. May be used to track mutations by the client.
   */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  /** An object where the defined keys will be set on the `TeamMember` being updated. */
  patch: TeamMemberPatch;
};

/** The output of our update `TeamMember` mutation. */
export type UpdateTeamMemberPayload = {
  __typename?: 'UpdateTeamMemberPayload';
  /**
   * The exact same `clientMutationId` that was provided in the mutation input,
   * unchanged and unused. May be used by a client to track mutations.
   */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `TeamMember`. */
  league?: Maybe<League>;
  /** Reads a single `Player` that is related to this `TeamMember`. */
  player?: Maybe<Player>;
  /** Reads a single `LeaguePosition` that is related to this `TeamMember`. */
  position?: Maybe<LeaguePosition>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `Team` that is related to this `TeamMember`. */
  team?: Maybe<Team>;
  /** The `TeamMember` that was updated by this mutation. */
  teamMember?: Maybe<TeamMember>;
  /** An edge for our `TeamMember`. May be used by Relay 1. */
  teamMemberEdge?: Maybe<TeamMembersEdge>;
};


/** The output of our update `TeamMember` mutation. */
export type UpdateTeamMemberPayloadTeamMemberEdgeArgs = {
  orderBy?: InputMaybe<Array<TeamMembersOrderBy>>;
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

/** All input for the upsert `GameBatting` mutation. */
export type UpsertGameBattingInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `GameBatting` to be upserted by this mutation. */
  gameBatting: GameBattingInput;
};

/** The output of our upsert `GameBatting` mutation. */
export type UpsertGameBattingPayload = {
  __typename?: 'UpsertGameBattingPayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `GameBatting` that was upserted by this mutation. */
  gameBatting?: Maybe<GameBatting>;
  /** An edge for our `GameBatting`. May be used by Relay 1. */
  gameBattingEdge?: Maybe<GameBattingsEdge>;
  /** Reads a single `Player` that is related to this `GameBatting`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our upsert `GameBatting` mutation. */
export type UpsertGameBattingPayloadGameBattingEdgeArgs = {
  orderBy?: InputMaybe<Array<GameBattingsOrderBy>>;
};

/** Where conditions for the upsert `GameBatting` mutation. */
export type UpsertGameBattingWhere = {
  gameNumber?: InputMaybe<Scalars['Int']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['Int']['input']>;
};

/** All input for the upsert `GameFielding` mutation. */
export type UpsertGameFieldingInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `GameFielding` to be upserted by this mutation. */
  gameFielding: GameFieldingInput;
};

/** The output of our upsert `GameFielding` mutation. */
export type UpsertGameFieldingPayload = {
  __typename?: 'UpsertGameFieldingPayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `GameFielding` that was upserted by this mutation. */
  gameFielding?: Maybe<GameFielding>;
  /** An edge for our `GameFielding`. May be used by Relay 1. */
  gameFieldingEdge?: Maybe<GameFieldingsEdge>;
  /** Reads a single `Player` that is related to this `GameFielding`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our upsert `GameFielding` mutation. */
export type UpsertGameFieldingPayloadGameFieldingEdgeArgs = {
  orderBy?: InputMaybe<Array<GameFieldingsOrderBy>>;
};

/** Where conditions for the upsert `GameFielding` mutation. */
export type UpsertGameFieldingWhere = {
  gameNum?: InputMaybe<Scalars['Int']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['Int']['input']>;
};

/** All input for the upsert `GamePitching` mutation. */
export type UpsertGamePitchingInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `GamePitching` to be upserted by this mutation. */
  gamePitching: GamePitchingInput;
};

/** The output of our upsert `GamePitching` mutation. */
export type UpsertGamePitchingPayload = {
  __typename?: 'UpsertGamePitchingPayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** The `GamePitching` that was upserted by this mutation. */
  gamePitching?: Maybe<GamePitching>;
  /** An edge for our `GamePitching`. May be used by Relay 1. */
  gamePitchingEdge?: Maybe<GamePitchingsEdge>;
  /** Reads a single `Player` that is related to this `GamePitching`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our upsert `GamePitching` mutation. */
export type UpsertGamePitchingPayloadGamePitchingEdgeArgs = {
  orderBy?: InputMaybe<Array<GamePitchingsOrderBy>>;
};

/** Where conditions for the upsert `GamePitching` mutation. */
export type UpsertGamePitchingWhere = {
  gameNum?: InputMaybe<Scalars['Int']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['Int']['input']>;
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
  /** Reads a single `Matchup` that is related to this `League`. */
  matchupByCurrentMatchup?: Maybe<Matchup>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `User` that is related to this `League`. */
  userByOwner?: Maybe<User>;
};


/** The output of our upsert `League` mutation. */
export type UpsertLeaguePayloadLeagueEdgeArgs = {
  orderBy?: InputMaybe<Array<LeaguesOrderBy>>;
};

/** All input for the upsert `LeaguePosition` mutation. */
export type UpsertLeaguePositionInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `LeaguePosition` to be upserted by this mutation. */
  leaguePosition: LeaguePositionInput;
};

/** The output of our upsert `LeaguePosition` mutation. */
export type UpsertLeaguePositionPayload = {
  __typename?: 'UpsertLeaguePositionPayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `LeaguePosition`. */
  league?: Maybe<League>;
  /** The `LeaguePosition` that was upserted by this mutation. */
  leaguePosition?: Maybe<LeaguePosition>;
  /** An edge for our `LeaguePosition`. May be used by Relay 1. */
  leaguePositionEdge?: Maybe<LeaguePositionsEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our upsert `LeaguePosition` mutation. */
export type UpsertLeaguePositionPayloadLeaguePositionEdgeArgs = {
  orderBy?: InputMaybe<Array<LeaguePositionsOrderBy>>;
};

/** Where conditions for the upsert `LeaguePosition` mutation. */
export type UpsertLeaguePositionWhere = {
  id?: InputMaybe<Scalars['Int']['input']>;
};

/** Where conditions for the upsert `League` mutation. */
export type UpsertLeagueWhere = {
  id?: InputMaybe<Scalars['Int']['input']>;
};

/** All input for the upsert `Matchup` mutation. */
export type UpsertMatchupInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `Matchup` to be upserted by this mutation. */
  matchup: MatchupInput;
};

/** The output of our upsert `Matchup` mutation. */
export type UpsertMatchupPayload = {
  __typename?: 'UpsertMatchupPayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `Matchup`. */
  leagueById?: Maybe<League>;
  /** The `Matchup` that was upserted by this mutation. */
  matchup?: Maybe<Matchup>;
  /** An edge for our `Matchup`. May be used by Relay 1. */
  matchupEdge?: Maybe<MatchupsEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our upsert `Matchup` mutation. */
export type UpsertMatchupPayloadMatchupEdgeArgs = {
  orderBy?: InputMaybe<Array<MatchupsOrderBy>>;
};

/** All input for the upsert `MatchupPlayerGame` mutation. */
export type UpsertMatchupPlayerGameInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `MatchupPlayerGame` to be upserted by this mutation. */
  matchupPlayerGame: MatchupPlayerGameInput;
};

/** The output of our upsert `MatchupPlayerGame` mutation. */
export type UpsertMatchupPlayerGamePayload = {
  __typename?: 'UpsertMatchupPlayerGamePayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `MatchupPlayer` that is related to this `MatchupPlayerGame`. */
  matchupPlayer?: Maybe<MatchupPlayer>;
  /** The `MatchupPlayerGame` that was upserted by this mutation. */
  matchupPlayerGame?: Maybe<MatchupPlayerGame>;
  /** An edge for our `MatchupPlayerGame`. May be used by Relay 1. */
  matchupPlayerGameEdge?: Maybe<MatchupPlayerGamesEdge>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our upsert `MatchupPlayerGame` mutation. */
export type UpsertMatchupPlayerGamePayloadMatchupPlayerGameEdgeArgs = {
  orderBy?: InputMaybe<Array<MatchupPlayerGamesOrderBy>>;
};

/** Where conditions for the upsert `MatchupPlayerGame` mutation. */
export type UpsertMatchupPlayerGameWhere = {
  id?: InputMaybe<Scalars['Int']['input']>;
};

/** All input for the upsert `MatchupPlayer` mutation. */
export type UpsertMatchupPlayerInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `MatchupPlayer` to be upserted by this mutation. */
  matchupPlayer: MatchupPlayerInput;
};

/** The output of our upsert `MatchupPlayer` mutation. */
export type UpsertMatchupPlayerPayload = {
  __typename?: 'UpsertMatchupPlayerPayload';
  /** Reads a single `AggregateSeasonBatting` that is related to this `MatchupPlayer`. */
  aggregateSeasonBattingByPlayerIdAndSeason?: Maybe<AggregateSeasonBatting>;
  /** Reads a single `AggregateSeasonFielding` that is related to this `MatchupPlayer`. */
  aggregateSeasonFieldingByPlayerIdAndSeason?: Maybe<AggregateSeasonFielding>;
  /** Reads a single `AggregateSeasonPitching` that is related to this `MatchupPlayer`. */
  aggregateSeasonPitchingByPlayerIdAndSeason?: Maybe<AggregateSeasonPitching>;
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Matchup` that is related to this `MatchupPlayer`. */
  matchup?: Maybe<Matchup>;
  /** The `MatchupPlayer` that was upserted by this mutation. */
  matchupPlayer?: Maybe<MatchupPlayer>;
  /** An edge for our `MatchupPlayer`. May be used by Relay 1. */
  matchupPlayerEdge?: Maybe<MatchupPlayersEdge>;
  /** Reads a single `Player` that is related to this `MatchupPlayer`. */
  player?: Maybe<Player>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
};


/** The output of our upsert `MatchupPlayer` mutation. */
export type UpsertMatchupPlayerPayloadMatchupPlayerEdgeArgs = {
  orderBy?: InputMaybe<Array<MatchupPlayersOrderBy>>;
};

/** Where conditions for the upsert `MatchupPlayer` mutation. */
export type UpsertMatchupPlayerWhere = {
  id?: InputMaybe<Scalars['Int']['input']>;
  matchupId?: InputMaybe<Scalars['Int']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
};

/** Where conditions for the upsert `Matchup` mutation. */
export type UpsertMatchupWhere = {
  id?: InputMaybe<Scalars['Int']['input']>;
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  weekNumber?: InputMaybe<Scalars['Int']['input']>;
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
  playerId?: InputMaybe<Scalars['Int']['input']>;
  rowId?: InputMaybe<Scalars['String']['input']>;
  season?: InputMaybe<Scalars['Int']['input']>;
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
  playerId?: InputMaybe<Scalars['Int']['input']>;
  pos?: InputMaybe<Scalars['String']['input']>;
  rowId?: InputMaybe<Scalars['String']['input']>;
  season?: InputMaybe<Scalars['Int']['input']>;
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
  /** Reads a single `Player` that is related to this `SeasonPitching`. */
  player?: Maybe<Player>;
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
  playerId?: InputMaybe<Scalars['Int']['input']>;
  rowId?: InputMaybe<Scalars['String']['input']>;
  season?: InputMaybe<Scalars['Int']['input']>;
  team?: InputMaybe<Scalars['String']['input']>;
};

/** All input for the upsert `Team` mutation. */
export type UpsertTeamInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `Team` to be upserted by this mutation. */
  team: TeamInput;
};

/** All input for the upsert `TeamMember` mutation. */
export type UpsertTeamMemberInput = {
  /** An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  /** The `TeamMember` to be upserted by this mutation. */
  teamMember: TeamMemberInput;
};

/** The output of our upsert `TeamMember` mutation. */
export type UpsertTeamMemberPayload = {
  __typename?: 'UpsertTeamMemberPayload';
  /** The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations. */
  clientMutationId?: Maybe<Scalars['String']['output']>;
  /** Reads a single `League` that is related to this `TeamMember`. */
  league?: Maybe<League>;
  /** Reads a single `Player` that is related to this `TeamMember`. */
  player?: Maybe<Player>;
  /** Reads a single `LeaguePosition` that is related to this `TeamMember`. */
  position?: Maybe<LeaguePosition>;
  /** Our root query field type. Allows us to run any query from our mutation payload. */
  query?: Maybe<Query>;
  /** Reads a single `Team` that is related to this `TeamMember`. */
  team?: Maybe<Team>;
  /** The `TeamMember` that was upserted by this mutation. */
  teamMember?: Maybe<TeamMember>;
  /** An edge for our `TeamMember`. May be used by Relay 1. */
  teamMemberEdge?: Maybe<TeamMembersEdge>;
};


/** The output of our upsert `TeamMember` mutation. */
export type UpsertTeamMemberPayloadTeamMemberEdgeArgs = {
  orderBy?: InputMaybe<Array<TeamMembersOrderBy>>;
};

/** Where conditions for the upsert `TeamMember` mutation. */
export type UpsertTeamMemberWhere = {
  id?: InputMaybe<Scalars['Int']['input']>;
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
};

export type User = Node & {
  __typename?: 'User';
  accessLevel?: Maybe<AccessLevel>;
  email?: Maybe<Scalars['String']['output']>;
  id: Scalars['Int']['output'];
  /** Reads and enables pagination through a set of `LeagueMember`. */
  leagueMembers: LeagueMembersConnection;
  /** Reads and enables pagination through a set of `LeagueMessage`. */
  leagueMessages: LeagueMessagesConnection;
  /** Reads and enables pagination through a set of `League`. */
  leaguesByOwner: LeaguesConnection;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  username?: Maybe<Scalars['String']['output']>;
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


export type UserLeaguesByOwnerArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<LeagueCondition>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LeaguesOrderBy>>;
};

/** A condition to be used against `User` object types. All fields are tested for equality and combined with a logical ‘and.’ */
export type UserCondition = {
  /** Checks for equality with the object’s `accessLevel` field. */
  accessLevel?: InputMaybe<AccessLevel>;
  /** Checks for equality with the object’s `email` field. */
  email?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `username` field. */
  username?: InputMaybe<Scalars['String']['input']>;
};

/** An input for mutations affecting `User` */
export type UserInput = {
  accessLevel?: InputMaybe<AccessLevel>;
  email?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int']['input'];
  username?: InputMaybe<Scalars['String']['input']>;
};

/** Represents an update to a `User`. Fields that are set will be updated. */
export type UserPatch = {
  accessLevel?: InputMaybe<AccessLevel>;
  email?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
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
  AccessLevelAsc = 'ACCESS_LEVEL_ASC',
  AccessLevelDesc = 'ACCESS_LEVEL_DESC',
  EmailAsc = 'EMAIL_ASC',
  EmailDesc = 'EMAIL_DESC',
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  UsernameAsc = 'USERNAME_ASC',
  UsernameDesc = 'USERNAME_DESC'
}

export type AggregateSeasonBattingKeySpecifier = ('ab' | 'bb' | 'cs' | 'doubles' | 'g' | 'gidp' | 'h' | 'hbp' | 'hr' | 'ibb' | 'matchupPlayersByPlayerIdAndSeason' | 'pa' | 'player' | 'playerId' | 'r' | 'rbi' | 'sb' | 'season' | 'sf' | 'sh' | 'so' | 'tb' | 'triples' | AggregateSeasonBattingKeySpecifier)[];
export type AggregateSeasonBattingFieldPolicy = {
	ab?: FieldPolicy<any> | FieldReadFunction<any>,
	bb?: FieldPolicy<any> | FieldReadFunction<any>,
	cs?: FieldPolicy<any> | FieldReadFunction<any>,
	doubles?: FieldPolicy<any> | FieldReadFunction<any>,
	g?: FieldPolicy<any> | FieldReadFunction<any>,
	gidp?: FieldPolicy<any> | FieldReadFunction<any>,
	h?: FieldPolicy<any> | FieldReadFunction<any>,
	hbp?: FieldPolicy<any> | FieldReadFunction<any>,
	hr?: FieldPolicy<any> | FieldReadFunction<any>,
	ibb?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayersByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	pa?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	r?: FieldPolicy<any> | FieldReadFunction<any>,
	rbi?: FieldPolicy<any> | FieldReadFunction<any>,
	sb?: FieldPolicy<any> | FieldReadFunction<any>,
	season?: FieldPolicy<any> | FieldReadFunction<any>,
	sf?: FieldPolicy<any> | FieldReadFunction<any>,
	sh?: FieldPolicy<any> | FieldReadFunction<any>,
	so?: FieldPolicy<any> | FieldReadFunction<any>,
	tb?: FieldPolicy<any> | FieldReadFunction<any>,
	triples?: FieldPolicy<any> | FieldReadFunction<any>
};
export type AggregateSeasonBattingsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | AggregateSeasonBattingsConnectionKeySpecifier)[];
export type AggregateSeasonBattingsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type AggregateSeasonBattingsEdgeKeySpecifier = ('cursor' | 'node' | AggregateSeasonBattingsEdgeKeySpecifier)[];
export type AggregateSeasonBattingsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type AggregateSeasonFieldingKeySpecifier = ('a' | 'cg' | 'chances' | 'cs' | 'dpDef' | 'eDef' | 'g' | 'gs' | 'innDef' | 'matchupPlayersByPlayerIdAndSeason' | 'pickoffs' | 'player' | 'playerId' | 'po' | 'sb' | 'season' | 'wp' | AggregateSeasonFieldingKeySpecifier)[];
export type AggregateSeasonFieldingFieldPolicy = {
	a?: FieldPolicy<any> | FieldReadFunction<any>,
	cg?: FieldPolicy<any> | FieldReadFunction<any>,
	chances?: FieldPolicy<any> | FieldReadFunction<any>,
	cs?: FieldPolicy<any> | FieldReadFunction<any>,
	dpDef?: FieldPolicy<any> | FieldReadFunction<any>,
	eDef?: FieldPolicy<any> | FieldReadFunction<any>,
	g?: FieldPolicy<any> | FieldReadFunction<any>,
	gs?: FieldPolicy<any> | FieldReadFunction<any>,
	innDef?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayersByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	pickoffs?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	po?: FieldPolicy<any> | FieldReadFunction<any>,
	sb?: FieldPolicy<any> | FieldReadFunction<any>,
	season?: FieldPolicy<any> | FieldReadFunction<any>,
	wp?: FieldPolicy<any> | FieldReadFunction<any>
};
export type AggregateSeasonFieldingByPoKeySpecifier = ('a' | 'cg' | 'chances' | 'cs' | 'dpDef' | 'eDef' | 'g' | 'gs' | 'innDef' | 'pickoffs' | 'player' | 'playerId' | 'po' | 'pos' | 'sb' | 'season' | 'wp' | AggregateSeasonFieldingByPoKeySpecifier)[];
export type AggregateSeasonFieldingByPoFieldPolicy = {
	a?: FieldPolicy<any> | FieldReadFunction<any>,
	cg?: FieldPolicy<any> | FieldReadFunction<any>,
	chances?: FieldPolicy<any> | FieldReadFunction<any>,
	cs?: FieldPolicy<any> | FieldReadFunction<any>,
	dpDef?: FieldPolicy<any> | FieldReadFunction<any>,
	eDef?: FieldPolicy<any> | FieldReadFunction<any>,
	g?: FieldPolicy<any> | FieldReadFunction<any>,
	gs?: FieldPolicy<any> | FieldReadFunction<any>,
	innDef?: FieldPolicy<any> | FieldReadFunction<any>,
	pickoffs?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	po?: FieldPolicy<any> | FieldReadFunction<any>,
	pos?: FieldPolicy<any> | FieldReadFunction<any>,
	sb?: FieldPolicy<any> | FieldReadFunction<any>,
	season?: FieldPolicy<any> | FieldReadFunction<any>,
	wp?: FieldPolicy<any> | FieldReadFunction<any>
};
export type AggregateSeasonFieldingByPosConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | AggregateSeasonFieldingByPosConnectionKeySpecifier)[];
export type AggregateSeasonFieldingByPosConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type AggregateSeasonFieldingByPosEdgeKeySpecifier = ('cursor' | 'node' | AggregateSeasonFieldingByPosEdgeKeySpecifier)[];
export type AggregateSeasonFieldingByPosEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type AggregateSeasonFieldingsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | AggregateSeasonFieldingsConnectionKeySpecifier)[];
export type AggregateSeasonFieldingsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type AggregateSeasonFieldingsEdgeKeySpecifier = ('cursor' | 'node' | AggregateSeasonFieldingsEdgeKeySpecifier)[];
export type AggregateSeasonFieldingsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type AggregateSeasonPitchingKeySpecifier = ('battersFaced' | 'bb' | 'bk' | 'cg' | 'er' | 'g' | 'gf' | 'gs' | 'h' | 'hbp' | 'hr' | 'ibb' | 'l' | 'matchupPlayersByPlayerIdAndSeason' | 'outsRecorded' | 'player' | 'playerId' | 'r' | 'season' | 'sho' | 'so' | 'sv' | 'w' | 'wp' | AggregateSeasonPitchingKeySpecifier)[];
export type AggregateSeasonPitchingFieldPolicy = {
	battersFaced?: FieldPolicy<any> | FieldReadFunction<any>,
	bb?: FieldPolicy<any> | FieldReadFunction<any>,
	bk?: FieldPolicy<any> | FieldReadFunction<any>,
	cg?: FieldPolicy<any> | FieldReadFunction<any>,
	er?: FieldPolicy<any> | FieldReadFunction<any>,
	g?: FieldPolicy<any> | FieldReadFunction<any>,
	gf?: FieldPolicy<any> | FieldReadFunction<any>,
	gs?: FieldPolicy<any> | FieldReadFunction<any>,
	h?: FieldPolicy<any> | FieldReadFunction<any>,
	hbp?: FieldPolicy<any> | FieldReadFunction<any>,
	hr?: FieldPolicy<any> | FieldReadFunction<any>,
	ibb?: FieldPolicy<any> | FieldReadFunction<any>,
	l?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayersByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	outsRecorded?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	r?: FieldPolicy<any> | FieldReadFunction<any>,
	season?: FieldPolicy<any> | FieldReadFunction<any>,
	sho?: FieldPolicy<any> | FieldReadFunction<any>,
	so?: FieldPolicy<any> | FieldReadFunction<any>,
	sv?: FieldPolicy<any> | FieldReadFunction<any>,
	w?: FieldPolicy<any> | FieldReadFunction<any>,
	wp?: FieldPolicy<any> | FieldReadFunction<any>
};
export type AggregateSeasonPitchingsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | AggregateSeasonPitchingsConnectionKeySpecifier)[];
export type AggregateSeasonPitchingsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type AggregateSeasonPitchingsEdgeKeySpecifier = ('cursor' | 'node' | AggregateSeasonPitchingsEdgeKeySpecifier)[];
export type AggregateSeasonPitchingsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CareerBattingKeySpecifier = ('ab' | 'bb' | 'cs' | 'doubles' | 'g' | 'gidp' | 'h' | 'hbp' | 'hr' | 'ibb' | 'pa' | 'player' | 'playerId' | 'r' | 'rbi' | 'sb' | 'sh' | 'so' | 'tb' | 'triples' | CareerBattingKeySpecifier)[];
export type CareerBattingFieldPolicy = {
	ab?: FieldPolicy<any> | FieldReadFunction<any>,
	bb?: FieldPolicy<any> | FieldReadFunction<any>,
	cs?: FieldPolicy<any> | FieldReadFunction<any>,
	doubles?: FieldPolicy<any> | FieldReadFunction<any>,
	g?: FieldPolicy<any> | FieldReadFunction<any>,
	gidp?: FieldPolicy<any> | FieldReadFunction<any>,
	h?: FieldPolicy<any> | FieldReadFunction<any>,
	hbp?: FieldPolicy<any> | FieldReadFunction<any>,
	hr?: FieldPolicy<any> | FieldReadFunction<any>,
	ibb?: FieldPolicy<any> | FieldReadFunction<any>,
	pa?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	r?: FieldPolicy<any> | FieldReadFunction<any>,
	rbi?: FieldPolicy<any> | FieldReadFunction<any>,
	sb?: FieldPolicy<any> | FieldReadFunction<any>,
	sh?: FieldPolicy<any> | FieldReadFunction<any>,
	so?: FieldPolicy<any> | FieldReadFunction<any>,
	tb?: FieldPolicy<any> | FieldReadFunction<any>,
	triples?: FieldPolicy<any> | FieldReadFunction<any>
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
export type CareerFieldingKeySpecifier = ('a' | 'cg' | 'chances' | 'cs' | 'dpDef' | 'eDef' | 'g' | 'gs' | 'innDef' | 'pickoffs' | 'player' | 'playerId' | 'po' | 'pos' | 'sb' | 'wp' | CareerFieldingKeySpecifier)[];
export type CareerFieldingFieldPolicy = {
	a?: FieldPolicy<any> | FieldReadFunction<any>,
	cg?: FieldPolicy<any> | FieldReadFunction<any>,
	chances?: FieldPolicy<any> | FieldReadFunction<any>,
	cs?: FieldPolicy<any> | FieldReadFunction<any>,
	dpDef?: FieldPolicy<any> | FieldReadFunction<any>,
	eDef?: FieldPolicy<any> | FieldReadFunction<any>,
	g?: FieldPolicy<any> | FieldReadFunction<any>,
	gs?: FieldPolicy<any> | FieldReadFunction<any>,
	innDef?: FieldPolicy<any> | FieldReadFunction<any>,
	pickoffs?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	po?: FieldPolicy<any> | FieldReadFunction<any>,
	pos?: FieldPolicy<any> | FieldReadFunction<any>,
	sb?: FieldPolicy<any> | FieldReadFunction<any>,
	wp?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CareerFieldingByPositionKeySpecifier = ('a' | 'cg' | 'chances' | 'cs' | 'dpDef' | 'eDef' | 'g' | 'gs' | 'innDef' | 'pickoffs' | 'player' | 'playerId' | 'po' | 'pos' | 'sb' | 'wp' | CareerFieldingByPositionKeySpecifier)[];
export type CareerFieldingByPositionFieldPolicy = {
	a?: FieldPolicy<any> | FieldReadFunction<any>,
	cg?: FieldPolicy<any> | FieldReadFunction<any>,
	chances?: FieldPolicy<any> | FieldReadFunction<any>,
	cs?: FieldPolicy<any> | FieldReadFunction<any>,
	dpDef?: FieldPolicy<any> | FieldReadFunction<any>,
	eDef?: FieldPolicy<any> | FieldReadFunction<any>,
	g?: FieldPolicy<any> | FieldReadFunction<any>,
	gs?: FieldPolicy<any> | FieldReadFunction<any>,
	innDef?: FieldPolicy<any> | FieldReadFunction<any>,
	pickoffs?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	po?: FieldPolicy<any> | FieldReadFunction<any>,
	pos?: FieldPolicy<any> | FieldReadFunction<any>,
	sb?: FieldPolicy<any> | FieldReadFunction<any>,
	wp?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CareerFieldingByPositionsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | CareerFieldingByPositionsConnectionKeySpecifier)[];
export type CareerFieldingByPositionsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CareerFieldingByPositionsEdgeKeySpecifier = ('cursor' | 'node' | CareerFieldingByPositionsEdgeKeySpecifier)[];
export type CareerFieldingByPositionsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
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
export type CareerPitchingKeySpecifier = ('battersFaced' | 'bb' | 'bk' | 'cg' | 'er' | 'era' | 'g' | 'gf' | 'gs' | 'h' | 'hbp' | 'hr' | 'ibb' | 'l' | 'outRate' | 'outsRecorded' | 'player' | 'playerId' | 'r' | 'sho' | 'so' | 'sv' | 'w' | 'wp' | CareerPitchingKeySpecifier)[];
export type CareerPitchingFieldPolicy = {
	battersFaced?: FieldPolicy<any> | FieldReadFunction<any>,
	bb?: FieldPolicy<any> | FieldReadFunction<any>,
	bk?: FieldPolicy<any> | FieldReadFunction<any>,
	cg?: FieldPolicy<any> | FieldReadFunction<any>,
	er?: FieldPolicy<any> | FieldReadFunction<any>,
	era?: FieldPolicy<any> | FieldReadFunction<any>,
	g?: FieldPolicy<any> | FieldReadFunction<any>,
	gf?: FieldPolicy<any> | FieldReadFunction<any>,
	gs?: FieldPolicy<any> | FieldReadFunction<any>,
	h?: FieldPolicy<any> | FieldReadFunction<any>,
	hbp?: FieldPolicy<any> | FieldReadFunction<any>,
	hr?: FieldPolicy<any> | FieldReadFunction<any>,
	ibb?: FieldPolicy<any> | FieldReadFunction<any>,
	l?: FieldPolicy<any> | FieldReadFunction<any>,
	outRate?: FieldPolicy<any> | FieldReadFunction<any>,
	outsRecorded?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	r?: FieldPolicy<any> | FieldReadFunction<any>,
	sho?: FieldPolicy<any> | FieldReadFunction<any>,
	so?: FieldPolicy<any> | FieldReadFunction<any>,
	sv?: FieldPolicy<any> | FieldReadFunction<any>,
	w?: FieldPolicy<any> | FieldReadFunction<any>,
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
export type CreateDraftPayloadKeySpecifier = ('clientMutationId' | 'draft' | 'draftEdge' | 'league' | 'query' | CreateDraftPayloadKeySpecifier)[];
export type CreateDraftPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateDraftTeamPayloadKeySpecifier = ('clientMutationId' | 'draft' | 'draftTeam' | 'draftTeamEdge' | 'query' | 'teamLeague' | CreateDraftTeamPayloadKeySpecifier)[];
export type CreateDraftTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	teamLeague?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateGameBattingPayloadKeySpecifier = ('clientMutationId' | 'gameBatting' | 'gameBattingEdge' | 'player' | 'query' | CreateGameBattingPayloadKeySpecifier)[];
export type CreateGameBattingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	gameBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	gameBattingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateGameFieldingPayloadKeySpecifier = ('clientMutationId' | 'gameFielding' | 'gameFieldingEdge' | 'player' | 'query' | CreateGameFieldingPayloadKeySpecifier)[];
export type CreateGameFieldingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	gameFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	gameFieldingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateGamePitchingPayloadKeySpecifier = ('clientMutationId' | 'gamePitching' | 'gamePitchingEdge' | 'player' | 'query' | CreateGamePitchingPayloadKeySpecifier)[];
export type CreateGamePitchingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	gamePitching?: FieldPolicy<any> | FieldReadFunction<any>,
	gamePitchingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateLeagueAndTeamsPayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueEdge' | 'matchupByCurrentMatchup' | 'query' | 'userByOwner' | CreateLeagueAndTeamsPayloadKeySpecifier)[];
export type CreateLeagueAndTeamsPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupByCurrentMatchup?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	userByOwner?: FieldPolicy<any> | FieldReadFunction<any>
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
export type CreateLeagueMessagePayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueMessage' | 'leagueMessageEdge' | 'query' | 'user' | CreateLeagueMessagePayloadKeySpecifier)[];
export type CreateLeagueMessagePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessageEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateLeaguePayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueEdge' | 'matchupByCurrentMatchup' | 'query' | 'userByOwner' | CreateLeaguePayloadKeySpecifier)[];
export type CreateLeaguePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupByCurrentMatchup?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	userByOwner?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateLeaguePositionPayloadKeySpecifier = ('clientMutationId' | 'league' | 'leaguePosition' | 'leaguePositionEdge' | 'query' | CreateLeaguePositionPayloadKeySpecifier)[];
export type CreateLeaguePositionPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leaguePosition?: FieldPolicy<any> | FieldReadFunction<any>,
	leaguePositionEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateMatchupPayloadKeySpecifier = ('clientMutationId' | 'leagueById' | 'matchup' | 'matchupEdge' | 'query' | CreateMatchupPayloadKeySpecifier)[];
export type CreateMatchupPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueById?: FieldPolicy<any> | FieldReadFunction<any>,
	matchup?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateMatchupPlayerGamePayloadKeySpecifier = ('clientMutationId' | 'matchupPlayer' | 'matchupPlayerGame' | 'matchupPlayerGameEdge' | 'query' | CreateMatchupPlayerGamePayloadKeySpecifier)[];
export type CreateMatchupPlayerGamePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerGame?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerGameEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateMatchupPlayerPayloadKeySpecifier = ('aggregateSeasonBattingByPlayerIdAndSeason' | 'aggregateSeasonFieldingByPlayerIdAndSeason' | 'aggregateSeasonPitchingByPlayerIdAndSeason' | 'clientMutationId' | 'matchup' | 'matchupPlayer' | 'matchupPlayerEdge' | 'player' | 'query' | CreateMatchupPlayerPayloadKeySpecifier)[];
export type CreateMatchupPlayerPayloadFieldPolicy = {
	aggregateSeasonBattingByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	aggregateSeasonFieldingByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	aggregateSeasonPitchingByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	matchup?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreatePlayerPayloadKeySpecifier = ('clientMutationId' | 'player' | 'playerEdge' | 'query' | CreatePlayerPayloadKeySpecifier)[];
export type CreatePlayerPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerEdge?: FieldPolicy<any> | FieldReadFunction<any>,
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
export type CreateSeasonPitchingPayloadKeySpecifier = ('clientMutationId' | 'player' | 'query' | 'seasonPitching' | 'seasonPitchingEdge' | CreateSeasonPitchingPayloadKeySpecifier)[];
export type CreateSeasonPitchingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitchingEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type CreateTeamMemberPayloadKeySpecifier = ('clientMutationId' | 'league' | 'player' | 'position' | 'query' | 'team' | 'teamMember' | 'teamMemberEdge' | CreateTeamMemberPayloadKeySpecifier)[];
export type CreateTeamMemberPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	position?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	team?: FieldPolicy<any> | FieldReadFunction<any>,
	teamMember?: FieldPolicy<any> | FieldReadFunction<any>,
	teamMemberEdge?: FieldPolicy<any> | FieldReadFunction<any>
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
export type DeleteDraftTeamPayloadKeySpecifier = ('clientMutationId' | 'deletedDraftTeamNodeId' | 'draft' | 'draftTeam' | 'draftTeamEdge' | 'query' | 'teamLeague' | DeleteDraftTeamPayloadKeySpecifier)[];
export type DeleteDraftTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedDraftTeamNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	teamLeague?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteGameBattingPayloadKeySpecifier = ('clientMutationId' | 'deletedGameBattingNodeId' | 'gameBatting' | 'gameBattingEdge' | 'player' | 'query' | DeleteGameBattingPayloadKeySpecifier)[];
export type DeleteGameBattingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedGameBattingNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	gameBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	gameBattingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteGameFieldingPayloadKeySpecifier = ('clientMutationId' | 'deletedGameFieldingNodeId' | 'gameFielding' | 'gameFieldingEdge' | 'player' | 'query' | DeleteGameFieldingPayloadKeySpecifier)[];
export type DeleteGameFieldingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedGameFieldingNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	gameFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	gameFieldingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteGamePitchingPayloadKeySpecifier = ('clientMutationId' | 'deletedGamePitchingNodeId' | 'gamePitching' | 'gamePitchingEdge' | 'player' | 'query' | DeleteGamePitchingPayloadKeySpecifier)[];
export type DeleteGamePitchingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedGamePitchingNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	gamePitching?: FieldPolicy<any> | FieldReadFunction<any>,
	gamePitchingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
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
export type DeleteLeagueMessagePayloadKeySpecifier = ('clientMutationId' | 'deletedLeagueMessageNodeId' | 'league' | 'leagueMessage' | 'leagueMessageEdge' | 'query' | 'user' | DeleteLeagueMessagePayloadKeySpecifier)[];
export type DeleteLeagueMessagePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedLeagueMessageNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessageEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteLeaguePayloadKeySpecifier = ('clientMutationId' | 'deletedLeagueNodeId' | 'league' | 'leagueEdge' | 'matchupByCurrentMatchup' | 'query' | 'userByOwner' | DeleteLeaguePayloadKeySpecifier)[];
export type DeleteLeaguePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedLeagueNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupByCurrentMatchup?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	userByOwner?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteLeaguePositionPayloadKeySpecifier = ('clientMutationId' | 'deletedLeaguePositionNodeId' | 'league' | 'leaguePosition' | 'leaguePositionEdge' | 'query' | DeleteLeaguePositionPayloadKeySpecifier)[];
export type DeleteLeaguePositionPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedLeaguePositionNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leaguePosition?: FieldPolicy<any> | FieldReadFunction<any>,
	leaguePositionEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteMatchupPayloadKeySpecifier = ('clientMutationId' | 'deletedMatchupNodeId' | 'leagueById' | 'matchup' | 'matchupEdge' | 'query' | DeleteMatchupPayloadKeySpecifier)[];
export type DeleteMatchupPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedMatchupNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueById?: FieldPolicy<any> | FieldReadFunction<any>,
	matchup?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteMatchupPlayerGamePayloadKeySpecifier = ('clientMutationId' | 'deletedMatchupPlayerGameNodeId' | 'matchupPlayer' | 'matchupPlayerGame' | 'matchupPlayerGameEdge' | 'query' | DeleteMatchupPlayerGamePayloadKeySpecifier)[];
export type DeleteMatchupPlayerGamePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedMatchupPlayerGameNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerGame?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerGameEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteMatchupPlayerPayloadKeySpecifier = ('aggregateSeasonBattingByPlayerIdAndSeason' | 'aggregateSeasonFieldingByPlayerIdAndSeason' | 'aggregateSeasonPitchingByPlayerIdAndSeason' | 'clientMutationId' | 'deletedMatchupPlayerNodeId' | 'matchup' | 'matchupPlayer' | 'matchupPlayerEdge' | 'player' | 'query' | DeleteMatchupPlayerPayloadKeySpecifier)[];
export type DeleteMatchupPlayerPayloadFieldPolicy = {
	aggregateSeasonBattingByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	aggregateSeasonFieldingByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	aggregateSeasonPitchingByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedMatchupPlayerNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	matchup?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
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
export type DeleteSeasonPitchingPayloadKeySpecifier = ('clientMutationId' | 'deletedSeasonPitchingNodeId' | 'player' | 'query' | 'seasonPitching' | 'seasonPitchingEdge' | DeleteSeasonPitchingPayloadKeySpecifier)[];
export type DeleteSeasonPitchingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedSeasonPitchingNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitchingEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type DeleteTeamMemberPayloadKeySpecifier = ('clientMutationId' | 'deletedTeamMemberNodeId' | 'league' | 'player' | 'position' | 'query' | 'team' | 'teamMember' | 'teamMemberEdge' | DeleteTeamMemberPayloadKeySpecifier)[];
export type DeleteTeamMemberPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	deletedTeamMemberNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	position?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	team?: FieldPolicy<any> | FieldReadFunction<any>,
	teamMember?: FieldPolicy<any> | FieldReadFunction<any>,
	teamMemberEdge?: FieldPolicy<any> | FieldReadFunction<any>
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
export type DraftTeamKeySpecifier = ('draft' | 'draftId' | 'draftOrder' | 'leagueId' | 'nodeId' | 'teamId' | 'teamLeague' | DraftTeamKeySpecifier)[];
export type DraftTeamFieldPolicy = {
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftId?: FieldPolicy<any> | FieldReadFunction<any>,
	draftOrder?: FieldPolicy<any> | FieldReadFunction<any>,
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
export type GameBattingKeySpecifier = ('ab' | 'bb' | 'cs' | 'doubles' | 'gameIdentifier' | 'gameNumber' | 'gidp' | 'h' | 'hbp' | 'hr' | 'ibb' | 'nodeId' | 'pa' | 'player' | 'playerId' | 'r' | 'rbi' | 'sb' | 'season' | 'sf' | 'sh' | 'so' | 'triples' | GameBattingKeySpecifier)[];
export type GameBattingFieldPolicy = {
	ab?: FieldPolicy<any> | FieldReadFunction<any>,
	bb?: FieldPolicy<any> | FieldReadFunction<any>,
	cs?: FieldPolicy<any> | FieldReadFunction<any>,
	doubles?: FieldPolicy<any> | FieldReadFunction<any>,
	gameIdentifier?: FieldPolicy<any> | FieldReadFunction<any>,
	gameNumber?: FieldPolicy<any> | FieldReadFunction<any>,
	gidp?: FieldPolicy<any> | FieldReadFunction<any>,
	h?: FieldPolicy<any> | FieldReadFunction<any>,
	hbp?: FieldPolicy<any> | FieldReadFunction<any>,
	hr?: FieldPolicy<any> | FieldReadFunction<any>,
	ibb?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	pa?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	r?: FieldPolicy<any> | FieldReadFunction<any>,
	rbi?: FieldPolicy<any> | FieldReadFunction<any>,
	sb?: FieldPolicy<any> | FieldReadFunction<any>,
	season?: FieldPolicy<any> | FieldReadFunction<any>,
	sf?: FieldPolicy<any> | FieldReadFunction<any>,
	sh?: FieldPolicy<any> | FieldReadFunction<any>,
	so?: FieldPolicy<any> | FieldReadFunction<any>,
	triples?: FieldPolicy<any> | FieldReadFunction<any>
};
export type GameBattingsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | GameBattingsConnectionKeySpecifier)[];
export type GameBattingsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type GameBattingsEdgeKeySpecifier = ('cursor' | 'node' | GameBattingsEdgeKeySpecifier)[];
export type GameBattingsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type GameFieldingKeySpecifier = ('a' | 'chances' | 'dpDef' | 'eDef' | 'gameIdentifier' | 'gameNum' | 'innDef' | 'nodeId' | 'player' | 'playerId' | 'po' | 'season' | GameFieldingKeySpecifier)[];
export type GameFieldingFieldPolicy = {
	a?: FieldPolicy<any> | FieldReadFunction<any>,
	chances?: FieldPolicy<any> | FieldReadFunction<any>,
	dpDef?: FieldPolicy<any> | FieldReadFunction<any>,
	eDef?: FieldPolicy<any> | FieldReadFunction<any>,
	gameIdentifier?: FieldPolicy<any> | FieldReadFunction<any>,
	gameNum?: FieldPolicy<any> | FieldReadFunction<any>,
	innDef?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	po?: FieldPolicy<any> | FieldReadFunction<any>,
	season?: FieldPolicy<any> | FieldReadFunction<any>
};
export type GameFieldingsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | GameFieldingsConnectionKeySpecifier)[];
export type GameFieldingsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type GameFieldingsEdgeKeySpecifier = ('cursor' | 'node' | GameFieldingsEdgeKeySpecifier)[];
export type GameFieldingsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type GamePitchingKeySpecifier = ('battersFaced' | 'bb' | 'cg' | 'er' | 'gameIdentifier' | 'gameNum' | 'gf' | 'gs' | 'h' | 'hbp' | 'hr' | 'ibb' | 'ip' | 'l' | 'nodeId' | 'outsRecorded' | 'player' | 'playerId' | 'r' | 'season' | 'sho' | 'so' | 'sv' | 'w' | GamePitchingKeySpecifier)[];
export type GamePitchingFieldPolicy = {
	battersFaced?: FieldPolicy<any> | FieldReadFunction<any>,
	bb?: FieldPolicy<any> | FieldReadFunction<any>,
	cg?: FieldPolicy<any> | FieldReadFunction<any>,
	er?: FieldPolicy<any> | FieldReadFunction<any>,
	gameIdentifier?: FieldPolicy<any> | FieldReadFunction<any>,
	gameNum?: FieldPolicy<any> | FieldReadFunction<any>,
	gf?: FieldPolicy<any> | FieldReadFunction<any>,
	gs?: FieldPolicy<any> | FieldReadFunction<any>,
	h?: FieldPolicy<any> | FieldReadFunction<any>,
	hbp?: FieldPolicy<any> | FieldReadFunction<any>,
	hr?: FieldPolicy<any> | FieldReadFunction<any>,
	ibb?: FieldPolicy<any> | FieldReadFunction<any>,
	ip?: FieldPolicy<any> | FieldReadFunction<any>,
	l?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	outsRecorded?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	r?: FieldPolicy<any> | FieldReadFunction<any>,
	season?: FieldPolicy<any> | FieldReadFunction<any>,
	sho?: FieldPolicy<any> | FieldReadFunction<any>,
	so?: FieldPolicy<any> | FieldReadFunction<any>,
	sv?: FieldPolicy<any> | FieldReadFunction<any>,
	w?: FieldPolicy<any> | FieldReadFunction<any>
};
export type GamePitchingsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | GamePitchingsConnectionKeySpecifier)[];
export type GamePitchingsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type GamePitchingsEdgeKeySpecifier = ('cursor' | 'node' | GamePitchingsEdgeKeySpecifier)[];
export type GamePitchingsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type IsMajorLeaguePayloadKeySpecifier = ('boolean' | 'clientMutationId' | 'query' | IsMajorLeaguePayloadKeySpecifier)[];
export type IsMajorLeaguePayloadFieldPolicy = {
	boolean?: FieldPolicy<any> | FieldReadFunction<any>,
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type LeagueKeySpecifier = ('currentMatchup' | 'drafts' | 'id' | 'leagueMembers' | 'leagueMessages' | 'leaguePositions' | 'matchupByCurrentMatchup' | 'matchupById' | 'maxRosterSize' | 'name' | 'nodeId' | 'owner' | 'teamMembers' | 'teams' | 'userByOwner' | LeagueKeySpecifier)[];
export type LeagueFieldPolicy = {
	currentMatchup?: FieldPolicy<any> | FieldReadFunction<any>,
	drafts?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMembers?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessages?: FieldPolicy<any> | FieldReadFunction<any>,
	leaguePositions?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupByCurrentMatchup?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupById?: FieldPolicy<any> | FieldReadFunction<any>,
	maxRosterSize?: FieldPolicy<any> | FieldReadFunction<any>,
	name?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	owner?: FieldPolicy<any> | FieldReadFunction<any>,
	teamMembers?: FieldPolicy<any> | FieldReadFunction<any>,
	teams?: FieldPolicy<any> | FieldReadFunction<any>,
	userByOwner?: FieldPolicy<any> | FieldReadFunction<any>
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
export type LeagueMessageKeySpecifier = ('id' | 'league' | 'leagueId' | 'messageText' | 'nodeId' | 'timestamp' | 'user' | 'userId' | LeagueMessageKeySpecifier)[];
export type LeagueMessageFieldPolicy = {
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	messageText?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	timestamp?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>,
	userId?: FieldPolicy<any> | FieldReadFunction<any>
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
export type LeaguePositionKeySpecifier = ('id' | 'league' | 'leagueId' | 'nodeId' | 'positionType' | 'teamMembersByPositionId' | LeaguePositionKeySpecifier)[];
export type LeaguePositionFieldPolicy = {
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	positionType?: FieldPolicy<any> | FieldReadFunction<any>,
	teamMembersByPositionId?: FieldPolicy<any> | FieldReadFunction<any>
};
export type LeaguePositionsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | LeaguePositionsConnectionKeySpecifier)[];
export type LeaguePositionsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type LeaguePositionsEdgeKeySpecifier = ('cursor' | 'node' | LeaguePositionsEdgeKeySpecifier)[];
export type LeaguePositionsEdgeFieldPolicy = {
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
export type MatchupKeySpecifier = ('id' | 'leagueById' | 'leagueId' | 'leaguesByCurrentMatchup' | 'matchupPlayers' | 'nodeId' | 'numberOfGames' | 'weekNumber' | MatchupKeySpecifier)[];
export type MatchupFieldPolicy = {
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueById?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	leaguesByCurrentMatchup?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayers?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	numberOfGames?: FieldPolicy<any> | FieldReadFunction<any>,
	weekNumber?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MatchupBattingKeySpecifier = ('ab' | 'bb' | 'cs' | 'doubles' | 'gidp' | 'h' | 'hbp' | 'hr' | 'ibb' | 'matchupPlayer' | 'matchupPlayerId' | 'pa' | 'playerId' | 'r' | 'rbi' | 'sb' | 'sf' | 'sh' | 'so' | 'triples' | MatchupBattingKeySpecifier)[];
export type MatchupBattingFieldPolicy = {
	ab?: FieldPolicy<any> | FieldReadFunction<any>,
	bb?: FieldPolicy<any> | FieldReadFunction<any>,
	cs?: FieldPolicy<any> | FieldReadFunction<any>,
	doubles?: FieldPolicy<any> | FieldReadFunction<any>,
	gidp?: FieldPolicy<any> | FieldReadFunction<any>,
	h?: FieldPolicy<any> | FieldReadFunction<any>,
	hbp?: FieldPolicy<any> | FieldReadFunction<any>,
	hr?: FieldPolicy<any> | FieldReadFunction<any>,
	ibb?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerId?: FieldPolicy<any> | FieldReadFunction<any>,
	pa?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	r?: FieldPolicy<any> | FieldReadFunction<any>,
	rbi?: FieldPolicy<any> | FieldReadFunction<any>,
	sb?: FieldPolicy<any> | FieldReadFunction<any>,
	sf?: FieldPolicy<any> | FieldReadFunction<any>,
	sh?: FieldPolicy<any> | FieldReadFunction<any>,
	so?: FieldPolicy<any> | FieldReadFunction<any>,
	triples?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MatchupBattingsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | MatchupBattingsConnectionKeySpecifier)[];
export type MatchupBattingsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MatchupBattingsEdgeKeySpecifier = ('cursor' | 'node' | MatchupBattingsEdgeKeySpecifier)[];
export type MatchupBattingsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MatchupFieldingKeySpecifier = ('a' | 'chances' | 'dpDef' | 'eDef' | 'innDef' | 'matchupPlayer' | 'matchupPlayerId' | 'playerId' | 'po' | MatchupFieldingKeySpecifier)[];
export type MatchupFieldingFieldPolicy = {
	a?: FieldPolicy<any> | FieldReadFunction<any>,
	chances?: FieldPolicy<any> | FieldReadFunction<any>,
	dpDef?: FieldPolicy<any> | FieldReadFunction<any>,
	eDef?: FieldPolicy<any> | FieldReadFunction<any>,
	innDef?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerId?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	po?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MatchupFieldingsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | MatchupFieldingsConnectionKeySpecifier)[];
export type MatchupFieldingsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MatchupFieldingsEdgeKeySpecifier = ('cursor' | 'node' | MatchupFieldingsEdgeKeySpecifier)[];
export type MatchupFieldingsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MatchupPitchingKeySpecifier = ('battersFaced' | 'bb' | 'cg' | 'er' | 'gf' | 'gs' | 'h' | 'hbp' | 'hr' | 'ibb' | 'ip' | 'l' | 'matchupPlayer' | 'matchupPlayerId' | 'outsRecorded' | 'playerId' | 'r' | 'sho' | 'so' | 'sv' | 'w' | MatchupPitchingKeySpecifier)[];
export type MatchupPitchingFieldPolicy = {
	battersFaced?: FieldPolicy<any> | FieldReadFunction<any>,
	bb?: FieldPolicy<any> | FieldReadFunction<any>,
	cg?: FieldPolicy<any> | FieldReadFunction<any>,
	er?: FieldPolicy<any> | FieldReadFunction<any>,
	gf?: FieldPolicy<any> | FieldReadFunction<any>,
	gs?: FieldPolicy<any> | FieldReadFunction<any>,
	h?: FieldPolicy<any> | FieldReadFunction<any>,
	hbp?: FieldPolicy<any> | FieldReadFunction<any>,
	hr?: FieldPolicy<any> | FieldReadFunction<any>,
	ibb?: FieldPolicy<any> | FieldReadFunction<any>,
	ip?: FieldPolicy<any> | FieldReadFunction<any>,
	l?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerId?: FieldPolicy<any> | FieldReadFunction<any>,
	outsRecorded?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	r?: FieldPolicy<any> | FieldReadFunction<any>,
	sho?: FieldPolicy<any> | FieldReadFunction<any>,
	so?: FieldPolicy<any> | FieldReadFunction<any>,
	sv?: FieldPolicy<any> | FieldReadFunction<any>,
	w?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MatchupPitchingsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | MatchupPitchingsConnectionKeySpecifier)[];
export type MatchupPitchingsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MatchupPitchingsEdgeKeySpecifier = ('cursor' | 'node' | MatchupPitchingsEdgeKeySpecifier)[];
export type MatchupPitchingsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MatchupPlayerKeySpecifier = ('aggregateSeasonBattingByPlayerIdAndSeason' | 'aggregateSeasonFieldingByPlayerIdAndSeason' | 'aggregateSeasonPitchingByPlayerIdAndSeason' | 'id' | 'matchup' | 'matchupBatting' | 'matchupFielding' | 'matchupId' | 'matchupPitching' | 'matchupPlayerGames' | 'nodeId' | 'player' | 'playerId' | 'season' | MatchupPlayerKeySpecifier)[];
export type MatchupPlayerFieldPolicy = {
	aggregateSeasonBattingByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	aggregateSeasonFieldingByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	aggregateSeasonPitchingByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	matchup?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupId?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerGames?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	season?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MatchupPlayerGameKeySpecifier = ('battingGameNum' | 'fieldingGameNum' | 'fieldingGamePos' | 'gameNum' | 'id' | 'matchupPlayer' | 'matchupPlayerId' | 'nodeId' | 'pitchingGameNum' | MatchupPlayerGameKeySpecifier)[];
export type MatchupPlayerGameFieldPolicy = {
	battingGameNum?: FieldPolicy<any> | FieldReadFunction<any>,
	fieldingGameNum?: FieldPolicy<any> | FieldReadFunction<any>,
	fieldingGamePos?: FieldPolicy<any> | FieldReadFunction<any>,
	gameNum?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerId?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	pitchingGameNum?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MatchupPlayerGamesConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | MatchupPlayerGamesConnectionKeySpecifier)[];
export type MatchupPlayerGamesConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MatchupPlayerGamesEdgeKeySpecifier = ('cursor' | 'node' | MatchupPlayerGamesEdgeKeySpecifier)[];
export type MatchupPlayerGamesEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MatchupPlayersConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | MatchupPlayersConnectionKeySpecifier)[];
export type MatchupPlayersConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MatchupPlayersEdgeKeySpecifier = ('cursor' | 'node' | MatchupPlayersEdgeKeySpecifier)[];
export type MatchupPlayersEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MatchupsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | MatchupsConnectionKeySpecifier)[];
export type MatchupsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MatchupsEdgeKeySpecifier = ('cursor' | 'node' | MatchupsEdgeKeySpecifier)[];
export type MatchupsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
};
export type MutationKeySpecifier = ('createDraft' | 'createDraftTeam' | 'createGameBatting' | 'createGameFielding' | 'createGamePitching' | 'createLeague' | 'createLeagueAndTeams' | 'createLeagueMember' | 'createLeagueMessage' | 'createLeaguePosition' | 'createMatchup' | 'createMatchupPlayer' | 'createMatchupPlayerGame' | 'createPlayer' | 'createSeasonBatting' | 'createSeasonFielding' | 'createSeasonPitching' | 'createTeam' | 'createTeamMember' | 'createUser' | 'deleteDraft' | 'deleteDraftByNodeId' | 'deleteDraftTeam' | 'deleteDraftTeamByDraftIdAndDraftOrder' | 'deleteDraftTeamByNodeId' | 'deleteGameBatting' | 'deleteGameBattingByNodeId' | 'deleteGameFielding' | 'deleteGameFieldingByNodeId' | 'deleteGamePitching' | 'deleteGamePitchingByNodeId' | 'deleteLeague' | 'deleteLeagueByNodeId' | 'deleteLeagueMember' | 'deleteLeagueMemberByNodeId' | 'deleteLeagueMessage' | 'deleteLeagueMessageByNodeId' | 'deleteLeaguePosition' | 'deleteLeaguePositionByNodeId' | 'deleteMatchup' | 'deleteMatchupByLeagueIdAndWeekNumber' | 'deleteMatchupByNodeId' | 'deleteMatchupPlayer' | 'deleteMatchupPlayerByMatchupIdAndPlayerId' | 'deleteMatchupPlayerByNodeId' | 'deleteMatchupPlayerGame' | 'deleteMatchupPlayerGameByNodeId' | 'deletePlayer' | 'deletePlayerByBrefId' | 'deletePlayerByNodeId' | 'deleteSeasonBatting' | 'deleteSeasonBattingByNodeId' | 'deleteSeasonFielding' | 'deleteSeasonFieldingByNodeId' | 'deleteSeasonPitching' | 'deleteSeasonPitchingByNodeId' | 'deleteTeam' | 'deleteTeamByIdAndLeagueId' | 'deleteTeamByNodeId' | 'deleteTeamMember' | 'deleteTeamMemberByNodeId' | 'deleteUser' | 'deleteUserByEmail' | 'deleteUserByNodeId' | 'isMajorLeague' | 'updateDraft' | 'updateDraftByNodeId' | 'updateDraftTeam' | 'updateDraftTeamByDraftIdAndDraftOrder' | 'updateDraftTeamByNodeId' | 'updateGameBatting' | 'updateGameBattingByNodeId' | 'updateGameFielding' | 'updateGameFieldingByNodeId' | 'updateGamePitching' | 'updateGamePitchingByNodeId' | 'updateLeague' | 'updateLeagueByNodeId' | 'updateLeagueMember' | 'updateLeagueMemberByNodeId' | 'updateLeagueMessage' | 'updateLeagueMessageByNodeId' | 'updateLeaguePosition' | 'updateLeaguePositionByNodeId' | 'updateMatchup' | 'updateMatchupByLeagueIdAndWeekNumber' | 'updateMatchupByNodeId' | 'updateMatchupPlayer' | 'updateMatchupPlayerByMatchupIdAndPlayerId' | 'updateMatchupPlayerByNodeId' | 'updateMatchupPlayerGame' | 'updateMatchupPlayerGameByNodeId' | 'updatePlayer' | 'updatePlayerByBrefId' | 'updatePlayerByNodeId' | 'updateSeasonBatting' | 'updateSeasonBattingByNodeId' | 'updateSeasonFielding' | 'updateSeasonFieldingByNodeId' | 'updateSeasonPitching' | 'updateSeasonPitchingByNodeId' | 'updateTeam' | 'updateTeamByIdAndLeagueId' | 'updateTeamByNodeId' | 'updateTeamMember' | 'updateTeamMemberByNodeId' | 'updateUser' | 'updateUserByEmail' | 'updateUserByNodeId' | 'upsertDraft' | 'upsertDraftTeam' | 'upsertGameBatting' | 'upsertGameFielding' | 'upsertGamePitching' | 'upsertLeague' | 'upsertLeagueMember' | 'upsertLeagueMessage' | 'upsertLeaguePosition' | 'upsertMatchup' | 'upsertMatchupPlayer' | 'upsertMatchupPlayerGame' | 'upsertPlayer' | 'upsertSeasonBatting' | 'upsertSeasonFielding' | 'upsertSeasonPitching' | 'upsertTeam' | 'upsertTeamMember' | 'upsertUser' | MutationKeySpecifier)[];
export type MutationFieldPolicy = {
	createDraft?: FieldPolicy<any> | FieldReadFunction<any>,
	createDraftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	createGameBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	createGameFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	createGamePitching?: FieldPolicy<any> | FieldReadFunction<any>,
	createLeague?: FieldPolicy<any> | FieldReadFunction<any>,
	createLeagueAndTeams?: FieldPolicy<any> | FieldReadFunction<any>,
	createLeagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	createLeagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	createLeaguePosition?: FieldPolicy<any> | FieldReadFunction<any>,
	createMatchup?: FieldPolicy<any> | FieldReadFunction<any>,
	createMatchupPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	createMatchupPlayerGame?: FieldPolicy<any> | FieldReadFunction<any>,
	createPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	createSeasonBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	createSeasonFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	createSeasonPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	createTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	createTeamMember?: FieldPolicy<any> | FieldReadFunction<any>,
	createUser?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraft?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraftByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraftTeamByDraftIdAndDraftOrder?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteDraftTeamByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteGameBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteGameBattingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteGameFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteGameFieldingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteGamePitching?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteGamePitchingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeague?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeagueByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeagueMemberByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeagueMessageByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeaguePosition?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteLeaguePositionByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteMatchup?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteMatchupByLeagueIdAndWeekNumber?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteMatchupByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteMatchupPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteMatchupPlayerByMatchupIdAndPlayerId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteMatchupPlayerByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteMatchupPlayerGame?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteMatchupPlayerGameByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
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
	deleteTeamMember?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteTeamMemberByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteUser?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteUserByEmail?: FieldPolicy<any> | FieldReadFunction<any>,
	deleteUserByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	isMajorLeague?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraft?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraftByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraftTeamByDraftIdAndDraftOrder?: FieldPolicy<any> | FieldReadFunction<any>,
	updateDraftTeamByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateGameBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	updateGameBattingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateGameFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	updateGameFieldingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateGamePitching?: FieldPolicy<any> | FieldReadFunction<any>,
	updateGamePitchingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeague?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeagueByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeagueMemberByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeagueMessageByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeaguePosition?: FieldPolicy<any> | FieldReadFunction<any>,
	updateLeaguePositionByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateMatchup?: FieldPolicy<any> | FieldReadFunction<any>,
	updateMatchupByLeagueIdAndWeekNumber?: FieldPolicy<any> | FieldReadFunction<any>,
	updateMatchupByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateMatchupPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	updateMatchupPlayerByMatchupIdAndPlayerId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateMatchupPlayerByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateMatchupPlayerGame?: FieldPolicy<any> | FieldReadFunction<any>,
	updateMatchupPlayerGameByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
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
	updateTeamMember?: FieldPolicy<any> | FieldReadFunction<any>,
	updateTeamMemberByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	updateUser?: FieldPolicy<any> | FieldReadFunction<any>,
	updateUserByEmail?: FieldPolicy<any> | FieldReadFunction<any>,
	updateUserByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertDraft?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertDraftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertGameBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertGameFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertGamePitching?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertLeague?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertLeagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertLeagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertLeaguePosition?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertMatchup?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertMatchupPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertMatchupPlayerGame?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertSeasonBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertSeasonFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertSeasonPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	upsertTeamMember?: FieldPolicy<any> | FieldReadFunction<any>,
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
export type PlayerKeySpecifier = ('aggregateSeasonBattings' | 'aggregateSeasonFieldingByPos' | 'aggregateSeasonFieldings' | 'aggregateSeasonPitchings' | 'brefId' | 'careerBattings' | 'careerFieldingByPositions' | 'careerFieldings' | 'careerPitchings' | 'gameBattings' | 'gameFieldings' | 'gamePitchings' | 'id' | 'matchupPlayers' | 'name' | 'nodeId' | 'playerEligiblePositions' | 'seasonBattings' | 'seasonFieldings' | 'seasonPitchings' | 'teamMembers' | PlayerKeySpecifier)[];
export type PlayerFieldPolicy = {
	aggregateSeasonBattings?: FieldPolicy<any> | FieldReadFunction<any>,
	aggregateSeasonFieldingByPos?: FieldPolicy<any> | FieldReadFunction<any>,
	aggregateSeasonFieldings?: FieldPolicy<any> | FieldReadFunction<any>,
	aggregateSeasonPitchings?: FieldPolicy<any> | FieldReadFunction<any>,
	brefId?: FieldPolicy<any> | FieldReadFunction<any>,
	careerBattings?: FieldPolicy<any> | FieldReadFunction<any>,
	careerFieldingByPositions?: FieldPolicy<any> | FieldReadFunction<any>,
	careerFieldings?: FieldPolicy<any> | FieldReadFunction<any>,
	careerPitchings?: FieldPolicy<any> | FieldReadFunction<any>,
	gameBattings?: FieldPolicy<any> | FieldReadFunction<any>,
	gameFieldings?: FieldPolicy<any> | FieldReadFunction<any>,
	gamePitchings?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayers?: FieldPolicy<any> | FieldReadFunction<any>,
	name?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	playerEligiblePositions?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonBattings?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonFieldings?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitchings?: FieldPolicy<any> | FieldReadFunction<any>,
	teamMembers?: FieldPolicy<any> | FieldReadFunction<any>
};
export type PlayerEligiblePositionKeySpecifier = ('player' | 'playerId' | 'position' | PlayerEligiblePositionKeySpecifier)[];
export type PlayerEligiblePositionFieldPolicy = {
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	position?: FieldPolicy<any> | FieldReadFunction<any>
};
export type PlayerEligiblePositionsConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | PlayerEligiblePositionsConnectionKeySpecifier)[];
export type PlayerEligiblePositionsConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type PlayerEligiblePositionsEdgeKeySpecifier = ('cursor' | 'node' | PlayerEligiblePositionsEdgeKeySpecifier)[];
export type PlayerEligiblePositionsEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
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
export type QueryKeySpecifier = ('aggregateSeasonBattings' | 'aggregateSeasonFieldingByPos' | 'aggregateSeasonFieldings' | 'aggregateSeasonPitchings' | 'careerBattings' | 'careerFieldingByPositions' | 'careerFieldings' | 'careerPitchings' | 'draft' | 'draftByNodeId' | 'draftTeam' | 'draftTeamByDraftIdAndDraftOrder' | 'draftTeamByNodeId' | 'draftTeams' | 'drafts' | 'gameBatting' | 'gameBattingByNodeId' | 'gameBattings' | 'gameFielding' | 'gameFieldingByNodeId' | 'gameFieldings' | 'gamePitching' | 'gamePitchingByNodeId' | 'gamePitchings' | 'league' | 'leagueByNodeId' | 'leagueMember' | 'leagueMemberByNodeId' | 'leagueMembers' | 'leagueMessage' | 'leagueMessageByNodeId' | 'leagueMessages' | 'leaguePosition' | 'leaguePositionByNodeId' | 'leaguePositions' | 'leagues' | 'matchup' | 'matchupBattingByMatchupPlayerId' | 'matchupBattings' | 'matchupByLeagueIdAndWeekNumber' | 'matchupByNodeId' | 'matchupFieldingByMatchupPlayerId' | 'matchupFieldings' | 'matchupPitchingByMatchupPlayerId' | 'matchupPitchings' | 'matchupPlayer' | 'matchupPlayerByMatchupIdAndPlayerId' | 'matchupPlayerByNodeId' | 'matchupPlayerGame' | 'matchupPlayerGameByNodeId' | 'matchupPlayerGames' | 'matchupPlayers' | 'matchups' | 'node' | 'nodeId' | 'player' | 'playerByBrefId' | 'playerByNodeId' | 'playerEligiblePositions' | 'players' | 'query' | 'seasonBatting' | 'seasonBattingByNodeId' | 'seasonBattings' | 'seasonFielding' | 'seasonFieldingByNodeId' | 'seasonFieldings' | 'seasonPitching' | 'seasonPitchingByNodeId' | 'seasonPitchings' | 'team' | 'teamByIdAndLeagueId' | 'teamByNodeId' | 'teamMember' | 'teamMemberByNodeId' | 'teamMembers' | 'teams' | 'user' | 'userByEmail' | 'userByNodeId' | 'users' | QueryKeySpecifier)[];
export type QueryFieldPolicy = {
	aggregateSeasonBattings?: FieldPolicy<any> | FieldReadFunction<any>,
	aggregateSeasonFieldingByPos?: FieldPolicy<any> | FieldReadFunction<any>,
	aggregateSeasonFieldings?: FieldPolicy<any> | FieldReadFunction<any>,
	aggregateSeasonPitchings?: FieldPolicy<any> | FieldReadFunction<any>,
	careerBattings?: FieldPolicy<any> | FieldReadFunction<any>,
	careerFieldingByPositions?: FieldPolicy<any> | FieldReadFunction<any>,
	careerFieldings?: FieldPolicy<any> | FieldReadFunction<any>,
	careerPitchings?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamByDraftIdAndDraftOrder?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeams?: FieldPolicy<any> | FieldReadFunction<any>,
	drafts?: FieldPolicy<any> | FieldReadFunction<any>,
	gameBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	gameBattingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	gameBattings?: FieldPolicy<any> | FieldReadFunction<any>,
	gameFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	gameFieldingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	gameFieldings?: FieldPolicy<any> | FieldReadFunction<any>,
	gamePitching?: FieldPolicy<any> | FieldReadFunction<any>,
	gamePitchingByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	gamePitchings?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMember?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMemberByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMembers?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessageByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessages?: FieldPolicy<any> | FieldReadFunction<any>,
	leaguePosition?: FieldPolicy<any> | FieldReadFunction<any>,
	leaguePositionByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	leaguePositions?: FieldPolicy<any> | FieldReadFunction<any>,
	leagues?: FieldPolicy<any> | FieldReadFunction<any>,
	matchup?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupBattingByMatchupPlayerId?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupBattings?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupByLeagueIdAndWeekNumber?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupFieldingByMatchupPlayerId?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupFieldings?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPitchingByMatchupPlayerId?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPitchings?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerByMatchupIdAndPlayerId?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerGame?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerGameByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerGames?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayers?: FieldPolicy<any> | FieldReadFunction<any>,
	matchups?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerByBrefId?: FieldPolicy<any> | FieldReadFunction<any>,
	playerByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	playerEligiblePositions?: FieldPolicy<any> | FieldReadFunction<any>,
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
	teamMember?: FieldPolicy<any> | FieldReadFunction<any>,
	teamMemberByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	teamMembers?: FieldPolicy<any> | FieldReadFunction<any>,
	teams?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>,
	userByEmail?: FieldPolicy<any> | FieldReadFunction<any>,
	userByNodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	users?: FieldPolicy<any> | FieldReadFunction<any>
};
export type SeasonBattingKeySpecifier = ('ab' | 'awardSummary' | 'battingAvg' | 'bb' | 'cs' | 'doubles' | 'g' | 'gidp' | 'h' | 'hbp' | 'hr' | 'ibb' | 'lgId' | 'nodeId' | 'onbasePerc' | 'onbasePlusSlugging' | 'onbasePlusSluggingPlus' | 'pa' | 'player' | 'playerId' | 'posSeason' | 'r' | 'rbi' | 'rowId' | 'sb' | 'season' | 'sf' | 'sh' | 'sluggingPerc' | 'so' | 'tb' | 'team' | 'triples' | SeasonBattingKeySpecifier)[];
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
	rowId?: FieldPolicy<any> | FieldReadFunction<any>,
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
export type SeasonFieldingKeySpecifier = ('a' | 'awardSummary' | 'caughtStealingPerc' | 'caughtStealingPercLg' | 'cg' | 'chances' | 'cs' | 'dpDef' | 'eDef' | 'fieldingPerc' | 'fieldingPercLg' | 'g' | 'gOfParts' | 'gs' | 'innDef' | 'lgId' | 'nodeId' | 'pickoffs' | 'player' | 'playerId' | 'po' | 'pos' | 'rangeFactorPerGame' | 'rangeFactorPerGameLg' | 'rangeFactorPerNine' | 'rangeFactorPerNineLg' | 'rowId' | 'sb' | 'season' | 'team' | 'wp' | SeasonFieldingKeySpecifier)[];
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
	rowId?: FieldPolicy<any> | FieldReadFunction<any>,
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
export type SeasonPitchingKeySpecifier = ('awardSummary' | 'basesOnBallsPerNine' | 'battersFaced' | 'bb' | 'bk' | 'cg' | 'earnedRunAvg' | 'earnedRunAvgPlus' | 'er' | 'fip' | 'g' | 'gf' | 'gs' | 'h' | 'hbp' | 'hitsPerNine' | 'homeRunsPerNine' | 'hr' | 'ibb' | 'ip' | 'l' | 'lgId' | 'nodeId' | 'outsRecorded' | 'player' | 'playerId' | 'r' | 'rowId' | 'season' | 'sho' | 'so' | 'strikeoutsPerBaseOnBalls' | 'strikeoutsPerNine' | 'sv' | 'team' | 'w' | 'whip' | 'winLossPerc' | 'wp' | SeasonPitchingKeySpecifier)[];
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
	outsRecorded?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	r?: FieldPolicy<any> | FieldReadFunction<any>,
	rowId?: FieldPolicy<any> | FieldReadFunction<any>,
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
export type TeamKeySpecifier = ('draftTeamsByTeamIdAndLeagueId' | 'id' | 'league' | 'leagueId' | 'name' | 'nodeId' | 'teamMembers' | TeamKeySpecifier)[];
export type TeamFieldPolicy = {
	draftTeamsByTeamIdAndLeagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	name?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	teamMembers?: FieldPolicy<any> | FieldReadFunction<any>
};
export type TeamMemberKeySpecifier = ('id' | 'league' | 'leagueId' | 'nodeId' | 'player' | 'playerId' | 'position' | 'positionId' | 'team' | 'teamId' | TeamMemberKeySpecifier)[];
export type TeamMemberFieldPolicy = {
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueId?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	playerId?: FieldPolicy<any> | FieldReadFunction<any>,
	position?: FieldPolicy<any> | FieldReadFunction<any>,
	positionId?: FieldPolicy<any> | FieldReadFunction<any>,
	team?: FieldPolicy<any> | FieldReadFunction<any>,
	teamId?: FieldPolicy<any> | FieldReadFunction<any>
};
export type TeamMembersConnectionKeySpecifier = ('edges' | 'nodes' | 'pageInfo' | 'totalCount' | TeamMembersConnectionKeySpecifier)[];
export type TeamMembersConnectionFieldPolicy = {
	edges?: FieldPolicy<any> | FieldReadFunction<any>,
	nodes?: FieldPolicy<any> | FieldReadFunction<any>,
	pageInfo?: FieldPolicy<any> | FieldReadFunction<any>,
	totalCount?: FieldPolicy<any> | FieldReadFunction<any>
};
export type TeamMembersEdgeKeySpecifier = ('cursor' | 'node' | TeamMembersEdgeKeySpecifier)[];
export type TeamMembersEdgeFieldPolicy = {
	cursor?: FieldPolicy<any> | FieldReadFunction<any>,
	node?: FieldPolicy<any> | FieldReadFunction<any>
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
export type UpdateDraftTeamPayloadKeySpecifier = ('clientMutationId' | 'draft' | 'draftTeam' | 'draftTeamEdge' | 'query' | 'teamLeague' | UpdateDraftTeamPayloadKeySpecifier)[];
export type UpdateDraftTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	teamLeague?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateGameBattingPayloadKeySpecifier = ('clientMutationId' | 'gameBatting' | 'gameBattingEdge' | 'player' | 'query' | UpdateGameBattingPayloadKeySpecifier)[];
export type UpdateGameBattingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	gameBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	gameBattingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateGameFieldingPayloadKeySpecifier = ('clientMutationId' | 'gameFielding' | 'gameFieldingEdge' | 'player' | 'query' | UpdateGameFieldingPayloadKeySpecifier)[];
export type UpdateGameFieldingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	gameFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	gameFieldingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateGamePitchingPayloadKeySpecifier = ('clientMutationId' | 'gamePitching' | 'gamePitchingEdge' | 'player' | 'query' | UpdateGamePitchingPayloadKeySpecifier)[];
export type UpdateGamePitchingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	gamePitching?: FieldPolicy<any> | FieldReadFunction<any>,
	gamePitchingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
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
export type UpdateLeagueMessagePayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueMessage' | 'leagueMessageEdge' | 'query' | 'user' | UpdateLeagueMessagePayloadKeySpecifier)[];
export type UpdateLeagueMessagePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessageEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateLeaguePayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueEdge' | 'matchupByCurrentMatchup' | 'query' | 'userByOwner' | UpdateLeaguePayloadKeySpecifier)[];
export type UpdateLeaguePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupByCurrentMatchup?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	userByOwner?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateLeaguePositionPayloadKeySpecifier = ('clientMutationId' | 'league' | 'leaguePosition' | 'leaguePositionEdge' | 'query' | UpdateLeaguePositionPayloadKeySpecifier)[];
export type UpdateLeaguePositionPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leaguePosition?: FieldPolicy<any> | FieldReadFunction<any>,
	leaguePositionEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateMatchupPayloadKeySpecifier = ('clientMutationId' | 'leagueById' | 'matchup' | 'matchupEdge' | 'query' | UpdateMatchupPayloadKeySpecifier)[];
export type UpdateMatchupPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueById?: FieldPolicy<any> | FieldReadFunction<any>,
	matchup?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateMatchupPlayerGamePayloadKeySpecifier = ('clientMutationId' | 'matchupPlayer' | 'matchupPlayerGame' | 'matchupPlayerGameEdge' | 'query' | UpdateMatchupPlayerGamePayloadKeySpecifier)[];
export type UpdateMatchupPlayerGamePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerGame?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerGameEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateMatchupPlayerPayloadKeySpecifier = ('aggregateSeasonBattingByPlayerIdAndSeason' | 'aggregateSeasonFieldingByPlayerIdAndSeason' | 'aggregateSeasonPitchingByPlayerIdAndSeason' | 'clientMutationId' | 'matchup' | 'matchupPlayer' | 'matchupPlayerEdge' | 'player' | 'query' | UpdateMatchupPlayerPayloadKeySpecifier)[];
export type UpdateMatchupPlayerPayloadFieldPolicy = {
	aggregateSeasonBattingByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	aggregateSeasonFieldingByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	aggregateSeasonPitchingByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	matchup?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
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
export type UpdateSeasonPitchingPayloadKeySpecifier = ('clientMutationId' | 'player' | 'query' | 'seasonPitching' | 'seasonPitchingEdge' | UpdateSeasonPitchingPayloadKeySpecifier)[];
export type UpdateSeasonPitchingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitchingEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpdateTeamMemberPayloadKeySpecifier = ('clientMutationId' | 'league' | 'player' | 'position' | 'query' | 'team' | 'teamMember' | 'teamMemberEdge' | UpdateTeamMemberPayloadKeySpecifier)[];
export type UpdateTeamMemberPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	position?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	team?: FieldPolicy<any> | FieldReadFunction<any>,
	teamMember?: FieldPolicy<any> | FieldReadFunction<any>,
	teamMemberEdge?: FieldPolicy<any> | FieldReadFunction<any>
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
export type UpsertDraftTeamPayloadKeySpecifier = ('clientMutationId' | 'draft' | 'draftTeam' | 'draftTeamEdge' | 'query' | 'teamLeague' | UpsertDraftTeamPayloadKeySpecifier)[];
export type UpsertDraftTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	draft?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeam?: FieldPolicy<any> | FieldReadFunction<any>,
	draftTeamEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	teamLeague?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertGameBattingPayloadKeySpecifier = ('clientMutationId' | 'gameBatting' | 'gameBattingEdge' | 'player' | 'query' | UpsertGameBattingPayloadKeySpecifier)[];
export type UpsertGameBattingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	gameBatting?: FieldPolicy<any> | FieldReadFunction<any>,
	gameBattingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertGameFieldingPayloadKeySpecifier = ('clientMutationId' | 'gameFielding' | 'gameFieldingEdge' | 'player' | 'query' | UpsertGameFieldingPayloadKeySpecifier)[];
export type UpsertGameFieldingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	gameFielding?: FieldPolicy<any> | FieldReadFunction<any>,
	gameFieldingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertGamePitchingPayloadKeySpecifier = ('clientMutationId' | 'gamePitching' | 'gamePitchingEdge' | 'player' | 'query' | UpsertGamePitchingPayloadKeySpecifier)[];
export type UpsertGamePitchingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	gamePitching?: FieldPolicy<any> | FieldReadFunction<any>,
	gamePitchingEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
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
export type UpsertLeagueMessagePayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueMessage' | 'leagueMessageEdge' | 'query' | 'user' | UpsertLeagueMessagePayloadKeySpecifier)[];
export type UpsertLeagueMessagePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessage?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessageEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertLeaguePayloadKeySpecifier = ('clientMutationId' | 'league' | 'leagueEdge' | 'matchupByCurrentMatchup' | 'query' | 'userByOwner' | UpsertLeaguePayloadKeySpecifier)[];
export type UpsertLeaguePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupByCurrentMatchup?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	userByOwner?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertLeaguePositionPayloadKeySpecifier = ('clientMutationId' | 'league' | 'leaguePosition' | 'leaguePositionEdge' | 'query' | UpsertLeaguePositionPayloadKeySpecifier)[];
export type UpsertLeaguePositionPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	leaguePosition?: FieldPolicy<any> | FieldReadFunction<any>,
	leaguePositionEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertMatchupPayloadKeySpecifier = ('clientMutationId' | 'leagueById' | 'matchup' | 'matchupEdge' | 'query' | UpsertMatchupPayloadKeySpecifier)[];
export type UpsertMatchupPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueById?: FieldPolicy<any> | FieldReadFunction<any>,
	matchup?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertMatchupPlayerGamePayloadKeySpecifier = ('clientMutationId' | 'matchupPlayer' | 'matchupPlayerGame' | 'matchupPlayerGameEdge' | 'query' | UpsertMatchupPlayerGamePayloadKeySpecifier)[];
export type UpsertMatchupPlayerGamePayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerGame?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerGameEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertMatchupPlayerPayloadKeySpecifier = ('aggregateSeasonBattingByPlayerIdAndSeason' | 'aggregateSeasonFieldingByPlayerIdAndSeason' | 'aggregateSeasonPitchingByPlayerIdAndSeason' | 'clientMutationId' | 'matchup' | 'matchupPlayer' | 'matchupPlayerEdge' | 'player' | 'query' | UpsertMatchupPlayerPayloadKeySpecifier)[];
export type UpsertMatchupPlayerPayloadFieldPolicy = {
	aggregateSeasonBattingByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	aggregateSeasonFieldingByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	aggregateSeasonPitchingByPlayerIdAndSeason?: FieldPolicy<any> | FieldReadFunction<any>,
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	matchup?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayer?: FieldPolicy<any> | FieldReadFunction<any>,
	matchupPlayerEdge?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
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
export type UpsertSeasonPitchingPayloadKeySpecifier = ('clientMutationId' | 'player' | 'query' | 'seasonPitching' | 'seasonPitchingEdge' | UpsertSeasonPitchingPayloadKeySpecifier)[];
export type UpsertSeasonPitchingPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitching?: FieldPolicy<any> | FieldReadFunction<any>,
	seasonPitchingEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertTeamMemberPayloadKeySpecifier = ('clientMutationId' | 'league' | 'player' | 'position' | 'query' | 'team' | 'teamMember' | 'teamMemberEdge' | UpsertTeamMemberPayloadKeySpecifier)[];
export type UpsertTeamMemberPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	player?: FieldPolicy<any> | FieldReadFunction<any>,
	position?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	team?: FieldPolicy<any> | FieldReadFunction<any>,
	teamMember?: FieldPolicy<any> | FieldReadFunction<any>,
	teamMemberEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertTeamPayloadKeySpecifier = ('clientMutationId' | 'league' | 'query' | 'team' | 'teamEdge' | UpsertTeamPayloadKeySpecifier)[];
export type UpsertTeamPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	league?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	team?: FieldPolicy<any> | FieldReadFunction<any>,
	teamEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UpsertUserPayloadKeySpecifier = ('clientMutationId' | 'query' | 'user' | 'userEdge' | UpsertUserPayloadKeySpecifier)[];
export type UpsertUserPayloadFieldPolicy = {
	clientMutationId?: FieldPolicy<any> | FieldReadFunction<any>,
	query?: FieldPolicy<any> | FieldReadFunction<any>,
	user?: FieldPolicy<any> | FieldReadFunction<any>,
	userEdge?: FieldPolicy<any> | FieldReadFunction<any>
};
export type UserKeySpecifier = ('accessLevel' | 'email' | 'id' | 'leagueMembers' | 'leagueMessages' | 'leaguesByOwner' | 'nodeId' | 'username' | UserKeySpecifier)[];
export type UserFieldPolicy = {
	accessLevel?: FieldPolicy<any> | FieldReadFunction<any>,
	email?: FieldPolicy<any> | FieldReadFunction<any>,
	id?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMembers?: FieldPolicy<any> | FieldReadFunction<any>,
	leagueMessages?: FieldPolicy<any> | FieldReadFunction<any>,
	leaguesByOwner?: FieldPolicy<any> | FieldReadFunction<any>,
	nodeId?: FieldPolicy<any> | FieldReadFunction<any>,
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
	AggregateSeasonBatting?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | AggregateSeasonBattingKeySpecifier | (() => undefined | AggregateSeasonBattingKeySpecifier),
		fields?: AggregateSeasonBattingFieldPolicy,
	},
	AggregateSeasonBattingsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | AggregateSeasonBattingsConnectionKeySpecifier | (() => undefined | AggregateSeasonBattingsConnectionKeySpecifier),
		fields?: AggregateSeasonBattingsConnectionFieldPolicy,
	},
	AggregateSeasonBattingsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | AggregateSeasonBattingsEdgeKeySpecifier | (() => undefined | AggregateSeasonBattingsEdgeKeySpecifier),
		fields?: AggregateSeasonBattingsEdgeFieldPolicy,
	},
	AggregateSeasonFielding?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | AggregateSeasonFieldingKeySpecifier | (() => undefined | AggregateSeasonFieldingKeySpecifier),
		fields?: AggregateSeasonFieldingFieldPolicy,
	},
	AggregateSeasonFieldingByPo?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | AggregateSeasonFieldingByPoKeySpecifier | (() => undefined | AggregateSeasonFieldingByPoKeySpecifier),
		fields?: AggregateSeasonFieldingByPoFieldPolicy,
	},
	AggregateSeasonFieldingByPosConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | AggregateSeasonFieldingByPosConnectionKeySpecifier | (() => undefined | AggregateSeasonFieldingByPosConnectionKeySpecifier),
		fields?: AggregateSeasonFieldingByPosConnectionFieldPolicy,
	},
	AggregateSeasonFieldingByPosEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | AggregateSeasonFieldingByPosEdgeKeySpecifier | (() => undefined | AggregateSeasonFieldingByPosEdgeKeySpecifier),
		fields?: AggregateSeasonFieldingByPosEdgeFieldPolicy,
	},
	AggregateSeasonFieldingsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | AggregateSeasonFieldingsConnectionKeySpecifier | (() => undefined | AggregateSeasonFieldingsConnectionKeySpecifier),
		fields?: AggregateSeasonFieldingsConnectionFieldPolicy,
	},
	AggregateSeasonFieldingsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | AggregateSeasonFieldingsEdgeKeySpecifier | (() => undefined | AggregateSeasonFieldingsEdgeKeySpecifier),
		fields?: AggregateSeasonFieldingsEdgeFieldPolicy,
	},
	AggregateSeasonPitching?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | AggregateSeasonPitchingKeySpecifier | (() => undefined | AggregateSeasonPitchingKeySpecifier),
		fields?: AggregateSeasonPitchingFieldPolicy,
	},
	AggregateSeasonPitchingsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | AggregateSeasonPitchingsConnectionKeySpecifier | (() => undefined | AggregateSeasonPitchingsConnectionKeySpecifier),
		fields?: AggregateSeasonPitchingsConnectionFieldPolicy,
	},
	AggregateSeasonPitchingsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | AggregateSeasonPitchingsEdgeKeySpecifier | (() => undefined | AggregateSeasonPitchingsEdgeKeySpecifier),
		fields?: AggregateSeasonPitchingsEdgeFieldPolicy,
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
	CareerFieldingByPosition?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CareerFieldingByPositionKeySpecifier | (() => undefined | CareerFieldingByPositionKeySpecifier),
		fields?: CareerFieldingByPositionFieldPolicy,
	},
	CareerFieldingByPositionsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CareerFieldingByPositionsConnectionKeySpecifier | (() => undefined | CareerFieldingByPositionsConnectionKeySpecifier),
		fields?: CareerFieldingByPositionsConnectionFieldPolicy,
	},
	CareerFieldingByPositionsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CareerFieldingByPositionsEdgeKeySpecifier | (() => undefined | CareerFieldingByPositionsEdgeKeySpecifier),
		fields?: CareerFieldingByPositionsEdgeFieldPolicy,
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
	CreateDraftPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateDraftPayloadKeySpecifier | (() => undefined | CreateDraftPayloadKeySpecifier),
		fields?: CreateDraftPayloadFieldPolicy,
	},
	CreateDraftTeamPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateDraftTeamPayloadKeySpecifier | (() => undefined | CreateDraftTeamPayloadKeySpecifier),
		fields?: CreateDraftTeamPayloadFieldPolicy,
	},
	CreateGameBattingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateGameBattingPayloadKeySpecifier | (() => undefined | CreateGameBattingPayloadKeySpecifier),
		fields?: CreateGameBattingPayloadFieldPolicy,
	},
	CreateGameFieldingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateGameFieldingPayloadKeySpecifier | (() => undefined | CreateGameFieldingPayloadKeySpecifier),
		fields?: CreateGameFieldingPayloadFieldPolicy,
	},
	CreateGamePitchingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateGamePitchingPayloadKeySpecifier | (() => undefined | CreateGamePitchingPayloadKeySpecifier),
		fields?: CreateGamePitchingPayloadFieldPolicy,
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
	CreateLeaguePositionPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateLeaguePositionPayloadKeySpecifier | (() => undefined | CreateLeaguePositionPayloadKeySpecifier),
		fields?: CreateLeaguePositionPayloadFieldPolicy,
	},
	CreateMatchupPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateMatchupPayloadKeySpecifier | (() => undefined | CreateMatchupPayloadKeySpecifier),
		fields?: CreateMatchupPayloadFieldPolicy,
	},
	CreateMatchupPlayerGamePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateMatchupPlayerGamePayloadKeySpecifier | (() => undefined | CreateMatchupPlayerGamePayloadKeySpecifier),
		fields?: CreateMatchupPlayerGamePayloadFieldPolicy,
	},
	CreateMatchupPlayerPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateMatchupPlayerPayloadKeySpecifier | (() => undefined | CreateMatchupPlayerPayloadKeySpecifier),
		fields?: CreateMatchupPlayerPayloadFieldPolicy,
	},
	CreatePlayerPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreatePlayerPayloadKeySpecifier | (() => undefined | CreatePlayerPayloadKeySpecifier),
		fields?: CreatePlayerPayloadFieldPolicy,
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
	CreateTeamMemberPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | CreateTeamMemberPayloadKeySpecifier | (() => undefined | CreateTeamMemberPayloadKeySpecifier),
		fields?: CreateTeamMemberPayloadFieldPolicy,
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
	DeleteGameBattingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteGameBattingPayloadKeySpecifier | (() => undefined | DeleteGameBattingPayloadKeySpecifier),
		fields?: DeleteGameBattingPayloadFieldPolicy,
	},
	DeleteGameFieldingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteGameFieldingPayloadKeySpecifier | (() => undefined | DeleteGameFieldingPayloadKeySpecifier),
		fields?: DeleteGameFieldingPayloadFieldPolicy,
	},
	DeleteGamePitchingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteGamePitchingPayloadKeySpecifier | (() => undefined | DeleteGamePitchingPayloadKeySpecifier),
		fields?: DeleteGamePitchingPayloadFieldPolicy,
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
	DeleteLeaguePositionPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteLeaguePositionPayloadKeySpecifier | (() => undefined | DeleteLeaguePositionPayloadKeySpecifier),
		fields?: DeleteLeaguePositionPayloadFieldPolicy,
	},
	DeleteMatchupPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteMatchupPayloadKeySpecifier | (() => undefined | DeleteMatchupPayloadKeySpecifier),
		fields?: DeleteMatchupPayloadFieldPolicy,
	},
	DeleteMatchupPlayerGamePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteMatchupPlayerGamePayloadKeySpecifier | (() => undefined | DeleteMatchupPlayerGamePayloadKeySpecifier),
		fields?: DeleteMatchupPlayerGamePayloadFieldPolicy,
	},
	DeleteMatchupPlayerPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteMatchupPlayerPayloadKeySpecifier | (() => undefined | DeleteMatchupPlayerPayloadKeySpecifier),
		fields?: DeleteMatchupPlayerPayloadFieldPolicy,
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
	DeleteTeamMemberPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | DeleteTeamMemberPayloadKeySpecifier | (() => undefined | DeleteTeamMemberPayloadKeySpecifier),
		fields?: DeleteTeamMemberPayloadFieldPolicy,
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
	GameBatting?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | GameBattingKeySpecifier | (() => undefined | GameBattingKeySpecifier),
		fields?: GameBattingFieldPolicy,
	},
	GameBattingsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | GameBattingsConnectionKeySpecifier | (() => undefined | GameBattingsConnectionKeySpecifier),
		fields?: GameBattingsConnectionFieldPolicy,
	},
	GameBattingsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | GameBattingsEdgeKeySpecifier | (() => undefined | GameBattingsEdgeKeySpecifier),
		fields?: GameBattingsEdgeFieldPolicy,
	},
	GameFielding?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | GameFieldingKeySpecifier | (() => undefined | GameFieldingKeySpecifier),
		fields?: GameFieldingFieldPolicy,
	},
	GameFieldingsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | GameFieldingsConnectionKeySpecifier | (() => undefined | GameFieldingsConnectionKeySpecifier),
		fields?: GameFieldingsConnectionFieldPolicy,
	},
	GameFieldingsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | GameFieldingsEdgeKeySpecifier | (() => undefined | GameFieldingsEdgeKeySpecifier),
		fields?: GameFieldingsEdgeFieldPolicy,
	},
	GamePitching?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | GamePitchingKeySpecifier | (() => undefined | GamePitchingKeySpecifier),
		fields?: GamePitchingFieldPolicy,
	},
	GamePitchingsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | GamePitchingsConnectionKeySpecifier | (() => undefined | GamePitchingsConnectionKeySpecifier),
		fields?: GamePitchingsConnectionFieldPolicy,
	},
	GamePitchingsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | GamePitchingsEdgeKeySpecifier | (() => undefined | GamePitchingsEdgeKeySpecifier),
		fields?: GamePitchingsEdgeFieldPolicy,
	},
	IsMajorLeaguePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | IsMajorLeaguePayloadKeySpecifier | (() => undefined | IsMajorLeaguePayloadKeySpecifier),
		fields?: IsMajorLeaguePayloadFieldPolicy,
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
	LeaguePosition?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | LeaguePositionKeySpecifier | (() => undefined | LeaguePositionKeySpecifier),
		fields?: LeaguePositionFieldPolicy,
	},
	LeaguePositionsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | LeaguePositionsConnectionKeySpecifier | (() => undefined | LeaguePositionsConnectionKeySpecifier),
		fields?: LeaguePositionsConnectionFieldPolicy,
	},
	LeaguePositionsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | LeaguePositionsEdgeKeySpecifier | (() => undefined | LeaguePositionsEdgeKeySpecifier),
		fields?: LeaguePositionsEdgeFieldPolicy,
	},
	LeaguesConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | LeaguesConnectionKeySpecifier | (() => undefined | LeaguesConnectionKeySpecifier),
		fields?: LeaguesConnectionFieldPolicy,
	},
	LeaguesEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | LeaguesEdgeKeySpecifier | (() => undefined | LeaguesEdgeKeySpecifier),
		fields?: LeaguesEdgeFieldPolicy,
	},
	Matchup?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupKeySpecifier | (() => undefined | MatchupKeySpecifier),
		fields?: MatchupFieldPolicy,
	},
	MatchupBatting?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupBattingKeySpecifier | (() => undefined | MatchupBattingKeySpecifier),
		fields?: MatchupBattingFieldPolicy,
	},
	MatchupBattingsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupBattingsConnectionKeySpecifier | (() => undefined | MatchupBattingsConnectionKeySpecifier),
		fields?: MatchupBattingsConnectionFieldPolicy,
	},
	MatchupBattingsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupBattingsEdgeKeySpecifier | (() => undefined | MatchupBattingsEdgeKeySpecifier),
		fields?: MatchupBattingsEdgeFieldPolicy,
	},
	MatchupFielding?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupFieldingKeySpecifier | (() => undefined | MatchupFieldingKeySpecifier),
		fields?: MatchupFieldingFieldPolicy,
	},
	MatchupFieldingsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupFieldingsConnectionKeySpecifier | (() => undefined | MatchupFieldingsConnectionKeySpecifier),
		fields?: MatchupFieldingsConnectionFieldPolicy,
	},
	MatchupFieldingsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupFieldingsEdgeKeySpecifier | (() => undefined | MatchupFieldingsEdgeKeySpecifier),
		fields?: MatchupFieldingsEdgeFieldPolicy,
	},
	MatchupPitching?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupPitchingKeySpecifier | (() => undefined | MatchupPitchingKeySpecifier),
		fields?: MatchupPitchingFieldPolicy,
	},
	MatchupPitchingsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupPitchingsConnectionKeySpecifier | (() => undefined | MatchupPitchingsConnectionKeySpecifier),
		fields?: MatchupPitchingsConnectionFieldPolicy,
	},
	MatchupPitchingsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupPitchingsEdgeKeySpecifier | (() => undefined | MatchupPitchingsEdgeKeySpecifier),
		fields?: MatchupPitchingsEdgeFieldPolicy,
	},
	MatchupPlayer?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupPlayerKeySpecifier | (() => undefined | MatchupPlayerKeySpecifier),
		fields?: MatchupPlayerFieldPolicy,
	},
	MatchupPlayerGame?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupPlayerGameKeySpecifier | (() => undefined | MatchupPlayerGameKeySpecifier),
		fields?: MatchupPlayerGameFieldPolicy,
	},
	MatchupPlayerGamesConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupPlayerGamesConnectionKeySpecifier | (() => undefined | MatchupPlayerGamesConnectionKeySpecifier),
		fields?: MatchupPlayerGamesConnectionFieldPolicy,
	},
	MatchupPlayerGamesEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupPlayerGamesEdgeKeySpecifier | (() => undefined | MatchupPlayerGamesEdgeKeySpecifier),
		fields?: MatchupPlayerGamesEdgeFieldPolicy,
	},
	MatchupPlayersConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupPlayersConnectionKeySpecifier | (() => undefined | MatchupPlayersConnectionKeySpecifier),
		fields?: MatchupPlayersConnectionFieldPolicy,
	},
	MatchupPlayersEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupPlayersEdgeKeySpecifier | (() => undefined | MatchupPlayersEdgeKeySpecifier),
		fields?: MatchupPlayersEdgeFieldPolicy,
	},
	MatchupsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupsConnectionKeySpecifier | (() => undefined | MatchupsConnectionKeySpecifier),
		fields?: MatchupsConnectionFieldPolicy,
	},
	MatchupsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | MatchupsEdgeKeySpecifier | (() => undefined | MatchupsEdgeKeySpecifier),
		fields?: MatchupsEdgeFieldPolicy,
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
	Player?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | PlayerKeySpecifier | (() => undefined | PlayerKeySpecifier),
		fields?: PlayerFieldPolicy,
	},
	PlayerEligiblePosition?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | PlayerEligiblePositionKeySpecifier | (() => undefined | PlayerEligiblePositionKeySpecifier),
		fields?: PlayerEligiblePositionFieldPolicy,
	},
	PlayerEligiblePositionsConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | PlayerEligiblePositionsConnectionKeySpecifier | (() => undefined | PlayerEligiblePositionsConnectionKeySpecifier),
		fields?: PlayerEligiblePositionsConnectionFieldPolicy,
	},
	PlayerEligiblePositionsEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | PlayerEligiblePositionsEdgeKeySpecifier | (() => undefined | PlayerEligiblePositionsEdgeKeySpecifier),
		fields?: PlayerEligiblePositionsEdgeFieldPolicy,
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
	TeamMember?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | TeamMemberKeySpecifier | (() => undefined | TeamMemberKeySpecifier),
		fields?: TeamMemberFieldPolicy,
	},
	TeamMembersConnection?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | TeamMembersConnectionKeySpecifier | (() => undefined | TeamMembersConnectionKeySpecifier),
		fields?: TeamMembersConnectionFieldPolicy,
	},
	TeamMembersEdge?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | TeamMembersEdgeKeySpecifier | (() => undefined | TeamMembersEdgeKeySpecifier),
		fields?: TeamMembersEdgeFieldPolicy,
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
	UpdateGameBattingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateGameBattingPayloadKeySpecifier | (() => undefined | UpdateGameBattingPayloadKeySpecifier),
		fields?: UpdateGameBattingPayloadFieldPolicy,
	},
	UpdateGameFieldingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateGameFieldingPayloadKeySpecifier | (() => undefined | UpdateGameFieldingPayloadKeySpecifier),
		fields?: UpdateGameFieldingPayloadFieldPolicy,
	},
	UpdateGamePitchingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateGamePitchingPayloadKeySpecifier | (() => undefined | UpdateGamePitchingPayloadKeySpecifier),
		fields?: UpdateGamePitchingPayloadFieldPolicy,
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
	UpdateLeaguePositionPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateLeaguePositionPayloadKeySpecifier | (() => undefined | UpdateLeaguePositionPayloadKeySpecifier),
		fields?: UpdateLeaguePositionPayloadFieldPolicy,
	},
	UpdateMatchupPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateMatchupPayloadKeySpecifier | (() => undefined | UpdateMatchupPayloadKeySpecifier),
		fields?: UpdateMatchupPayloadFieldPolicy,
	},
	UpdateMatchupPlayerGamePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateMatchupPlayerGamePayloadKeySpecifier | (() => undefined | UpdateMatchupPlayerGamePayloadKeySpecifier),
		fields?: UpdateMatchupPlayerGamePayloadFieldPolicy,
	},
	UpdateMatchupPlayerPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateMatchupPlayerPayloadKeySpecifier | (() => undefined | UpdateMatchupPlayerPayloadKeySpecifier),
		fields?: UpdateMatchupPlayerPayloadFieldPolicy,
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
	UpdateTeamMemberPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpdateTeamMemberPayloadKeySpecifier | (() => undefined | UpdateTeamMemberPayloadKeySpecifier),
		fields?: UpdateTeamMemberPayloadFieldPolicy,
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
	UpsertGameBattingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertGameBattingPayloadKeySpecifier | (() => undefined | UpsertGameBattingPayloadKeySpecifier),
		fields?: UpsertGameBattingPayloadFieldPolicy,
	},
	UpsertGameFieldingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertGameFieldingPayloadKeySpecifier | (() => undefined | UpsertGameFieldingPayloadKeySpecifier),
		fields?: UpsertGameFieldingPayloadFieldPolicy,
	},
	UpsertGamePitchingPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertGamePitchingPayloadKeySpecifier | (() => undefined | UpsertGamePitchingPayloadKeySpecifier),
		fields?: UpsertGamePitchingPayloadFieldPolicy,
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
	UpsertLeaguePositionPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertLeaguePositionPayloadKeySpecifier | (() => undefined | UpsertLeaguePositionPayloadKeySpecifier),
		fields?: UpsertLeaguePositionPayloadFieldPolicy,
	},
	UpsertMatchupPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertMatchupPayloadKeySpecifier | (() => undefined | UpsertMatchupPayloadKeySpecifier),
		fields?: UpsertMatchupPayloadFieldPolicy,
	},
	UpsertMatchupPlayerGamePayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertMatchupPlayerGamePayloadKeySpecifier | (() => undefined | UpsertMatchupPlayerGamePayloadKeySpecifier),
		fields?: UpsertMatchupPlayerGamePayloadFieldPolicy,
	},
	UpsertMatchupPlayerPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertMatchupPlayerPayloadKeySpecifier | (() => undefined | UpsertMatchupPlayerPayloadKeySpecifier),
		fields?: UpsertMatchupPlayerPayloadFieldPolicy,
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
	UpsertTeamMemberPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertTeamMemberPayloadKeySpecifier | (() => undefined | UpsertTeamMemberPayloadKeySpecifier),
		fields?: UpsertTeamMemberPayloadFieldPolicy,
	},
	UpsertTeamPayload?: Omit<TypePolicy, "fields" | "keyFields"> & {
		keyFields?: false | UpsertTeamPayloadKeySpecifier | (() => undefined | UpsertTeamPayloadKeySpecifier),
		fields?: UpsertTeamPayloadFieldPolicy,
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