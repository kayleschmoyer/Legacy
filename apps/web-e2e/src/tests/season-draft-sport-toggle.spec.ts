/**
 * E2E Tests: Season Draft sport toggle — create → lobby (LS-4664)
 *
 * Covers the sport-toggle [8/10] surfaces:
 *  - Baseball create persists sport='baseball' and lands on a "Dead Ball Dynasty" lobby
 *  - Football create persists sport='football' and lands on a "Gridiron Dynasty" lobby
 *
 * Hermetic — all GraphQL is mocked via the shared fallback router.
 */

import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

type Sport = 'baseball' | 'football';

interface MockSeasonDraftGame {
  __typename: 'SeasonDraftGame';
  id: number;
  name: string;
  status: 'setup';
  currentTurn: 0;
  createdBy: 1;
  statKey: 'hr';
  gameMode: 'season';
  playerType: 'hitter';
  sport: Sport;
  inviteCode: string;
  pickDeadlineSeconds: 60;
  currentPickDeadline: null;
  players: ReadonlyArray<{
    __typename: 'SeasonDraftPlayer';
    id: number;
    userId: number;
    playerName: string;
    draftOrder: number;
    totalScore: number;
    roster: ReadonlyArray<{
      __typename: 'SeasonDraftRosterSlot';
      id: number;
      position: string;
      slotNumber: number;
      isFilled: boolean;
      pick: null;
    }>;
  }>;
  picks: readonly [];
}

function buildGameDetail(sport: Sport): MockSeasonDraftGame {
  return {
    __typename: 'SeasonDraftGame',
    id: 99,
    name: sport === 'football' ? 'Gridiron Greats' : 'Bombers Only',
    status: 'setup',
    currentTurn: 0,
    createdBy: 1,
    statKey: 'hr',
    gameMode: 'season',
    playerType: 'hitter',
    sport,
    inviteCode: 'abc123',
    pickDeadlineSeconds: 60,
    currentPickDeadline: null,
    players: [
      {
        __typename: 'SeasonDraftPlayer',
        id: 10,
        userId: 1,
        playerName: 'testuser',
        draftOrder: 0,
        totalScore: 0,
        roster: [
          {
            __typename: 'SeasonDraftRosterSlot',
            id: 100,
            position: '1B',
            slotNumber: 0,
            isFilled: false,
            pick: null,
          },
        ],
      },
    ],
    picks: [],
  };
}

/**
 * Capture the sport variable passed into `CreateSeasonDraftGame` and then
 * route subsequent `GetSeasonDraftGame` calls to a game detail that echoes
 * the requested sport. The component navigates to /games/season-draft/99
 * after `createSeasonDraftGame` returns an id.
 */
async function mockCreateAndLobby(page: Page) {
  const state: { capturedSport: Sport | null } = { capturedSport: null };

  await page.route(isGraphQLEndpoint, async (route, request) => {
    const body = request.postDataJSON() as {
      operationName?: string;
      variables?: Record<string, unknown>;
    };

    if (body?.operationName === 'CreateSeasonDraftGame') {
      const sport = (body.variables?.sport as Sport | undefined) ?? 'baseball';
      state.capturedSport = sport;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { createSeasonDraftGame: 99 } }),
      });
      return;
    }

    if (body?.operationName === 'GetSeasonDraftGame') {
      const sport = state.capturedSport ?? 'baseball';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { seasonDraftGame: buildGameDetail(sport) },
        }),
      });
      return;
    }

    if (body?.operationName === 'GetSeasonDraftGames') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { seasonDraftGames: [] } }),
      });
      return;
    }

    await unmockedGraphQLFallback(route);
  });

  return state;
}

test.describe('Season Draft sport toggle @critical', () => {
  test('create baseball game → lobby shows Dead Ball Dynasty', async ({
    page,
  }) => {
    const state = await mockCreateAndLobby(page);
    await page.goto('/games/season-draft/create');

    // Baseball is the default — confirm preview strapline is visible
    await expect(page.getByText(/dead ball dynasty/i).first()).toBeVisible();

    // Fill name and submit (sport stays default 'baseball')
    await page.getByPlaceholder(/hr challenge/i).fill('Bombers Only');
    await page.getByRole('button', { name: /create game/i }).click();

    // Lands on the lobby route after create
    await expect(page).toHaveURL(/\/games\/season-draft\/99$/);

    // Lobby strapline reflects baseball
    await expect(page.getByTestId('sport-strapline').first()).toHaveText(
      /dead ball dynasty/i,
    );

    // Mutation captured sport='baseball'
    expect(state.capturedSport).toBe('baseball');
  });

  test('create football game → lobby shows Gridiron Dynasty', async ({
    page,
  }) => {
    const state = await mockCreateAndLobby(page);
    await page.goto('/games/season-draft/create');

    // Switch to football via the sport toggle
    await page.getByTestId('sport-toggle-option-football').click();

    // Preview strapline updates to football voice
    await expect(page.getByText(/gridiron dynasty/i).first()).toBeVisible();

    await page.getByPlaceholder(/hr challenge/i).fill('Gridiron Greats');
    await page.getByRole('button', { name: /create game/i }).click();

    // Lands on lobby and renders football chrome
    await expect(page).toHaveURL(/\/games\/season-draft\/99$/);
    await expect(page.getByTestId('sport-strapline').first()).toHaveText(
      /gridiron dynasty/i,
    );

    // Mutation captured sport='football'
    expect(state.capturedSport).toBe('football');
  });
});
