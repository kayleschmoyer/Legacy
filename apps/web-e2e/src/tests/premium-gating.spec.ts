import { ENTITLEMENTS } from '@legacy-sports/utils';
import { expect, test } from '../fixtures/auth-enhanced';
import {
  enableFootball,
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { DESKTOP_VIEWPORT } from '../utils/viewport';

/**
 * E2E coverage for the premium gating added in LS-5024.
 *
 * View Game Logs (baseball + football) and the Player Detail career-stats
 * surface were previously ungated — a free user had full access to
 * advanced/historical statistics. Each is now wrapped in `PremiumGate`, so a
 * free user should see the blurred lock overlay + "Upgrade to Premium" CTA.
 *
 * The Player Stats page itself is a public, browsable surface (LS-9347) — a
 * free user sees the full table/card feed, with only specific premium
 * features (export, column customization, large page sizes) withheld. See
 * "Player Stats page is accessible but export is withheld for free users"
 * below.
 *
 * Premium status is sourced from `GetUserById.subscriptionTier` by `useIsPremium`
 * (apps/web/src/hooks/useIsPremium.ts), and the baseline mock returns a premium
 * user (LS-5030). These specs pin the tier to FREE via `useTier` before
 * navigating so the gate renders. The gate overlay carries
 * `data-testid="premium-feature-gate"`.
 */

const GATE = 'premium-feature-gate';
const UPGRADE_CTA = /upgrade to premium/i;
const EXPORT_BUTTON = /export player statistics as json/i;

test.describe('Premium gating — free user @critical', () => {
  test('Player Stats page is accessible but export is withheld for free users (LS-9347)', async ({
    page,
  }) => {
    await useTier(page, 'free');
    await page.goto('/players/stats');

    // No page-wide lock overlay — the stats table itself is public
    // (LS-9347). Export (a premium-only capability, LS-9140) is withheld:
    // the shared shell renders no Export button at all when canExport=false.
    await expect(page.getByTestId(GATE)).toHaveCount(0);
    await expect(page.getByRole('button', { name: EXPORT_BUTTON })).toHaveCount(
      0,
    );
  });

  test('View Game Logs page is gated for free users', async ({ page }) => {
    await useTier(page, 'free');
    await page.goto('/players/view-game-logs');

    await expect(page.getByTestId(GATE)).toBeVisible();
    await expect(
      page.getByRole('button', { name: UPGRADE_CTA }).first(),
    ).toBeVisible();
  });

  test('Football Game Logs page is gated for free users', async ({ page }) => {
    await enableFootball(page);
    await useTier(page, 'free');
    await page.goto('/football/players/view-game-logs');

    await expect(page.getByTestId(GATE)).toBeVisible();
    await expect(
      page.getByRole('button', { name: UPGRADE_CTA }).first(),
    ).toBeVisible();
  });

  // LS-10546: player career stats are a Free decision — a free user gets the
  // real detail modal on /players/:id, matching /football/players/:id.
  test('Player Detail career stats are open to free users', async ({
    page,
  }) => {
    await useTier(page, 'free');
    await page.goto('/players/123');

    await expect(page.getByTestId('player-detail-modal')).toBeVisible();
    await expect(page.getByTestId(GATE)).toHaveCount(0);
  });
});

// ── Position-scoped scoring bonuses (LS-9105) ────────────────────────────────
//
// The position-bonus section of the football commissioner scoring editor is
// wrapped in `PremiumGate` (lib/shared-components), gated on
// `useHasEntitlement(ENTITLEMENTS.custom_scoring_multipliers)`. Unlike the
// other gates on this page (sourced from `GetUserById.subscriptionTier`),
// this reads `MyEntitlements` — `useTier` overrides both.
//
// The league detail page itself (LeagueDetailPageV2) is *also* wrapped in a
// coarse `PremiumGate` keyed off `GetUserById.subscriptionTier` (the
// account-level "Fantasy League" gate) — a `useTier(page, 'free')` commissioner
// never reaches the Scoring Rules accordion at all, so the free-tier scenario
// below stays on the `premium` subscription tier (passes the page-level gate)
// and overrides only the `MyEntitlements` response to omit
// `custom_scoring_multipliers`, isolating the granular entitlement gate under
// test from the coarse account-tier gate.

const POSITION_BONUS_FEATURE_NAME = 'Position-Scoped Scoring Bonuses';

async function mockFootballCommissionerPage(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route, request) => {
      const body = request.postDataJSON() as { operationName?: string };
      const op = body.operationName ?? '';

      if (op === 'GetLeagueById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              league: {
                __typename: 'League',
                id: 1,
                name: 'Test Football League',
                owner: 1,
                sport: 'football',
                defensiveFormat: 'dst',
                draftStatus: 'not-started',
                numberOfTeams: 4,
                isPublic: false,
                inviteCode: 'TEST1234',
                userMembership: { teamId: 1 },
                frozenAt: null,
              },
            },
          }),
        });
        return;
      }
      if (op === 'GetLeagueTeams') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueTeams: [] } }),
        });
        return;
      }
      if (op === 'GetLeagueScoringProfile') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              leagueScoringProfile: {
                __typename: 'ScoringConfig',
                profileId: 1,
                profileName: 'Standard',
                stats: [
                  {
                    __typename: 'ScoringRule',
                    multiplier: 0.04,
                    defaultMultiplier: 0.04,
                    isOverride: false,
                    isEnabled: true,
                    definition: {
                      __typename: 'ScoringStatDefinition',
                      id: 1,
                      statKey: 'pass_yds',
                      statGroup: 'passing',
                      displayName: 'Passing Yards',
                      description: null,
                      sourceColumn: 'passingYards',
                      defaultMultiplier: 0.04,
                      minMultiplier: 0,
                      maxMultiplier: 1,
                      stepSize: 0.01,
                      isRequired: false,
                      enforcePositive: false,
                      enforceNegative: false,
                    },
                  },
                ],
                multiplierGroups: [],
              },
            },
          }),
        });
        return;
      }

      await unmockedGraphQLFallback(route);
    },
  );
}

