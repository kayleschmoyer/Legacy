/**
 * Draft mutation: initializeMockDraft (LS-470)
 *
 * Creates an ephemeral mock draft for a logged-in user to practice against
 * AI auto-pick teams using the real EliteDraftBoard UI.
 * No rosters are persisted and no matchups are created at the end.
 *
 * Steps:
 *  1. Create a temporary league (isMockDraft=true)
 *  2. Create numTeams teams – one human team at userPickPosition, the rest CPU
 *  3. Register the human as a commissioner member of the league
 *  4. Create the draft record and draft_teams rows (CPU teams: autoPick=true)
 *  5. Set draftStatus → 'in-progress' with an initial pick deadline
 *  6. Return { leagueId, draftId } so the front-end can render EliteDraftBoardScreen
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, count, eq, gte } from 'drizzle-orm';

import { builder } from '../../builder';
import {
  AuthenticationError,
  PremiumRequiredError,
  UserInputError,
} from '../../graphql-errors';
import { getSubscriptionTier } from '../../authorization';

// ── Allowed values ───────────────────────────────────────────────────────────

const VALID_DRAFT_ORDERS = ['snake', 'linear'] as const;
const VALID_PLAYER_POOLS = ['all', 'nl', 'al'] as const;

type DraftOrder = (typeof VALID_DRAFT_ORDERS)[number];
type PlayerPool = (typeof VALID_PLAYER_POOLS)[number];

function isValidDraftOrder(v: string): v is DraftOrder {
  return (VALID_DRAFT_ORDERS as readonly string[]).includes(v);
}

function isValidPlayerPool(v: string): v is PlayerPool {
  return (VALID_PLAYER_POOLS as readonly string[]).includes(v);
}

// ── Response type ────────────────────────────────────────────────────────────

interface MockDraftInitShape {
  leagueId: number;
  draftId: number;
}

const MockDraftInit = builder.objectRef<MockDraftInitShape>('MockDraftInit');

builder.objectType(MockDraftInit, {
  description: 'Identifiers for a newly created mock draft session',
  fields: (t) => ({
    leagueId: t.exposeInt('leagueId'),
    draftId: t.exposeInt('draftId'),
  }),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ── Mutation ─────────────────────────────────────────────────────────────────

builder.mutationField('initializeMockDraft', (t) =>
  t.field({
    type: MockDraftInit,
    description:
      'Create an ephemeral mock draft league to practice drafting against AI teams. ' +
      'Picks are recorded but rosters are not persisted to any real league.',
    args: {
      numTeams: t.arg.int({
        required: true,
        description: 'Total number of teams in the mock draft (2–12)',
      }),
      rosterSize: t.arg.int({
        required: true,
        description: 'Number of roster slots per team',
      }),
      userPickPosition: t.arg.int({
        required: true,
        description: 'The 1-based draft slot the human user will draft from',
      }),
      pickTimeLimitSeconds: t.arg.int({
        required: false,
        description: 'Seconds per pick (default: 30 for mock drafts)',
      }),
      draftOrder: t.arg.string({
        required: false,
        description: 'Draft order style: "snake" (default) or "linear"',
      }),
      playerPool: t.arg.string({
        required: false,
        description:
          'Player pool to draft from: "all" (default), "nl" (NL only), or "al" (AL only)',
      }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to initialize a mock draft',
        );
      }

      const {
        numTeams,
        rosterSize,
        userPickPosition,
        pickTimeLimitSeconds: rawTimeLimit,
        draftOrder: rawDraftOrder,
        playerPool: rawPlayerPool,
      } = args;
      const userId = context.user.id;
      // Mock drafts use a shorter default timer (30 s) so practice sessions
      // complete quickly.  The caller can override via pickTimeLimitSeconds.
      const pickTimeLimit = rawTimeLimit ?? 30;
      const draftOrder = rawDraftOrder ?? 'snake';
      const playerPool = rawPlayerPool ?? 'all';

      // Validate inputs
      if (numTeams < 2 || numTeams > 12) {
        throw UserInputError('numTeams must be between 2 and 12');
      }
      if (rosterSize < 1 || rosterSize > 50) {
        throw UserInputError('rosterSize must be between 1 and 50');
      }
      if (userPickPosition < 1 || userPickPosition > numTeams) {
        throw UserInputError(
          `userPickPosition must be between 1 and ${numTeams}`,
        );
      }
      if (!isValidDraftOrder(draftOrder)) {
        throw UserInputError('draftOrder must be "snake" or "linear"');
      }
      if (!isValidPlayerPool(playerPool)) {
        throw UserInputError('playerPool must be "all", "nl", or "al"');
      }

      // ── Premium feature gating: max 2 mock drafts/week for free tier ────
      const isAdmin = context.user?.isAdmin === true;
      if (!isAdmin) {
        const tier = await getSubscriptionTier(context);
        if (tier !== 'premium') {
          const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const [{ mockDraftCount }] = await context.db
            .select({ mockDraftCount: count() })
            .from(PublicSchema.leagues)
            .where(
              and(
                eq(PublicSchema.leagues.owner, userId),
                eq(PublicSchema.leagues.isMockDraft, true),
                gte(PublicSchema.leagues.createdAt, oneWeekAgo),
              ),
            );
          if (mockDraftCount >= 2) {
            throw PremiumRequiredError(
              'Free tier is limited to 2 mock drafts per week. Upgrade to premium for unlimited mock drafts.',
            );
          }
        }
      }

      LOGGER.info('Initializing mock draft', {
        userId,
        numTeams,
        rosterSize,
        userPickPosition,
        draftOrder,
        playerPool,
      });

      try {
        // ── 1. Create ephemeral league ──────────────────────────────────────
        // Generate a unique invite code (mock drafts are never joined via code
        // but the column has a UNIQUE constraint)
        let inviteCode = generateInviteCode();
        for (let attempt = 0; attempt < 10; attempt++) {
          const existing = await context.db
            .select({ id: PublicSchema.leagues.id })
            .from(PublicSchema.leagues)
            .where(eq(PublicSchema.leagues.inviteCode, inviteCode))
            .limit(1);
          if (existing.length === 0) break;
          inviteCode = generateInviteCode();
        }

        // No career-game/season restrictions for mock drafts — all players eligible
        const leagueValues = {
          name: 'Mock Draft Practice',
          owner: userId,
          playerPool,
          maxRosterSize: rosterSize,
          draftStatus: 'not-started' as const,
          inviteCode,
          minCareerGames: 0,
          minCareerSeasons: 0,
          isMockDraft: true,
        };
        const [league] = await context.db
          .insert(PublicSchema.leagues)
          .values(leagueValues)
          .returning();

        LOGGER.info('Mock draft league created', { leagueId: league.id });

        // ── 2. Create teams ─────────────────────────────────────────────────
        // Teams are created in draft-order slots 1..numTeams.
        // Slot userPickPosition belongs to the human; rest are CPU.
        const teamInserts = Array.from({ length: numTeams }, (_, i) => ({
          name: i + 1 === userPickPosition ? 'My Team' : `CPU Team ${i + 1}`,
          leagueId: league.id,
        }));

        const teams = await context.db
          .insert(PublicSchema.teams)
          .values(teamInserts)
          .returning({ id: PublicSchema.teams.id });

        // The team at index (userPickPosition - 1) is the human's team
        const humanTeamId = teams[userPickPosition - 1].id;

        // ── 3. Register the human as a commissioner league member ───────────
        await context.db.insert(PublicSchema.leagueMembers).values({
          leagueId: league.id,
          userId,
          teamId: humanTeamId,
          permissionLevel: 'commissioner',
        });

        // ── 4. Create the draft record ──────────────────────────────────────
        const [draft] = await context.db
          .insert(PublicSchema.drafts)
          .values({
            leagueId: league.id,
            draftMode: 'live',
            selectionMethod: 'standard',
            draftOrder,
            currentPick: 0,
            pickTimeLimitSeconds: pickTimeLimit,
            draftStartedAt: new Date(),
          })
          .returning();

        // ── 5. Create draft_teams rows ──────────────────────────────────────
        // Maintains the requested draft order; CPU teams get autoPick=true
        await context.db.insert(PublicSchema.draftTeams).values(
          teams.map((team, i) => ({
            draftId: draft.id,
            teamId: team.id,
            leagueId: league.id,
            draftOrder: i + 1,
            autoPick: team.id !== humanTeamId,
          })),
        );

        // ── 6. Set league status to in-progress and initial pick deadline ───
        // If the first pick belongs to a CPU team (human is not in slot 1),
        // immediately expire the deadline so autoProcessDraftPicks fires as
        // soon as the client nudges (~2 s after loading the draft board).
        const firstPickIsCpu = userPickPosition !== 1;
        const initialDeadline = firstPickIsCpu
          ? new Date(Date.now() - 1)
          : new Date(Date.now() + pickTimeLimit * 1000);
        await context.db
          .update(PublicSchema.drafts)
          .set({ currentPickDeadline: initialDeadline })
          .where(eq(PublicSchema.drafts.id, draft.id));

        await context.db
          .update(PublicSchema.leagues)
          .set({ draftStatus: 'in-progress' })
          .where(eq(PublicSchema.leagues.id, league.id));

        // Notify over WebSocket that draft has started (so EliteDraftBoardScreen
        // receives the DRAFT_STARTED event and transitions into drafting mode)
        if (context.notificationService) {
          await context.notificationService.notifyDraftStarted(
            league.id,
            draft.id,
            draftOrder,
            numTeams,
            pickTimeLimit,
            initialDeadline.toISOString(),
          );
        }

        LOGGER.info('Mock draft initialized', {
          leagueId: league.id,
          draftId: draft.id,
          numTeams,
          rosterSize,
          userPickPosition,
          humanTeamId,
          draftOrder,
          playerPool,
        });

        return { leagueId: league.id, draftId: draft.id };
      } catch (error) {
        LOGGER.error(
          'Error initializing mock draft',
          error instanceof Error ? error : new Error(String(error)),
          { userId },
        );
        throw error;
      }
    },
  }),
);
