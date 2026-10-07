/**
 * Roster Positions Configuration — Football League Create (LS-5379)
 *
 * QA-coverage Feature Story under LS-5263 (QA — Page: Create League —
 * Football). Covers the "As a commissioner, I want to configure roster
 * positions so that my lineup matches my league's format" journey from the
 * epic: navigate to the roster-positions section, adjust position slot
 * counts, assert the Starters/Bench/Total summary updates live, create the
 * league, and assert the saved roster configuration matches the selected
 * slots.
 *
 * Roster positions are football-only (`StepRosterSettings`, LS-6147) and
 * live in the Roster & Schedule section of the sport-aware
 * `LeagueCreatePage`; the defensive format (D/ST vs IDP) that determines
 * which slots exist lives in the separate Scoring Format section. D/ST is
 * hidden while no team-defense players exist (LS-10727), so leagues default
 * to the IDP slot set.
 *
 * All GraphQL responses are mocked (hermetic) — no live backend required.
 */

import { expect, leagueTest as test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

interface CapturedCreateLeagueInput {
  rosterSlots?: Array<{ positionType: string; count: number }>;
  maxRosterSize?: number;
  defensiveFormat?: string;
}

/**
 * Mock a successful createLeagueAndTeams response, capturing each call's
 * `input` variables so specs can assert what the form actually submitted.
 */
async function mockCreateLeagueSuccess(
  page: import('@playwright/test').Page,
  captured: CapturedCreateLeagueInput[],
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    if (extractOperationName(route).toLowerCase() === 'createleagueandteams') {
      const postData = route.request().postDataJSON() as {
        variables?: { input?: CapturedCreateLeagueInput };
      };
      captured.push(postData.variables?.input ?? {});
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createLeagueAndTeams: {
              __typename: 'CreateLeagueAndTeamsPayload',
              league: {
                __typename: 'League',
                id: 555,
                name: 'Test League',
                owner: 1,
                maxRosterSize: 15,
                currentMatchup: null,
                draftStatus: 'not-started',
                numberOfTeams: 12,
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
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

test.describe('Create League (Football) – Roster Positions Configuration @regression', () => {
  test.beforeEach(async ({ leaguePage }) => {
    await leaguePage.gotoCreate('football');
    await leaguePage.leagueNameInput.expectVisible();
    await leaguePage.expandSection('roster-schedule');
    await leaguePage.rosterPositionsConfig.expectVisible();
  });

  test('displays the default IDP roster slots with correct labels and totals', async ({
    leaguePage,
  }) => {
    // Default (IDP) slot set and counts, from IDP_ROSTER_DEFAULTS. D/ST is not
    // offered while no team-defense players exist (LS-10727).
    const expectedDefaults: Record<string, number> = {
      QB: 1,
      RB: 2,
      WR: 2,
      TE: 1,
      FLEX: 1,
      K: 1,
      DL: 2,
      LB: 2,
      DB: 2,
      BN: 6,
    };

    for (const [slot, count] of Object.entries(expectedDefaults)) {
      await leaguePage.rosterSlotRow(slot).expectVisible();
      expect(await leaguePage.rosterSlotCount(slot)).toBe(count);
    }

    // The team-defense slot is absent.
    await leaguePage.rosterSlotRow('DST').expectHidden();

    await leaguePage.rosterPositionsTotals.expectVisible();
    const starters = await leaguePage
      .testId('roster-positions-totals-starters')
      .text();
    const bench = await leaguePage
      .testId('roster-positions-totals-bench')
      .text();
    const total = await leaguePage
      .testId('roster-positions-totals-total')
      .text();
    expect(Number(starters)).toBe(14); // QB+RB+WR+TE+FLEX+K+DL+LB+DB
    expect(Number(bench)).toBe(6);
    expect(Number(total)).toBe(20);
  });

  test('adjusting a slot count updates the row and the Starters/Total summary live', async ({
    leaguePage,
  }) => {
    expect(await leaguePage.rosterSlotCount('WR')).toBe(2);

    await leaguePage.incrementRosterSlot('WR', 2);
    expect(await leaguePage.rosterSlotCount('WR')).toBe(4);

    await leaguePage
      .testId('roster-positions-totals-starters')
      .expectContainsText('16');
    await leaguePage
      .testId('roster-positions-totals-total')
      .expectContainsText('22');

    await leaguePage.decrementRosterSlot('WR', 1);
    expect(await leaguePage.rosterSlotCount('WR')).toBe(3);
    await leaguePage
      .testId('roster-positions-totals-total')
      .expectContainsText('21');
  });

  test('D/ST is not offered while no team-defense players exist (LS-10727)', async ({
    leaguePage,
  }) => {
    await leaguePage.expandSection('football-scoring');
    await leaguePage.testId('defensive-format-idp').expectVisible();
    await leaguePage.testId('defensive-format-dst').expectHidden();
  });

  test('creating the league submits the adjusted per-slot roster configuration', async ({
    page,
    leaguePage,
  }) => {
    const captured: CapturedCreateLeagueInput[] = [];
    await mockCreateLeagueSuccess(page, captured);

    await leaguePage.incrementRosterSlot('TE', 1); // TE: 1 -> 2
    await leaguePage.decrementRosterSlot('K', 1); // K: 1 -> 0 (dropped, not submitted)

    await leaguePage.fillLeagueName('Roster Config League');
    await leaguePage.submitCreate();
    await leaguePage.continueToLeague();
    await expect(page).toHaveURL(/\/football\/league\/\d+/);

    expect(captured).toHaveLength(1);
    const submittedSlots = captured[0].rosterSlots ?? [];
    const bySlot = Object.fromEntries(
      submittedSlots.map((s) => [s.positionType, s.count]),
    );

    expect(bySlot).toEqual({
      QB: 1,
      RB: 2,
      WR: 2,
      TE: 2,
      FLEX: 1,
      DL: 2,
      LB: 2,
      DB: 2,
    });
    // Bench never appears as its own position_slot entry — it is folded
    // into maxRosterSize instead (LS-6147).
    expect(bySlot.BN).toBeUndefined();
    expect(bySlot.K).toBeUndefined();
    expect(captured[0].maxRosterSize).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Custom roster positions (Superflex / K-P) — LS-6151
//
// The premium tier is this suite's ambient default (BASELINE_GRAPHQL_RESPONSES),
// so the tests above already exercise a premium viewer without an explicit
// `useTier` call. These add: a premium user submitting an SFLEX slot, and a
// free user hitting the gate (never a silently-hidden or inert control).
// ---------------------------------------------------------------------------

test.describe('Create League (Football) – Custom Roster Positions @regression', () => {
  test.beforeEach(async ({ leaguePage }) => {
    await leaguePage.gotoCreate('football');
    await leaguePage.leagueNameInput.expectVisible();
    await leaguePage.expandSection('roster-schedule');
    await leaguePage.rosterPositionsConfig.expectVisible();
  });

  test('a premium user can add a Superflex slot and it is submitted', async ({
    page,
    leaguePage,
  }) => {
    const captured: CapturedCreateLeagueInput[] = [];
    await mockCreateLeagueSuccess(page, captured);

    await leaguePage.rosterPremiumSlotRow('SFLEX').expectVisible();
    expect(await leaguePage.rosterPremiumSlotCount('SFLEX')).toBe(0);

    await leaguePage.tapRosterPremiumSlotIncrement('SFLEX');
    expect(await leaguePage.rosterPremiumSlotCount('SFLEX')).toBe(1);
    await leaguePage
      .testId('roster-positions-totals-total')
      .expectContainsText('21');

    await leaguePage.fillLeagueName('Superflex League');
    await leaguePage.submitCreate();
    await leaguePage.continueToLeague();
    await expect(page).toHaveURL(/\/football\/league\/\d+/);

    expect(captured).toHaveLength(1);
    const submittedSlots = captured[0].rosterSlots ?? [];
    expect(
      submittedSlots.some((s) => s.positionType === 'SFLEX' && s.count === 1),
    ).toBe(true);
  });

  test('a non-premium user sees Superflex/K-P as visibly gated, never hidden, and interacting routes to upgrade', async ({
    page,
    leaguePage,
  }) => {
    await useTier(page, 'free');
    await leaguePage.gotoCreate('football');
    await leaguePage.leagueNameInput.expectVisible();
    await leaguePage.expandSection('roster-schedule');
    await leaguePage.rosterPositionsConfig.expectVisible();

    // Present but gated — never hidden (LS-6151 no-silent-no-op rule).
    await leaguePage.rosterPremiumSlotRow('SFLEX').expectVisible();
    await leaguePage.rosterPremiumSlotRow('KP').expectVisible();
    expect(await leaguePage.rosterPremiumSlotCount('SFLEX')).toBe(0);

    await leaguePage.tapRosterPremiumSlotIncrement('SFLEX');

    // The tap must not silently no-op — it opens the upgrade modal — and the
    // count must stay at 0 rather than incrementing behind the gate.
    await expect(
      page.getByRole('dialog', { name: /upgrade to premium/i }),
    ).toBeVisible();
    expect(await leaguePage.rosterPremiumSlotCount('SFLEX')).toBe(0);
  });
});
