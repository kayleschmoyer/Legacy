/**
 * E2E Tests: Compact Draft Board — Players Tab (LS-9732)
 *
 * `EliteDraftBoardScreen` swaps in `CompactLiveDraftBoard` ->
 * `DraftPlayersTab` below `useDraftViewportTier()`'s `phone` tier (<800px),
 * in place of the wide `DraftPlayerBoard` (whose root carries
 * `data-testid="draft-board"`). That surface had zero E2E coverage — LS-9712
 * pinned the desktop-board specs (`draft-selection-workflow.spec.ts`,
 * `player-detail-deep-link.spec.ts`'s draft-board describe) to a desktop
 * viewport rather than skip them at mobile width, deferring compact coverage
 * here rather than bolting a `draft-board`-shaped testID onto a component
 * that doesn't have that surface.
 *
 * Covers `DraftPlayersTab`'s own affordances at phone width: the search
 * input, the position chip rail (and its active/selected state), the queue
 * star, and the DRAFT button — the same `GetAvailableDraftPlayers` data the
 * desktop board reads (no new queries/mutations beyond what
 * `draft-selection-workflow.spec.ts` already exercises for the desktop
 * board).
 *
 * All GraphQL is mocked (ADR-0015 §6) via `createGraphQLRouter`.
 */

import { expect, test } from '../fixtures/pages';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import { MOBILE_VIEWPORT } from '../utils/viewport';

const LEAGUE_ID = 1;
const DRAFT_URL = `/baseball/league/${LEAGUE_ID}/draft`;

const PLAYER_A = { id: 201, firstName: 'Mike', lastName: 'Trout' };
const PLAYER_B = { id: 202, firstName: 'Shohei', lastName: 'Ohtani' };
const PLAYER_C = { id: 203, firstName: 'Aaron', lastName: 'Judge' };

const MOCK_LEAGUE = {
  __typename: 'League',
  id: LEAGUE_ID,
  name: 'Test Draft League',
  description: '',
  owner: 1,
  maxRosterSize: 16,
  draftStatus: 'in-progress',
  activeDraftId: 1,
  currentMatchup: null,
  numberOfTeams: 2,
  playerPool: 'all',
  draftMode: 'live',
  selectionMethod: 'standard',
  draftOrder: 'snake',
  isPublic: false,
  maxBatters: 14,
  maxPitchers: 9,
  tradingEnabled: true,
  waiverEnabled: true,
  startDate: null,
  logoUrl: null,
  bannerUrl: null,
  primaryColor: null,
  secondaryColor: null,
  inviteCode: 'TEST1234',
  userMembership: { teamId: 1 },
  minCareerGames: 50,
  minCareerSeasons: 3,
  waiverType: 'standard',
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'My Team',
    owner: 1,
    leagueId: LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 1,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Their Team',
    owner: 2,
    leagueId: LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 2,
  },
];

const MOCK_POSITIONS = [
  {
    __typename: 'LeaguePosition',
    id: 1,
    leagueId: LEAGUE_ID,
    positionType: 'C',
  },
  {
    __typename: 'LeaguePosition',
    id: 2,
    leagueId: LEAGUE_ID,
    positionType: '1B',
  },
  {
    __typename: 'LeaguePosition',
    id: 3,
    leagueId: LEAGUE_ID,
    positionType: 'OF',
  },
];

const DRAFT_IN_PROGRESS = {
  __typename: 'Draft',
  id: 1,
  leagueId: LEAGUE_ID,
  status: 'in-progress',
  currentRound: 1,
  currentPick: 1,
  totalRounds: 25,
  totalPicks: 100,
  draftType: 'snake',
  secondsPerPick: 90,
  scheduledFor: null,
};

function mockDraftPlayer(p: {
  id: number;
  firstName: string;
  lastName: string;
}) {
  return {
    __typename: 'DraftPlayer',
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    brefId: `player${p.id}`,
    eligiblePositions: ['OF'],
    hitterAvgPointsPerGame: 12.5,
    pitchingAvgPointsPerGame: null,
    projectedMatchupPoints: 20.0,
    adp: 10.0,
  };
}

interface DraftRouteOptions {
  /** teamId 1 == "my" team (see MOCK_TEAMS/userMembership above). */
  currentPickTeamId?: number;
}

/**
 * Installs hermetic GraphQL mocks for the draft-in-progress screen, matching
 * the same operation set `draft-selection-workflow.spec.ts` and
 * `player-detail-deep-link.spec.ts`'s `installDraftMocks` already exercise
 * for the desktop board — this spec drives the same data through the
 * compact board's Players tab. Tracks queue and pick mutations so tests can
 * assert on them, and keeps queue state (`getmydraftqueue`) live so the
 * queue star's post-toggle UI state reflects a real refetch rather than
 * optimistic-only local state.
 */
