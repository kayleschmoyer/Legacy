/**
 * League domain — Shared type definitions and constants
 *
 * This module defines the core GraphQL types used across league,
 * team, and waiver resolvers.
 */
import { PublicSchema } from '@legacy-sports/db-client';
import type { Team as DbTeam } from '@legacy-sports/db-client';
import { eq } from 'drizzle-orm';
import { builder } from '../builder';
import { loadLeagueScoringConfig, ScoringConfigRef } from '../scoring';

// Default roster positions for new leagues
// These represent a standard fantasy baseball roster configuration
export const DEFAULT_ROSTER_POSITIONS = [
  // Batting positions
  'C', // Catcher
  '1B', // First Base
  '2B', // Second Base
  '3B', // Third Base
  'SS', // Shortstop
  'OF', // Outfield (3 slots)
  'OF',
  'OF',
  'DH', // Designated Hitter
  // Pitching positions
  'SP', // Starting Pitcher (5 slots)
  'SP',
  'SP',
  'SP',
  'SP',
  'RP', // Relief Pitcher (3 slots)
  'RP',
  'RP',
  // Utility positions
  'IF', // Infield utility
  'XDH', // Extra DH/utility
] as const;

// League type - matches database schema with proper nullability
export const League = builder.objectRef<{
  id: number;
  name: string;
  owner: number;
  maxRosterSize: number;
  currentMatchup: number | null;
  draftStatus:
    | 'not-started'
    | 'queued'
    | 'in-progress'
    | 'paused'
    | 'completed';
  inviteCode: string;
  playerPool: 'all' | 'nl' | 'al';
  weekAdvanceStatus?: 'idle' | 'queued' | 'processing' | 'success' | 'failed';
  waiverType?: 'standard' | 'faab';
  waiverEnabled?: boolean;
  faabBudgetDefault?: number;
  spStartsPerMatchup?: number;
  gamesPerMatchup?: number;
  minCareerGames?: number;
  minCareerSeasons?: number;
  userMembership?: {
    leagueId: number;
    userId: number;
    teamId: number | null;
    permissionLevel: 'owner' | 'commissioner';
  } | null;
}>('League');

League.implement({
  description: 'A fantasy sports league',
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
    owner: t.exposeInt('owner'),
    maxRosterSize: t.exposeInt('maxRosterSize'),
    currentMatchup: t.exposeInt('currentMatchup', { nullable: true }),
    draftStatus: t.exposeString('draftStatus'),
    inviteCode: t.exposeString('inviteCode'),
    playerPool: t.exposeString('playerPool'),
    weekAdvanceStatus: t.exposeString('weekAdvanceStatus', { nullable: true }),
    waiverType: t.exposeString('waiverType', { nullable: true }),
    waiverEnabled: t.exposeBoolean('waiverEnabled', { nullable: true }),
    faabBudgetDefault: t.exposeInt('faabBudgetDefault', { nullable: true }),
    spStartsPerMatchup: t.exposeInt('spStartsPerMatchup', { nullable: true }),
    gamesPerMatchup: t.exposeInt('gamesPerMatchup', { nullable: true }),
    minCareerGames: t.exposeInt('minCareerGames', { nullable: true }),
    minCareerSeasons: t.exposeInt('minCareerSeasons', { nullable: true }),
    currentWeekNumber: t.int({
      nullable: true,
      description:
        'The week number of the current matchup (resolved from the matchup record)',
      resolve: async (parent, _args, context) => {
        if (!parent.currentMatchup) return null;
        const rows = await context.db
          .select({
            weekNumber: PublicSchema.matchups.weekNumber,
          })
          .from(PublicSchema.matchups)
          .where(eq(PublicSchema.matchups.id, parent.currentMatchup))
          .limit(1);
        return rows[0]?.weekNumber ?? null;
      },
    }),
    scoringProfile: t.field({
      type: ScoringConfigRef,
      resolve: async (parent, args, context) => {
        if (!context.user) {
          throw new Error('Authentication required to fetch scoring settings');
        }

        return loadLeagueScoringConfig(parent.id);
      },
    }),
    userMembership: t.field({
      type: LeagueMember,
      nullable: true,
      resolve: (parent) => parent.userMembership || null,
    }),
  }),
});

// Team type
export const Team = builder.objectRef<DbTeam>('Team');

Team.implement({
  description: 'A team in a league',
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
    leagueId: t.exposeInt('leagueId'),
    waiverOrder: t.exposeInt('waiverOrder', { nullable: true }),
    faabBudget: t.exposeInt('faabBudget', { nullable: true }),
    createdAt: t.string({
      resolve: (team) => team.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      resolve: (team) => team.updatedAt.toISOString(),
    }),
  }),
});

// LeagueMember type - no id field, teamId is nullable, enum for permissionLevel
export const LeagueMember = builder.objectRef<{
  leagueId: number;
  userId: number;
  teamId: number | null;
  permissionLevel: 'owner' | 'commissioner';
}>('LeagueMember');

LeagueMember.implement({
  description: 'A member of a league',
  fields: (t) => ({
    leagueId: t.exposeInt('leagueId'),
    userId: t.exposeInt('userId'),
    teamId: t.exposeInt('teamId', { nullable: true }),
    permissionLevel: t.exposeString('permissionLevel'),
    team: t.field({
      type: Team,
      nullable: true,
      resolve: async (parent, _args, context) => {
        if (!parent.teamId) return null;
        return context.loaders.teams.load(parent.teamId);
      },
    }),
  }),
});

// LeaguePosition type
export const LeaguePosition = builder.objectRef<{
  id: number;
  leagueId: number;
  positionType: string;
}>('LeaguePosition');

LeaguePosition.implement({
  description: 'A position configuration in a league',
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId'),
    positionType: t.exposeString('positionType'),
  }),
});

// TeamMember type
export const TeamMember = builder.objectRef<{
  id: number;
  teamId: number | null;
  leagueId: number;
  playerId: number;
  positionId: number | null;
}>('TeamMember');

TeamMember.implement({
  description: 'A member of a team',
  fields: (t) => ({
    id: t.exposeInt('id'),
    teamId: t.exposeInt('teamId', { nullable: true }),
    leagueId: t.exposeInt('leagueId'),
    playerId: t.exposeInt('playerId'),
    positionId: t.exposeInt('positionId', { nullable: true }),
    player: t.field({
      type: 'Player',
      nullable: true,
      resolve: async (parent, _args, context) => {
        return context.loaders.players.load(parent.playerId);
      },
    }),
  }),
});
