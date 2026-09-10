/**
 * E2E coverage for the "draft packet" premium gate (LS-9750).
 *
 * The Draft Room v2 recap (`DraftRoomRecap`, LS-9402) already shows every
 * user their own team's picks/grade for free once a draft completes; this
 * adds a `DraftPacketSection` — the full, all-teams draft results plus a CSV
 * download — behind the new `draft_packet` entitlement. The recap (and this
 * section) only renders at the board's `phone` viewport tier
 * (`useDraftViewportTier`, < 800px), so these specs pin `MOBILE_VIEWPORT`.
 *
 * Per the tiered test-user convention, `useTier(page, 'free')` is called only
 * in the spec asserting the gate fires; the premium spec relies on the
 * premium-by-default baseline.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import {
  getAvailableDraftPlayersResponse,
  getCurrentDraftPickResponse,
  getDraftPicksResponse,
  leagueByIdResponse,
  leaguePositionsResponse,
  leagueScoringProfileResponse,
  leagueTeamsResponse,
  userTeamIdResponse,
} from '../mocks/graphql';
import { MOBILE_VIEWPORT } from '../utils/viewport';

const TEST_LEAGUE_ID = 1;

const PICK_HISTORY = [
  { id: 1, round: 1, pickNumber: 1, overallPick: 1, teamId: 1, playerId: 100 },
  { id: 2, round: 1, pickNumber: 2, overallPick: 2, teamId: 2, playerId: 101 },
];

/** Hermetic GraphQL route for a completed draft, at the phone viewport tier. */
async function setupCompletedDraftRoute(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route);

    if (
      op === 'GetDraft' ||
      op === 'GetLiveDraftLeagueDraft' ||
      op === 'GetLeagueDraft'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getLeagueDraft: {
              __typename: 'Draft',
              id: 1,
              leagueId: TEST_LEAGUE_ID,
              status: 'completed',
              currentRound: 1,
              currentPick: 1,
              totalRounds: 1,
              draftMode: 'live',
              draftOrder: 'snake',
              selectionMethod: 'standard',
              playerPool: 'all',
              pickTimeLimitSeconds: 60,
              scheduledAt: null,
            },
          },
        }),
      });
      return;
    }

    if (op === 'GetCurrentDraftPick') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(getCurrentDraftPickResponse({ isComplete: true })),
      });
      return;
    }

    if (op === 'GetDraftPicks') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(getDraftPicksResponse(PICK_HISTORY)),
      });
      return;
    }

    if (op === 'GetAvailableDraftPlayers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(getAvailableDraftPlayersResponse([])),
      });
      return;
    }

    if (op === 'GetLeagueById' || op === 'GetLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(leagueByIdResponse({ draftStatus: 'completed' })),
      });
      return;
    }

    if (op === 'GetLeagueTeams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(leagueTeamsResponse()),
      });
      return;
    }

    if (op === 'GetLeaguePositions') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(leaguePositionsResponse()),
      });
      return;
    }

    if (op === 'GetUserTeamId') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(userTeamIdResponse()),
      });
      return;
    }

    if (op === 'GetLeagueScoringProfile') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(leagueScoringProfileResponse()),
      });
      return;
    }

    if (op === 'GetMyDraftQueue') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMyDraftQueue: [] } }),
      });
      return;
    }

    if (op === 'GetDraftTeamOrder') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getDraftTeamOrder: [
              { teamId: 1, teamName: 'Team 1', draftOrder: 1 },
              { teamId: 2, teamName: 'Team 2', draftOrder: 2 },
            ],
          },
        }),
      });
      return;
    }

    if (op === 'GetDraftTeamAutoPickStatuses') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getDraftTeamAutoPickStatuses: [] } }),
      });
      return;
    }

    if (op === 'GetDraftRecommendations') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getDraftRecommendations: [] } }),
      });
      return;
    }

    if (op === 'GetMyDraftTeamAutoPick') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMyDraftTeamAutoPick: false } }),
      });
      return;
    }

    if (op === 'GetUserLeagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [] } }),
      });
      return;
    }

    if (op === 'GetTeamMembers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: [] } }),
      });
      return;
    }

    if (op === 'NudgeExpiredDraftPick') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { nudgeExpiredDraftPick: true } }),
      });
      return;
    }

    await unmockedGraphQLFallback(route);
  });
}

test.describe('Draft packet premium gate @regression', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('premium user can view and download the full draft packet', async ({
    page,
  }) => {
    await setupCompletedDraftRoute(page);

    await page.goto(`/baseball/league/${TEST_LEAGUE_ID}/draft`);
    await expect(page.getByTestId('draft-room-recap')).toBeVisible();

    await expect(page.getByTestId('draft-packet-section')).toBeVisible();
    await expect(page.getByTestId('premium-feature-gate')).toHaveCount(0);

    const downloadButton = page.getByTestId('draft-packet-download');
    await expect(downloadButton).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadButton.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/draft-packet\.csv$/);
  });

  test('free user sees the upsell instead of the draft packet', async ({
    page,
  }) => {
    await setupCompletedDraftRoute(page);
    await useTier(page, 'free');

    await page.goto(`/baseball/league/${TEST_LEAGUE_ID}/draft`);
    await expect(page.getByTestId('draft-room-recap')).toBeVisible();

    await expect(page.getByTestId('draft-packet-section')).toBeVisible();
    await expect(page.getByTestId('premium-feature-gate')).toBeVisible();
    await expect(page.getByTestId('draft-packet-download')).toHaveCount(0);
  });
});
