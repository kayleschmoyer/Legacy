/**
 * League History domain — GraphQL types and queries (LS-287)
 *
 * Provides multi-season league history, season archives, and all-time records
 * by traversing the previousLeagueId lineage chain.
 */

import { builder } from './builder';
import { AuthenticationError } from './graphql-errors';

// ── Types ────────────────────────────────────────────────────────────────────

const LeagueSeasonSummary = builder.objectRef<{
  leagueId: number;
  seasonNumber: number;
  name: string;
  frozenAt: string | null;
  leaguePhase: string;
  totalMatchups: number;
  championTeamId: number | null;
  championTeamName: string | null;
  runnerUpTeamId: number | null;
  runnerUpTeamName: string | null;
  championScore: number | null;
  runnerUpScore: number | null;
}>('LeagueSeasonSummary');

builder.objectType(LeagueSeasonSummary, {
  description: "Summary of a single season in a league's history",
  fields: (t) => ({
    leagueId: t.exposeInt('leagueId'),
    seasonNumber: t.exposeInt('seasonNumber'),
    name: t.exposeString('name'),
    frozenAt: t.exposeString('frozenAt', { nullable: true }),
    leaguePhase: t.exposeString('leaguePhase'),
    totalMatchups: t.exposeInt('totalMatchups'),
    championTeamId: t.exposeInt('championTeamId', { nullable: true }),
    championTeamName: t.exposeString('championTeamName', { nullable: true }),
    runnerUpTeamId: t.exposeInt('runnerUpTeamId', { nullable: true }),
    runnerUpTeamName: t.exposeString('runnerUpTeamName', { nullable: true }),
    championScore: t.exposeFloat('championScore', { nullable: true }),
    runnerUpScore: t.exposeFloat('runnerUpScore', { nullable: true }),
  }),
});

const AllTimeRecord = builder.objectRef<{
  recordType: string;
  value: number;
  teamName: string;
  teamId: number;
  seasonNumber: number;
  leagueId: number;
  details: string | null;
}>('AllTimeRecord');

builder.objectType(AllTimeRecord, {
  description: "An all-time record across all seasons in a league's history",
  fields: (t) => ({
    recordType: t.exposeString('recordType'),
    value: t.exposeFloat('value'),
    teamName: t.exposeString('teamName'),
    teamId: t.exposeInt('teamId'),
    seasonNumber: t.exposeInt('seasonNumber'),
    leagueId: t.exposeInt('leagueId'),
    details: t.exposeString('details', { nullable: true }),
  }),
});

// ── Queries ──────────────────────────────────────────────────────────────────

builder.queryField('getLeagueHistory', (t) =>
  t.field({
    type: [LeagueSeasonSummary],
    description:
      'Get the full season history for a league by traversing the previousLeagueId lineage chain. Returns seasons in reverse chronological order (current first).',
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { getLeagueSeasonSummaries } =
        await import('@legacy-sports/db-client');

      return await getLeagueSeasonSummaries(context.db, args.leagueId);
    },
  }),
);

builder.queryField('getAllTimeRecords', (t) =>
  t.field({
    type: [AllTimeRecord],
    description:
      "Get all-time records across all seasons in a league's history (most wins, highest score, longest win streak, most points in a season).",
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { getAllTimeRecords } = await import('@legacy-sports/db-client');

      return await getAllTimeRecords(context.db, args.leagueId);
    },
  }),
);
