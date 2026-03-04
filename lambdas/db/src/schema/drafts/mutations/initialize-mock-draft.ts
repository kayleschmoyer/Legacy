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
import { eq } from 'drizzle-orm';

import { builder } from '../../builder';
import { AuthenticationError } from '../../graphql-errors';

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
        description: 'Seconds per pick (default: 120)',
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
      } = args;
      const userId = context.user.id;
      const pickTimeLimit = rawTimeLimit ?? 120;

      // Validate inputs
      if (numTeams < 2 || numTeams > 12) {
        throw new Error('numTeams must be between 2 and 12');
      }
      if (rosterSize < 1 || rosterSize > 50) {
        throw new Error('rosterSize must be between 1 and 50');
      }
      if (userPickPosition < 1 || userPickPosition > numTeams) {
        throw new Error(`userPickPosition must be between 1 and ${numTeams}`);
      }

      LOGGER.info('Initializing mock draft', {
        userId,
        numTeams,
        rosterSize,
        userPickPosition,
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

        const [league] = await context.db
          .insert(PublicSchema.leagues)
          .values({
            name: 'Mock Draft Practice',
            owner: userId,
            maxRosterSize: rosterSize,
            draftStatus: 'not-started',
            inviteCode,
            playerPool: 'all',
            // No career-game/season restrictions for mock drafts — all players eligible
            minCareerGames: 0,
            minCareerSeasons: 0,
            isMockDraft: true,
          })
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
            draftOrder: 'snake',
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
        const initialDeadline = new Date(Date.now() + pickTimeLimit * 1000);
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
            'snake',
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
        });

        return { leagueId: league.id, draftId: draft.id };
      } catch (error) {
        LOGGER.error('Error initializing mock draft', {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
);
