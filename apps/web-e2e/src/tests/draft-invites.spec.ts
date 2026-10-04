/**
 * Invites E2E (LS-10078)
 *
 * Covers the universal join route and direct invites through the real app
 * router, with every GraphQL operation fulfilled locally (route.fulfill only):
 *
 *   - /join/:code previews a mock-draft code and a league code, and joins each
 *     with the right mutation, landing in the draft room / league.
 *   - An unknown code says so.
 *   - Legacy mock-draft invite links redirect to /join/:code.
 *   - DRAFT_INVITE notifications: accept (mock + league), decline, and an
 *     invite that was revoked or has expired (no longer in myInvites) offers
 *     no actions; accepting one that lapsed meanwhile fails with a message.
 *
 * The lobby's host invite panel (send + revoke, reserved seat) is covered in
 * mock-draft-room.spec.ts; the commissioner's league invite panel in
 * commissioner-league-settings.spec.ts.
 */

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/auth-enhanced';
import { agoIso } from '../mocks/time';
import {
  createGraphQLRouter,
  fulfillJson,
  type GraphQLHandlerMap,
} from '../mocks/graphql/router';

const MOCK_CODE = 'MOCK2345';
const LEAGUE_CODE = 'LEAG2345';
const MOCK_DRAFT_ID = 77;
const LEAGUE_ID = 55;

const MOCK_PREVIEW = {
  __typename: 'MockDraftInvitePreview',
  code: MOCK_CODE,
  draftId: MOCK_DRAFT_ID,
  sport: 'baseball',
  hostUsername: 'HostHarry',
  playerPool: 'all',
  filledSeats: 1,
  totalSeats: 4,
  openSeats: 2,
  pickTimeLimitSeconds: 60,
  rounds: 25,
  lobbyExpiresAt: '2099-01-01T00:00:00.000Z',
  isJoinable: true,
  isAlreadySeated: false,
};

const LEAGUE_PREVIEW = {
  __typename: 'LeagueInvitePreview',
  code: LEAGUE_CODE,
  leagueId: LEAGUE_ID,
  sport: 'baseball',
  name: 'Sandlot Legends',
  totalTeams: 8,
  openTeams: 3,
  draftScheduledAt: null,
  isAlreadyMember: false,
};

/**
 * Once a join has navigated away, the destination page's own queries are not
 * what these tests are about — answer them empty instead of tripping the
 * unmocked-operation guard. Before navigation, unmocked ops still fall
 * through to the guard.
 */
async function routeGraphQL(
  page: Page,
  handlers: GraphQLHandlerMap,
  state: { navigated: boolean },
): Promise<void> {
  await createGraphQLRouter(page, handlers, {
    onUnmocked: async (route) => {
      if (state.navigated) {
        await fulfillJson(route, { data: null });
        return;
      }
      await route.fallback();
    },
  });
}

function resolveCode(code: string) {
  if (code === MOCK_CODE) return MOCK_PREVIEW;
  if (code === LEAGUE_CODE) return LEAGUE_PREVIEW;
  return null;
}

