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

// LS-10460: a user reported 20 Questions' "Play Now" landing on
// /baseball/mock-draft. Click each card's own CTA pill (not the card centre)
// at the reporter's 1280×713 viewport — where the cards stack one per row,
// the 20 Questions card directly above Mock Draft — and assert it routes to
// its own game. "Play Now" is shared by two cards, so each CTA is scoped to
// the card carrying its title.
test.describe('Minigames Hub card CTAs (LS-10460) @critical', () => {
  test.use({ viewport: { width: 1280, height: 713 } });

  const CARDS = [
    {
      title: 'Season Draft',
      cta: 'Enter Lobby',
      url: /\/games\/season-draft$/,
    },
    { title: 'Who Am I?', cta: 'Play Now', url: /\/games\/disclosure$/ },
    {
      title: '20 Questions',
      cta: 'Play Now',
      url: /\/games\/twenty-questions$/,
    },
    { title: 'Mock Draft', cta: 'Start Draft', url: /\/baseball\/mock-draft$/ },
  ];

  for (const { title, cta, url } of CARDS) {
    test(`"${cta}" on the ${title} card routes to ${String(url)}`, async ({
      page,
    }) => {
      await mockHubQueries(page);
      await page.goto('/games');

      const card = page
        .getByRole('button')
        .filter({ has: page.getByText(title, { exact: true }) });
      await expect(card).toHaveCount(1);
      await card.getByText(cta, { exact: true }).click();

      await expect(page).toHaveURL(url);
    });
  }
});

// LS-10758: at phone widths (iPhone SE, 375px) the four game cards grew past
// the right edge of the viewport — descriptions cut mid-word and CTA pills
// off-screen, with no horizontal scroll to reach them. Each card must sit
// inside the page's 16px gutter, with its CTA pill fully on-screen, from
// 320px to 414px.
test.describe('Minigames Hub cards fit phone viewports (LS-10758)', () => {
  const CARDS = [
    { title: 'Season Draft', cta: 'Enter Lobby' },
    { title: 'Who Am I?', cta: 'Play Now' },
    { title: '20 Questions', cta: 'Play Now' },
    { title: 'Mock Draft', cta: 'Start Draft' },
  ];
  const GUTTER = 16;

  for (const width of [320, 375, 414]) {
    test(`every card fits within the ${width}px viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 667 });
      await mockHubQueries(page);
      await page.goto('/games');

      for (const { title, cta } of CARDS) {
        const card = page
          .getByRole('button')
          .filter({ has: page.getByText(title, { exact: true }) });
        await expect(card).toHaveCount(1);
        const ctaLabel = card.getByText(cta, { exact: true });
        await expect(ctaLabel).toBeVisible();

        const cardBox = await card.boundingBox();
        const ctaBox = await ctaLabel.boundingBox();
        expect(cardBox, `${title} card box`).not.toBeNull();
        expect(ctaBox, `${title} CTA box`).not.toBeNull();
        if (!cardBox || !ctaBox) return;

        expect(cardBox.x, `${title} card left edge`).toBeGreaterThanOrEqual(
          GUTTER - 0.5,
        );
        expect(
          cardBox.x + cardBox.width,
          `${title} card right edge`,
        ).toBeLessThanOrEqual(width - GUTTER + 0.5);
        expect(
          ctaBox.x + ctaBox.width,
          `${title} CTA right edge`,
        ).toBeLessThanOrEqual(width - GUTTER + 0.5);
      }

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, 'horizontal page overflow').toBeLessThanOrEqual(0);
    });
  }
});
