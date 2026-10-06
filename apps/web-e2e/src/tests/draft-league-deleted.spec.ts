/**
 * League deleted mid-draft E2E Tests
 *
 * When a league is deleted while a draft room is open, the server pushes a
 * LEAGUE_DELETED notification on the draft channel. A connected client must
 * leave the room rather than sit on a draft that no longer exists.
 *
 * Covers the spectator (watch) route: a pushed LEAGUE_DELETED for this draft
 * navigates away, while one naming a different draft is ignored.
 *
 * All GraphQL calls are mocked via page.route(); the WebSocket channel is
 * intercepted via page.routeWebSocket() — no real backend required.
 */

import type { WebSocketRoute } from '@playwright/test';
import { injectWebSocketUrl } from './helpers/websocket-test-utils';
import { expect, test } from '../fixtures/auth';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import { leagueByIdResponse } from '../mocks/graphql';
import { FIXED_NOW_ISO } from '../mocks/time';

const LEAGUE_ID = 1;
const DRAFT_ID = 1;
const WATCH_URL = `/baseball/league/${LEAGUE_ID}/draft/watch`;

/** Wrap a notification payload in the wire format WebSocketClient expects. */
function wsNotification(data: Record<string, unknown>): string {
  return JSON.stringify({ type: 'notification', data });
}

test.describe('League deleted during a draft', () => {
  test('a spectator is taken out of the draft room; a deletion for another draft is ignored', async ({
    page,
  }) => {
    await injectWebSocketUrl(page);

    await createGraphQLRouter(page, {
      getleaguebyid: (route) =>
        fulfillJson(
          route,
          leagueByIdResponse({
            id: LEAGUE_ID,
            name: 'Public Test League',
            isPublic: true,
            draftStatus: 'in-progress',
          }),
        ),
      getlivedraftleaguedraft: (route) =>
        fulfillJson(route, {
          data: {
            getLeagueDraft: {
              __typename: 'Draft',
              id: DRAFT_ID,
              leagueId: LEAGUE_ID,
              draftMode: 'live',
              selectionMethod: 'standard',
              draftOrder: 'snake',
              currentPick: 1,
              pickTimeLimitSeconds: 90,
              currentPickDeadline: null,
              draftStartedAt: FIXED_NOW_ISO,
              draftCompletedAt: null,
              scheduledAt: null,
              createdAt: FIXED_NOW_ISO,
              autoPickDisabled: false,
            },
          },
        }),
      getcurrentdraftpick: (route) =>
        fulfillJson(route, {
          data: {
            getCurrentDraftPick: {
              __typename: 'CurrentDraftPick',
              draftId: DRAFT_ID,
              teamId: 1,
              round: 1,
              pickNumber: 1,
              overallPick: 1,
              isComplete: false,
            },
          },
        }),
      getdraftpicks: (route) =>
        fulfillJson(route, { data: { getDraftPicks: [] } }),
      getleagueteams: (route) =>
        fulfillJson(route, {
          data: {
            leagueTeams: [
              {
                __typename: 'Team',
                id: 1,
                name: 'Home Team',
                leagueId: LEAGUE_ID,
                owner: 1,
              },
              {
                __typename: 'Team',
                id: 2,
                name: 'Away Team',
                leagueId: LEAGUE_ID,
                owner: 2,
              },
            ],
          },
        }),
    });

    // Capture only the draft-keyed channel socket (the league-channel socket
    // opened before draftId resolves is torn down and never sees pushes).
    let wsRoute: WebSocketRoute | undefined;
    await page.routeWebSocket(/wss?:\/\//, (ws) => {
      const params = new URL(ws.url()).searchParams;
      if (
        params.get('viewContext') === 'draft' &&
        params.get('draftId') === String(DRAFT_ID)
      ) {
        wsRoute = ws;
      }
      ws.onMessage(() => {
        /* no-op — the spectator never sends over the socket */
      });
    });

    await page.goto(WATCH_URL);
    await page.waitForLoadState('load');
    await expect(page.getByTestId('spectator-screen')).toBeVisible();

    await expect.poll(() => wsRoute !== undefined).toBe(true);
    if (!wsRoute) throw new Error('WebSocket route not established');

    // A deletion naming some other draft must not move this client.
    wsRoute.send(
      wsNotification({
        type: 'LEAGUE_DELETED',
        leagueId: 999,
        draftIds: [999],
        deletedAt: FIXED_NOW_ISO,
      }),
    );
    await expect(page.getByTestId('spectator-screen')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${WATCH_URL}$`));

    // The deletion of this draft's league takes the spectator out of the room.
    wsRoute.send(
      wsNotification({
        type: 'LEAGUE_DELETED',
        leagueId: LEAGUE_ID,
        draftIds: [DRAFT_ID],
        deletedAt: FIXED_NOW_ISO,
      }),
    );
    await expect(page).not.toHaveURL(new RegExp(`${WATCH_URL}$`));
    await expect(page.getByTestId('spectator-screen')).toBeHidden();
  });
});