test.describe('Universal join route — /join/:code @regression', () => {
  test('previews a mock-draft code and joins the lobby', async ({ page }) => {
    const state = { navigated: false };
    let joinVariables: Record<string, unknown> | null = null;

    await routeGraphQL(
      page,
      {
        resolveinvitecode: (route, { variables }) =>
          fulfillJson(route, {
            data: { resolveInviteCode: resolveCode(String(variables.code)) },
          }),
        joinmockdraft: (route, { variables }) => {
          joinVariables = variables;
          state.navigated = true;
          return fulfillJson(route, {
            data: {
              joinMockDraft: {
                __typename: 'JoinMockDraftResult',
                draftId: MOCK_DRAFT_ID,
                seatId: 9,
                sport: 'baseball',
              },
            },
          });
        },
      },
      state,
    );

    await page.goto(`/join/${MOCK_CODE}`);

    const preview = page.getByTestId('join-preview-mock');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("HostHarry's mock draft");
    await expect(preview).toContainText('1 of 4 filled · 2 open');
    await expect(preview).toContainText('60s');
    await expect(preview).toContainText('25');
    await expect(page.getByLabel('Invite code')).toHaveValue(MOCK_CODE);

    await page.getByLabel('Team name').fill('Draft Dodgers');
    await page.getByTestId('join-submit').click();

    await expect(page).toHaveURL(
      new RegExp(`/baseball/mock-draft/${String(MOCK_DRAFT_ID)}$`),
    );
    expect(joinVariables).toEqual({
      inviteCode: MOCK_CODE,
      teamName: 'Draft Dodgers',
    });
  });

  test('previews a league code and joins the league', async ({ page }) => {
    const state = { navigated: false };
    let joinVariables: Record<string, unknown> | null = null;

    await routeGraphQL(
      page,
      {
        resolveinvitecode: (route, { variables }) =>
          fulfillJson(route, {
            data: { resolveInviteCode: resolveCode(String(variables.code)) },
          }),
        joinleaguebycode: (route, { variables }) => {
          joinVariables = variables;
          state.navigated = true;
          return fulfillJson(route, {
            data: {
              joinLeagueByCode: {
                __typename: 'Team',
                id: 501,
                name: 'Draft Dodgers',
                leagueId: LEAGUE_ID,
              },
            },
          });
        },
      },
      state,
    );

    await page.goto(`/join/${LEAGUE_CODE}`);

    const preview = page.getByTestId('join-preview-league');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('Sandlot Legends');
    await expect(preview).toContainText('3 of 8');

    await page.getByLabel('Team name').fill('Draft Dodgers');
    await page.getByTestId('join-submit').click();

    await expect(page).toHaveURL(
      new RegExp(`/baseball/league/${String(LEAGUE_ID)}$`),
    );
    expect(joinVariables).toEqual({
      inviteCode: LEAGUE_CODE,
      teamName: 'Draft Dodgers',
    });
  });

  test('an unknown code says it matches nothing', async ({ page }) => {
    await createGraphQLRouter(page, {
      resolveinvitecode: (route) =>
        fulfillJson(route, { data: { resolveInviteCode: null } }),
    });

    await page.goto('/join/ZZZZ2345');

    await expect(page.getByTestId('join-not-found')).toBeVisible();
    await expect(page.getByTestId('join-submit')).toHaveCount(0);
  });

  test('a full mock lobby cannot be joined', async ({ page }) => {
    await createGraphQLRouter(page, {
      resolveinvitecode: (route) =>
        fulfillJson(route, {
          data: {
            resolveInviteCode: {
              ...MOCK_PREVIEW,
              openSeats: 0,
              isJoinable: false,
            },
          },
        }),
    });

    await page.goto(`/join/${MOCK_CODE}`);

    await expect(page.getByTestId('join-unavailable')).toBeVisible();
    await expect(page.getByTestId('join-submit')).toHaveCount(0);
  });
});

test.describe('Legacy mock-draft invite links redirect to /join @regression', () => {
  const cases: [string, string][] = [
    [`/baseball/mock-draft/join/${MOCK_CODE}`, `/join/${MOCK_CODE}`],
    ['/baseball/mock-draft/join', '/join'],
  ];

  for (const [from, to] of cases) {
    test(`${from} → ${to}`, async ({ page }) => {
      await createGraphQLRouter(page, {
        resolveinvitecode: (route, { variables }) =>
          fulfillJson(route, {
            data: { resolveInviteCode: resolveCode(String(variables.code)) },
          }),
      });

      await page.goto(from);

      await expect(page).toHaveURL(new RegExp(`${to}$`));
      await expect(page.getByTestId('join-by-code')).toBeVisible();
    });
  }
});

// ── DRAFT_INVITE notifications ─────────────────────────────────────────────

const MOCK_INVITE_ID = 901;
const LEAGUE_INVITE_ID = 902;

function inviteNotification(id: number, inviteId: number, title: string) {
  return {
    __typename: 'NotificationHistoryItem',
    id,
    userId: 1,
    notificationType: 'DRAFT_INVITE',
    channel: 'push',
    matchupId: null,
    leagueId: null,
    tradeOfferId: null,
    title,
    message: 'HostHarry invited you.',
    metadata: JSON.stringify({ inviteId, target: { kind: 'mock' } }),
    read: false,
    sentAt: agoIso(5 * 60 * 1000),
    readAt: null,
    createdAt: agoIso(5 * 60 * 1000),
  };
}

function invitation(id: number, kind: 'mock' | 'league') {
  return {
    __typename: 'Invitation',
    id,
    kind,
    status: 'pending',
    draftId: kind === 'mock' ? MOCK_DRAFT_ID : null,
    leagueId: kind === 'league' ? LEAGUE_ID : null,
    sport: 'baseball',
    targetName: kind === 'mock' ? "HostHarry's mock draft" : 'Sandlot Legends',
    invitedUserId: 1,
    invitedUsername: 'testuser',
    invitedById: 2,
    invitedByUsername: 'HostHarry',
    reservedSlot: kind === 'mock' ? 3 : null,
    expiresAt: '2099-01-01T00:00:00.000Z',
    createdAt: agoIso(5 * 60 * 1000),
  };
}

