/**
 * League Member Payment Status Tracking — E2E Tests (LS-2115)
 *
 * Covers LeagueDuesStatusDashboard on the Commissioner tab
 * (`/baseball/league/:id/commissioner`, aliased to the `commish` tab):
 *
 *   - Payment status renders for each league member (Paid/Unpaid badge)
 *   - Commissioner can mark an unpaid member as paid (MarkMemberPaid)
 *   - Commissioner can mark a paid member as unpaid (MarkMemberUnpaid)
 *   - The dashboard refetches after a mutation so the UI reflects the new state
 *   - Paid/Unpaid summary counts update after toggling
 *   - Commissioner cannot toggle their own payment status (LS-4029: no
 *     self-exempt from dues collection) — "Self" label renders instead
 *   - Non-commissioner members do not see the "Mark Paid/Unpaid" action column
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 * Default test JWT has id=1, so a league with owner=1 grants commissioner
 * access (LeagueDetailPageV2 gates isCommissioner on league.owner === user.id).
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import { leagueByIdResponse, leagueTeamsResponse } from '../mocks/graphql';
import { agoIso, FIXED_NOW_ISO } from '../mocks/time';

// ── Mock Data ─────────────────────────────────────────────────────────────────

/** League owned by user id=1 (matches the default test JWT) — commissioner view. */
const COMMISSIONER_LEAGUE = { owner: 1 };

/** League owned by user id=2 — current test user (id=1) is NOT the commissioner. */
const MEMBER_LEAGUE = { owner: 2 };

const DUES_SETTINGS = {
  __typename: 'LeagueDuesSettings',
  id: 1,
  leagueId: 1,
  enabled: true,
  amountCents: 5000,
  reminderEnabled: false,
  reminderDayOfWeek: null,
  createdAt: agoIso(30 * 24 * 60 * 60 * 1000),
  updatedAt: agoIso(30 * 24 * 60 * 60 * 1000),
};

interface MockMemberStatus {
  __typename: 'LeagueMemberPaymentStatus';
  id: number;
  leagueId: number;
  userId: number;
  username: string;
  paid: boolean;
  paidAt: string | null;
  markedBy: number | null;
  createdAt: string;
  updatedAt: string;
}

function mockMemberStatus(
  overrides: Partial<MockMemberStatus> = {},
): MockMemberStatus {
  return {
    __typename: 'LeagueMemberPaymentStatus',
    id: 1,
    leagueId: 1,
    userId: 2,
    username: 'member_two',
    paid: false,
    paidAt: null,
    markedBy: null,
    createdAt: FIXED_NOW_ISO,
    updatedAt: FIXED_NOW_ISO,
    ...overrides,
  };
}

const DEFAULT_MEMBERS = [
  mockMemberStatus({ id: 1, userId: 1, username: 'the_commish', paid: true }),
  mockMemberStatus({ id: 2, userId: 2, username: 'member_two', paid: false }),
  mockMemberStatus({ id: 3, userId: 3, username: 'member_three', paid: true }),
];

// ── GraphQL Route Handler ─────────────────────────────────────────────────────

interface RouteOptions {
  league?: Record<string, unknown>;
  members?: ReturnType<typeof mockMemberStatus>[];
  onMarkPaid?: (vars: { leagueId: number; userId: number }) => void;
  onMarkUnpaid?: (vars: { leagueId: number; userId: number }) => void;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: RouteOptions = {},
) {
  const { league = COMMISSIONER_LEAGUE, onMarkPaid, onMarkUnpaid } = opts;

  let currentMembers = [...(opts.members ?? DEFAULT_MEMBERS)];

  await createGraphQLRouter(page, {
    getleaguebyid: (route) => fulfillJson(route, leagueByIdResponse(league)),
    getleagueteams: (route) => fulfillJson(route, leagueTeamsResponse()),
    getleagueduessettings: (route) =>
      fulfillJson(route, { data: { leagueDuesSettings: DUES_SETTINGS } }),
    getleagueduesstatus: (route) =>
      fulfillJson(route, {
        data: {
          leagueDuesSettings: DUES_SETTINGS,
          leagueDuesStatus: currentMembers,
        },
      }),
    markmemberpaid: (route, { variables }) => {
      const userId = variables.userId as number;
      onMarkPaid?.({ leagueId: variables.leagueId as number, userId });
      currentMembers = currentMembers.map((m) =>
        m.userId === userId
          ? { ...m, paid: true, paidAt: FIXED_NOW_ISO, markedBy: 1 }
          : m,
      );
      const updated = currentMembers.find((m) => m.userId === userId);
      return fulfillJson(route, { data: { markMemberPaid: updated } });
    },
    markmemberunpaid: (route, { variables }) => {
      const userId = variables.userId as number;
      onMarkUnpaid?.({ leagueId: variables.leagueId as number, userId });
      currentMembers = currentMembers.map((m) =>
        m.userId === userId
          ? { ...m, paid: false, paidAt: null, markedBy: 1 }
          : m,
      );
      const updated = currentMembers.find((m) => m.userId === userId);
      return fulfillJson(route, { data: { markMemberUnpaid: updated } });
    },
  });
}

