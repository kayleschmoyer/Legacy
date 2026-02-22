/**
 * Draft Schema - GraphQL types, queries, and mutations for draft functionality
 */

import { PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { createNotificationService } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import { and, asc, desc, eq, notInArray, sql } from 'drizzle-orm';
import { builder } from './builder';
import { Team } from './leagues';

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
 * Calculate current pick information based on draft settings
 */
async function getCurrentDraftPickInfo(
  db: PublicDb,
  draftId: number,
): Promise<{
  draftId: number;
  teamId: number;
  round: number;
  pickNumber: number;
  overallPick: number;
  isComplete: boolean;
} | null> {
  // Get draft and draft teams
  const [draft] = await db
    .select()
    .from(PublicSchema.drafts)
    .where(eq(PublicSchema.drafts.id, draftId))
    .limit(1);

  if (!draft) {
    return null;
  }

  const draftTeams = await db
    .select()
    .from(PublicSchema.draftTeams)
    .where(eq(PublicSchema.draftTeams.draftId, draftId))
    .orderBy(asc(PublicSchema.draftTeams.draftOrder));

  if (draftTeams.length === 0) {
    throw new Error('No teams configured for this draft');
  }

  const teamCount = draftTeams.length;
  const currentOverallPick = draft.currentPick + 1;

  // Calculate round (1-indexed)
  const round = Math.ceil(currentOverallPick / teamCount);

  // Determine team based on draft order (snake vs normal)
  const isSnake = draft.draftOrder === 'snake';
  const isReverseRound = isSnake && round % 2 === 0;

  // Calculate pick within round (1-indexed)
  const pickInRound = ((currentOverallPick - 1) % teamCount) + 1;

  // Determine team index
  const teamIndex = isReverseRound
    ? teamCount - pickInRound // Reverse order for snake draft even rounds
    : pickInRound - 1; // Normal order (0-indexed)

  const team = draftTeams[teamIndex];

  if (!team) {
    throw new Error('Could not determine team for current pick');
  }

  return {
    draftId,
    teamId: team.teamId,
    round,
    pickNumber: pickInRound,
    overallPick: currentOverallPick,
    isComplete: false,
  };
}

/**
 * Query: Get draft by ID
 */
builder.queryField('getDraft', (t) =>
  t.field({
    type: Draft,
    nullable: true,
    args: {
      draftId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const [draft] = await context.db
        .select()
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, args.draftId))
        .limit(1);

      return draft || null;
    },
  }),
);

/**
 * Query: Get draft for a league
 */
builder.queryField('getLeagueDraft', (t) =>
  t.field({
    type: Draft,
    nullable: true,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const [draft] = await context.db
        .select()
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.leagueId, args.leagueId))
        .orderBy(desc(PublicSchema.drafts.createdAt))
        .limit(1);

      return draft || null;
    },
  }),
);

/**
 * Query: Get current draft pick information
 */
builder.queryField('getCurrentDraftPick', (t) =>
  t.field({
    type: CurrentDraftPick,
    nullable: true,
    args: {
      draftId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return getCurrentDraftPickInfo(context.db, args.draftId);
    },
  }),
);

/**
 * Query: Get all picks for a draft
 */
builder.queryField('getDraftPicks', (t) =>
  t.field({
    type: [DraftPick],
    args: {
      draftId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const picks = await context.db
        .select()
        .from(PublicSchema.draftPicks)
        .where(eq(PublicSchema.draftPicks.draftId, args.draftId))
        .orderBy(asc(PublicSchema.draftPicks.overallPick));

      return picks;
    },
  }),
);

/**
 * Query: Get available (un-drafted) players for a draft
 * Returns all players not yet picked in this draft, optionally
 * filtered by a name search term.
 */
