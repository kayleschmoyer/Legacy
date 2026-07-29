/**
 * Keeper Designation Flow E2E Tests (LS-8673)
 *
 * Covers: the pre-draft Keeper Designations panel on the "My Team" tab —
 * rendering eligible roster players, designating/undesignating a keeper,
 * and the locked state once the draft has started.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 * Route: /baseball/league/1/team
 */

import { expect } from '../fixtures/auth-enhanced';
import { test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const TEAM_URL = '/baseball/league/1/team';

function mockLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: 1,
    name: 'Keeper League',
    owner: 1,
    sport: 'baseball',
    defensiveFormat: null,
    maxRosterSize: 25,
    currentMatchup: null,
    currentWeekNumber: null,
    draftStatus: 'not-started',
    leaguePhase: 'pre-draft',
    inviteCode: 'KEEPER01',
    playerPool: 'all',
    weekAdvanceStatus: 'idle',
    waiverType: 'standard',
    waiverEnabled: true,
    faabBudgetDefault: 100,
    pitcherStartsPerMatchup: 1,
    gamesPerMatchup: 7,
    minCareerGames: 50,
    minCareerSeasons: 3,
    totalMatchups: 12,
    playoffEnabled: true,
    playoffFormat: '4-team',
    playoffMultiWeek: false,
    lmNotes: null,
    isMockDraft: false,
    isPublic: false,
    logoUrl: null,
    bannerUrl: null,
    primaryColor: null,
    secondaryColor: null,
    previousLeagueId: null,
    frozenAt: null,
    seasonNumber: 2,
    salaryCapEnabled: false,
    salaryCap: null,
    salaryFloor: null,
    luxuryTaxThreshold: null,
    minSalary: 1,
    salaryEscalationPct: 10,
    salaryDecayPct: 25,
    auctionBudget: 260,
    auctionMinBid: 1,
    eraFilter: 'all',
    baseballHofOnly: false,
    customEraStartYear: null,
    customEraEndYear: null,
    tradeDeadlineWeek: null,
    rosterContinuity: 'keeper',
    keeperSettings: {
      __typename: 'KeeperSettings',
      keeperCount: 2,
      costModel: 'round-penalty',
      maxConsecutiveKeeps: null,
      rookieExempt: false,
    },
    userMembership: {
      __typename: 'LeagueMember',
      leagueId: 1,
      userId: 1,
      teamId: 1,
      permissionLevel: 'general_manager',
      username: 'testuser',
    },
    ...overrides,
  };
}

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'My Team',
    leagueId: 1,
    divisionId: null,
    waiverOrder: 1,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    managerId: 1,
    totalPayroll: null,
    capSpace: null,
  },
];

const MOCK_TEAM_MEMBERS = [
  {
    __typename: 'TeamMember',
    id: 1,
    playerId: 101,
    positionId: 1,
    teamId: 1,
    leagueId: 1,
    onTradeBlock: false,
    salary: null,
    askingPrice: null,
    nickname: null,
    isLocked: false,
    player: {
      __typename: 'Player',
      id: 101,
      firstName: 'Mike',
      lastName: 'Trout',
      brefId: 'troutmi01',
      eligiblePositions: ['CF'],
      injuryStatus: null,
      careerBatting: { __typename: 'CareerBatting', games: 1000 },
      seasonsPlayed: 10,
    },
  },
];

function mockEligiblePlayer(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'KeeperEligiblePlayer',
    playerId: 101,
    teamId: 1,
    isRookie: false,
    designated: false,
    designationId: null,
    previewCostRound: 5,
    previewCostAmount: null,
    player: {
      __typename: 'Player',
      id: 101,
      firstName: 'Mike',
      lastName: 'Trout',
    },
    ...overrides,
  };
}

interface SetupOptions {
  league?: Record<string, unknown>;
  eligibleRoster?: Record<string, unknown>[];
  onDesignate?: () => void;
  onUndesignate?: () => void;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const league = opts.league ?? mockLeague();
  let eligibleRoster = opts.eligibleRoster ?? [mockEligiblePlayer()];

  await page.route(isGraphQLEndpoint, async (route) => {
    const operationName = extractOperationName(route).toLowerCase();

    if (operationName === 'getleaguebyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league } }),
      });
    } else if (operationName === 'getleagueteams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (operationName === 'getuserteamid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (operationName === 'getteammembers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: MOCK_TEAM_MEMBERS } }),
      });
    } else if (operationName === 'getkeepereligibleroster') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { keeperEligibleRoster: eligibleRoster },
        }),
      });
    } else if (operationName === 'designatekeeper') {
      opts.onDesignate?.();
      eligibleRoster = eligibleRoster.map((p) =>
        p.playerId === 101 ? { ...p, designated: true, designationId: 999 } : p,
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            designateKeeper: {
              __typename: 'KeeperDesignation',
              id: 999,
              leagueId: 1,
              teamId: 1,
              playerId: 101,
              season: 2,
              status: 'pending',
              costRound: null,
              costAmount: null,
            },
          },
        }),
      });
    } else if (operationName === 'undesignatekeeper') {
      opts.onUndesignate?.();
      eligibleRoster = eligibleRoster.map((p) =>
        p.playerId === 101
          ? { ...p, designated: false, designationId: null }
          : p,
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            undesignateKeeper: {
              __typename: 'KeeperDesignation',
              id: 999,
              leagueId: 1,
              teamId: 1,
              playerId: 101,
              season: 2,
              status: 'released',
            },
          },
        }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

test.describe('Keeper Designation Panel — pre-draft team view @regression', () => {
  test('renders the Keeper Designations panel with an eligible roster player', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: 'Keeper Designations' }),
    ).toBeVisible();
    await expect(page.getByText('Mike Trout')).toBeVisible();
    await expect(page.getByText('0/2')).toBeVisible();
  });

  test('designating a player flips the button to Undesignate and updates the count', async ({
    page,
  }) => {
    let designated = false;
    await setupGraphQL(page, {
      onDesignate: () => {
        designated = true;
      },
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await page.getByRole('button', { name: 'Keep', exact: true }).click();

    await expect(
      page.getByRole('button', { name: 'Undesignate' }),
    ).toBeVisible();
    await expect(page.getByText('1/2')).toBeVisible();
    expect(designated).toBe(true);
  });

  test('undesignating a keeper reverts the button back to Keep', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      eligibleRoster: [
        mockEligiblePlayer({ designated: true, designationId: 999 }),
      ],
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('button', { name: 'Undesignate' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Undesignate' }).click();

    await expect(
      page.getByRole('button', { name: 'Keep', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('0/2')).toBeVisible();
  });

  test('shows the locked message and disables designation once the draft is live', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: mockLeague({ draftStatus: 'in-progress' }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByText('Designations are locked — the draft has started.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Keep', exact: true }),
    ).toBeDisabled();
  });

  test('does not render the panel for a non-keeper league', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: mockLeague({ rosterContinuity: 'redraft', keeperSettings: null }),
    });
    await page.goto(TEAM_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: 'Keeper Designations' }),
    ).not.toBeVisible();
  });
});
