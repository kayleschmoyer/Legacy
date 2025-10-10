import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    // Set up authentication bypass for all tests
    await page.addInitScript(() => {
      // Create a valid JWT token that AuthService can decode
      const mockJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwidXNlcm5hbWUiOiJ0ZXN0dXNlciIsImFjY2Vzc0xldmVsIjoiYWRtaW4iLCJuYW1lIjoiVGVzdCBVc2VyIiwiZXhwIjoyMDAwMDAwMDAwfQ.XO-6WJiJsviIWCdR8HPJWzYVxsYhQVNhO3dKlkkK7fs';
      
      // Use the correct localStorage key that AuthService looks for
      window.localStorage.setItem('auth_jwt', mockJwt);
    });

    // Only intercept very specific authentication and API endpoints
    // Let all static assets and module scripts load normally
    await page.route('**/oauth/login', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: { 
            id: 1, 
            email: 'test@example.com', 
            username: 'testuser',
            name: 'Test User',
            accessLevel: 'admin'
          },
          token: 'mock-test-token'
        }),
      });
    });

    // Mock only the specific GraphQL endpoint (not file paths containing 'graphql')
    await page.route(url => {
      const urlString = url.toString();
      return urlString.includes('/graphql') && 
             !urlString.includes('/@fs/') && 
             !urlString.includes('.ts') && 
             !urlString.includes('.js');
    }, route => {
      const request = route.request();
      const postData = request.postData();
      
      if (postData?.includes('getLeagueById')) {
        route.fulfill({
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
                startDate: null
              }
            }
          }),
        });
      } else if (postData?.includes('startDraft')) {
        route.fulfill({
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
                startDate: null
              }
            }
          }),
        });
      } else if (postData?.includes('getPositionsForLeague')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              leaguePositions: [
                { __typename: 'LeaguePosition', id: 1, name: 'Catcher', abbrev: 'C' },
                { __typename: 'LeaguePosition', id: 2, name: 'First Base', abbrev: '1B' },
                { __typename: 'LeaguePosition', id: 3, name: 'Second Base', abbrev: '2B' }
              ]
            }
          }),
        });
      } else if (postData?.includes('getTeamMembers')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              teamMembers: []
            }
          }),
        });
      } else {
        // Let other GraphQL requests pass through
        route.continue();
      }
    });

    await use(page);
  },
});

export { expect };
