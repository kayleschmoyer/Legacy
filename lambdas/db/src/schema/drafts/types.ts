/**
 * Draft domain — GraphQL type definitions
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { eq } from 'drizzle-orm';
import { builder } from '../builder';
import { Team } from '../leagues/types';

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
      resolve: async (parent, args, context) => {
        const teams = await context.db
          .select()
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.id, parent.teamId))
          .limit(1);

        if (!teams[0]) {
          throw new Error(`Team ${parent.teamId} not found`);
        }

        return teams[0];
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
      resolve: async (parent, args, context) => {
        const teams = await context.db
          .select()
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.id, parent.teamId))
          .limit(1);

        if (!teams[0]) {
          throw new Error(`Team ${parent.teamId} not found`);
        }

        return teams[0];
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