builder.queryField('getAvailableDraftPlayers', (t) =>
  t.field({
    type: [DraftPlayer],
    args: {
      draftId: t.arg.int({ required: true }),
      search: t.arg.string({ required: false }),
      limit: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { draftId, search, limit: resultLimit } = args;

      // Get already-drafted player IDs for this draft
      const drafted = await context.db
        .select({ playerId: PublicSchema.draftPicks.playerId })
        .from(PublicSchema.draftPicks)
        .where(eq(PublicSchema.draftPicks.draftId, draftId));

      const draftedIds = drafted.map((d) => d.playerId);

      // Build base query for available players
      const baseConditions =
        draftedIds.length > 0
          ? [notInArray(PublicSchema.players.id, draftedIds)]
          : [];

      // Apply optional name filter
      if (search && search.trim().length > 0) {
        const term = `%${search.trim().toLowerCase()}%`;
        baseConditions.push(
          sql`(LOWER(${PublicSchema.players.firstName} || ' ' || ${PublicSchema.players.lastName}) LIKE ${term})`,
        );
      }

      const query = context.db
        .select()
        .from(PublicSchema.players)
        .where(baseConditions.length > 0 ? and(...baseConditions) : undefined)
        .orderBy(
          asc(PublicSchema.players.lastName),
          asc(PublicSchema.players.firstName),
        )
        .limit(resultLimit ?? 50);

      return query;
    },
  }),
);

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

/**
 * Mutation: Make a draft pick
 */