/** Expand the "Scoring" accordion on the commissioner tab. */
async function expandScoringSection(
  page: import('@playwright/test').Page,
): Promise<void> {
  const toggle = page.getByRole('button', {
    name: 'Scoring Rules',
    exact: true,
  });
  await toggle.waitFor({ state: 'visible' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

test.describe('Premium gating — position-scoped scoring bonuses (LS-9105) @critical', () => {
  test('position bonuses are gated for a commissioner without the entitlement', async ({
    page,
  }) => {
    // Base tier is `premium` so the page-level "Fantasy League" gate
    // (LeagueDetailPageV2, keyed off GetUserById.subscriptionTier) passes —
    // only the MyEntitlements claim is overridden to omit
    // custom_scoring_multipliers, isolating the position-bonus gate itself.
    await useTier(page, 'premium');
    await page.route(isGraphQLEndpoint, async (route) => {
      const op = extractOperationName(route).toLowerCase();
      if (op === 'myentitlements') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              myEntitlements: Object.values(ENTITLEMENTS).filter(
                (key) => key !== ENTITLEMENTS.custom_scoring_multipliers,
              ),
            },
          }),
        });
        return;
      }
      await route.fallback();
    });
    await enableFootball(page);
    await mockFootballCommissionerPage(page);
    await page.goto('/football/league/1/commissioner');
    await expandScoringSection(page);

    // Locked state: the PremiumGate's feature name is visible, the real
    // section content (position-bonus-section testid) is not.
    await expect(
      page.getByText(POSITION_BONUS_FEATURE_NAME, { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('position-bonus-section')).toHaveCount(0);
  });

  test('position bonuses are available to a premium football commissioner', async ({
    page,
  }) => {
    await useTier(page, 'premium');
    await enableFootball(page);
    await mockFootballCommissionerPage(page);
    await page.goto('/football/league/1/commissioner');
    await expandScoringSection(page);

    await expect(page.getByTestId('position-bonus-section')).toBeVisible();
  });
});

// ── Mock Draft "Control All Teams" (LS-9253) ─────────────────────────────────
//
// Free users must see the option as a visible upgrade surface (not hidden)
// but cannot enable it — selecting "On" routes to the upgrade CTA instead.
// Isolated the same way as the position-bonus gate above: base tier stays
// `premium` (so the page itself renders normally) and only the
// `MyEntitlements` claim is overridden to omit mock_draft_control_all_teams.

test.describe('Premium gating — Mock Draft Control All Teams (LS-9253) @critical', () => {
  test('a non-entitled user sees Control All Teams as a visible upgrade surface, not hidden', async ({
    page,
  }) => {
    await useTier(page, 'premium');
    await page.route(isGraphQLEndpoint, async (route) => {
      const op = extractOperationName(route).toLowerCase();
      if (op === 'myentitlements') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              myEntitlements: Object.values(ENTITLEMENTS).filter(
                (key) => key !== ENTITLEMENTS.mock_draft_control_all_teams,
              ),
            },
          }),
        });
        return;
      }
      if (op === 'getmymockdraftusage') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              getMyMockDraftUsage: {
                __typename: 'MockDraftUsage',
                isUnlimited: true,
                used: 0,
                limit: 2,
                // Unlimited users get remaining: null (LS-10463).
                remaining: null,
              },
            },
          }),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto('/baseball/mock-draft');
    await page.waitForLoadState('load');

    // Visible, not hidden — the option and both choices render. The locked
    // "On" option carries an accessible name noting the upgrade requirement
    // (OptionButton's `locked` aria-label), rather than being hidden.
    await expect(page.getByText('Control All Teams')).toBeVisible();
    const onOption = page.getByRole('button', {
      name: 'On (requires Premium)',
    });
    await expect(onOption).toBeVisible();

    // Tapping the locked option opens the upgrade modal (UpgradeModal's own
    // CTA reads "Get Premium") instead of enabling the setting — Start
    // remains available for a normal (non-Control-All-Teams) draft.
    await onOption.click();
    await expect(
      page.getByRole('button', { name: 'Get Premium' }),
    ).toBeVisible();
  });
});

/**
 * Asserts the Player Stats Export control, which the phone-width card feed
 * does not render by design (LS-9075). Pinned rather than skipped so the
 * premium-entitlement assertion still runs under the mobile projects
 * (LS-9712). The free-user describe above needs no pin — its assertion is that
 * export is *absent*, which holds at either width.
 */
test.describe('Premium gating — premium user @critical', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test('View Game Logs page is not gated for premium users', async ({
    page,
  }) => {
    await useTier(page, 'premium');
    await page.goto('/players/view-game-logs');
    await page.waitForLoadState('load');

    // No lock overlay; the player-ID input is interactive (not behind the gate).
    await expect(page.getByTestId(GATE)).toHaveCount(0);
    await expect(page.getByPlaceholder('Enter player ID')).toBeVisible();
  });

  test('Player Stats Export JSON is available to premium users', async ({
    page,
  }) => {
    await useTier(page, 'premium');
    await page.goto('/players/stats');

    // No lock overlay, and the Export action is rendered. Export (all
    // formats, including JSON) is premium-only (LS-9140, superseding the
    // LS-5591 "available to all entitlements" exemption).
    await expect(page.getByTestId(GATE)).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: EXPORT_BUTTON }),
    ).toBeVisible();
  });
});
