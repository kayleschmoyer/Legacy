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
import { randomBytes } from 'node:crypto';

import { builder } from '../../builder';
import {
  AuthenticationError,
  PremiumRequiredError,
  UserInputError,
} from '../../graphql-errors';
import { hasEntitlement } from '../../authorization';
import { ENTITLEMENTS } from '../../entitlements';
import {
  countRecentMockDrafts,
  MOCK_DRAFT_FREE_WEEKLY_LIMIT,
} from '../helpers';

// ── Allowed values ───────────────────────────────────────────────────────────

const VALID_DRAFT_ORDERS = ['snake', 'linear'] as const;
const VALID_PLAYER_POOLS = ['all', 'nl', 'al', 'nfl', 'afc', 'nfc'] as const;

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
  // 32-char alphabet (omits ambiguous 0/O/1/I) → exactly 5 bits per char, so
  // masking a random byte with 0x1f yields an unbiased index (256 % 32 === 0).
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(bytes[i] & 0x1f);
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
          'Player pool to draft from. Baseball: "all" (default), "nl" (NL only), "al" (AL only). Football: "all", "nfl", "afc" (AFC only), "nfc" (NFC only).',
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
        throw UserInputError(
          'playerPool must be one of: "all", "nl", "al", "nfl", "afc", "nfc"',
        );
      }
      if (rawTimeLimit !== null && rawTimeLimit !== undefined) {
        if (rawTimeLimit < 10 || rawTimeLimit > 300) {
          throw UserInputError(
            'pickTimeLimitSeconds must be between 10 and 300',
          );
        }
      }

      // ── Feature gating: free tier is capped at MOCK_DRAFT_FREE_WEEKLY_LIMIT
      // mock drafts per rolling 7-day window (unlimited_mock_drafts exempts).
      // The same count + limit is surfaced pre-submit via getMyMockDraftUsage
      // so the UI can reflect the limit before the user hits it (LS-5178).
      if (
        !(await hasEntitlement(context, ENTITLEMENTS.unlimited_mock_drafts))
      ) {
        const mockDraftCount = await countRecentMockDrafts(context.db, userId);
        if (mockDraftCount >= MOCK_DRAFT_FREE_WEEKLY_LIMIT) {
          throw PremiumRequiredError(
            `You have reached the ${MOCK_DRAFT_FREE_WEEKLY_LIMIT} mock drafts per week limit for your current plan. Upgrade to unlock unlimited mock drafts.`,
          );
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
        // Generate invite code outside the transaction (read-only probe, no need
        // to hold a lock). A race-condition collision on the UNIQUE constraint
        // is extremely rare; if it happens the transaction rolls back cleanly.
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

        // ── Steps 1-6: single atomic transaction ─────────────────────────────
        // All DB writes are wrapped in one transaction so a failure at any step
        // rolls everything back, preventing orphaned draft records without
        // draft_teams (which would cause getCurrentDraftPickInfo to throw
        // "No teams configured for this draft" — LS-4853).
        interface TxResult {
          leagueId: number;
          draftId: number;
          humanTeamId: number;
          initialDeadline: Date;
        }

        const txResult: TxResult = await context.db.transaction(async (tx) => {
          // ── 1. Create ephemeral league ──────────────────────────────────
          const [league] = await tx
            .insert(PublicSchema.leagues)
            .values(leagueValues)
            .returning();

          // ── 2. Create teams ─────────────────────────────────────────────
          // Teams are created in draft-order slots 1..numTeams.
          // Slot userPickPosition belongs to the human; rest are CPU.
          const teamInserts = Array.from({ length: numTeams }, (_, i) => ({
            name: i + 1 === userPickPosition ? 'My Team' : `CPU Team ${i + 1}`,
            leagueId: league.id,
          }));

          const teams = await tx
            .insert(PublicSchema.teams)
            .values(teamInserts)
            .returning({ id: PublicSchema.teams.id });

          // The team at index (userPickPosition - 1) is the human's team
          const humanTeamId = teams[userPickPosition - 1].id;

          // ── 3. Register the human as a commissioner league member ────────
          await tx.insert(PublicSchema.leagueMembers).values({
            leagueId: league.id,
            userId,
            teamId: humanTeamId,
            permissionLevel: 'commissioner',
          });

          // ── 4. Create the draft record ───────────────────────────────────
          const [draft] = await tx
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

          // ── 5. Create draft_teams rows ───────────────────────────────────
          // Maintains the requested draft order; CPU teams get autoPick=true
          await tx.insert(PublicSchema.draftTeams).values(
            teams.map((team, i) => ({
              draftId: draft.id,
              teamId: team.id,
              leagueId: league.id,
              draftOrder: i + 1,
              autoPick: team.id !== humanTeamId,
            })),
          );

          // ── 6. Set league status to in-progress and initial pick deadline ─
          // If the first pick belongs to a CPU team (human is not in slot 1),
          // immediately expire the deadline so autoProcessDraftPicks fires as
          // soon as the client nudges (~2 s after loading the draft board).
          const firstPickIsCpu = userPickPosition !== 1;
          const initialDeadline = firstPickIsCpu
            ? new Date(Date.now() - 1)
            : new Date(Date.now() + pickTimeLimit * 1000);

          await tx
            .update(PublicSchema.drafts)
            .set({ currentPickDeadline: initialDeadline })
            .where(eq(PublicSchema.drafts.id, draft.id));

          await tx
            .update(PublicSchema.leagues)
            .set({ draftStatus: 'in-progress' })
            .where(eq(PublicSchema.leagues.id, league.id));

          return {
            leagueId: league.id,
            draftId: draft.id,
            humanTeamId,
            initialDeadline,
          };
        });

        // ── Post-transaction: WebSocket notification ──────────────────────
        // Kept outside the transaction so a notification failure does not
        // roll back the already-committed draft state (same pattern as
        // initializeDraft).
        if (context.notificationService) {
          await context.notificationService.notifyDraftStarted(
            txResult.leagueId,
            txResult.draftId,
            draftOrder,
            numTeams,
            pickTimeLimit,
            txResult.initialDeadline.toISOString(),
          );
        }

        LOGGER.info('Mock draft initialized', {
          leagueId: txResult.leagueId,
          draftId: txResult.draftId,
          numTeams,
          rosterSize,
          userPickPosition,
          humanTeamId: txResult.humanTeamId,
          draftOrder,
          playerPool,
        });

        return { leagueId: txResult.leagueId, draftId: txResult.draftId };
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