builder.mutationField('makeDraftPick', (t) =>
  t.field({
    type: DraftPick,
    args: {
      draftId: t.arg.int({ required: true }),
      playerId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required to make a draft pick');
      }

      const { draftId, playerId } = args;
      const userId = context.user.id;

      try {
        // Get draft information
        const [draft] = await context.db
          .select()
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.id, draftId))
          .limit(1);

        if (!draft) {
          throw new Error('Draft not found');
        }

        // Fetch league to validate draft status and get maxRosterSize
        const [league] = await context.db
          .select()
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, draft.leagueId))
          .limit(1);

        if (!league) {
          throw new Error('League not found');
        }

        if (league.draftStatus !== 'in-progress') {
          throw new Error(
            `Draft is not in progress (current status: ${league.draftStatus ?? 'unknown'})`,
          );
        }

        // Get current pick information
        const currentPickInfo = await getCurrentDraftPickInfo(
          context.db,
          draftId,
        );

        if (!currentPickInfo) {
          throw new Error('Could not determine current pick');
        }

        if (currentPickInfo.isComplete) {
          throw new Error('Draft is already complete');
        }

        // Get the league membership to verify user owns the team
        const leagueMembers = await context.db
          .select()
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, draft.leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        const membership = leagueMembers[0];

        if (!membership || membership.teamId !== currentPickInfo.teamId) {
          throw new Error(
            'Not authorized: It is not your turn to pick or you do not own this team',
          );
        }

        // Check if player has already been drafted
        const existingPick = await context.db
          .select()
          .from(PublicSchema.draftPicks)
          .where(
            and(
              eq(PublicSchema.draftPicks.draftId, draftId),
              eq(PublicSchema.draftPicks.playerId, playerId),
            ),
          )
          .limit(1);

        if (existingPick.length > 0) {
          throw new Error('Player has already been drafted');
        }

        // Verify player exists
        const players = await context.db
          .select()
          .from(PublicSchema.players)
          .where(eq(PublicSchema.players.id, playerId))
          .limit(1);

        if (!players[0]) {
          throw new Error('Player not found');
        }

        const now = new Date();

        // Create the draft pick
        const [draftPick] = await context.db
          .insert(PublicSchema.draftPicks)
          .values({
            draftId,
            teamId: currentPickInfo.teamId,
            playerId,
            round: currentPickInfo.round,
            pickNumber: currentPickInfo.pickNumber,
            overallPick: currentPickInfo.overallPick,
            pickedAt: now,
          })
          .returning();

        // Determine if this is the first pick (set draftStartedAt)
        const isFirstPick = draft.currentPick === 0;

        // Determine if the draft is now complete
        const numTeams = (
          await context.db
            .select()
            .from(PublicSchema.draftTeams)
            .where(eq(PublicSchema.draftTeams.draftId, draftId))
        ).length;
        const totalPicks = numTeams * league.maxRosterSize;
        const isDraftComplete = currentPickInfo.overallPick >= totalPicks;

        // Update draft: advance currentPick, conditionally set started/completed timestamps
        await context.db
          .update(PublicSchema.drafts)
          .set({
            currentPick: currentPickInfo.overallPick,
            updatedAt: now,
            ...(isFirstPick ? { draftStartedAt: now } : {}),
            ...(isDraftComplete ? { draftCompletedAt: now } : {}),
          })
          .where(eq(PublicSchema.drafts.id, draftId));

        // If draft is complete, update league status
        if (isDraftComplete) {
          await context.db
            .update(PublicSchema.leagues)
            .set({ draftStatus: 'completed' })
            .where(eq(PublicSchema.leagues.id, draft.leagueId));
        }

        // Add player to team roster
        await context.db.insert(PublicSchema.teamMembers).values({
          teamId: currentPickInfo.teamId,
          leagueId: draft.leagueId,
          playerId,
          draftRound: currentPickInfo.round,
          draftPick: currentPickInfo.pickNumber,
          acquisitionType: 'draft',
        });

        LOGGER.info('Draft pick made successfully', {
          draftId,
          playerId,
          teamId: currentPickInfo.teamId,
          round: currentPickInfo.round,
          pick: currentPickInfo.pickNumber,
          overallPick: currentPickInfo.overallPick,
          isDraftComplete,
        });

        // Send WebSocket notification for the pick
        if (context.notificationService) {
          await context.notificationService.notifyDraftPickMade(
            draft.leagueId,
            draftId,
            draftPick.id,
            currentPickInfo.teamId,
            playerId,
            currentPickInfo.round,
            currentPickInfo.pickNumber,
            currentPickInfo.overallPick,
          );

          // If draft completed, also send draft-completed notification
          if (isDraftComplete) {
            /* eslint-disable @typescript-eslint/no-unsafe-argument */
            await context.notificationService.notifyDraftCompleted(
              draft.leagueId,
              draft.selectionMethod,
            );
            /* eslint-enable @typescript-eslint/no-unsafe-argument */
          }
        }

        return draftPick;
      } catch (error) {
        LOGGER.error('Error making draft pick', {
          draftId,
          playerId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
);

/**
 * Mutation: Initialize a live draft
 * Creates the drafts record, randomizes team order into draft_teams, and
 * sets the league's draftStatus to 'in-progress' so makeDraftPick can proceed.
 * Unlike startDraft (which queues an automated random draft to SQS), this
 * supports a human pick-by-pick draft session.
 */
builder.mutationField('initializeLiveDraft', (t) =>
  t.field({
    type: Draft,
    args: {
      leagueId: t.arg.int({ required: true }),
      draftOrder: t.arg.string({ required: false }), // 'snake' (default) | 'linear'
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required to initialize a draft');
      }

      const { leagueId, draftOrder = 'snake' } = args;
      const userId = context.user.id;

      if (draftOrder !== 'snake' && draftOrder !== 'linear') {
        throw new Error("draftOrder must be 'snake' or 'linear'");
      }

      try {
        // Fetch league
        const [league] = await context.db
          .select()
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        if (!league) {
          throw new Error('League not found');
        }

        if (league.draftStatus !== 'not-started') {
          throw new Error(
            `Cannot initialize draft: current status is '${league.draftStatus}'`,
          );
        }

        // Verify user is the league owner
        const [membership] = await context.db
          .select()
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        if (!membership || membership.permissionLevel !== 'owner') {
          throw new Error('Only the league owner can initialize a draft');
        }

        // Get all teams in the league
        const teams = await context.db
          .select({ id: PublicSchema.teams.id })
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.leagueId, leagueId))
          .orderBy(asc(PublicSchema.teams.id));

        if (teams.length < 2) {
          throw new Error('At least 2 teams are required to start a draft');
        }

        // Fisher-Yates shuffle for randomized draft order
        const shuffled = [...teams];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        // Upsert the draft record — update the existing one from league creation,
        // or create a new one if somehow missing
        const [existingDraft] = await context.db
          .select({ id: PublicSchema.drafts.id })
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.leagueId, leagueId))
          .orderBy(desc(PublicSchema.drafts.createdAt))
          .limit(1);

        let draft;
        if (existingDraft) {
          const [updated] = await context.db
            .update(PublicSchema.drafts)
            .set({
              draftMode: 'live',
              selectionMethod: 'standard',
              draftOrder: draftOrder,
              currentPick: 0,
              draftStartedAt: new Date(),
            })
            .where(eq(PublicSchema.drafts.id, existingDraft.id))
            .returning();
          draft = updated;
        } else {
          const [created] = await context.db
            .insert(PublicSchema.drafts)
            .values({
              leagueId,
              draftMode: 'live',
              selectionMethod: 'standard',
              draftOrder: draftOrder,
              currentPick: 0,
              draftStartedAt: new Date(),
            })
            .returning();
          draft = created;
        }

        // Insert draft_teams with the randomized order (1-indexed)
        await context.db.insert(PublicSchema.draftTeams).values(
          shuffled.map((team, index) => ({
            draftId: draft.id,
            teamId: team.id,
            leagueId,
            draftOrder: index + 1,
          })),
        );

        // Update league status to in-progress
        await context.db
          .update(PublicSchema.leagues)
          .set({ draftStatus: 'in-progress' })
          .where(eq(PublicSchema.leagues.id, leagueId));

        LOGGER.info('Live draft initialized', {
          leagueId,
          draftId: draft.id,
          draftOrder,
          teamCount: teams.length,
        });

        // Notify all league connections that the draft has started
        if (context.notificationService) {
          await context.notificationService.notifyDraftStarted(
            leagueId,
            draft.id,
            draftOrder,
            teams.length,
          );
        }

        return draft;
      } catch (error) {
        LOGGER.error('Error initializing live draft', {
          leagueId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
);

// ── Update Draft Settings ────────────────────────────────────────────────────

// Input type for updating draft settings before a draft starts
const UpdateDraftSettingsInput = builder.inputType('UpdateDraftSettingsInput', {
  fields: (t) => ({
    leagueId: t.int({ required: true }),
    draftMode: t.string({ required: false }), // 'live' | 'automated'
    selectionMethod: t.string({ required: false }), // 'standard' | 'auction' | 'random'
    draftOrder: t.string({ required: false }), // 'snake' | 'linear'
    playerPool: t.string({ required: false }), // 'all' | 'nl' | 'al'
  }),
});

// Payload for draft settings update — returns the updated draft record
const UpdateDraftSettingsPayload = builder.objectRef<{
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

/**
 * Mutation: Update draft settings (mode, selection method, order, player pool).
 * Only allowed when the league's draftStatus is 'not-started'.
 */
builder.mutationField('updateDraftSettings', (t) =>
  t.field({
    type: UpdateDraftSettingsPayload,
    args: {
      input: t.arg({ type: UpdateDraftSettingsInput, required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required to update draft settings');
      }

      const { leagueId, draftMode, selectionMethod, draftOrder, playerPool } =
        args.input;
      const userId = context.user.id;

      try {
        // Verify user is the league owner
        const [league] = await context.db
          .select({
            id: PublicSchema.leagues.id,
            owner: PublicSchema.leagues.owner,
            draftStatus: PublicSchema.leagues.draftStatus,
            playerPool: PublicSchema.leagues.playerPool,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        if (!league) {
          throw new Error('League not found');
        }

        if (league.owner !== userId) {
          throw new Error('Only the league owner can update draft settings');
        }

        // Prevent changes after draft has started
        if (league.draftStatus !== 'not-started') {
          throw new Error(
            'Draft settings cannot be changed after the draft has been started',
          );
        }

        // Validate enum values
        const validDraftModes = ['live', 'automated'];
        const validSelectionMethods = ['standard', 'auction', 'random'];
        const validDraftOrders = ['snake', 'linear'];
        const validPlayerPools = ['all', 'nl', 'al'];

        if (draftMode && !validDraftModes.includes(draftMode)) {
          throw new Error(
            `Invalid draft mode: ${draftMode}. Must be one of: ${validDraftModes.join(', ')}`,
          );
        }
        if (
          selectionMethod &&
          !validSelectionMethods.includes(selectionMethod)
        ) {
          throw new Error(
            `Invalid selection method: ${selectionMethod}. Must be one of: ${validSelectionMethods.join(', ')}`,
          );
        }
        if (draftOrder && !validDraftOrders.includes(draftOrder)) {
          throw new Error(
            `Invalid draft order: ${draftOrder}. Must be one of: ${validDraftOrders.join(', ')}`,
          );
        }
        if (playerPool && !validPlayerPools.includes(playerPool)) {
          throw new Error(
            `Invalid player pool: ${playerPool}. Must be one of: ${validPlayerPools.join(', ')}`,
          );
        }

        // Update playerPool on the league if provided
        let updatedPlayerPool = league.playerPool;
        if (playerPool) {
          const [updatedLeague] = await context.db
            .update(PublicSchema.leagues)
            .set({
              playerPool: playerPool as 'all' | 'nl' | 'al',
              updatedAt: new Date(),
            })
            .where(eq(PublicSchema.leagues.id, leagueId))
            .returning({ playerPool: PublicSchema.leagues.playerPool });
          updatedPlayerPool = updatedLeague.playerPool;
        }

        // Check if a draft record exists, create one if not
        let [existingDraft] = await context.db
          .select()
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.leagueId, leagueId))
          .limit(1);

        // Cross-validate: automated drafts only support 'random' selection
        const effectiveDraftMode = draftMode ?? existingDraft?.draftMode;
        const effectiveSelectionMethod =
          selectionMethod ?? existingDraft?.selectionMethod;

        if (
          effectiveDraftMode === 'automated' &&
          effectiveSelectionMethod &&
          effectiveSelectionMethod !== 'random'
        ) {
          throw new Error(
            "Automated drafts only support the 'random' selection method.",
          );
        }

        const draftUpdates: Record<string, unknown> = {
          updatedAt: new Date(),
        };
        if (draftMode) {
          draftUpdates['draftMode'] = draftMode as 'live' | 'automated';
        }
        if (selectionMethod) {
          draftUpdates['selectionMethod'] = selectionMethod as
            | 'standard'
            | 'auction'
            | 'random';
        }
        if (draftOrder) {
          draftUpdates['draftOrder'] = draftOrder as 'snake' | 'linear';
        }

        if (existingDraft) {
          const [updated] = await context.db
            .update(PublicSchema.drafts)
            .set(draftUpdates)
            .where(eq(PublicSchema.drafts.id, existingDraft.id))
            .returning();
          existingDraft = updated;
        } else {
          const [created] = await context.db
            .insert(PublicSchema.drafts)
            .values({
              leagueId,
              draftMode: (draftMode as 'live' | 'automated') || 'live',
              selectionMethod:
                (selectionMethod as 'standard' | 'auction' | 'random') ||
                'standard',
              draftOrder: (draftOrder as 'snake' | 'linear') || 'snake',
              currentPick: 0,
            })
            .returning();
          existingDraft = created;
        }

        LOGGER.info('Draft settings updated successfully', {
          leagueId,
          draftMode: existingDraft.draftMode,
          selectionMethod: existingDraft.selectionMethod,
          draftOrder: existingDraft.draftOrder,
          playerPool: updatedPlayerPool,
        });

        // Post a system chat notification so all league members see the change
        const username = context.user.username ?? `user_${userId}`;
        const changedFields: string[] = [];
        if (draftMode) changedFields.push(`mode → ${draftMode}`);
        if (selectionMethod)
          changedFields.push(`selection → ${selectionMethod}`);
        if (draftOrder) changedFields.push(`order → ${draftOrder}`);
        if (playerPool) changedFields.push(`player pool → ${playerPool}`);
        const changesSummary =
          changedFields.length > 0 ? ` (${changedFields.join(', ')})` : '';
        const notificationText = `${username} updated draft settings${changesSummary}.`;

        const [chatMsg] = await context.db
          .insert(PublicSchema.leagueMessages)
          .values({ leagueId, userId, messageText: notificationText })
          .returning();

        const notificationService = createNotificationService();
        if (notificationService) {
          notificationService
            .notifyLeagueChatMessage(leagueId, {
              leagueId,
              messageId: chatMsg.id,
              senderId: userId,
              senderUsername: username,
              messageText: notificationText,
              timestamp: chatMsg.timestamp ?? new Date().toISOString(),
            })
            .catch((err: unknown) => {
              LOGGER.warn(
                'Failed to send league chat WS notification for settings update',
                { err },
              );
            });
        }

        return {
          ...existingDraft,
          playerPool: updatedPlayerPool,
        };
      } catch (error) {
        LOGGER.error('Error updating draft settings', {
          leagueId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
);
