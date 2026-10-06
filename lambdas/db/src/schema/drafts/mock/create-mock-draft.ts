/**
 * Mock draft mutation: createMockDraft (LS-10076)
 *
 * Creates a mock draft as a league-less `drafts` row. (It replaced the removed
 * `initializeMockDraft`, which built a throwaway league, teams and a
 * league_members row for every practice session.)
 *
 * Two modes:
 *
 *  - OFFLINE — solo practice against AI seats. Starts `in-progress` with every
 *    seat already filled: the host at `pickPosition`, AI on the rest. Control
 *    All Teams (LS-9253) instead seats the host on every slot and disables
 *    auto-pick entirely. The clock is the untimed sentinel.
 *  - ONLINE — a lobby. Starts `not-started` with the host's seat and the rest
 *    open for `joinMockDraft`; the host starts it with `startMockDraft`. The
 *    lobby expires 24h after creation.
 *
 * No `leagues`, `teams` or `league_members` row is written in either mode.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import {
  DEFAULT_ROSTER_SIZE_BY_SPORT,
  getPickPositionError,
  MAX_MOCK_DRAFT_TEAMS,
  MIN_MOCK_DRAFT_TEAMS,
} from '@legacy-sports/utils';
import { eq } from 'drizzle-orm';

import {
  assertPickTimeLimitInRange,
  assertPoolMatchesSport,
  cpuSeatName,
  DEFAULT_ONLINE_PICK_TIME_LIMIT_SECONDS,
  generateUnusedInviteCode,
  isValidDraftOrder,
  isValidPlayerPool,
  MOCK_DRAFT_LOBBY_TTL_MS,
  type MockDraftSport,
  OFFLINE_PICK_TIME_LIMIT_SECONDS,
  openSeatName,
} from './shared';
import { MockDraftModeEnum } from '../types';
import {
  countRecentMockDrafts,
  MOCK_DRAFT_FREE_WEEKLY_LIMIT,
} from '../helpers';
import { builder } from '../../builder';
import { hasEntitlement, requireEntitlement } from '../../authorization';
import { ENTITLEMENTS } from '../../entitlements';
import { SportKindEnum } from '../../leagues/types';
import {
  AuthenticationError,
  PremiumRequiredError,
  UserInputError,
} from '../../graphql-errors';

interface CreateMockDraftShape {
  draftId: number;
  inviteCode: string;
  webSocketReady: boolean;
}

const CreateMockDraftResult = builder.objectRef<CreateMockDraftShape>(
  'CreateMockDraftResult',
);

builder.objectType(CreateMockDraftResult, {
  description: 'Identifiers for a newly created mock draft (LS-10076).',
  fields: (t) => ({
    draftId: t.exposeInt('draftId'),
    inviteCode: t.exposeString('inviteCode', {
      description:
        'Code another user redeems via joinMockDraft. Only useful for an ' +
        'ONLINE lobby that has not started — an offline draft has no open seats.',
    }),
    webSocketReady: t.exposeBoolean('webSocketReady', {
      description:
        'False if the draft-started WebSocket notification failed to send. ' +
        'The draft exists either way; when false the client should poll ' +
        'immediately rather than wait for an event that will never arrive.',
    }),
  }),
});

builder.mutationField('createMockDraft', (t) =>
  t.field({
    type: CreateMockDraftResult,
    description:
      'Create a mock draft. OFFLINE practices solo against AI seats and starts ' +
      'immediately; ONLINE opens a lobby other users join via joinMockDraft. ' +
      'Picks are recorded but no roster, league or team is ever written.',
    args: {
      sport: t.arg({ type: SportKindEnum, required: false }),
      numTeams: t.arg.int({
        required: true,
        description: `Total number of seats (${MIN_MOCK_DRAFT_TEAMS}–${MAX_MOCK_DRAFT_TEAMS}).`,
      }),
      rosterSize: t.arg.int({
        required: false,
        description:
          "Deprecated and ignored (LS-10086). A mock draft always uses the sport's " +
          'default roster size so every starting slot can be filled. Retained so ' +
          'older clients keep working.',
      }),
      pickPosition: t.arg.int({
        required: true,
        description: "The 1-based slot the creator's own seat takes.",
      }),
      draftOrder: t.arg.string({
        required: false,
        description: '"snake" (default) or "linear".',
      }),
      playerPool: t.arg.string({
        required: false,
        description:
          'Baseball: "all" (default), "nl", "al". Football: "all", "nfl", "afc", "nfc".',
      }),
      pickTimeLimitSeconds: t.arg.int({
        required: false,
        description:
          'Seconds per pick for an ONLINE draft (10–300, default 30). Ignored for OFFLINE.',
      }),
      mode: t.arg({
        type: MockDraftModeEnum,
        required: false,
        description: 'OFFLINE (default) or ONLINE.',
      }),
      controlAllTeams: t.arg.boolean({
        required: false,
        description:
          "Premium (LS-9253): the host makes every seat's pick. Implies OFFLINE " +
          'and requires the mock_draft_control_all_teams entitlement.',
      }),
      isPublic: t.arg.boolean({
        required: false,
        description:
          'ONLINE only: the lobby is listed publicly and joinable by draft id ' +
          'without an invite code.',
      }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to create a mock draft',
        );
      }

      const userId = context.user.id;
      const sport: MockDraftSport = args.sport ?? 'baseball';
      const numTeams = args.numTeams;
      const pickPosition = args.pickPosition;
      const controlAllTeams = args.controlAllTeams ?? false;
      // Control All Teams always implies OFFLINE: with no CPU opponents to
      // wait on there is no reason to put the host on a pick clock, and the
      // untimed sentinel is the first line of defence against
      // autoProcessDraftPicks ever advancing this draft (belt-and-braces
      // alongside drafts.auto_pick_disabled, set below).
      const mode = controlAllTeams ? 'offline' : (args.mode ?? 'offline');
      const isOffline = mode === 'offline';
      const draftOrder = args.draftOrder ?? 'snake';
      const playerPool = args.playerPool ?? 'all';
      const isPublic = !isOffline && (args.isPublic ?? false);

      if (numTeams < MIN_MOCK_DRAFT_TEAMS || numTeams > MAX_MOCK_DRAFT_TEAMS) {
        throw UserInputError(
          `numTeams must be between ${MIN_MOCK_DRAFT_TEAMS} and ${MAX_MOCK_DRAFT_TEAMS}`,
        );
      }
      const pickPositionError = getPickPositionError(pickPosition, numTeams);
      if (pickPositionError) {
        throw UserInputError(pickPositionError);
      }
      if (!isValidDraftOrder(draftOrder)) {
        throw UserInputError('draftOrder must be "snake" or "linear"');
      }
      if (!isValidPlayerPool(playerPool)) {
        throw UserInputError(
          'playerPool must be one of: "all", "nl", "al", "nfl", "afc", "nfc"',
        );
      }
      assertPoolMatchesSport(sport, playerPool);
      if (!isOffline && args.pickTimeLimitSeconds != null) {
        assertPickTimeLimitInRange(args.pickTimeLimitSeconds);
      }

      const pickTimeLimit = isOffline
        ? OFFLINE_PICK_TIME_LIMIT_SECONDS
        : (args.pickTimeLimitSeconds ?? DEFAULT_ONLINE_PICK_TIME_LIMIT_SECONDS);

      // Free tier is capped at MOCK_DRAFT_FREE_WEEKLY_LIMIT drafts per rolling
      // 7-day window; unlimited_mock_drafts exempts. The same count is
      // surfaced pre-submit by getMyMockDraftUsage (LS-5178).
      if (
        !(await hasEntitlement(context, ENTITLEMENTS.unlimited_mock_drafts))
      ) {
        const used = await countRecentMockDrafts(context.db, userId);
        if (used >= MOCK_DRAFT_FREE_WEEKLY_LIMIT) {
          throw PremiumRequiredError(
            `You have reached the ${MOCK_DRAFT_FREE_WEEKLY_LIMIT} mock drafts per week limit for your current plan. Upgrade to unlock unlimited mock drafts.`,
          );
        }
      }

      // Control All Teams is a separate premium capability: a free user may
      // have drafts left this week and still not be able to start one this way.
      if (controlAllTeams) {
        await requireEntitlement(
          context,
          ENTITLEMENTS.mock_draft_control_all_teams,
        );
      }

      // A mock draft mirrors a real league of its sport (LS-10086): the full
      // default roster size, so every default starting slot is reachable. The
      // caller's rosterSize is ignored. 'idp' rather than the column default
      // 'dst' because career_football_defense is empty, so a 'dst' mock
      // draft's DST slot could never be filled (LS-9475).
      const rosterSize = DEFAULT_ROSTER_SIZE_BY_SPORT[sport];
      const defensiveFormat = 'idp' as const;

      const inviteCode = await generateUnusedInviteCode(context.db);

      const hostSeatName = context.user.username ?? 'My Team';

      const result = await context.db.transaction(async (tx) => {
        const [draft] = await tx
          .insert(PublicSchema.drafts)
          .values({
            leagueId: null,
            kind: 'mock',
            status: isOffline ? 'in-progress' : 'not-started',
            createdBy: userId,
            sport,
            mockMode: mode,
            controlAllTeams,
            isPublic,
            inviteCode,
            lobbyExpiresAt: isOffline
              ? null
              : new Date(Date.now() + MOCK_DRAFT_LOBBY_TTL_MS),
            draftMode: 'live',
            selectionMethod: 'standard',
            draftOrder,
            currentPick: 0,
            pickTimeLimitSeconds: pickTimeLimit,
            ...(isOffline ? { draftStartedAt: new Date() } : {}),
            // Control All Teams: the authoritative guard against auto-pick.
            // autoProcessDraftPicks excludes any draft with
            // auto_pick_disabled = true at the SQL level, however expired the
            // deadline becomes (LS-9253).
            autoPickDisabled: controlAllTeams,
          })
          .returning();

        await tx.insert(PublicSchema.mockDraftSettings).values({
          draftId: draft.id,
          playerPool,
          rosterSize,
          defensiveFormat,
          eraFilter: 'all',
          hofOnly: false,
          minCareerGames: 0,
          minCareerSeasons: 0,
        });

        // Seats. Offline fills the board immediately; online leaves every
        // other slot open for a joiner, and startMockDraft turns whatever is
        // still open into AI.
        const now = new Date();
        const seats = Array.from({ length: numTeams }, (_, index) => {
          const slot = index + 1;
          const isHostSeat = slot === pickPosition;

          if (controlAllTeams) {
            // Every seat is the host's — there is no CPU anywhere on the board.
            return {
              draftId: draft.id,
              slot,
              userId,
              controller: 'user' as const,
              seatName: isHostSeat ? hostSeatName : `Team ${String(slot)}`,
              autoPick: false,
              joinedAt: now,
            };
          }

          if (isHostSeat) {
            return {
              draftId: draft.id,
              slot,
              userId,
              controller: 'user' as const,
              seatName: hostSeatName,
              autoPick: false,
              joinedAt: now,
            };
          }

          return isOffline
            ? {
                draftId: draft.id,
                slot,
                userId: null,
                controller: 'ai' as const,
                seatName: cpuSeatName(slot),
                autoPick: true,
                joinedAt: null,
              }
            : {
                draftId: draft.id,
                slot,
                userId: null,
                controller: 'open' as const,
                seatName: openSeatName(slot),
                autoPick: false,
                joinedAt: null,
              };
        });

        await tx.insert(PublicSchema.draftParticipants).values(seats);

        if (!isOffline) {
          return { draftId: draft.id, initialDeadline: null };
        }

        // If the first pick belongs to an AI seat, expire the deadline now so
        // autoProcessDraftPicks fires as soon as the client nudges. Control
        // All Teams never seats AI, so another slot's turn is still a human
        // turn and must not be treated as a CPU one (LS-9369).
        const firstPickIsCpu = !controlAllTeams && pickPosition !== 1;
        const initialDeadline = firstPickIsCpu
          ? new Date(Date.now() - 1)
          : new Date(Date.now() + pickTimeLimit * 1000);

        await tx
          .update(PublicSchema.drafts)
          .set({ currentPickDeadline: initialDeadline })
          .where(eq(PublicSchema.drafts.id, draft.id));

        return { draftId: draft.id, initialDeadline };
      });

      // Outside the transaction: a notification failure must not roll back an
      // already-created draft and strand the client without a draftId
      // (LS-6954). An online lobby has not started, so there is no
      // draft-started event to send yet — startMockDraft sends it.
      let webSocketReady = true;
      if (result.initialDeadline) {
        if (context.notificationService) {
          try {
            await context.notificationService.notifyDraftStarted(
              null,
              result.draftId,
              draftOrder,
              numTeams,
              pickTimeLimit,
              result.initialDeadline.toISOString(),
            );
          } catch (notificationError) {
            webSocketReady = false;
            LOGGER.error(
              'Failed to send draft-started notification for mock draft',
              notificationError instanceof Error
                ? notificationError
                : new Error(String(notificationError)),
              { draftId: result.draftId },
            );
          }
        } else {
          webSocketReady = false;
        }
      }

      LOGGER.info('Mock draft created', {
        draftId: result.draftId,
        userId,
        sport,
        numTeams,
        pickPosition,
        mode,
        controlAllTeams,
        isPublic,
        webSocketReady,
      });

      return { draftId: result.draftId, inviteCode, webSocketReady };
    },
  }),
);
