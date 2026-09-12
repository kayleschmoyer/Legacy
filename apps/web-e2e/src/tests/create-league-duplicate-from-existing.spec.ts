/**
 * Duplicate from Existing League — Baseball League Create (LS-6062)
 *
 * Premium commissioners frequently re-run the same league shape year-over-year.
 * This covers the "Duplicate from Existing League" affordance added to the
 * create-league page:
 *   - a premium user sees the picker listing leagues they commission, filtered
 *     to the active sport tab
 *   - selecting a league pre-fills the form from that league's settings (and
 *     the league's current draft settings)
 *   - a free (non-premium) user sees the control in a premium-gated state and
 *     the upgrade modal, rather than the control being hidden entirely
 *
 * All GraphQL responses are mocked (hermetic) — no live backend required.
 */

import { adminTest, customAuthTest, expect } from '../fixtures/pages';
import { useTier } from '../fixtures/shared-mocks';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

const freeUserTest = customAuthTest('freeuser-ls6062@test.com', 'none');

const COMMISSIONED_LEAGUE = {
  __typename: 'League',
  id: 501,
  name: 'Legacy Dynasty',
  owner: 1,
  sport: 'baseball',
  defensiveFormat: null,
  maxRosterSize: 30,
  currentMatchup: null,
  draftStatus: 'completed',
  playerPool: 'al',
  waiverType: 'faab',
  waiverEnabled: true,
  faabBudgetDefault: 175,
  gamesPerMatchup: 4,
  isPublic: true,
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
  numberOfDivisions: 2,
  schedulingStrategy: 'divisional',
  schedulingDivisionalWeightPct: 90,
  userMembership: {
    __typename: 'LeagueMember',
    leagueId: 501,
    userId: 1,
    teamId: 1,
    permissionLevel: 'commissioner',
  },
};

const NON_COMMISSIONED_LEAGUE = {
  ...COMMISSIONED_LEAGUE,
  id: 502,
  name: 'Someone Else Commissions This',
  userMembership: {
    __typename: 'LeagueMember',
    leagueId: 502,
    userId: 1,
    teamId: 2,
    permissionLevel: 'general_manager',
  },
};

async function mockUserLeagues(page: import('@playwright/test').Page) {
  await createGraphQLRouter(page, {
    getuserleagues: (route) =>
      fulfillJson(route, {
        data: {
          userLeagues: [COMMISSIONED_LEAGUE, NON_COMMISSIONED_LEAGUE],
        },
      }),
    getleaguedraft: (route) =>
      fulfillJson(route, {
        data: {
          getLeagueDraft: {
            __typename: 'Draft',
            id: 1,
            leagueId: 501,
            draftMode: 'automated',
            selectionMethod: 'auction',
            draftOrder: 'linear',
            currentPick: 0,
            pickTimeLimitSeconds: 90,
            draftStartedAt: null,
            draftCompletedAt: null,
            scheduledAt: null,
          },
        },
      }),
  });
}

adminTest.describe(
  'Create League (Baseball) – Duplicate from Existing League, premium user @regression',
  () => {
    adminTest.beforeEach(async ({ page, leaguePage }) => {
      await useTier(page, 'premium');
      await mockUserLeagues(page);
      await leaguePage.gotoCreate();
      await leaguePage.leagueNameInput.expectVisible();
    });

    adminTest(
      'lists only leagues the user commissions, not leagues they merely belong to',
      async ({ leaguePage }) => {
        await leaguePage.testId('duplicate-league-select').expectVisible();
        await leaguePage
          .testId('duplicate-league-select')
          .byRole('option', { name: 'Legacy Dynasty' })
          .expectAttached();
        await leaguePage.text('Someone Else Commissions This').expectHidden();
      },
    );

    adminTest(
      'selecting a league pre-fills the form from its settings and draft settings',
      async ({ leaguePage }) => {
        await leaguePage.testId('duplicate-league-select').selectOption('501');

        // Waiver type prefilled to FAAB pulls the FAAB budget field into view.
        await leaguePage.expandSection('waiver-budget');
        await leaguePage.text('FAAB Budget (per manager)').expectVisible();

        // Draft settings sourced from getLeagueDraft (auction/automated/linear).
        // OptionButtonGroup conveys selection visually only (border, background,
        // font weight) — it renders no aria-selected/aria-pressed, so the active
        // option cannot be read off the button itself. The Draft Mode FieldRow
        // hint is rendered straight from formData.draftMode, so asserting its
        // automated-mode copy proves the prefill landed on 'automated'.
        await leaguePage.expandSection('draft');
        await leaguePage
          .text('Automated drafts use random player assignment')
          .expectVisible();
      },
    );
  },
);

freeUserTest.describe(
  'Create League (Baseball) – Duplicate from Existing League, free user @regression',
  () => {
    freeUserTest.beforeEach(async ({ page, leaguePage }) => {
      await useTier(page, 'free');
      await mockUserLeagues(page);
      await leaguePage.gotoCreate();
      await leaguePage.leagueNameInput.expectVisible();
    });

    freeUserTest(
      'shows the control in a premium-gated state rather than hiding it, and clicking Upgrade opens the upgrade modal',
      async ({ leaguePage }) => {
        await leaguePage.testId('duplicate-league-card').expectVisible();
        await leaguePage.duplicateLeaguePremiumGate.expectVisible();

        await leaguePage.clickDuplicateLeaguePremiumGateUpgrade();

        await leaguePage.expectUpgradeModalVisible('Duplicate League Settings');
      },
    );
  },
);
