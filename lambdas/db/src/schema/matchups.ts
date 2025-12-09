import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { and, eq } from 'drizzle-orm';
import { builder } from './builder';
import { Team } from './leagues'; // Import Team ref from leagues schema

// Matchup status enum
const MatchupStatus = builder.enumType('MatchupStatus', {
  values: ['scheduled', 'in_progress', 'completed', 'cancelled'] as const,
});

// Extended Matchup type with all new fields
const Matchup = builder.objectRef<{
  id: number;
  weekNumber: number;
  leagueId: number;
  team1Id: number | null;
  team2Id: number | null;
  team1Score: string | null; // Decimal stored as string
  team2Score: string | null; // Decimal stored as string
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  selectedSeason: number | null;
  gamesPerMatchup: number | null;
  startTime: string | null;
  endTime: string | null;
}>('Matchup');

builder.objectType(Matchup, {
  description: 'A head-to-head matchup between two teams in a league',
  fields: (t) => ({
    id: t.exposeID('id'),
    weekNumber: t.exposeInt('weekNumber'),
    leagueId: t.exposeInt('leagueId'),
    team1Id: t.exposeInt('team1Id', { nullable: true }),
    team2Id: t.exposeInt('team2Id', { nullable: true }),
    team1Score: t.float({
      nullable: true,
      resolve: (matchup) =>
        matchup.team1Score ? parseFloat(matchup.team1Score) : null,
    }),
    team2Score: t.float({
      nullable: true,
      resolve: (matchup) =>
        matchup.team2Score ? parseFloat(matchup.team2Score) : null,
    }),
    status: t.field({
      type: MatchupStatus,
      resolve: (matchup) => matchup.status,
    }),
    selectedSeason: t.exposeInt('selectedSeason', { nullable: true }),
    gamesPerMatchup: t.exposeInt('gamesPerMatchup', { nullable: true }),
    startTime: t.exposeString('startTime', { nullable: true }),
    endTime: t.exposeString('endTime', { nullable: true }),
    // Relational fields
    team1: t.field({
      type: Team,
      nullable: true,
      resolve: async (matchup) => {
        if (!matchup.team1Id) return null;
        return await runWithPublicClient(getDbOptions(), async (db) => {
          const results = await db
            .select({
              id: PublicSchema.teams.id,
              name: PublicSchema.teams.name,
              leagueId: PublicSchema.teams.leagueId,
            })
            .from(PublicSchema.teams)
            .where(eq(PublicSchema.teams.id, matchup.team1Id))
            .limit(1);
          return results[0] || null;
        });
      },
    }),
    team2: t.field({
      type: Team,
      nullable: true,
      resolve: async (matchup) => {
        if (!matchup.team2Id) return null;
        return await runWithPublicClient(getDbOptions(), async (db) => {
          const results = await db
            .select({
              id: PublicSchema.teams.id,
              name: PublicSchema.teams.name,
              leagueId: PublicSchema.teams.leagueId,
            })
            .from(PublicSchema.teams)
            .where(eq(PublicSchema.teams.id, matchup.team2Id))
            .limit(1);
          return results[0] || null;
        });
      },
    }),
  }),
});

// Query: getMatchupById
builder.queryField('getMatchupById', (t) =>
  t.field({
    type: Matchup,
    nullable: true,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        const results = await db
          .select()
          .from(PublicSchema.matchups)
          .where(eq(PublicSchema.matchups.id, args.id))
          .limit(1);

        return results[0] || null;
      });
    },
  }),
);

// Query: getMatchupsForLeague
builder.queryField('getMatchupsForLeague', (t) =>
  t.field({
    type: [Matchup],
    args: {
      leagueId: t.arg.int({ required: true }),
      weekNumber: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        const conditions = [eq(PublicSchema.matchups.leagueId, args.leagueId)];

        if (args.weekNumber !== null && args.weekNumber !== undefined) {
          conditions.push(
            eq(PublicSchema.matchups.weekNumber, args.weekNumber),
          );
        }

        return await db
          .select()
          .from(PublicSchema.matchups)
          .where(and(...conditions));
      });
    },
  }),
);

// Query: getCurrentMatchupForLeague
builder.queryField('getCurrentMatchupForLeague', (t) =>
  t.field({
    type: Matchup,
    nullable: true,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        // Get the current matchup ID from the league
        const leagueResults = await db
          .select({ currentMatchup: PublicSchema.leagues.currentMatchup })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, args.leagueId))
          .limit(1);

        if (!leagueResults[0]?.currentMatchup) {
          return null;
        }

        const matchupResults = await db
          .select()
          .from(PublicSchema.matchups)
          .where(eq(PublicSchema.matchups.id, leagueResults[0].currentMatchup))
          .limit(1);

        return matchupResults[0] || null;
      });
    },
  }),
);

