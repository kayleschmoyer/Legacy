/**
 * E2E Tests: Tamagui media config ↔ design-token breakpoint alignment (LS-9895)
 *
 * LS-9885 aligns the workspace Tamagui `media` config with the
 * `@legacy-sports/design-tokens` band scale. `lib/tamagui-config`'s unit spec
 * asserts the config OBJECT, but that is deliberately not sufficient evidence:
 * Tamagui's jest setup treats every `maxWidth` tier as active before
 * measurement, so a media-dependent component can pass in jest while rendering
 * against the wrong width in a real browser. This spec closes that gap by
 * driving a real viewport across the boundary and asserting the layout flips
 * exactly there.
 *
 * Covered here:
 *   - the `$lg` boundary, which LS-9895 moved from 1280 → 1119.
 *     Probe: the Create League two-column layout, whose summary sidebar is
 *     `width={340}` with `$lg={{ width: '100%' }}`. Below the boundary the
 *     parent stacks and the sidebar fills the row; at or above it the sidebar
 *     is its fixed 340px column.
 *   - the `$md`/`$gtMd` boundary, which LS-9896 moved from 1020/1021 → 979/980.
 *     Probe: `StandingsTable`'s PF column header, `display: none` with
 *     `$gtMd={{ display: 'flex' }}` — hidden at 979px, visible at 980px.
 *
 * This is the template for the remaining slices — LS-9897 (`$xs`) and
 * LS-9898 (`$sm`) each add their own boundary case here as they land, so the
 * whole scale ends up pinned at real viewport widths.
 *
 * Page-object convention (ADR-0015): locators live on `leaguePage`/
 * `standingsPage`, so this spec is selector-free. Viewport is the spec's to
 * own.
 */

import { expect, leagueTest as test } from '../fixtures/pages';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

/** Design-token `xl` band lower bound — the first width at which `$lg` stops applying. */
const LG_BOUNDARY = 1120;
const FIXED_SIDEBAR_WIDTH = 340;
const VIEWPORT_HEIGHT = 900;

/** Width of the sidebar as laid out, rounded — the assertion subject throughout. */
async function sidebarWidth(leaguePage: {
  createSummarySidebar: { boundingBox(): Promise<{ width: number } | null> };
}): Promise<number> {
  const box = await leaguePage.createSummarySidebar.boundingBox();
  expect(box).not.toBeNull();
  return Math.round(box?.width ?? 0);
}

test.describe('Breakpoint alignment — $lg fires on the design-token scale @regression', () => {
  test(`sidebar is a fixed ${FIXED_SIDEBAR_WIDTH}px column at the boundary (${LG_BOUNDARY}px)`, async ({
    page,
    leaguePage,
  }) => {
    await page.setViewportSize({ width: LG_BOUNDARY, height: VIEWPORT_HEIGHT });
    await leaguePage.gotoCreate();
    await leaguePage.createSummarySidebar.expectVisible();

    // Two-column: the sidebar keeps its fixed width rather than filling the row.
    expect(await sidebarWidth(leaguePage)).toBe(FIXED_SIDEBAR_WIDTH);
  });

  test(`sidebar goes full-width one pixel below the boundary (${LG_BOUNDARY - 1}px)`, async ({
    page,
    leaguePage,
  }) => {
    await page.setViewportSize({
      width: LG_BOUNDARY - 1,
      height: VIEWPORT_HEIGHT,
    });
    await leaguePage.gotoCreate();
    await leaguePage.createSummarySidebar.expectVisible();

    // Stacked: `$lg` has applied `width: '100%'`. Asserted as a lower bound
    // rather than an exact width so page padding and scrollbar width don't make
    // this brittle — the point is that it is emphatically not the 340px column.
    expect(await sidebarWidth(leaguePage)).toBeGreaterThan(
      FIXED_SIDEBAR_WIDTH * 1.5,
    );
  });

  test('the stock Tamagui $lg width (1280) is no longer the flip point', async ({
    page,
    leaguePage,
  }) => {
    // The discriminating case, and the actual defect LS-9885 describes: before
    // this change `$lg` resolved to `maxWidth: 1280`, so 1200 still rendered
    // the stacked treatment. This assertion fails against the stock config.
    await page.setViewportSize({ width: 1200, height: VIEWPORT_HEIGHT });
    await leaguePage.gotoCreate();
    await leaguePage.createSummarySidebar.expectVisible();

    expect(await sidebarWidth(leaguePage)).toBe(FIXED_SIDEBAR_WIDTH);
  });
});

