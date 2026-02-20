import { test as base, expect } from '@playwright/test';

/**
 * Auth fixture that provides GraphQL mocking for tests that need mock API responses.
 *
 * Authentication is handled by the global-setup.ts storageState — the JWT is
 * already in localStorage before the page loads. This fixture only adds
 * route-level mocks for GraphQL and OAuth endpoints.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // Mock OAuth login endpoint
    await page.route('**/oauth/login', (route) => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: {
            id: 1,
            email: 'test@example.com',
            username: 'testuser',
            name: 'Test User',
            accessLevel: 'admin',
          },
          token: 'mock-test-token',
        }),
      });
    });

    // Mock only the specific GraphQL endpoint (not file paths containing 'graphql')
    await page.route(
      (url) => {
        const urlString = url.toString();
        return (
          urlString.includes('/graphql') &&
          !urlString.includes('/@fs/') &&
          !urlString.includes('.ts') &&
          !urlString.includes('.js')
        );
      },
      (route) => {
        const request = route.request();
        const postData = request.postData()?.toLowerCase() ?? '';

        if (postData.includes('getleaguebyid')) {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                league: {
                  __typename: 'League',
                  id: 1,
                  name: 'Test League',
                  description: 'A test league for E2E testing',
                  owner: 1,
                  maxRosterSize: 25,
                  draftStatus: 'not-started',
                  currentMatchup: null,
                  numberOfTeams: 10,
                  draftType: 'NORMAL',
                  isPublic: false,
                  maxBatters: 14,
                  maxPitchers: 9,
                  tradingEnabled: true,
                  waiverEnabled: true,
                  startDate: null,
                },
              },
            }),
          });
        } else if (postData.includes('startdraft')) {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                startDraft: {
                  __typename: 'League',
                  id: 1,
                  name: 'Test League',
                  description: 'A test league for E2E testing',
                  owner: 1,
                  maxRosterSize: 25,
                  draftStatus: 'queued',
                  currentMatchup: null,
                  numberOfTeams: 10,
                  draftType: 'NORMAL',
                  isPublic: false,
                  maxBatters: 14,
                  maxPitchers: 9,
                  tradingEnabled: true,
                  waiverEnabled: true,
                  startDate: null,
                },
              },
            }),
          });
        } else if (postData.includes('getpositionsforleague')) {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                leaguePositions: [
                  {
                    __typename: 'LeaguePosition',
                    id: 1,
                    name: 'Catcher',
                    abbrev: 'C',
                  },
                  {
                    __typename: 'LeaguePosition',
                    id: 2,
                    name: 'First Base',
                    abbrev: '1B',
                  },
                  {
                    __typename: 'LeaguePosition',
                    id: 3,
                    name: 'Second Base',
                    abbrev: '2B',
                  },
                ],
              },
            }),
          });
        } else if (postData.includes('getteammembers')) {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                teamMembers: [],
              },
            }),
          });
        } else if (postData.includes('getuserteamid')) {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                userTeamId: { __typename: 'UserTeamId', teamId: 1 },
              },
            }),
          });
        } else if (postData.includes('getleagueteams')) {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                leagueTeams: [
                  { __typename: 'Team', id: 1, name: 'Team 1', owner: 1 },
                  { __typename: 'Team', id: 2, name: 'Team 2', owner: null },
                ],
              },
            }),
          });
        } else if (postData.includes('getcurrentmatchupforleague')) {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { currentMatchupForLeague: null },
            }),
          });
        } else if (postData.includes('getmatchupsforleague')) {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { matchupsForLeague: [] },
            }),
          });
        } else if (postData.includes('getmatchupbyid')) {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { matchup: null },
            }),
          });
        } else if (postData.includes('getleaguescoringprofile')) {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { leagueScoringProfile: null },
            }),
          });
        } else if (postData.includes('getuserleagues')) {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                userLeagues: [
                  {
                    __typename: 'League',
                    id: 1,
                    name: 'Test League',
                    description: 'A test league for E2E testing',
                    owner: 1,
                    maxRosterSize: 25,
                    draftStatus: 'not-started',
                    currentMatchup: null,
                    numberOfTeams: 10,
                    draftType: 'NORMAL',
                    isPublic: false,
                  },
                ],
              },
            }),
          });
        } else {
          // Let other GraphQL requests pass through
          void route.continue();
        }
      },
    );

    await use(page);
  },
});

export { expect };
