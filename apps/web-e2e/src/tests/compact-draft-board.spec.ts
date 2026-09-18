/**
 * E2E Tests: Compact Draft Board — pick sheet (LS-9732, LS-10002)
 *
 * `EliteDraftBoardScreen` swaps in `CompactLiveDraftBoard` below
 * `useDraftViewportTier()`'s `phone` tier (<800px), in place of the wide
 * `DraftPlayerBoard` (whose root carries `data-testid="draft-board"`). LS-9712
 * pinned the desktop-board specs (`draft-selection-workflow.spec.ts`,
 * `player-detail-deep-link.spec.ts`'s draft-board describe) to a desktop
 * viewport rather than skip them at mobile width, deferring compact coverage
 * here.
 *
 * On phone the player browser (`DraftPlayersTab`) rides in a sheet raised
 * over the round board by the gold CTA (LS-10002), alongside the Queue and
 * History tabs (LS-10165). Covers the sheet against real Tamagui (open, scrim and close
 * dismissal, viewport bounds, draft-then-dismiss — the jest Sheet mock can't)
 * and the browser's own affordances inside it: the search input, the position
 * chip rail (and its active/selected state), the queue star, and the DRAFT
 * button — the same `GetAvailableDraftPlayers` data the desktop board reads.
 *
 * All GraphQL is mocked (ADR-0015 §6) via `createGraphQLRouter`.
 */

import { expect, test } from '../fixtures/pages';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import { DESKTOP_VIEWPORT, MOBILE_VIEWPORT } from '../utils/viewport';

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
  // The fields GetLiveDraftLeagueDraft actually selects — the hero's
  // "2 teams · Snake" badge reads draftOrder (LS-10204).
  selectionMethod: 'standard',
  draftOrder: 'snake',
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
 * compact board's pick sheet. Tracks queue and pick mutations so tests can
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

/**
 * Navigate to the draft and raise the compact board's pick sheet (LS-10002).
 * The sheet is the phone tier's only route to `DraftPlayersTab`; since
 * LS-10165 the draft room has no bottom nav at all.
 */
async function openPickSheet(page: import('@playwright/test').Page) {
  await page.goto(DRAFT_URL);
  await page.waitForLoadState('load');
  // Confirms the compact board (not the desktop `draft-board` grid) rendered —
  // the squad strip only mounts on the phone tier.
  await page.getByTestId('draft-squad-strip').waitFor({ timeout: 15000 });
  await page.getByTestId('draft-pick-cta').click();
  await page
    .getByTestId('draft-players-row')
    .first()
    .waitFor({ timeout: 15000 });
}