async function setupInviteNotifications(
  page: Page,
  options: {
    pendingInviteIds: number[];
    onRespond?: (variables: Record<string, unknown>) => unknown;
  },
  state: { navigated: boolean },
): Promise<void> {
  const notifications = [
    inviteNotification(1, MOCK_INVITE_ID, 'Mock draft invite'),
    inviteNotification(2, LEAGUE_INVITE_ID, 'League invite'),
  ];
  const all = [
    invitation(MOCK_INVITE_ID, 'mock'),
    invitation(LEAGUE_INVITE_ID, 'league'),
  ];

  await routeGraphQL(
    page,
    {
      getnotificationhistory: (route) =>
        fulfillJson(route, { data: { getNotificationHistory: notifications } }),
      getunreadnotificationcount: (route) =>
        fulfillJson(route, { data: { getUnreadNotificationCount: 2 } }),
      myinvites: (route) =>
        fulfillJson(route, {
          data: {
            myInvites: {
              __typename: 'InvitationConnection',
              nodes: all.filter((i) => options.pendingInviteIds.includes(i.id)),
              endCursor: null,
              hasNextPage: false,
            },
          },
        }),
      marknotificationasread: (route) =>
        fulfillJson(route, { data: { markNotificationAsRead: true } }),
      respondtoinvite: async (route, { variables }) => {
        const result = options.onRespond?.(variables);
        if (result instanceof Error) {
          await fulfillJson(route, {
            errors: [
              {
                message: result.message,
                extensions: { code: 'BAD_USER_INPUT' },
              },
            ],
            data: null,
          });
          return;
        }
        const invite = all.find((i) => i.id === variables.inviteId);
        if (variables.accept) state.navigated = true;
        await fulfillJson(route, {
          data: {
            respondToInvite: {
              ...invite,
              status: variables.accept ? 'accepted' : 'declined',
            },
          },
        });
      },
    },
    state,
  );
}

test.describe('DRAFT_INVITE notifications @regression', () => {
  test('accepting a mock invite lands in the draft room', async ({ page }) => {
    const state = { navigated: false };
    const responses: Record<string, unknown>[] = [];
    await setupInviteNotifications(
      page,
      {
        pendingInviteIds: [MOCK_INVITE_ID, LEAGUE_INVITE_ID],
        onRespond: (v) => responses.push(v),
      },
      state,
    );

    await page.goto('/notifications');
    await page.getByTestId(`invite-accept-${String(MOCK_INVITE_ID)}`).click();

    await expect(page).toHaveURL(
      new RegExp(`/baseball/mock-draft/${String(MOCK_DRAFT_ID)}$`),
    );
    expect(responses).toEqual([{ inviteId: MOCK_INVITE_ID, accept: true }]);
  });

  test('accepting a league invite lands in the league', async ({ page }) => {
    const state = { navigated: false };
    await setupInviteNotifications(
      page,
      { pendingInviteIds: [MOCK_INVITE_ID, LEAGUE_INVITE_ID] },
      state,
    );

    await page.goto('/notifications');
    await page.getByTestId(`invite-accept-${String(LEAGUE_INVITE_ID)}`).click();

    await expect(page).toHaveURL(
      new RegExp(`/baseball/league/${String(LEAGUE_ID)}$`),
    );
  });

  test('declining an invite answers it in place', async ({ page }) => {
    const state = { navigated: false };
    const responses: Record<string, unknown>[] = [];
    await setupInviteNotifications(
      page,
      {
        pendingInviteIds: [MOCK_INVITE_ID, LEAGUE_INVITE_ID],
        onRespond: (v) => responses.push(v),
      },
      state,
    );

    await page.goto('/notifications');
    await page
      .getByTestId(`invite-decline-${String(LEAGUE_INVITE_ID)}`)
      .click();

    await expect(
      page.getByTestId(`invite-declined-${String(LEAGUE_INVITE_ID)}`),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/notifications$/);
    expect(responses).toEqual([{ inviteId: LEAGUE_INVITE_ID, accept: false }]);
  });

  test('a revoked or expired invite offers no actions', async ({ page }) => {
    const state = { navigated: false };
    // Only the league invite is still pending; the mock invite was revoked
    // (or its lobby expired), so myInvites no longer lists it.
    await setupInviteNotifications(
      page,
      { pendingInviteIds: [LEAGUE_INVITE_ID] },
      state,
    );

    await page.goto('/notifications');

    await expect(
      page.getByTestId(`invite-accept-${String(LEAGUE_INVITE_ID)}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`invite-accept-${String(MOCK_INVITE_ID)}`),
    ).toHaveCount(0);
  });

  test('accepting an invite that lapsed meanwhile shows why', async ({
    page,
  }) => {
    const state = { navigated: false };
    await setupInviteNotifications(
      page,
      {
        pendingInviteIds: [MOCK_INVITE_ID, LEAGUE_INVITE_ID],
        onRespond: () =>
          new Error(
            'This invite is no longer available. It may have been revoked or expired.',
          ),
      },
      state,
    );

    await page.goto('/notifications');
    await page.getByTestId(`invite-accept-${String(MOCK_INVITE_ID)}`).click();

    await expect(
      page
        .getByTestId('main-content')
        .getByRole('alert')
        .filter({ hasText: /no longer available/ }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/notifications$/);
  });
});