async function setupCompactDraftRoute(
  page: import('@playwright/test').Page,
  options: DraftRouteOptions = {},
) {
  const { currentPickTeamId = 1 } = options;
  const capturedMutations: Array<{
    operationName: string;
    variables: Record<string, unknown>;
  }> = [];
  const queuedPlayerIds = new Set<number>();

  await createGraphQLRouter(page, {
    getleaguebyid: (route) =>
      fulfillJson(route, { data: { league: MOCK_LEAGUE } }),
    getleagueteams: (route) =>
      fulfillJson(route, { data: { leagueTeams: MOCK_TEAMS } }),
    getpositionsforleague: (route) =>
      fulfillJson(route, { data: { leaguePositions: MOCK_POSITIONS } }),
    getuserteamid: (route) => fulfillJson(route, { data: { userTeamId: 1 } }),
    getlivedraftleaguedraft: (route) =>
      fulfillJson(route, { data: { getLeagueDraft: DRAFT_IN_PROGRESS } }),
    getavailabledraftplayers: (route) =>
      fulfillJson(route, {
        data: {
          getAvailableDraftPlayers: [PLAYER_A, PLAYER_B, PLAYER_C].map(
            mockDraftPlayer,
          ),
        },
      }),
    getdraftpicks: (route) =>
      fulfillJson(route, { data: { getDraftPicks: [] } }),
    getcurrentdraftpick: (route) =>
      fulfillJson(route, {
        data: {
          getCurrentDraftPick: {
            __typename: 'DraftPick',
            id: 1,
            draftId: 1,
            round: 1,
            pickNumber: 1,
            overallPick: 1,
            teamId: currentPickTeamId,
            isComplete: false,
            playerId: null,
            player: null,
          },
        },
      }),
    getdraftteamorder: (route) =>
      fulfillJson(route, {
        data: {
          getDraftTeamOrder: [
            { teamId: 1, teamName: 'My Team', draftOrder: 1 },
            { teamId: 2, teamName: 'Their Team', draftOrder: 2 },
          ],
        },
      }),
    getleaguescoringprofile: (route) =>
      fulfillJson(route, { data: { leagueScoringProfile: null } }),
    getmydraftqueue: (route) =>
      fulfillJson(route, {
        data: {
          getMyDraftQueue: [...queuedPlayerIds].map((playerId, i) => ({
            __typename: 'DraftQueueEntry',
            id: i + 1,
            draftId: 1,
            playerId,
            priority: i + 1,
          })),
        },
      }),
    getmydraftteamautopick: (route) =>
      fulfillJson(route, { data: { getMyDraftTeamAutoPick: false } }),
    getdraftteamautopickstatuses: (route) =>
      fulfillJson(route, { data: { getDraftTeamAutoPickStatuses: [] } }),
    getuserleagues: (route) =>
      fulfillJson(route, { data: { userLeagues: [MOCK_LEAGUE] } }),
    getdraftrecommendations: (route) =>
      fulfillJson(route, { data: { getDraftRecommendations: [] } }),
    nudgeexpireddraftpick: (route) =>
      fulfillJson(route, { data: { nudgeExpiredDraftPick: true } }),

    addtodraftqueue: async (route, { variables }) => {
      capturedMutations.push({ operationName: 'AddToDraftQueue', variables });
      queuedPlayerIds.add(variables.playerId as number);
      await fulfillJson(route, {
        data: {
          addToDraftQueue: {
            __typename: 'DraftQueueEntry',
            id: queuedPlayerIds.size,
            draftId: 1,
            playerId: variables.playerId,
            priority: queuedPlayerIds.size,
          },
        },
      });
    },
    removefromdraftqueue: async (route, { variables }) => {
      capturedMutations.push({
        operationName: 'RemoveFromDraftQueue',
        variables,
      });
      queuedPlayerIds.delete(variables.playerId as number);
      await fulfillJson(route, { data: { removeFromDraftQueue: true } });
    },
    makedraftpick: async (route, { variables }) => {
      capturedMutations.push({ operationName: 'MakeDraftPick', variables });
      const playerId = variables.playerId as number;
      const player = [PLAYER_A, PLAYER_B, PLAYER_C].find(
        (p) => p.id === playerId,
      );
      await fulfillJson(route, {
        data: {
          makeDraftPick: {
            __typename: 'DraftPick',
            id: 1,
            round: 1,
            pickNumber: 1,
            overallPick: 1,
            pickedAt: new Date().toISOString(),
            teamId: 1,
            playerId,
            player: player
              ? {
                  id: player.id,
                  firstName: player.firstName,
                  lastName: player.lastName,
                }
              : null,
          },
        },
      });
    },
  });

  return { capturedMutations };
}

/** Navigate to the draft and switch to the compact board's Players tab. */
async function gotoDraftPlayersTab(page: import('@playwright/test').Page) {
  await page.goto(DRAFT_URL);
  await page.waitForLoadState('load');
  // Confirms the compact board (not the desktop `draft-board` grid) rendered.
  await page.getByTestId('draft-bottom-nav').waitFor({ timeout: 15000 });
  await page.getByTestId('draft-bottom-nav-players').click();
  await page
    .getByTestId('draft-players-row')
    .first()
    .waitFor({ timeout: 15000 });
}

