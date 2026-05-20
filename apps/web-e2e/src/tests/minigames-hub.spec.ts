/**
 * E2E Tests: Minigames Hub navigation (LS-4020)
 *
 * Asserts that each game card on /games routes to its dedicated page.
 * All GraphQL queries are mocked — no live backend needed.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

async function mockHubQueries(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route, request) => {
    const body = request.postDataJSON() as { operationName?: string };
    switch (body?.operationName) {
      case 'GetSeasonDraftGames':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { seasonDraftGames: [] } }),
        });
        return;
      case 'GetDisclosureGameBestScore':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { disclosureGameBestScore: null } }),
        });
        return;
      case 'GetMinigamesStats':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              minigamesStats: {
                __typename: 'MinigamesStats',
                playerSeasons: 1_000_000,
                earliestYear: 1871,
                playersTracked: 20_000,
              },
            },
          }),
        });
        return;
    }
    await unmockedGraphQLFallback(route);
  });
}

test.describe('Minigames Hub navigation @critical', () => {
  test('routes from the 20 Questions card to /games/twenty-questions', async ({
    page,
  }) => {
    await mockHubQueries(page);
    await page.goto('/games');

    await page.getByRole('button', { name: /20 questions/i }).click();

    await expect(page).toHaveURL(/\/games\/twenty-questions$/);
  });

  test('routes from the Season Draft card to /games/season-draft', async ({
    page,
  }) => {
    await mockHubQueries(page);
    await page.goto('/games');

    await page.getByRole('button', { name: /season draft/i }).click();

    await expect(page).toHaveURL(/\/games\/season-draft$/);
  });

  test('routes from the Who Am I? card to /games/disclosure', async ({
    page,
  }) => {
    await mockHubQueries(page);
    await page.goto('/games');

    await page.getByRole('button', { name: /who am i\?/i }).click();

    await expect(page).toHaveURL(/\/games\/disclosure$/);
  });
});
