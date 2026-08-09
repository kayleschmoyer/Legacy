/**
 * Draft Spectator (Watch) Page E2E Tests (LS-8943)
 *
 * Covers the read-only /baseball/league/:id/draft/watch route:
 *   1. A non-member on a public league reaches the live spectator layout
 *      (grid + clock) without any FORBIDDEN gate.
 *   2. A pushed DRAFT_PICK_MADE WebSocket notification triggers the pick
 *      splash overlay.
 *   3. The page never issues a nudgeExpiredDraftPick mutation — the
 *      spectator clock is read-only by construction (useDraftTimer
 *      readOnly: true in useSpectatorScreenState).
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
const WATCH_URL = `/baseball/league/${LEAGUE_ID}/draft/watch`;

/** Wrap a notification payload in the wire format WebSocketClient expects. */
function wsNotification(data: Record<string, unknown>): string {
  return JSON.stringify({ type: 'notification', data });
}

test.describe('Draft Spectator Watch page @critical', () => {
  test('non-member on a public league sees the live grid and clock; a pushed pick triggers the splash; no nudgeExpiredDraftPick is ever issued', async ({
    page,
  }) => {
    // Track every GraphQL operation name seen so we can assert
    // nudgeExpiredDraftPick was never issued, even if it lands after our
    // assertions below.
    const seenOperations: string[] = [];
    await page.route(/\/graphql/, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      const match = /"operationname":"([^"]*)"/.exec(postData);
      if (match) seenOperations.push(match[1]);
      await route.fallback();
    });

    // 1. Inject WS URL so the app opens a socket even in CI
    //    (VITE_WEBSOCKET_URL="" at build time).
    await injectWebSocketUrl(page);

    // 2. GraphQL mocks. A non-member spectator's view is driven purely by
    //    the mocked responses (no FORBIDDEN error) — isPublic: true documents
    //    *why* a non-member is allowed through in production; the hermetic
    //    mock doesn't itself enforce membership.
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
              id: 1,
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
              draftId: 1,
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
      // leagueTeamsResponse() (shared factory) omits leagueId, which
      // useSpectatorDraftData's leagueTeams filter requires (t.leagueId !=
      // null) — build the response directly so the mocked teams survive
      // that filter and actually render in the grid.
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

    // 3. Intercept the WebSocket connection before navigation.
    let wsRoute: WebSocketRoute | undefined;
    await page.routeWebSocket(/wss?:\/\//, (ws) => {
      wsRoute = ws;
      ws.onMessage(() => {
        /* no-op — spectator never sends draft mutations over the socket */
      });
    });

    // 4. Navigate directly to the watch route as a non-member.
    await page.goto(WATCH_URL);
    await page.waitForLoadState('load');

    // 5. Live spectator layout renders — grid (team names) + clock. Team
    //    names legitimately appear in multiple places (top band, grid
    //    header, depth chart), so scope to the first match rather than
    //    asserting a single element.
    await expect(page.getByTestId('spectator-screen')).toBeVisible();
    await expect(page.getByTestId('spectator-top-band')).toBeVisible();
    await expect(page.getByTestId('pick-timer')).toBeVisible();
    await expect(page.getByText('Home Team').first()).toBeVisible();
    await expect(page.getByText('Away Team').first()).toBeVisible();

    // 6. Wait for the app to open the WebSocket connection, then push a
    //    DRAFT_PICK_MADE notification — the splash must appear.
    await expect.poll(() => wsRoute !== undefined).toBe(true);
    if (!wsRoute) throw new Error('WebSocket route not established');

    wsRoute.send(
      wsNotification({
        type: 'DRAFT_PICK_MADE',
        leagueId: LEAGUE_ID,
        draftId: 1,
        pickId: 501,
        teamId: 2,
        playerId: 999,
        round: 1,
        pickNumber: 1,
        overallPick: 1,
        pickedAt: FIXED_NOW_ISO,
        wasAutoPick: false,
        autoPickReason: null,
        currentPickDeadline: null,
        nextPick: { teamId: 1, round: 1, pickNumber: 2, overallPick: 2 },
      }),
    );

    // PickAnnouncement's Tamagui `testID` doesn't compile to a web
    // data-testid on this platform target; its explicit role="alert" does
    // land in the DOM, so assert on that instead.
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('OPPONENT PICK');

    // 7. The spectator clock never nudges an expired pick (it holds at 0:00
    //    for the server) — assert no such mutation was ever issued.
    expect(seenOperations.some((op) => op === 'nudgeexpireddraftpick')).toBe(
      false,
    );
  });
});