// Query: getMatchupsByWeek
builder.queryField('getMatchupsByWeek', (t) =>
  t.field({
    type: [Matchup],
    args: {
      leagueId: t.arg.int({ required: true }),
      weekNumber: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        return await db
          .select()
          .from(PublicSchema.matchups)
          .where(
            and(
              eq(PublicSchema.matchups.leagueId, args.leagueId),
              eq(PublicSchema.matchups.weekNumber, args.weekNumber),
            ),
          );
      });
    },
  }),
);

// Input types for mutations
const CreateMatchupInput = builder.inputType('CreateMatchupInput', {
  fields: (t) => ({
    leagueId: t.int({ required: true }),
    weekNumber: t.int({ required: true }),
    team1Id: t.int({ required: false }),
    team2Id: t.int({ required: false }),
    selectedSeason: t.int({ required: false }),
    gamesPerMatchup: t.int({ required: false }),
    startTime: t.string({ required: false }),
    endTime: t.string({ required: false }),
  }),
});

// Mutation: createMatchup
builder.mutationField('createMatchup', (t) =>
  t.field({
    type: Matchup,
    args: {
      input: t.arg({ type: CreateMatchupInput, required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        // Get league configuration for defaults
        const league = await db
          .select({
            gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
            minGamesPerSeason: PublicSchema.leagues.minGamesPerSeason,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, args.input.leagueId))
          .limit(1);

        if (!league[0]) {
          throw new Error('League not found');
        }

        const gamesPerMatchup =
          args.input.gamesPerMatchup ?? league[0].gamesPerMatchup ?? 5;

        // Insert the matchup
        const results = await db
          .insert(PublicSchema.matchups)
          .values({
            leagueId: args.input.leagueId,
            weekNumber: args.input.weekNumber,
            team1Id: args.input.team1Id ?? null,
            team2Id: args.input.team2Id ?? null,
            selectedSeason: args.input.selectedSeason ?? null,
            gamesPerMatchup,
            startTime: args.input.startTime ?? null,
            endTime: args.input.endTime ?? null,
            status: 'scheduled',
          })
          .returning();

        return results[0];
      });
    },
  }),
);

// Mutation: updateMatchupScore
builder.mutationField('updateMatchupScore', (t) =>
  t.field({
    type: Matchup,
    args: {
      matchupId: t.arg.int({ required: true }),
      team1Score: t.arg.float({ required: false }),
      team2Score: t.arg.float({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        const updateData: { team1Score?: string; team2Score?: string } = {};

        if (args.team1Score !== null && args.team1Score !== undefined) {
          updateData.team1Score = args.team1Score.toString();
        }
        if (args.team2Score !== null && args.team2Score !== undefined) {
          updateData.team2Score = args.team2Score.toString();
        }

        const results = await db
          .update(PublicSchema.matchups)
          .set(updateData)
          .where(eq(PublicSchema.matchups.id, args.matchupId))
          .returning();

        if (!results[0]) {
          throw new Error('Matchup not found');
        }

        return results[0];
      });
    },
  }),
);

// Mutation: updateMatchupStatus
builder.mutationField('updateMatchupStatus', (t) =>
  t.field({
    type: Matchup,
    args: {
      matchupId: t.arg.int({ required: true }),
      status: t.arg({ type: MatchupStatus, required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        const results = await db
          .update(PublicSchema.matchups)
          .set({ status: args.status })
          .where(eq(PublicSchema.matchups.id, args.matchupId))
          .returning();

        if (!results[0]) {
          throw new Error('Matchup not found');
        }

        return results[0];
      });
    },
  }),
);

// Mutation: triggerGameSelection (placeholder for commissioner action)
builder.mutationField('triggerGameSelection', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      matchupId: t.arg.int({ required: true }),
      gameNumber: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      // This is a placeholder - actual game selection logic will be implemented in later stories
      // For now, just validate the matchup exists
      return await runWithPublicClient(getDbOptions(), async (db) => {
        const matchup = await db
          .select()
          .from(PublicSchema.matchups)
          .where(eq(PublicSchema.matchups.id, args.matchupId))
          .limit(1);

        if (!matchup[0]) {
          throw new Error('Matchup not found');
        }

        // TODO: Implement actual game selection logic in LS-20
        return true;
      });
    },
  }),
);
