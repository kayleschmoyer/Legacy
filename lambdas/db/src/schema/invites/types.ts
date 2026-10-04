/**
 * Invites (LS-10078, slice 6 of epic LS-9252) — GraphQL object types.
 *
 * One `invitations` row is a direct, per-user invite to exactly one target: a
 * mock draft (`draft_id`) or a league (`league_id`). A shareable code is not
 * an invitation — it stays on its target (`drafts.invite_code` /
 * `leagues.invite_code`) and is previewed by `resolveInviteCode`.
 */

import { SportKindEnum } from '../leagues/types';
import { builder } from '../builder';

/** The push / notification-history type every direct invite is sent as. */
export const DRAFT_INVITE_NOTIFICATION_TYPE = 'DRAFT_INVITE';

/** How long a league invite stays acceptable. A mock invite lives as long as its lobby. */
export const LEAGUE_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InviteTargetKind = 'mock' | 'league';
export type InviteStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'revoked'
  | 'expired';

export interface InvitationShape {
  id: number;
  kind: InviteTargetKind;
  status: InviteStatus;
  draftId: number | null;
  leagueId: number | null;
  sport: 'baseball' | 'football';
  /** League name, or "<host>'s mock draft". */
  targetName: string;
  invitedUserId: number;
  invitedUsername: string;
  invitedById: number;
  invitedByUsername: string;
  reservedSlot: number | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export const InviteTargetKindEnum = builder.enumType('InviteTargetKind', {
  values: ['mock', 'league'] as const,
});

export const InviteStatusEnum = builder.enumType('InviteStatus', {
  values: ['pending', 'accepted', 'declined', 'revoked', 'expired'] as const,
});

export const Invitation = builder
  .objectRef<InvitationShape>('Invitation')
  .implement({
    description:
      'A direct invite to a mock draft or a league (LS-10078). A pending mock ' +
      'invite holds `reservedSlot` so no public joiner can take it.',
    fields: (t) => ({
      id: t.exposeInt('id'),
      kind: t.field({ type: InviteTargetKindEnum, resolve: (i) => i.kind }),
      status: t.field({ type: InviteStatusEnum, resolve: (i) => i.status }),
      draftId: t.exposeInt('draftId', { nullable: true }),
      leagueId: t.exposeInt('leagueId', { nullable: true }),
      sport: t.field({ type: SportKindEnum, resolve: (i) => i.sport }),
      targetName: t.exposeString('targetName'),
      invitedUserId: t.exposeInt('invitedUserId'),
      invitedUsername: t.exposeString('invitedUsername'),
      invitedById: t.exposeInt('invitedById'),
      invitedByUsername: t.exposeString('invitedByUsername'),
      reservedSlot: t.exposeInt('reservedSlot', { nullable: true }),
      expiresAt: t.string({
        nullable: true,
        resolve: (i) => i.expiresAt?.toISOString() ?? null,
      }),
      createdAt: t.string({ resolve: (i) => i.createdAt.toISOString() }),
    }),
  });

export interface InvitationConnectionShape {
  nodes: InvitationShape[];
  endCursor: string | null;
  hasNextPage: boolean;
}

export const InvitationConnection = builder
  .objectRef<InvitationConnectionShape>('InvitationConnection')
  .implement({
    description:
      'A page of invites, newest first. Pass `endCursor` back as `after` for ' +
      'the next page.',
    fields: (t) => ({
      nodes: t.field({ type: [Invitation], resolve: (c) => c.nodes }),
      endCursor: t.exposeString('endCursor', { nullable: true }),
      hasNextPage: t.exposeBoolean('hasNextPage'),
    }),
  });

/** What a mock-draft invite code previews — never anything seat-holder-only. */
export interface MockDraftInvitePreviewShape {
  kind: 'mock';
  code: string;
  draftId: number;
  sport: 'baseball' | 'football';
  hostUsername: string;
  playerPool: string;
  filledSeats: number;
  totalSeats: number;
  openSeats: number;
  pickTimeLimitSeconds: number;
  rounds: number;
  lobbyExpiresAt: Date | null;
  isJoinable: boolean;
  isAlreadySeated: boolean;
}

/** What a league invite code previews — never anything member-only. */
export interface LeagueInvitePreviewShape {
  kind: 'league';
  code: string;
  leagueId: number;
  sport: 'baseball' | 'football';
  name: string;
  totalTeams: number;
  openTeams: number;
  draftScheduledAt: Date | null;
  isAlreadyMember: boolean;
}

export type InvitePreviewShape =
  | MockDraftInvitePreviewShape
  | LeagueInvitePreviewShape;

export const MockDraftInvitePreview = builder
  .objectRef<MockDraftInvitePreviewShape>('MockDraftInvitePreview')
  .implement({
    fields: (t) => ({
      code: t.exposeString('code'),
      draftId: t.exposeInt('draftId'),
      sport: t.field({ type: SportKindEnum, resolve: (p) => p.sport }),
      hostUsername: t.exposeString('hostUsername'),
      playerPool: t.exposeString('playerPool'),
      filledSeats: t.exposeInt('filledSeats'),
      totalSeats: t.exposeInt('totalSeats'),
      openSeats: t.exposeInt('openSeats', {
        description: 'Open seats minus pending invite reservations.',
      }),
      pickTimeLimitSeconds: t.exposeInt('pickTimeLimitSeconds'),
      rounds: t.exposeInt('rounds'),
      lobbyExpiresAt: t.string({
        nullable: true,
        resolve: (p) => p.lobbyExpiresAt?.toISOString() ?? null,
      }),
      isJoinable: t.exposeBoolean('isJoinable', {
        description:
          'Online, not started, unexpired, and at least one open seat.',
      }),
      isAlreadySeated: t.exposeBoolean('isAlreadySeated'),
    }),
  });

export const LeagueInvitePreview = builder
  .objectRef<LeagueInvitePreviewShape>('LeagueInvitePreview')
  .implement({
    fields: (t) => ({
      code: t.exposeString('code'),
      leagueId: t.exposeInt('leagueId'),
      sport: t.field({ type: SportKindEnum, resolve: (p) => p.sport }),
      name: t.exposeString('name'),
      totalTeams: t.exposeInt('totalTeams'),
      openTeams: t.exposeInt('openTeams'),
      draftScheduledAt: t.string({
        nullable: true,
        resolve: (p) => p.draftScheduledAt?.toISOString() ?? null,
      }),
      isAlreadyMember: t.exposeBoolean('isAlreadyMember'),
    }),
  });

export const InvitePreview = builder.unionType('InvitePreview', {
  description:
    'What an invite code points at (LS-10078): a mock-draft lobby or a league.',
  types: [MockDraftInvitePreview, LeagueInvitePreview],
  resolveType: (value) =>
    value.kind === 'mock' ? MockDraftInvitePreview : LeagueInvitePreview,
});