test.describe('Compact Draft Board — Players Tab @regression', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('renders the Players tab with search, chip rail, and the player list', async ({
    page,
  }) => {
    await setupCompactDraftRoute(page);
    await gotoDraftPlayersTab(page);

    await expect(page.getByPlaceholder('Search players…')).toBeVisible();
    await expect(page.getByTestId('draft-players-chip-ALL')).toBeVisible();
    await expect(
      page.getByTestId('draft-players-row').filter({ hasText: 'Mike Trout' }),
    ).toBeVisible();
    await expect(
      page
        .getByTestId('draft-players-row')
        .filter({ hasText: 'Shohei Ohtani' }),
    ).toBeVisible();
  });

  test('search input accepts a filter term', async ({ page }) => {
    await setupCompactDraftRoute(page);
    await gotoDraftPlayersTab(page);

    const search = page.getByPlaceholder('Search players…');
    await search.fill('Ohtani');
    await expect(search).toHaveValue('Ohtani');
  });

  test('position chip rail marks the tapped chip as the active filter', async ({
    page,
  }) => {
    // `accessibilityState={{ selected }}` on these chips (DraftPlayersTab.tsx)
    // doesn't decompose to `aria-selected` on web — react-native-web's
    // createDOMProps only maps the flat `accessibilitySelected`/`aria-selected`
    // props, not the RN-style `accessibilityState` object — so active/inactive
    // is asserted via the chip's rendered style (its color-carrying descendant
    // `<YStack>`'s atomic CSS class changing, not the outer `Pressable`'s own
    // class, which is style-static) instead of an ARIA attribute that isn't
    // actually wired up for web.
    await setupCompactDraftRoute(page);
    await gotoDraftPlayersTab(page);

    const allChip = page.getByTestId('draft-players-chip-ALL');
    const qbChip = page.getByTestId('draft-players-chip-QB');

    const allHtmlBefore = await allChip.innerHTML();
    const qbHtmlBefore = await qbChip.innerHTML();

    await qbChip.click();

    await expect.poll(() => qbChip.innerHTML()).not.toBe(qbHtmlBefore);
    await expect.poll(() => allChip.innerHTML()).not.toBe(allHtmlBefore);
  });

  test('tapping the queue star adds and removes a player from the draft queue', async ({
    page,
  }) => {
    const { capturedMutations } = await setupCompactDraftRoute(page);
    await gotoDraftPlayersTab(page);

    const queueButton = page.getByTestId(`draft-players-queue-${PLAYER_A.id}`);
    await expect(queueButton).toHaveAccessibleName(
      `Queue ${PLAYER_A.firstName} ${PLAYER_A.lastName}`,
    );

    await queueButton.click();
    await expect
      .poll(
        () =>
          capturedMutations.filter((m) => m.operationName === 'AddToDraftQueue')
            .length,
      )
      .toBeGreaterThan(0);
    await expect(queueButton).toHaveAccessibleName(
      `Remove ${PLAYER_A.firstName} ${PLAYER_A.lastName} from queue`,
    );

    await queueButton.click();
    await expect
      .poll(
        () =>
          capturedMutations.filter(
            (m) => m.operationName === 'RemoveFromDraftQueue',
          ).length,
      )
      .toBeGreaterThan(0);
    await expect(queueButton).toHaveAccessibleName(
      `Queue ${PLAYER_A.firstName} ${PLAYER_A.lastName}`,
    );
  });

  test('DRAFT button sends the makeDraftPick mutation for the tapped player', async ({
    page,
  }) => {
    const { capturedMutations } = await setupCompactDraftRoute(page, {
      currentPickTeamId: 1,
    });
    await gotoDraftPlayersTab(page);

    const draftButton = page.getByTestId(`draft-players-draft-${PLAYER_B.id}`);
    await expect(draftButton).toBeVisible();
    await draftButton.click();

    await expect
      .poll(
        () =>
          capturedMutations.filter((m) => m.operationName === 'MakeDraftPick')
            .length,
      )
      .toBeGreaterThan(0);
    const pick = capturedMutations.find(
      (m) => m.operationName === 'MakeDraftPick',
    );
    expect(pick?.variables.playerId).toBe(PLAYER_B.id);
  });

  test("DRAFT button is absent when it is not the viewer's pick", async ({
    page,
  }) => {
    await setupCompactDraftRoute(page, { currentPickTeamId: 2 });
    await gotoDraftPlayersTab(page);

    await expect(
      page.getByTestId(`draft-players-draft-${PLAYER_A.id}`),
    ).toHaveCount(0);
    // The queue star is still actionable when it isn't the viewer's turn.
    await expect(
      page.getByTestId(`draft-players-queue-${PLAYER_A.id}`),
    ).toBeVisible();
  });
});
