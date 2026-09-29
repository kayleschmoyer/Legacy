/**
 * Draft room query: draftRoom(draftId) (LS-10076)
 *
 * One root query the draft board loads itself from, for either draft kind.
 * The board used to assemble its state from league-shaped queries
 * (`GetLeagueById`, `GetLeagueTeams`, `GetPositionsForLeague`,
 * `getLeagueDraft`), none of which a mock draft can answer. `draftRoom` is the
 * league-independent replacement: the draft, its rules, its seats, and what
 * the caller may do in it.
 *
 * League drafts answer it too, so the board has a single data shape and the
 * league route is a thin wrapper that resolves leagueId → draftId.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { eq } from 'drizzle-orm';

import { type DraftRules, loadDraftRules } from '../draft-rules';
import {
  authorizeLoadedDraft,
  type DraftAuthorization,
} from '../authorize-draft';
import { type DraftSeat, getDraftSeats } from '../participants';
import { Draft, DraftKindEnum } from '../types';
import { builder } from '../../builder';
import { UserInputError } from '../../graphql-errors';

type DraftRow = typeof PublicSchema.drafts.$inferSelect;

interface DraftRoomShape {
  draft: DraftRow;
  rules: DraftRules;
  seats: DraftSeat[];
  auth: DraftAuthorization;
}

const DraftSeatType = builder.objectRef<DraftSeat>('DraftSeat').implement({
  description:
    'One seat in a draft (`draft_participants`). A league seat holds a team; ' +
    'a mock-draft seat holds a user, the CPU, or nobody yet (LS-10076).',
  fields: (t) => ({
    id: t.exposeInt('id'),
    slot: t.exposeInt('slot', { description: '1-based draft position.' }),
    teamId: t.exposeInt('teamId', {
      nullable: true,
      description: 'Null for a mock-draft seat.',
    }),
    userId: t.exposeInt('userId', {
      nullable: true,
      description: 'The seat holder, for a mock draft.',
    }),
    controller: t.exposeString('controller', {
      description: "'user' | 'ai' | 'open'.",
    }),
    seatName: t.exposeString('seatName'),
    autoPick: t.exposeBoolean('autoPick'),
  }),
});

const DraftRulesType = builder
  .objectRef<DraftRules>('DraftRulesInfo')
  .implement({
    description:
      'The settings a draft runs under, whether they came from a league or ' +
      'from mock_draft_settings (LS-10074, LS-10076).',
    fields: (t) => ({
      sport: t.exposeString('sport'),
      playerPool: t.exposeString('playerPool'),
      maxRosterSize: t.exposeInt('maxRosterSize'),
      defensiveFormat: t.exposeString('defensiveFormat'),
      rosterPositions: t.exposeStringList('rosterPositions', {
        description:
          'The starter slot list this draft fills, in order — the depth chart ' +
          'and the slot strip read it from here (LS-10086).',
      }),
      isMock: t.exposeBoolean('isMock'),
    }),
  });

interface DraftViewerShape {
  role: 'host' | 'participant' | 'spectator';
  seatId: number | null;
  canPick: boolean;
  canHost: boolean;
}

const DraftViewer = builder
  .objectRef<DraftViewerShape>('DraftViewer')
  .implement({
    description: 'What the calling user may do in this draft room.',
    fields: (t) => ({
      role: t.exposeString('role'),
      seatId: t.exposeInt('seatId', {
        nullable: true,
        description: 'The caller’s own seat, or null when they hold none.',
      }),
      canPick: t.exposeBoolean('canPick', {
        description:
          'The caller holds a seat, so they may make its picks. Control All ' +
          'Teams makes the host able to pick for every seat.',
      }),
      canHost: t.exposeBoolean('canHost', {
        description:
          'Host controls: start, kick, lobby settings, commissioner tools.',
      }),
    }),
  });

const DraftRoom = builder.objectRef<DraftRoomShape>('DraftRoom').implement({
  description:
    'Everything the draft board needs for one draft, league or mock (LS-10076).',
  fields: (t) => ({
    draft: t.field({ type: Draft, resolve: (room) => room.draft }),
    kind: t.field({
      type: DraftKindEnum,
      resolve: (room) => room.draft.kind,
    }),
    status: t.string({ resolve: (room) => room.draft.status }),
    sport: t.string({ resolve: (room) => room.draft.sport }),
    rules: t.field({ type: DraftRulesType, resolve: (room) => room.rules }),
    seats: t.field({
      type: [DraftSeatType],
      resolve: (room) => room.seats,
    }),
    viewer: t.field({
      type: DraftViewer,
      resolve: (room) => {
        const { auth, draft } = room;
        const isHost = auth.role === 'host';
        return {
          role: auth.role,
          seatId: auth.seat?.id ?? null,
          canPick: auth.seat !== null || (draft.controlAllTeams && isHost),
          canHost: isHost,
        };
      },
    }),
    leagueId: t.int({
      nullable: true,
      description:
        'The owning league, or null for a mock draft (LS-10076). The league ' +
        'draft route loads the league itself through GetLeagueById; the draft ' +
        'room deliberately carries only the id, so the board renders from one ' +
        'league-independent shape.',
      resolve: (room) => room.draft.leagueId,
    }),
  }),
});

builder.queryField('draftRoom', (t) =>
  t.field({
    type: DraftRoom,
    description:
      'Load a draft room by draft id. Seat holders read their own draft; a ' +
      'mock draft has no spectators. An invite code (or a public lobby) grants ' +
      'the pre-join lobby view.',
    args: {
      draftId: t.arg.int({ required: true }),
      inviteCode: t.arg.string({
        required: false,
        description: 'Grants the pre-join lobby view of a private mock draft.',
      }),
    },
    resolve: async (_parent, args, context) => {
      const { draftId, inviteCode } = args;

      const [draft] = await context.db
        .select()
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, draftId))
        .limit(1);

      if (!draft) {
        throw UserInputError('Draft not found');
      }

      // A caller with no seat may still preview an open lobby; a seat holder
      // gets the full room. `preview` resolves to the stronger of the two.
      const auth = await authorizeLoadedDraft(context, draft, 'preview', {
        inviteCode,
      });

      const [rules, seats] = await Promise.all([
        loadDraftRules(context.db, draftId),
        getDraftSeats(context.db, draftId),
      ]);

      return { draft, rules, seats, auth };
    },
  }),
);
