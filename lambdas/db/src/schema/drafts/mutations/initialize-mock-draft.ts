/**
 * Draft mutation: initializeMockDraft (LS-470, LS-9144, LS-9181)
 *
 * Creates an ephemeral mock draft league using the real EliteDraftBoard UI.
 * No rosters are persisted and no matchups are created at the end.
 *
 * Two modes, selected by `isOffline`:
 *
 *  - Offline (isOffline=true): solo practice against AI auto-pick teams,
 *    unchanged since LS-9144. Steps:
 *     1. Create a temporary league (isMockDraft=true, draftStatus='in-progress')
 *     2. Create numTeams teams – one human team at userPickPosition, rest CPU
 *     3. Register the human as a commissioner member of the league
 *     4. Create the draft + draft_teams rows (CPU teams: autoPick=true)
 *     5. Set an initial pick deadline
 *
 *  - Shared (isOffline=false, LS-9181): a real multiplayer lobby other users
 *    can join via `joinMockDraft` before it starts, mirroring how real
 *    leagues work pre-draft:
 *     1. Create a temporary league (isMockDraft=true, draftStatus='not-started')
 *     2. Create numTeams teams – one human team ("My Team") at
 *        userPickPosition, the rest left open ("Open Slot N") for joiners
 *     3. Register the creator as a commissioner member of the league
 *     4. Create the draft record with the chosen settings, but no
 *        draft_teams rows yet — `initializeDraft` (the same generic mutation
 *        real leagues use to start their draft, reused here unmodified)
 *        creates those when the commissioner starts the draft, seating any
 *        still-open slots with AI auto-pick teams.
 *
 * Returns { leagueId, draftId, inviteCode } so the front-end can render
 * EliteDraftBoardScreen (which already renders PreDraftLobby for any
 * not-started league) and, for Shared mode, share the invite code.
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
const VALID_SPORTS = ['baseball', 'football'] as const;
const BASEBALL_ONLY_POOLS = ['nl', 'al'] as const;
const FOOTBALL_ONLY_POOLS = ['nfl', 'afc', 'nfc'] as const;

type DraftOrder = (typeof VALID_DRAFT_ORDERS)[number];
type PlayerPool = (typeof VALID_PLAYER_POOLS)[number];
type MockDraftSport = (typeof VALID_SPORTS)[number];

// "Offline" mock drafts (LS-9144) never put the human drafter's own turn on
// a real clock — no countdown UI, no auto-pick-on-timeout. Rather than making
// drafts.pick_time_limit_seconds nullable (a schema change touching every
// real draft), offline drafts get a generous sentinel deadline instead. The
// commitDraftPick/autoProcessDraftPicks machinery still relies on a non-null
// deadline to chain immediate CPU auto-picks (that override always sets an
// explicitly-expired deadline regardless of this value), so a long sentinel
// is sufficient: in practice the human is never kept waiting by it.
const OFFLINE_PICK_TIME_LIMIT_SECONDS = 60 * 60 * 24; // 24 hours

function isValidDraftOrder(v: string): v is DraftOrder {
  return (VALID_DRAFT_ORDERS as readonly string[]).includes(v);
}

function isValidPlayerPool(v: string): v is PlayerPool {
  return (VALID_PLAYER_POOLS as readonly string[]).includes(v);
}

function isValidSport(v: string): v is MockDraftSport {
  return (VALID_SPORTS as readonly string[]).includes(v);
}

// ── Response type ────────────────────────────────────────────────────────────

interface MockDraftInitShape {
  leagueId: number;
  draftId: number;
  webSocketReady: boolean;
  inviteCode: string;
}

const MockDraftInit = builder.objectRef<MockDraftInitShape>('MockDraftInit');

builder.objectType(MockDraftInit, {
  description: 'Identifiers for a newly created mock draft session',
  fields: (t) => ({
    leagueId: t.exposeInt('leagueId'),
    draftId: t.exposeInt('draftId'),
    webSocketReady: t.exposeBoolean('webSocketReady', {
      description:
        'False if the draft-started WebSocket notification failed to send. ' +
        'The draft itself was created successfully either way; when false, ' +
        'the client should fall back to polling immediately instead of ' +
        'waiting for a WS event that will never arrive.',
    }),
    inviteCode: t.exposeString('inviteCode', {
      description:
        'Invite code other real users can redeem via joinMockDraft to be ' +
        'seated into an open slot (LS-9181). Always present, but only ' +
        'useful for a Shared (non-offline) mock draft that has not yet ' +
        'been started — offline drafts and already-started drafts have no ' +
        'open slots left to join.',
    }),
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
      'Create an ephemeral mock draft league. Offline mode practices solo against ' +
      'AI teams; Shared mode opens a joinable lobby other real users can enter via ' +
      'joinMockDraft using the returned inviteCode, seating into whichever slots ' +
      'stay open when the commissioner starts the draft (LS-9181). Picks are ' +
      'recorded but rosters are not persisted to any real league.',
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
      sport: t.arg.string({
        required: false,
        description:
          'Sport for the mock draft league: "baseball" (default) or "football" (LS-9040).',
      }),
      isOffline: t.arg.boolean({
        required: false,
        description:
          'When true, starts an "Offline" mock draft (LS-9144): a single-person ' +
          "practice session with no pick-clock pressure on the human's own turns. " +
          'AI opponents still auto-pick immediately. Ignores pickTimeLimitSeconds. Default: false.',
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
        sport: rawSport,
        isOffline: rawIsOffline,
      } = args;
      const userId = context.user.id;
      const isOffline = rawIsOffline ?? false;
      // Mock drafts use a shorter default timer (30 s) so practice sessions
      // complete quickly. The caller can override via pickTimeLimitSeconds.
      // Offline drafts ignore the caller's time limit entirely — see
      // OFFLINE_PICK_TIME_LIMIT_SECONDS above.
      const pickTimeLimit = isOffline
        ? OFFLINE_PICK_TIME_LIMIT_SECONDS
        : (rawTimeLimit ?? 30);
      const draftOrder = rawDraftOrder ?? 'snake';
      const playerPool = rawPlayerPool ?? 'all';
      const sport = rawSport ?? 'baseball';

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
      if (!isValidSport(sport)) {
        throw UserInputError('sport must be "baseball" or "football"');
      }
      if (
        sport === 'baseball' &&
        (FOOTBALL_ONLY_POOLS as readonly string[]).includes(playerPool)
      ) {
        throw UserInputError(
          `playerPool "${playerPool}" is not valid for a baseball mock draft`,
        );
      }
      if (
        sport === 'football' &&
        (BASEBALL_ONLY_POOLS as readonly string[]).includes(playerPool)
      ) {
        throw UserInputError(
          `playerPool "${playerPool}" is not valid for a football mock draft`,
        );
      }
      if (!isOffline && rawTimeLimit !== null && rawTimeLimit !== undefined) {
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
        sport,
        isOffline,
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
          sport,
          playerPool,
          maxRosterSize: rosterSize,
          draftStatus: 'not-started' as const,
          inviteCode,
          minCareerGames: 0,
          minCareerSeasons: 0,
          isMockDraft: true,
          isOfflineDraft: isOffline,
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
          /** Null for a Shared lobby that hasn't been started yet (LS-9181). */
          initialDeadline: Date | null;
        }

        const txResult: TxResult = await context.db.transaction(async (tx) => {
          // ── 1. Create ephemeral league ──────────────────────────────────
          const [league] = await tx
            .insert(PublicSchema.leagues)
            .values(leagueValues)
            .returning();

          // ── 2. Create teams ─────────────────────────────────────────────
          // Teams are created in draft-order slots 1..numTeams.
          // Slot userPickPosition belongs to the human; the rest are CPU for
          // Offline drafts, or left "Open" for real players to claim via
          // joinMockDraft for Shared drafts (LS-9181).
          const teamInserts = Array.from({ length: numTeams }, (_, i) => ({
            name:
              i + 1 === userPickPosition
                ? 'My Team'
                : isOffline
                  ? `CPU Team ${i + 1}`
                  : `Open Slot ${i + 1}`,
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
              ...(isOffline ? { draftStartedAt: new Date() } : {}),
            })
            .returning();

          if (!isOffline) {
            // Shared mode (LS-9181): stop here. The league stays
            // 'not-started' with open slots so other real users can join via
            // joinMockDraft; the commissioner starts the draft later via the
            // same generic `initializeDraft` mutation real leagues use (it
            // creates draft_teams and auto-picks any still-open slots).
            return {
              leagueId: league.id,
              draftId: draft.id,
              humanTeamId,
              initialDeadline: null,
            };
          }

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
        // initializeDraft). Caught separately from the transaction: the
        // draft already exists at this point, so a notification failure
        // must not fail the mutation and strand the client without
        // leagueId/draftId (LS-6954). webSocketReady tells the client
        // whether to expect the WS event or fall back to polling now.
        // Shared-mode lobbies (initialDeadline === null) haven't started, so
        // there's no "draft started" event to send yet — that fires later
        // from initializeDraft when the commissioner actually starts it.
        let webSocketReady = true;
        if (txResult.initialDeadline && context.notificationService) {
          try {
            await context.notificationService.notifyDraftStarted(
              txResult.leagueId,
              txResult.draftId,
              draftOrder,
              numTeams,
              pickTimeLimit,
              txResult.initialDeadline.toISOString(),
            );
          } catch (notificationError) {
            webSocketReady = false;
            LOGGER.error(
              'Failed to send draft-started notification for mock draft',
              notificationError instanceof Error
                ? notificationError
                : new Error(String(notificationError)),
              { leagueId: txResult.leagueId, draftId: txResult.draftId },
            );
          }
        } else if (txResult.initialDeadline) {
          webSocketReady = false;
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
          sport,
          webSocketReady,
        });

        return {
          leagueId: txResult.leagueId,
          draftId: txResult.draftId,
          webSocketReady,
          inviteCode,
        };
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
