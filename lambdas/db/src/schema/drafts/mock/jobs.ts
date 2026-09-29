/**
 * Mock draft maintenance jobs (LS-10076). Both are system mutations, invoked
 * on an EventBridge schedule like `autoProcessDraftPicks`.
 *
 *   expireMockDraftLobbies      — hourly. An unstarted online lobby is dead
 *     24h after creation: its pending invitations expire, its seat holders are
 *     told, and the row is deleted once it has aged out of the mock-draft
 *     quota window (the weekly cap counts drafts, so deleting an expired lobby
 *     any sooner would hand its creator a free draft back).
 *
 *   purgeStaleOfflineMockDrafts — daily. An offline mock draft nobody has
 *     picked in for 30 days is abandoned practice; nothing references it.
 */

import { LOGGER } from '@legacy-sports/logging';
import { sql } from 'drizzle-orm';

import { getLobbySeats } from './shared';
import { MOCK_DRAFT_WINDOW_MS } from '../helpers';
import { builder } from '../../builder';
import { ForbiddenError } from '../../graphql-errors';

/** An offline mock draft with no pick for this long is abandoned. */
export const STALE_OFFLINE_MOCK_DRAFT_MS = 30 * 24 * 60 * 60 * 1000;

interface MockDraftMaintenanceShape {
  lobbiesExpired: number;
  draftsDeleted: number;
}

const MockDraftMaintenanceResult = builder.objectRef<MockDraftMaintenanceShape>(
  'MockDraftMaintenanceResult',
);

builder.objectType(MockDraftMaintenanceResult, {
  description: 'What a mock-draft maintenance sweep did (LS-10076).',
  fields: (t) => ({
    lobbiesExpired: t.exposeInt('lobbiesExpired', {
      description: 'Lobbies that passed their expiry in this sweep.',
    }),
    draftsDeleted: t.exposeInt('draftsDeleted'),
  }),
});

/** System-only: these sweeps act across every user's drafts. */
function assertSystemRequest(isSystemRequest: boolean, isAdmin: boolean): void {
  if (!isSystemRequest && !isAdmin) {
    throw ForbiddenError(
      'Only system processes can run mock-draft maintenance',
    );
  }
}

builder.mutationField('expireMockDraftLobbies', (t) =>
  t.field({
    type: MockDraftMaintenanceResult,
    description:
      'System: expire unstarted mock-draft lobbies past lobby_expires_at, and ' +
      'delete the ones old enough to have left the weekly-quota window.',
    resolve: async (_parent, _args, context) => {
      assertSystemRequest(
        context.isSystemRequest === true,
        context.user?.isAdmin === true,
      );

      const now = new Date();
      const quotaCutoff = new Date(now.getTime() - MOCK_DRAFT_WINDOW_MS);

      // Newly-expired lobbies: their invitations can never be accepted.
      const expired = await context.db.execute(sql`
        SELECT d.id
        FROM drafts d
        WHERE d.kind = 'mock'
          AND d.status = 'not-started'
          AND d.lobby_expires_at IS NOT NULL
          AND d.lobby_expires_at <= ${now}
      `);
      const expiredIds = expired.rows.map((r) => r.id as number);

      if (expiredIds.length > 0) {
        await context.db.execute(sql`
          UPDATE invitations
          SET status = 'expired', responded_at = ${now}
          WHERE status = 'pending'
            AND draft_id = ANY(${sql.param(expiredIds)}::integer[])
        `);

        // Tell whoever is still sitting in the lobby that it is over. The
        // seat counts are the lobby's own, so a client that renders the
        // counter from this payload does not have to refetch to show it.
        const { notificationService } = context;
        if (notificationService) {
          for (const draftId of expiredIds) {
            try {
              const seats = await getLobbySeats(context.db, draftId);
              await notificationService.notifyDraftLobbyUpdated({
                draftId,
                reason: 'expired',
                filledSeats: seats.filter((s) => s.userId !== null).length,
                totalSeats: seats.length,
              });
            } catch (err) {
              LOGGER.warn('Failed to notify expired mock draft lobby', {
                draftId,
                err,
              });
            }
          }
        }
      }

      // Delete only once the draft has aged out of the quota window, so an
      // expired lobby still counts against its creator's weekly cap until then.
      const deleted = await context.db.execute(sql`
        DELETE FROM drafts
        WHERE kind = 'mock'
          AND status = 'not-started'
          AND lobby_expires_at IS NOT NULL
          AND lobby_expires_at <= ${now}
          AND created_at < ${quotaCutoff}
        RETURNING id
      `);

      LOGGER.info('[expireMockDraftLobbies] Sweep complete', {
        lobbiesExpired: expiredIds.length,
        draftsDeleted: deleted.rows.length,
      });

      return {
        lobbiesExpired: expiredIds.length,
        draftsDeleted: deleted.rows.length,
      };
    },
  }),
);

builder.mutationField('purgeStaleOfflineMockDrafts', (t) =>
  t.field({
    type: MockDraftMaintenanceResult,
    description:
      'System: delete offline mock drafts with no pick in the last 30 days.',
    resolve: async (_parent, _args, context) => {
      assertSystemRequest(
        context.isSystemRequest === true,
        context.user?.isAdmin === true,
      );

      const cutoff = new Date(Date.now() - STALE_OFFLINE_MOCK_DRAFT_MS);

      // "Last activity" is the most recent pick, or the draft's own creation
      // when it never got one.
      const deleted = await context.db.execute(sql`
        DELETE FROM drafts d
        WHERE d.kind = 'mock'
          AND d.mock_mode = 'offline'
          AND d.status <> 'completed'
          AND COALESCE(
                (SELECT MAX(dp.picked_at) FROM draft_picks dp WHERE dp.draft_id = d.id),
                d.created_at
              ) < ${cutoff}
        RETURNING d.id
      `);

      LOGGER.info('[purgeStaleOfflineMockDrafts] Sweep complete', {
        draftsDeleted: deleted.rows.length,
      });

      return { lobbiesExpired: 0, draftsDeleted: deleted.rows.length };
    },
  }),
);
