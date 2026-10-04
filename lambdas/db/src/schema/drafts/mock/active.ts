/**
 * myActiveMockDrafts (LS-10465)
 *
 * The mock drafts a user can go back to: lobbies that have not started (and
 * not expired) and drafts still being picked, that the caller hosts or holds
 * a seat in. The setup page and the minigames hub read it to show a "Resume
 * your mock draft" banner, so a user who navigated away from the room — or
 * lost the in-memory invite card between setup and room — can get back to
 * `/:sport/mock-draft/:draftId`.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { and, count, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm';

import { builder } from '../../builder';
import { AuthenticationError } from '../../graphql-errors';
import { SportKindEnum } from '../../leagues/types';
import { MockDraftModeEnum } from '../types';

/** A banner, not a history list: a handful is plenty. */
const MAX_ACTIVE_MOCK_DRAFTS = 5;

/** Statuses a user can still resume into. */
const ACTIVE_STATUSES = [
  'not-started',
  'queued',
  'in-progress',
  'paused',
] as const;

const { draftParticipants, drafts } = PublicSchema;

export interface ActiveMockDraftShape {
  draftId: number;
  sport: 'baseball' | 'football';
  status: string;
  mode: 'offline' | 'online';
  isHost: boolean;
  totalSeats: number;
}

const ActiveMockDraft = builder
  .objectRef<ActiveMockDraftShape>('ActiveMockDraft')
  .implement({
    description:
      'A mock draft the caller hosts or is seated in that has not finished ' +
      '(LS-10465) — a lobby or a live draft to resume.',
    fields: (t) => ({
      draftId: t.exposeInt('draftId'),
      sport: t.field({ type: SportKindEnum, resolve: (d) => d.sport }),
      status: t.exposeString('status', {
        description: "'not-started' for a lobby; otherwise the draft is live.",
      }),
      mode: t.field({ type: MockDraftModeEnum, resolve: (d) => d.mode }),
      isHost: t.exposeBoolean('isHost'),
      totalSeats: t.exposeInt('totalSeats'),
    }),
  });

builder.queryField('myActiveMockDrafts', (t) =>
  t.field({
    type: [ActiveMockDraft],
    description:
      'Unfinished mock drafts the caller hosts or holds a seat in, most ' +
      'recently active first (LS-10465). Expired lobbies are left out.',
    resolve: async (_parent, _args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to list your mock drafts',
        );
      }

      const userId = context.user.id;
      const now = new Date();

      const rows = await context.db
        .select({
          draftId: drafts.id,
          sport: drafts.sport,
          status: drafts.status,
          mode: drafts.mockMode,
          createdBy: drafts.createdBy,
        })
        .from(drafts)
        .where(
          and(
            eq(drafts.kind, 'mock'),
            inArray(drafts.status, [...ACTIVE_STATUSES]),
            or(isNull(drafts.lobbyExpiresAt), gt(drafts.lobbyExpiresAt, now)),
            or(
              eq(drafts.createdBy, userId),
              inArray(
                drafts.id,
                context.db
                  .select({ draftId: draftParticipants.draftId })
                  .from(draftParticipants)
                  .where(eq(draftParticipants.userId, userId)),
              ),
            ),
          ),
        )
        .orderBy(desc(drafts.updatedAt), desc(drafts.id))
        .limit(MAX_ACTIVE_MOCK_DRAFTS);

      if (rows.length === 0) return [];

      const seatCounts = await context.db
        .select({ draftId: draftParticipants.draftId, n: count() })
        .from(draftParticipants)
        .where(
          inArray(
            draftParticipants.draftId,
            rows.map((row) => row.draftId),
          ),
        )
        .groupBy(draftParticipants.draftId);
      const seatsByDraft = new Map(
        seatCounts.map((c) => [c.draftId, Number(c.n)]),
      );

      return rows.map(
        (row): ActiveMockDraftShape => ({
          draftId: row.draftId,
          sport: row.sport,
          status: row.status,
          // CHECK drafts_mock_mode_ck: every mock draft has a mode.
          mode: row.mode ?? 'offline',
          isHost: row.createdBy === userId,
          totalSeats: seatsByDraft.get(row.draftId) ?? 0,
        }),
      );
    },
  }),
);
