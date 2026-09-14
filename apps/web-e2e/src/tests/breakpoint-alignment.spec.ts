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
 *   - the `$xs`/`$gtXs` boundary, which LS-9897 moved from 660/661 → 799/800.
 *     Probe: `LeagueHero`'s quick-share "Invite" button, `$xs={{ display:
 *     'none' }}` — hidden at 799px, visible at 800px. `$xs` is the only media
 *     key that element sets `display` on, so the flip reads the `xs` band
 *     directly rather than the resolution of two overlapping keys.
 *   - the `$sm`/`$gtSm` boundary, which LS-9898 moved from 800/801 → 859/860.
 *     Probe: `StandingsTable`'s T column header, `display: none` with
 *     `$gtSm={{ display: 'flex' }}` — hidden at 859px, visible at 860px. Same
 *     table as the `$md` case above but a different column, so the two bands
 *     are read independently: T is gated on `$gtSm` alone and PF on `$gtMd`
 *     alone.
 *
 * With `$sm` covered the whole scale is now pinned at real viewport widths,
 * which is the point: every band's flip is asserted in a browser, not just in
 * the config object.
 *
 * A final block (LS-10095) covers the orthogonal question those probes are
 * each designed to avoid: which band wins when two of them overlap and set the
 * same property. See its own comment at the bottom of this file.
 *
 * Page-object convention (ADR-0015): locators live on `leaguePage`/
 * `standingsPage`, so this spec is selector-free. Viewport is the spec's to
 * own.
 */

import { breakpoints } from '@legacy-sports/design-tokens';

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

/**
 * Design-token `sm` band lower bound — the first width at which `$gtXs` fires
 * and `$xs` stops applying. Derived, not hardcoded: the point of LS-9885 is
 * that this number lives in one place.
 */
const XS_BOUNDARY = breakpoints.sm;

const XS_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Breakpoint League',
  sport: 'baseball',
  owner: 1,
  draftStatus: 'not-started',
  inviteCode: 'INVITE123',
  numberOfTeams: 4,
  isPublic: false,
  userMembership: { teamId: 1 },
};

async function mockLeagueForXsBoundary(page: import('@playwright/test').Page) {
  await createGraphQLRouter(page, {
    getleaguebyid: (route) =>
      fulfillJson(route, { data: { league: XS_LEAGUE } }),
    getleague: (route) => fulfillJson(route, { data: { league: XS_LEAGUE } }),
    getleagueteams: (route) =>
      fulfillJson(route, { data: { leagueTeams: [] } }),
    getpositionsforleague: (route) =>
      fulfillJson(route, { data: { leaguePositions: [] } }),
    getuserteamid: (route) => fulfillJson(route, { data: { userTeamId: 1 } }),
    getuserleagues: (route) =>
      fulfillJson(route, { data: { userLeagues: [XS_LEAGUE] } }),
  });
}

test.describe('Breakpoint alignment — $xs/$gtXs fire on the design-token scale @regression', () => {
  test(`hero Invite is hidden one pixel below the boundary (${XS_BOUNDARY - 1}px)`, async ({
    page,
    leaguePage,
  }) => {
    await page.setViewportSize({
      width: XS_BOUNDARY - 1,
      height: VIEWPORT_HEIGHT,
    });
    await mockLeagueForXsBoundary(page);
    await leaguePage.gotoDetail(1, 'overview');
    // The title always renders, so it is the settle signal — the button under
    // test is expected to be absent here and cannot gate on itself.
    await leaguePage.leagueTitle.expectVisible({ timeout: 30000 });

    // `$xs` (≤799) has this button's `display: none` in effect.
    await leaguePage.heroInviteButton.expectHidden();
  });

  test(`hero Invite shows at the boundary (${XS_BOUNDARY}px)`, async ({
    page,
    leaguePage,
  }) => {
    await page.setViewportSize({ width: XS_BOUNDARY, height: VIEWPORT_HEIGHT });
    await mockLeagueForXsBoundary(page);
    await leaguePage.gotoDetail(1, 'overview');
    await leaguePage.leagueTitle.expectVisible({ timeout: 30000 });

    // `$gtXs` (≥800): `$xs` no longer applies, so the button is back.
    await leaguePage.heroInviteButton.expectVisible();
  });

  test('the stock Tamagui $xs width (660) is no longer the flip point', async ({
    page,
    leaguePage,
  }) => {
    // The discriminating case, and the largest single shift in the migration
    // (+139px): before LS-9897 `$xs` resolved to `maxWidth: 660`, so a 700px
    // viewport showed the hero Invite button. It is now inside the phone band
    // and the declutter applies. This assertion fails against the stock config.
    await page.setViewportSize({ width: 700, height: VIEWPORT_HEIGHT });
    await mockLeagueForXsBoundary(page);
    await leaguePage.gotoDetail(1, 'overview');
    await leaguePage.leagueTitle.expectVisible({ timeout: 30000 });

    await leaguePage.heroInviteButton.expectHidden();
  });
});

/**
 * Design-token `md` band lower bound — the first width at which `$gtSm` fires
 * and `$sm` stops applying. Derived, not hardcoded, for the same reason as
 * `XS_BOUNDARY`.
 */
const SM_BOUNDARY = breakpoints.md;

test.describe('Breakpoint alignment — $sm/$gtSm fire on the design-token scale @regression', () => {
  test(`T column hides one pixel below the boundary (${SM_BOUNDARY - 1}px)`, async ({
    page,
    leaguePage,
    standingsPage,
  }) => {
    await page.setViewportSize({ width: SM_BOUNDARY - 1, height: 900 });
    await mockStandingsForBoundary(page);
    await standingsPage.goto(1, 'football');
    await standingsPage.expectNoAppError();

    // `$sm` (≤859) leaves this column's base `display: none` in effect.
    await leaguePage.standingsColumnHeader(/^T$/).expectHidden();
  });

  test(`T column shows at the boundary (${SM_BOUNDARY}px)`, async ({
    page,
    leaguePage,
    standingsPage,
  }) => {
    await page.setViewportSize({ width: SM_BOUNDARY, height: 900 });
    await mockStandingsForBoundary(page);
    await standingsPage.goto(1, 'football');
    await standingsPage.expectNoAppError();

    // `$gtSm` (≥860) has flipped this column to `display: flex`.
    await leaguePage.standingsColumnHeader(/^T$/).expectVisible();
  });

  test('the stock Tamagui $gtSm width (801) is no longer the flip point', async ({
    page,
    leaguePage,
    standingsPage,
  }) => {
    // The discriminating case: before LS-9898 `$gtSm` resolved to
    // `minWidth: 801`, so an 830px viewport already revealed the T column.
    // 830 is now inside the `sm` band and the column stays hidden. This
    // assertion fails against the stock config.
    await page.setViewportSize({ width: 830, height: 900 });
    await mockStandingsForBoundary(page);
    await standingsPage.goto(1, 'football');
    await standingsPage.expectNoAppError();

    await leaguePage.standingsColumnHeader(/^T$/).expectHidden();
  });

  test(`both bands resolve independently at the boundary (${SM_BOUNDARY}px)`, async ({
    page,
    leaguePage,
    standingsPage,
  }) => {
    // Guards the invariant that made this slice indivisible: `$sm` and
    // `$gtSm` must be exact complements. If `$sm` had moved to 859 while
    // `$gtSm` stayed at 801, widths 801–859 would match BOTH keys and this
    // column's visibility would depend on cascade order rather than width.
    // At 860 the `gtSm` column is visible while the wider `gtMd` one is not.
    await page.setViewportSize({ width: SM_BOUNDARY, height: 900 });
    await mockStandingsForBoundary(page);
    await standingsPage.goto(1, 'football');
    await standingsPage.expectNoAppError();

    await leaguePage.standingsColumnHeader(/^T$/).expectVisible();
    await leaguePage.standingsColumnHeader(/^PF$/).expectHidden();
  });
});

/**
 * LS-10095. The bands above each read ONE media key, deliberately, so that a
 * flip reads that band's width rather than the resolution of two overlapping
 * keys. This block covers the complementary question: when two nested maxWidth
 * bands both match and both set the same property, WHICH ONE WINS.
 *
 * Tamagui answers that from the key's position in the media config object, not
 * from the query widths, so `lib/tamagui-config` lists its maxWidth keys
 * descending to make the narrower band win. The unit spec pins that key order;
 * only a real browser proves the resulting cascade actually renders the
 * narrower band's value.
 *
 * Probe: `LeagueDetailShell`'s league title, which sets `fontSize`/`lineHeight`
 * under BOTH `$sm` (24/28) and `$xs` (22/26). At 799px both bands match and the
 * `$xs` step-down must win; at 830px only `$sm` matches. Line height is read
 * off the title's laid-out height via `boundingBox()` — the same mechanism the
 * `$lg` probe at the top of this file uses — so no computed-style escape hatch
 * is needed. Before this fix the title measured 28px at BOTH widths: `$sm`
 * out-ranked `$xs` and the small-phone step-down was inert at every width.
 */
const XS_TITLE_LINE_HEIGHT = 26; // $xs — the small-phone step-down
const SM_TITLE_LINE_HEIGHT = 28; // $sm — the compact-tier value

async function titleLineHeight(leaguePage: {
  leagueTitle: { boundingBox(): Promise<{ height: number } | null> };
}): Promise<number> {
  const box = await leaguePage.leagueTitle.boundingBox();
  expect(box).not.toBeNull();
  return Math.round(box?.height ?? 0);
}

test.describe('Media key precedence — the narrower band wins @regression', () => {
  test(`title takes its $xs size where $xs and $sm overlap (${XS_BOUNDARY - 1}px)`, async ({
    page,
    leaguePage,
  }) => {
    await page.setViewportSize({
      width: XS_BOUNDARY - 1,
      height: VIEWPORT_HEIGHT,
    });
    await mockLeagueForXsBoundary(page);
    await leaguePage.gotoDetail(1, 'overview');
    await leaguePage.leagueTitle.expectVisible({ timeout: 30000 });

    // Both `$xs` (≤799) and `$sm` (≤859) match here. This is the assertion
    // that fails against the pre-LS-10095 key order, where `$sm` won.
    expect(await titleLineHeight(leaguePage)).toBe(XS_TITLE_LINE_HEIGHT);
  });

  test('title takes its $sm size just above the $xs band (830px)', async ({
    page,
    leaguePage,
  }) => {
    // The control for the case above: 830 is inside `sm` but outside `xs`, so
    // `$sm` wins on width alone. Without this, a config that dropped `$sm`
    // entirely would still pass the assertion above.
    await page.setViewportSize({ width: 830, height: VIEWPORT_HEIGHT });
    await mockLeagueForXsBoundary(page);
    await leaguePage.gotoDetail(1, 'overview');
    await leaguePage.leagueTitle.expectVisible({ timeout: 30000 });

    expect(await titleLineHeight(leaguePage)).toBe(SM_TITLE_LINE_HEIGHT);
  });
});
