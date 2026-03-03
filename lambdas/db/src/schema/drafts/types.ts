/**
 * Draft domain — GraphQL type definitions
 */

import { builder } from '../builder';
import { Team } from '../leagues/types';
import { CareerBattingRef } from '../statistics';

/**
 * DraftPick - Represents a single draft pick
 */
export const DraftPick = builder.objectRef<{
  id: number;
  draftId: number;
  teamId: number;
  playerId: number;
  round: number;
  pickNumber: number;
  overallPick: number;
  pickedAt: Date;
}>('DraftPick');

DraftPick.implement({
  description: 'A single pick made during a draft',
  fields: (t) => ({
    id: t.exposeInt('id'),
    draftId: t.exposeInt('draftId'),
    teamId: t.exposeInt('teamId'),
    playerId: t.exposeInt('playerId'),
    round: t.exposeInt('round'),
    pickNumber: t.exposeInt('pickNumber'),
    overallPick: t.exposeInt('overallPick'),
    pickedAt: t.string({
      resolve: (pick) => pick.pickedAt.toISOString(),
    }),
    team: t.field({
      type: Team,
      resolve: (parent, _args, context) => {
        return context.loaders.teams.load(parent.teamId).then((team) => {
          if (!team) throw new Error(`Team ${parent.teamId} not found`);
          return team;
        });
      },
    }),
  }),
});

/**
 * Draft - Extended draft type with current pick tracking
 */
export const Draft = builder.objectRef<{
  id: number;
  leagueId: number;
  draftMode: string;
  selectionMethod: string;
  draftOrder: string;
  currentPick: number;
  pickTimeLimitSeconds: number;
  currentPickDeadline: Date | null;
  draftStartedAt: Date | null;
  draftCompletedAt: Date | null;
  date: string | null;
  createdAt: Date;
  updatedAt: Date;
}>('Draft');

Draft.implement({
  description: 'A draft event for a league',
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId'),
    draftMode: t.exposeString('draftMode'),
    selectionMethod: t.exposeString('selectionMethod'),
    draftOrder: t.exposeString('draftOrder'),
    currentPick: t.exposeInt('currentPick'),
    pickTimeLimitSeconds: t.exposeInt('pickTimeLimitSeconds'),
    currentPickDeadline: t.string({
      nullable: true,
      resolve: (draft) => draft.currentPickDeadline?.toISOString() || null,
    }),
    draftStartedAt: t.string({
      nullable: true,
      resolve: (draft) => draft.draftStartedAt?.toISOString() || null,
    }),
    draftCompletedAt: t.string({
      nullable: true,
      resolve: (draft) => draft.draftCompletedAt?.toISOString() || null,
    }),
    date: t.exposeString('date', { nullable: true }),
    createdAt: t.string({
      resolve: (draft) => draft.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      resolve: (draft) => draft.updatedAt.toISOString(),
    }),
  }),
});

/**
 * CurrentDraftPick - Information about whose turn it is
 */
export const CurrentDraftPick = builder.objectRef<{
  draftId: number;
  teamId: number;
  round: number;
  pickNumber: number;
  overallPick: number;
  isComplete: boolean;
}>('CurrentDraftPick');

CurrentDraftPick.implement({
  description: 'Information about the current draft pick',
  fields: (t) => ({
    draftId: t.exposeInt('draftId'),
    teamId: t.exposeInt('teamId'),
    round: t.exposeInt('round'),
    pickNumber: t.exposeInt('pickNumber'),
    overallPick: t.exposeInt('overallPick'),
    isComplete: t.exposeBoolean('isComplete'),
    team: t.field({
      type: Team,
      resolve: (parent, _args, context) => {
        return context.loaders.teams.load(parent.teamId).then((team) => {
          if (!team) throw new Error(`Team ${parent.teamId} not found`);
          return team;
        });
      },
    }),
  }),
});

/**
 * DraftPlayer - A player available (or drafted) in a draft context
 */