test.describe('Compact Draft Board — pick sheet @regression', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('the CTA raises the player sheet over the board, which has no Players tab', async ({
    page,
  }) => {
    await setupCompactDraftRoute(page);
    await openPickSheet(page);

    await expect(page.getByTestId('draft-pick-sheet')).toBeVisible();
    await expect(page.getByText('Available players')).toBeVisible();
    // Over the board, not instead of it.
    await expect(page.getByTestId('draft-round-board')).toBeAttached();
    await expect(page.getByTestId('draft-bottom-nav-players')).toHaveCount(0);
  });

  // LS-10165: the app keeps its header and fixed MobileBottomBar on this route
  // at phone width, so the draft room must not add a nav bar of its own. Its
  // in-page navigation is the pick sheet's tabs plus the clock bar's chat.
  test('reaches Queue, History and Chat without a draft-owned nav bar', async ({
    page,
  }, testInfo) => {
    // The web wrapper's leave-draft guard (LS-4986) prompts on clicks to
    // role="tab" outside the board's container. The pick sheet is portaled to
    // <body>, so its tabs once tripped that prompt — and Playwright auto-
    // dismisses dialogs, which silently swallowed the tab switch. Any dialog
    // here is a regression.
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });

    await setupCompactDraftRoute(page);
    await openPickSheet(page);

    await expect(page.getByTestId('draft-bottom-nav')).toHaveCount(0);
    await expect(page.getByTestId('draft-sheet-tabs')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('phone-players.png') });

    await page.getByTestId('draft-sheet-tab-queue').click();
    await expect(page.getByTestId('draft-queue-tab')).toBeVisible();
    await expect(page.getByTestId('draft-players-row')).toHaveCount(0);

    await page.getByTestId('draft-sheet-tab-history').click();
    await expect(page.getByTestId('draft-pick-history')).toBeVisible();
    await expect(page.getByText('Pick history')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('phone-history.png') });
    expect(dialogs).toEqual([]);

    await page.getByTestId('draft-pick-sheet-close').click();
    await expect(page.getByTestId('draft-pick-sheet')).toHaveCount(0);

    await page.getByTestId('draft-clock-bar-chat').click();
    await expect(page.getByTestId('draft-chat-panel')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('phone-chat.png') });
    await page.getByTestId('draft-chat-panel-close').click();
    await expect(page.getByTestId('draft-chat-panel')).toBeHidden();
    await expect(page.getByTestId('draft-round-board')).toBeVisible();
  });

  test('the sheet stays inside the viewport with its close control on screen', async ({
    page,
  }) => {
    // LS-8501 / LS-9900: a viewport-anchored layer that sizes to its content
    // pushes its own controls off the fold. The sheet is snapped to a bounded
    // share of the viewport instead, and its list scrolls inside it.
    await setupCompactDraftRoute(page);
    await openPickSheet(page);

    const frame = page.getByTestId('draft-pick-sheet');
    // Measured once the slide-in settles — mid-animation the frame is still
    // translated below the fold.
    await expect
      .poll(async () => {
        const box = await frame.boundingBox();
        return box ? box.y + box.height : Infinity;
      })
      .toBeLessThanOrEqual(MOBILE_VIEWPORT.height + 1);
    const sheet = await frame.boundingBox();
    expect(sheet).not.toBeNull();
    if (!sheet) return;
    // Bounded: the board stays visible above it.
    expect(sheet.y).toBeGreaterThan(0);
    expect(sheet.height).toBeLessThanOrEqual(MOBILE_VIEWPORT.height * 0.85);

    const close = await page
      .getByTestId('draft-pick-sheet-close')
      .boundingBox();
    expect(close).not.toBeNull();
    if (!close) return;
    expect(close.y).toBeGreaterThanOrEqual(sheet.y);
    expect(close.y + close.height).toBeLessThanOrEqual(MOBILE_VIEWPORT.height);
  });

  test('the close control dismisses the sheet', async ({ page }) => {
    await setupCompactDraftRoute(page);
    await openPickSheet(page);

    await page.getByTestId('draft-pick-sheet-close').click();

    await expect(page.getByTestId('draft-players-row')).toHaveCount(0);
    // Nothing is left intercepting taps on the board behind it.
    await page.getByTestId('draft-pick-cta').click();
    await expect(page.getByTestId('draft-players-row').first()).toBeVisible();
  });

  test('tapping the scrim above the sheet dismisses it', async ({ page }) => {
    await setupCompactDraftRoute(page);
    await openPickSheet(page);

    // The top of the viewport is scrim — the sheet only covers the lower 84%.
    await page.mouse.click(MOBILE_VIEWPORT.width / 2, 20);

    await expect(page.getByTestId('draft-players-row')).toHaveCount(0);
  });

  test('drafting from the sheet completes the pick and dismisses the sheet', async ({
    page,
  }) => {
    const { capturedMutations } = await setupCompactDraftRoute(page, {
      currentPickTeamId: 1,
    });
    await openPickSheet(page);

    await page.getByTestId(`draft-players-draft-${PLAYER_B.id}`).click();

    await expect
      .poll(
        () =>
          capturedMutations.filter((m) => m.operationName === 'MakeDraftPick')
            .length,
      )
      .toBeGreaterThan(0);
    await expect(page.getByTestId('draft-players-row')).toHaveCount(0);
  });
});

