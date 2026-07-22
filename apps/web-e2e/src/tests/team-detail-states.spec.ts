/**
 * Team Detail Page E2E Tests — Loading / Error / Not Found States (LS-5363)
 *
 * QA Feature Story under epic LS-5261 (QA — Page: Baseball Team Detail).
 *
 * Covers the page's graceful-degradation states so a user is never shown a
 * broken screen:
 *   - Loading: spinner shown while queries are pending
 *   - Invalid team ID: non-numeric teamId in the URL
 *   - GraphQL query failure with a NOT_FOUND code: dedicated "Team not found" message
 *   - GraphQL query failure with any other code: generic "Error loading team" message
 *
 * NOT_FOUND detection uses the Apollo Client 4 `CombinedGraphQLErrors` shape
 * (LS-8315 — previously dead code checking the Apollo Client 3
 * `ApolloError.graphQLErrors` shape, which this repo's error objects never have).
 *
 * All GraphQL responses are mocked so these tests run without a live backend.
 * Route: /baseball/teams/:teamId
 */

import { expect } from '../fixtures/auth-enhanced';
import { test } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_TEAM_URL = '/baseball/teams/1';
const INVALID_TEAM_URL = '/baseball/teams/not-a-number';

// ── GraphQL mock helper ───────────────────────────────────────────────────────

type MembersMode = 'ok' | 'notFound' | 'genericError' | 'pending';

async function mockGraphQL(
  page: import('@playwright/test').Page,
  membersMode: MembersMode = 'ok',
) {
  let releaseMembers: (() => void) | undefined;
  const membersGate = new Promise<void>((resolve) => {
    releaseMembers = resolve;
  });

  await createGraphQLRouter(page, {
    getteammembers: async (route) => {
      if (membersMode === 'pending') {
        await membersGate;
        await fulfillJson(route, { data: { teamMembers: [] } });
      } else if (membersMode === 'notFound') {
        await fulfillJson(route, {
          errors: [
            { message: 'Team not found', extensions: { code: 'NOT_FOUND' } },
          ],
        });
      } else if (membersMode === 'genericError') {
        await fulfillJson(route, {
          errors: [{ message: 'Internal server error' }],
        });
      } else {
        await fulfillJson(route, { data: { teamMembers: [] } });
      }
    },
    getleagueteams: (route) =>
      fulfillJson(route, { data: { leagueTeams: [] } }),
    getuserteamid: (route) => fulfillJson(route, { data: { userTeamId: 1 } }),
    getleaguebyid: (route) => fulfillJson(route, { data: { league: null } }),
    getpositionsforleague: (route) =>
      fulfillJson(route, { data: { leaguePositions: [] } }),
    getteambyid: (route) => fulfillJson(route, { data: { team: null } }),
  });

  return { releaseMembers: releaseMembers as () => void };
}

// ── Tests: Loading state ──────────────────────────────────────────────────────

test.describe('Team Detail Page — loading state @regression', () => {
  test('shows a loading spinner while data is pending', async ({ page }) => {
    const { releaseMembers } = await mockGraphQL(page, 'pending');

    await page.goto(VALID_TEAM_URL, { waitUntil: 'commit' });

    await expect(page.getByRole('progressbar').first()).toBeVisible({
      timeout: 15_000,
    });

    releaseMembers();
  });
});

// ── Tests: Invalid team ID ────────────────────────────────────────────────────

test.describe('Team Detail Page — invalid team ID @regression', () => {
  test('shows "Team not found" for a non-numeric team ID', async ({ page }) => {
    await mockGraphQL(page);
    await page.goto(INVALID_TEAM_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByTestId('main-content').getByText('Team not found'),
    ).toBeVisible();
  });

  test('tells the user the link is invalid for a non-numeric team ID', async ({
    page,
  }) => {
    await mockGraphQL(page);
    await page.goto(INVALID_TEAM_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByTestId('main-content').getByText(/link is invalid/i),
    ).toBeVisible();
  });
});

// ── Tests: GraphQL query failure ──────────────────────────────────────────────

test.describe('Team Detail Page — GraphQL query failure @regression', () => {
  test('shows "Team not found" when the team members query returns a NOT_FOUND error', async ({
    page,
  }) => {
    await mockGraphQL(page, 'notFound');
    await page.goto(VALID_TEAM_URL);
    await page.waitForLoadState('load');

    const main = page.getByTestId('main-content');
    await expect(main.getByText('Team not found')).toBeVisible();
    await expect(
      main.getByText(/doesn.t exist or you may not have access/i),
    ).toBeVisible();
  });

  test('shows "Error loading team" for a generic GraphQL error', async ({
    page,
  }) => {
    await mockGraphQL(page, 'genericError');
    await page.goto(VALID_TEAM_URL);
    await page.waitForLoadState('load');

    const main = page.getByTestId('main-content');
    await expect(main.getByText('Error loading team')).toBeVisible();
    await expect(main.getByText(/something went wrong/i)).toBeVisible();
  });

  test('does not show the invalid-team-ID message for a query failure', async ({
    page,
  }) => {
    await mockGraphQL(page, 'genericError');
    await page.goto(VALID_TEAM_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByTestId('main-content').getByText(/link is invalid/i),
    ).not.toBeVisible();
  });
});
