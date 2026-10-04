/**
 * Query: resolveInviteCode(code) (LS-10078)
 *
 * The universal `/join/:code` route has one box and one code, and cannot know
 * whether the code is a mock draft's or a league's. This resolves it: mock
 * drafts first (`drafts.invite_code`), then leagues (`leagues.invite_code`) —
 * `generateUnusedInviteCode` keeps the two namespaces disjoint, so the order
 * only decides which table is read first.
 *
 * The preview is what a stranger holding the code may see: never rosters,
 * picks, chat or member names. A mock preview names the host (who handed out
 * the code); a league preview names only the league.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { and, count, desc, eq, sql } from 'drizzle-orm';

import {
  InvitePreview,
  type InvitePreviewShape,
  type LeagueInvitePreviewShape,
  type MockDraftInvitePreviewShape,
} from './types';
import { getSeatAvailability } from '../drafts/mock/shared';
import { builder } from '../builder';
import type { Context } from '../builder';
import { AuthenticationError } from '../graphql-errors';

/** An invite code is 8 characters from a 32-character alphabet. */
const INVITE_CODE_PATTERN = /^[A-Z0-9]{6,12}$/;

export async function previewMockDraftCode(
  db: Context['db'],
  code: string,
  userId: number,
  now: Date = new Date(),
): Promise<MockDraftInvitePreviewShape | null> {
  const [row] = await db
    .select({
      draftId: PublicSchema.drafts.id,
      sport: PublicSchema.drafts.sport,
      status: PublicSchema.drafts.status,
      mockMode: PublicSchema.drafts.mockMode,
      lobbyExpiresAt: PublicSchema.drafts.lobbyExpiresAt,
      pickTimeLimitSeconds: PublicSchema.drafts.pickTimeLimitSeconds,
      hostUsername: PublicSchema.users.username,
      playerPool: PublicSchema.mockDraftSettings.playerPool,
      rosterSize: PublicSchema.mockDraftSettings.rosterSize,
    })
    .from(PublicSchema.drafts)
    .innerJoin(
      PublicSchema.users,
      eq(PublicSchema.users.id, PublicSchema.drafts.createdBy),
    )
    .innerJoin(
      PublicSchema.mockDraftSettings,
      eq(PublicSchema.mockDraftSettings.draftId, PublicSchema.drafts.id),
    )
    .where(
      and(
        eq(PublicSchema.drafts.inviteCode, code),
        eq(PublicSchema.drafts.kind, 'mock'),
      ),
    )
    .limit(1);

  if (!row) return null;

  const availability = await getSeatAvailability(db, row.draftId, now);
  const isAlreadySeated = availability.seats.some((s) => s.userId === userId);
  const lobbyOpen =
    row.mockMode === 'online' &&
    row.status === 'not-started' &&
    (row.lobbyExpiresAt === null || row.lobbyExpiresAt > now);

  return {
    kind: 'mock',
    code,
    draftId: row.draftId,
    sport: row.sport,
    hostUsername: row.hostUsername ?? 'A friend',
    playerPool: row.playerPool,
    filledSeats: availability.filledSeats,
    totalSeats: availability.totalSeats,
    openSeats: availability.openSlots.length,
    pickTimeLimitSeconds: row.pickTimeLimitSeconds,
    rounds: row.rosterSize,
    lobbyExpiresAt: row.lobbyExpiresAt,
    isJoinable: lobbyOpen && availability.openSlots.length > 0,
    isAlreadySeated,
  };
}

export async function previewLeagueCode(
  db: Context['db'],
  code: string,
  userId: number,
): Promise<LeagueInvitePreviewShape | null> {
  const [league] = await db
    .select({
      id: PublicSchema.leagues.id,
      name: PublicSchema.leagues.name,
      sport: PublicSchema.leagues.sport,
    })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.inviteCode, code))
    .limit(1);

  if (!league) return null;

  const [[teamTotal], [assigned], [membership], [draft]] = await Promise.all([
    db
      .select({ n: count() })
      .from(PublicSchema.teams)
      .where(eq(PublicSchema.teams.leagueId, league.id)),
    // Distinct teams: a GM and an assistant manager share one team, and a
    // commissioner row without a team claims none (validateInviteCode's rule).
    db
      .select({
        n: sql<number>`count(distinct ${PublicSchema.leagueMembers.teamId})::int`,
      })
      .from(PublicSchema.leagueMembers)
      .where(eq(PublicSchema.leagueMembers.leagueId, league.id)),
    db
      .select({ userId: PublicSchema.leagueMembers.userId })
      .from(PublicSchema.leagueMembers)
      .where(
        and(
          eq(PublicSchema.leagueMembers.leagueId, league.id),
          eq(PublicSchema.leagueMembers.userId, userId),
        ),
      )
      .limit(1),
    db
      .select({ scheduledAt: PublicSchema.drafts.scheduledAt })
      .from(PublicSchema.drafts)
      .where(
        and(
          eq(PublicSchema.drafts.leagueId, league.id),
          eq(PublicSchema.drafts.kind, 'league'),
        ),
      )
      .orderBy(desc(PublicSchema.drafts.id))
      .limit(1),
  ]);

  const totalTeams = Number(teamTotal?.n ?? 0);

  return {
    kind: 'league',
    code,
    leagueId: league.id,
    sport: league.sport,
    name: league.name,
    totalTeams,
    openTeams: Math.max(0, totalTeams - Number(assigned?.n ?? 0)),
    draftScheduledAt: draft?.scheduledAt ?? null,
    isAlreadyMember: membership !== undefined,
  };
}

builder.queryField('resolveInviteCode', (t) =>
  t.field({
    type: InvitePreview,
    nullable: true,
    description:
      'Preview what an invite code joins — a mock-draft lobby or a league — ' +
      'for the universal /join/:code route (LS-10078). Null for an unknown ' +
      'code. Never returns member-only data.',
    args: {
      code: t.arg.string({ required: true }),
    },
    resolve: async (
      _parent,
      args,
      context,
    ): Promise<InvitePreviewShape | null> => {
      if (!context.user) {
        throw AuthenticationError('Sign in to view this invite');
      }

      const code = args.code.trim().toUpperCase();
      if (!INVITE_CODE_PATTERN.test(code)) return null;

      return (
        (await previewMockDraftCode(context.db, code, context.user.id)) ??
        (await previewLeagueCode(context.db, code, context.user.id))
      );
    },
  }),
);