export const DraftPlayer = builder.objectRef<{
  id: number;
  firstName: string;
  lastName: string;
  brefId: string;
}>('DraftPlayer');

DraftPlayer.implement({
  description: 'A player in the context of a draft',
  fields: (t) => ({
    id: t.exposeInt('id'),
    firstName: t.exposeString('firstName'),
    lastName: t.exposeString('lastName'),
    brefId: t.exposeString('brefId'),
    eligiblePositions: t.stringList({
      description:
        'List of positions this player is eligible to play (e.g. SP, RP, 1B, SS)',
      resolve: async (parent, _args, context) => {
        return context.loaders.eligiblePositions.load(parent.id);
      },
    }),
    careerBatting: t.field({
      description: 'Career batting statistics for the player',
      type: CareerBattingRef,
      nullable: true,
      resolve: async (parent, _args, context) => {
        return context.loaders.careerBatting.load(parent.id);
      },
    }),
  }),
});

/**
 * DraftTeamOrder - Represents a single team's draft slot position
 */
export const DraftTeamOrderEntry = builder.objectRef<{
  teamId: number;
  teamName: string;
  draftOrder: number;
}>('DraftTeamOrderEntry');

DraftTeamOrderEntry.implement({
  description: 'A team and its assigned slot in the draft order',
  fields: (t) => ({
    teamId: t.exposeInt('teamId'),
    teamName: t.exposeString('teamName'),
    draftOrder: t.exposeInt('draftOrder'),
  }),
});

// ── Update Draft Settings Types ──────────────────────────────────────────────

// Input type for updating draft settings before a draft starts
export const UpdateDraftSettingsInput = builder.inputType(
  'UpdateDraftSettingsInput',
  {
    fields: (t) => ({
      leagueId: t.int({ required: true }),
      draftMode: t.string({ required: false }), // 'live' | 'automated'
      selectionMethod: t.string({ required: false }), // 'standard' | 'auction' | 'random'
      draftOrder: t.string({ required: false }), // 'snake' | 'linear'
      playerPool: t.string({ required: false }), // 'all' | 'nl' | 'al'
      pickTimeLimitSeconds: t.int({ required: false }), // seconds per pick (default 120)
      // Era-based league settings (LS-295)
      eraFilter: t.string({ required: false }), // 'all' | 'dead_ball' | 'golden_age' | 'expansion' | 'free_agency' | 'steroid_era' | 'modern' | 'custom'
      hofOnly: t.boolean({ required: false }), // restrict draft board to Hall of Famers only
      customEraStartYear: t.int({ required: false }), // commissioner-defined era start year
      customEraEndYear: t.int({ required: false }), // commissioner-defined era end year
    }),
  },
);

// Payload for draft settings update — returns the updated draft record
export const UpdateDraftSettingsPayload = builder.objectRef<{
  id: number;
  leagueId: number;
  draftMode: string;
  selectionMethod: string;
  draftOrder: string;
  currentPick: number;
  pickTimeLimitSeconds: number;
  draftStartedAt: Date | null;
  draftCompletedAt: Date | null;
  date: string | null;
  createdAt: Date;
  updatedAt: Date;
  playerPool: string;
}>('UpdateDraftSettingsPayload');

UpdateDraftSettingsPayload.implement({
  description: 'Result of updating draft settings',
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId'),
    draftMode: t.exposeString('draftMode'),
    selectionMethod: t.exposeString('selectionMethod'),
    draftOrder: t.exposeString('draftOrder'),
    currentPick: t.exposeInt('currentPick'),
    playerPool: t.exposeString('playerPool'),
    pickTimeLimitSeconds: t.exposeInt('pickTimeLimitSeconds'),
    draftStartedAt: t.string({
      nullable: true,
      resolve: (payload) => payload.draftStartedAt?.toISOString() || null,
    }),
    draftCompletedAt: t.string({
      nullable: true,
      resolve: (payload) => payload.draftCompletedAt?.toISOString() || null,
    }),
  }),
});