/** Expand the "League Dues" accordion section on the Commissioner tab. */
async function openDuesSection(page: import('@playwright/test').Page) {
  const toggle = page.getByRole('button', { name: 'League Dues', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

/** Locate a member's row in the dues status table by userId. */
function memberRow(page: import('@playwright/test').Page, userId: number) {
  return page.getByTestId(`dues-member-row-${userId}`);
}

// ── Commissioner View Tests ───────────────────────────────────────────────────

test.describe('League Member Payment Status — commissioner view @regression', () => {
  test('payment status renders for each league member', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await openDuesSection(page);

    await expect(page.getByText('the_commish')).toBeVisible();
    await expect(page.getByText('member_two')).toBeVisible();
    await expect(page.getByText('member_three')).toBeVisible();

    // Two paid, one unpaid per DEFAULT_MEMBERS
    await expect(page.getByText('Paid (2)')).toBeVisible();
    await expect(page.getByText('Unpaid (1)')).toBeVisible();
  });

  test('commissioner can mark an unpaid member as paid', async ({ page }) => {
    let markPaidCalled: { leagueId: number; userId: number } | null = null;
    await setupGraphQL(page, {
      onMarkPaid: (vars) => {
        markPaidCalled = vars;
      },
    });
    await page.goto('/baseball/league/1/commissioner');
    await openDuesSection(page);

    await expect(memberRow(page, 2)).toContainText('Unpaid');

    await memberRow(page, 2)
      .getByRole('button', { name: /mark paid/i })
      .click();

    // Mutation fired with the correct variables
    await expect.poll(() => markPaidCalled).toEqual({ leagueId: 1, userId: 2 });

    // UI reflects the new status after refetch
    await expect(memberRow(page, 2)).toContainText('Paid');
    await expect(
      memberRow(page, 2).getByRole('button', {
        name: /mark unpaid/i,
      }),
    ).toBeVisible();
  });

  test('commissioner can mark a paid member as unpaid', async ({ page }) => {
    let markUnpaidCalled: { leagueId: number; userId: number } | null = null;
    await setupGraphQL(page, {
      onMarkUnpaid: (vars) => {
        markUnpaidCalled = vars;
      },
    });
    await page.goto('/baseball/league/1/commissioner');
    await openDuesSection(page);

    await expect(memberRow(page, 3)).toContainText('Paid');

    await memberRow(page, 3)
      .getByRole('button', { name: /mark unpaid/i })
      .click();

    await expect
      .poll(() => markUnpaidCalled)
      .toEqual({ leagueId: 1, userId: 3 });

    await expect(memberRow(page, 3)).toContainText('Unpaid');
    await expect(
      memberRow(page, 3).getByRole('button', {
        name: /mark paid/i,
      }),
    ).toBeVisible();
  });

  test('paid/unpaid summary counts update after toggling a member', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await openDuesSection(page);

    await expect(page.getByText('Paid (2)')).toBeVisible();
    await expect(page.getByText('Unpaid (1)')).toBeVisible();

    await memberRow(page, 2)
      .getByRole('button', { name: /mark paid/i })
      .click();

    await expect(page.getByText('Paid (3)')).toBeVisible();
    await expect(page.getByText('Unpaid (0)')).toBeVisible();
  });

  test('commissioner cannot toggle their own payment status', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto('/baseball/league/1/commissioner');
    await openDuesSection(page);

    // The commissioner's own row (userId=1, matches the default test JWT)
    // shows "Self" instead of a Mark Paid/Unpaid action.
    await expect(memberRow(page, 1)).toContainText('Self');
    await expect(
      memberRow(page, 1).getByRole('button', {
        name: /mark (paid|unpaid)/i,
      }),
    ).not.toBeVisible();
  });
});

// ── Member (non-commissioner) View Tests ─────────────────────────────────────

test.describe('League Member Payment Status — member view @regression', () => {
  test('non-commissioner is redirected away from the commissioner tab', async ({
    page,
  }) => {
    await setupGraphQL(page, { league: MEMBER_LEAGUE });
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('load');

    // LeagueDetailPageV2 redirects non-commissioners off the `commish` tab
    // back to `overview`, so the League Dues section never renders.
    await expect(
      page.getByRole('button', { name: 'League Dues', exact: true }),
    ).not.toBeVisible();
  });
});