test.describe('Compact Draft Board — player browser in the pick sheet @regression', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('renders search, chip rail, and the player list', async ({ page }) => {
    await setupCompactDraftRoute(page);
    await openPickSheet(page);

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
    await openPickSheet(page);

    const search = page.getByPlaceholder('Search players…');
    await search.fill('Ohtani');
    await expect(search).toHaveValue('Ohtani');
  });

  test('position chip rail offers the league sport and marks the tapped chip as the active filter', async ({
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
    await openPickSheet(page);

    // A baseball league gets baseball chips (LS-10002 — the browser used to
    // offer football chips to every league).
    await expect(page.getByTestId('draft-players-chip-QB')).toHaveCount(0);

    const allChip = page.getByTestId('draft-players-chip-ALL');
    const ssChip = page.getByTestId('draft-players-chip-SS');

    const allHtmlBefore = await allChip.innerHTML();
    const ssHtmlBefore = await ssChip.innerHTML();

    await ssChip.click();

    await expect.poll(() => ssChip.innerHTML()).not.toBe(ssHtmlBefore);
    await expect.poll(() => allChip.innerHTML()).not.toBe(allHtmlBefore);
  });

  test('tapping the queue star adds and removes a player from the draft queue', async ({
    page,
  }) => {
    const { capturedMutations } = await setupCompactDraftRoute(page);
    await openPickSheet(page);

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
    await openPickSheet(page);

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
    await openPickSheet(page);

    await expect(
      page.getByTestId(`draft-players-draft-${PLAYER_A.id}`),
    ).toHaveCount(0);
    // The queue star is still actionable when it isn't the viewer's turn.
    await expect(
      page.getByTestId(`draft-players-queue-${PLAYER_A.id}`),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Header chrome per tier (LS-10204). Product constraint: the draft room adds no
// navigation that duplicates or fights the app shell. On web the shell keeps
// its header on this route at every width (burger + league chip below 980, the
// full nav above), so the draft room draws neither a slim nav bar nor a
// burger/breadcrumb row — only the phone clock bar, or the tablet/desktop hero.
// ---------------------------------------------------------------------------
const TABLET_VIEWPORT = { width: 860, height: 1000 } as const;

async function gotoDraft(page: import('@playwright/test').Page) {
  await page.goto(DRAFT_URL);
  await page.waitForLoadState('load');
}

test.describe('Draft room header chrome — phone (LS-10204) @regression', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('the clock bar replaces the header band and no slim nav stacks under the app header', async ({
    page,
  }, testInfo) => {
    await setupCompactDraftRoute(page);
    await gotoDraft(page);

    const clockBar = page.getByTestId('draft-clock-bar');
    await expect(clockBar).toBeVisible({ timeout: 15000 });
    await expect(
      clockBar.getByText("You're on the clock · R1 · P1"),
    ).toBeVisible();
    await expect(clockBar.getByRole('timer')).toBeVisible();
    await expect(page.getByTestId('draft-clock-bar-chat')).toBeVisible();

    // The shell's header is the only nav: one burger, no draft slim nav, no
    // hero.
    await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(
      1,
    );
    await expect(page.getByTestId('draft-slim-nav')).toHaveCount(0);
    await expect(page.getByTestId('draft-hero')).toHaveCount(0);

    await page.screenshot({ path: testInfo.outputPath('phone-header.png') });
  });
});

test.describe('Draft room header chrome — tablet and desktop (LS-10204) @regression', () => {
  for (const [tier, viewport] of [
    ['tablet', TABLET_VIEWPORT],
    ['desktop', DESKTOP_VIEWPORT],
  ] as const) {
    test.describe(tier, () => {
      test.use({ viewport });

      test(`renders the hero under the shell header without a second nav (${tier})`, async ({
        page,
      }, testInfo) => {
        await setupCompactDraftRoute(page);
        await gotoDraft(page);

        const hero = page.getByTestId('draft-hero');
        await expect(hero).toBeVisible({ timeout: 15000 });
        await expect(
          hero.getByRole('heading', { name: 'Test Draft League · Draft' }),
        ).toBeVisible();
        await expect(hero.getByText('Draft Live')).toBeVisible();
        await expect(hero.getByText('Round 1 · Pick 1 of 32')).toBeVisible();
        await expect(hero.getByText('2 teams · Snake')).toBeVisible();
        await expect(page.getByTestId('draft-hero-back')).toBeVisible();

        // Burger and breadcrumbs come from the app shell, not the draft room:
        // at most one burger (the shell's, below 980) and no draft slim nav.
        const burgers = page.getByRole('button', { name: 'Open menu' });
        if (tier === 'tablet') {
          await expect(burgers).toHaveCount(1);
          await expect(burgers).toBeVisible();
        } else {
          await expect(burgers).toBeHidden();
        }
        await expect(page.getByTestId('draft-slim-nav')).toHaveCount(0);
        await expect(page.getByTestId('draft-clock-bar')).toHaveCount(0);

        await page.screenshot({
          path: testInfo.outputPath(`${tier}-header.png`),
        });
      });
    });
  }

  test.describe('back link', () => {
    test.use({ viewport: TABLET_VIEWPORT });

    // The back link sits inside the board, where the live-draft leave guard
    // (apps/web EliteDraftBoard.tsx) otherwise waves clicks through as draft
    // interactions. It must still ask before leaving a live draft — and
    // Playwright auto-dismisses dialogs, so assert the prompt explicitly.
    test('asks before leaving a live draft, and stays put when cancelled', async ({
      page,
    }) => {
      await setupCompactDraftRoute(page);
      await gotoDraft(page);
      await expect(page.getByTestId('draft-hero-back')).toBeVisible({
        timeout: 15000,
      });

      const dialogs: string[] = [];
      page.on('dialog', (dialog) => {
        dialogs.push(dialog.message());
        void dialog.dismiss();
      });

      await page.getByTestId('draft-hero-back').click();
      await expect.poll(() => dialogs.length).toBe(1);
      expect(dialogs[0]).toContain('Your draft is still in progress');
      await expect(page).toHaveURL(new RegExp(`${DRAFT_URL}$`));
      await expect(page.getByTestId('draft-hero')).toBeVisible();
    });

    test('goes back to the league when confirmed', async ({ page }) => {
      await setupCompactDraftRoute(page);
      await gotoDraft(page);
      await expect(page.getByTestId('draft-hero-back')).toBeVisible({
        timeout: 15000,
      });

      const dialogs: string[] = [];
      page.on('dialog', (dialog) => {
        dialogs.push(dialog.message());
        void dialog.accept();
      });

      await page.getByTestId('draft-hero-back').click();
      await expect(page).toHaveURL(
        new RegExp(`/baseball/league/${LEAGUE_ID}$`),
      );
      expect(dialogs).toHaveLength(1);
    });
  });
});
