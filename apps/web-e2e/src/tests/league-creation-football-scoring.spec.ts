/**
 * League Creation — Football Scoring Format (LS-5380)
 *
 * Verifies the Create League (Football) form's "Scoring Format" section:
 * selecting Standard then PPR updates the section summary, and submitting
 * the form persists the chosen `scoringFormat` in the CreateLeagueAndTeams
 * GraphQL mutation input.
 *
 * Hermetic — all GraphQL is mocked via page.route. Complements
 * league-creation-football.spec.ts (sport-aware form behavior).
 *
 * Page-object migration (LS-8092 / ADR-0015): all locators live on
 * `leaguePage` — specs are selector-free.
 */

import { expect, leagueTest as test } from '../fixtures/pages';
import {
  enableFootball,
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

/**
 * Mocks the createLeagueAndTeams mutation and resolves with the captured
 * variables so tests can assert on the input payload.
 */
async function mockCreateLeague(
  page: import('@playwright/test').Page,
  capturedInput: { current: Record<string, unknown> | null },
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    if (extractOperationName(route).toLowerCase() === 'createleagueandteams') {
      const body = route.request().postData() ?? '';
      try {
        const parsed = JSON.parse(body) as {
          variables?: { input?: Record<string, unknown> };
        };
        capturedInput.current = parsed.variables?.input ?? null;
      } catch {
        capturedInput.current = null;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createLeagueAndTeams: {
              __typename: 'CreateLeagueAndTeamsPayload',
              league: {
                __typename: 'League',
                id: 778,
                name: 'Test League',
                owner: 1,
                maxRosterSize: 16,
                currentMatchup: null,
                draftStatus: 'not-started',
                numberOfTeams: 10,
                playerPool: 'all',
                draftMode: 'live',
                selectionMethod: 'standard',
                draftOrder: 'snake',
                isPublic: false,
              },
            },
          },
        }),
      });
      return;
    }
    await unmockedGraphQLFallback(route);
  });
}

test.describe('League Creation — Football Scoring Format @regression', () => {
  test('selecting Standard then PPR updates the section summary and persists on submit', async ({
    page,
    leaguePage,
  }) => {
    const captured: { current: Record<string, unknown> | null } = {
      current: null,
    };
    await mockCreateLeague(page, captured);

    await enableFootball(page);
    await leaguePage.gotoCreate('football');
    await leaguePage.leagueNameInput.expectVisible();

    await leaguePage.expandSection('football-scoring');

    // Select Standard — the default is already PPR, so this is a real change.
    await leaguePage.testId('scoring-format-standard').tap();
    await leaguePage.collapseSection('football-scoring');
    const standardSummary = await leaguePage
      .sectionSummary('football-scoring')
      .text();
    expect(standardSummary).toMatch(/standard/i);

    // Now select PPR.
    await leaguePage.expandSection('football-scoring');
    await leaguePage.testId('scoring-format-ppr').tap();
    await leaguePage.collapseSection('football-scoring');
    const pprSummary = await leaguePage
      .sectionSummary('football-scoring')
      .text();
    expect(pprSummary).toMatch(/ppr/i);

    await leaguePage.fillLeagueName('Hermetic Scoring League');
    await leaguePage.submitCreate();
    await leaguePage.continueToLeague();

    await expect(page).toHaveURL(/\/football\/league\/\d+/);
    expect(captured.current?.scoringFormat).toBe('ppr');
  });
});