/** Design-token `lg` band lower bound — the first width at which `$gtMd` fires. */
const MD_BOUNDARY = 980;

async function mockStandingsForBoundary(page: import('@playwright/test').Page) {
  const league = {
    __typename: 'League',
    id: 1,
    name: 'Breakpoint League',
    sport: 'football',
    draftStatus: 'completed',
  };
  const teams = [
    { __typename: 'Team', id: 1, name: 'Home Team', owner: 1, leagueId: 1 },
  ];
  const standings = [
    {
      __typename: 'TeamStanding',
      teamId: 1,
      teamName: 'Home Team',
      wins: 1,
      losses: 0,
      ties: 0,
      winPercentage: 1,
      pointsFor: 10,
      pointsAgainst: 5,
      divisionId: null,
      divisionName: null,
      avatarUrl: null,
    },
  ];

  await createGraphQLRouter(page, {
    getleaguebyid: (route) => fulfillJson(route, { data: { league } }),
    getleague: (route) => fulfillJson(route, { data: { league } }),
    getleagueteams: (route) =>
      fulfillJson(route, { data: { leagueTeams: teams } }),
    getleaguestandings: (route) =>
      fulfillJson(route, { data: { getLeagueStandings: standings } }),
    leaguestandings: (route) =>
      fulfillJson(route, { data: { getLeagueStandings: standings } }),
    getcurrentweekforleague: (route) =>
      fulfillJson(route, { data: { getCurrentWeekForLeague: null } }),
    getpositionsforleague: (route) =>
      fulfillJson(route, { data: { leaguePositions: [] } }),
    getuserteamid: (route) => fulfillJson(route, { data: { userTeamId: 1 } }),
    getuserleagues: (route) =>
      fulfillJson(route, { data: { userLeagues: [league] } }),
    getusers: (route) => fulfillJson(route, { data: { users: [] } }),
    getteammembers: (route) =>
      fulfillJson(route, { data: { teamMembers: [] } }),
    getviewermembership: (route) =>
      fulfillJson(route, {
        data: {
          viewerMembership: {
            __typename: 'LeagueMember',
            leagueId: 1,
            userId: 1,
            teamId: 1,
            permissionLevel: 'general_manager',
            username: 'testuser',
          },
        },
      }),
  });
}

test.describe('Breakpoint alignment — $md/$gtMd fire on the design-token scale @regression', () => {
  test(`PF column hides one pixel below the boundary (${MD_BOUNDARY - 1}px)`, async ({
    page,
    leaguePage,
    standingsPage,
  }) => {
    await page.setViewportSize({ width: MD_BOUNDARY - 1, height: 900 });
    await mockStandingsForBoundary(page);
    await standingsPage.goto(1, 'football');
    await standingsPage.expectNoAppError();

    // `$md` (≤979) has this column's `display: none` in effect.
    await leaguePage.standingsColumnHeader(/^PF$/).expectHidden();
  });

  test(`PF column shows at the boundary (${MD_BOUNDARY}px)`, async ({
    page,
    leaguePage,
    standingsPage,
  }) => {
    await page.setViewportSize({ width: MD_BOUNDARY, height: 900 });
    await mockStandingsForBoundary(page);
    await standingsPage.goto(1, 'football');
    await standingsPage.expectNoAppError();

    // `$gtMd` (≥980) has flipped this column to `display: flex`.
    await leaguePage.standingsColumnHeader(/^PF$/).expectVisible();
  });

  test('the stock Tamagui $gtMd width (1021) is no longer the flip point', async ({
    page,
    leaguePage,
    standingsPage,
  }) => {
    // The discriminating case: before this change `$gtMd` resolved to
    // `minWidth: 1021`, so 1000 still hid the PF column. This assertion
    // fails against the stock config.
    await page.setViewportSize({ width: 1000, height: 900 });
    await mockStandingsForBoundary(page);
    await standingsPage.goto(1, 'football');
    await standingsPage.expectNoAppError();

    await leaguePage.standingsColumnHeader(/^PF$/).expectVisible();
  });
});
