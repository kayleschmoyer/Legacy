/**
 * Mock Drafts hub E2E (LS-10079)
 *
 * /mock-drafts through the real app router, with every GraphQL operation
 * fulfilled locally (route.fulfill only):
 *
 *   - Join a draft: a public lobby card joins by draft id and lands in that
 *     draft's lobby.
 *   - My mock drafts: a completed draft is listed and opens its results in
 *     the draft room.
 *   - Invites: a pending invite is listed with Accept / Decline.
 */

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/auth-enhanced';
import { draftRoomPayload } from '../mocks/graphql/mock-draft-room.mocks';
import {
  createGraphQLRouter,
  fulfillJson,
  type GraphQLHandlerMap,
} from '../mocks/graphql/router';

const LOBBY_ID = 41;
const COMPLETED_ID = 6;

const PUBLIC_LOBBY = {
  __typename: 'PublicMockDraft',
  draftId: LOBBY_ID,
  sport: 'baseball',
  hostUsername: 'HostHarry',
  playerPool: 'nl',
  filledSeats: 1,
  totalSeats: 3,
  openSeats: 2,
  pickTimeLimitSeconds: 60,
  rounds: 25,
  lobbyExpiresAt: '2099-01-01T00:00:00.000Z',
  createdAt: '2026-10-01T00:00:00.000Z',
};

const COMPLETED_DRAFT = {
  __typename: 'MyMockDraft',
  draftId: COMPLETED_ID,
  sport: 'baseball',
  status: 'completed',
  listStatus: 'COMPLETED',
  mode: 'OFFLINE',
  isPublic: false,
  isHost: true,
  hostUsername: 'me',
  playerPool: 'all',
  rounds: 25,
  filledSeats: 1,
  totalSeats: 8,
  lobbyExpiresAt: null,
  createdAt: '2026-09-30T00:00:00.000Z',
  completedAt: '2026-10-01T00:00:00.000Z',
};

function connection(typename: string, nodes: unknown[]) {
  return { __typename: typename, nodes, endCursor: null, hasNextPage: false };
}

/** The draft room's own queries, answered empty so a lobby mounts cleanly. */
const DRAFT_ROOM_SIDE_QUERIES: GraphQLHandlerMap = {
  getdraftmessages: (route) =>
    fulfillJson(route, { data: { draftMessages: [] } }),
  getcurrentdraftpick: (route) =>
    fulfillJson(route, { data: { getCurrentDraftPick: null } }),
  getdraftpicks: (route) => fulfillJson(route, { data: { getDraftPicks: [] } }),
  getavailabledraftplayers: (route) =>
    fulfillJson(route, { data: { getAvailableDraftPlayers: [] } }),
  getmydraftqueue: (route) =>
    fulfillJson(route, { data: { getMyDraftQueue: [] } }),
};

/**
 * Once the hub has navigated into a draft room, the room's remaining queries
 * are not what these tests are about — answer them empty instead of tripping
 * the unmocked-operation guard. Before navigation, unmocked ops still fall
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

test.describe('Mock Drafts hub — /mock-drafts @regression', () => {
  test('joins a public lobby and lands in it', async ({ page }) => {
    const state = { navigated: false };
    let joinVariables: Record<string, unknown> | null = null;

    await routeGraphQL(
      page,
      {
        ...DRAFT_ROOM_SIDE_QUERIES,
        getpublicmockdrafts: (route, { variables }) => {
          expect(variables.sport).toBe('baseball');
          return fulfillJson(route, {
            data: {
              publicMockDrafts: connection('PublicMockDraftConnection', [
                PUBLIC_LOBBY,
              ]),
            },
          });
        },
        joinmockdraft: (route, { variables }) => {
          joinVariables = variables;
          state.navigated = true;
          return fulfillJson(route, {
            data: {
              joinMockDraft: {
                __typename: 'JoinMockDraftResult',
                draftId: LOBBY_ID,
                seatId: 12,
                sport: 'baseball',
              },
            },
          });
        },
        getdraftroom: (route) =>
          fulfillJson(route, {
            data: {
              draftRoom: draftRoomPayload({
                draftId: LOBBY_ID,
                canHost: false,
                seatId: 12,
                isPublic: true,
                seats: [
                  {
                    id: 11,
                    slot: 1,
                    seatName: 'HostHarry',
                    userId: 1,
                    controller: 'user',
                  },
                  {
                    id: 12,
                    slot: 2,
                    seatName: 'Hub Joiners',
                    userId: 2,
                    controller: 'user',
                  },
                  {
                    id: 13,
                    slot: 3,
                    seatName: 'Open Slot 3',
                    userId: null,
                    controller: 'open',
                  },
                ],
              }),
            },
          }),
      },
      state,
    );

    await page.goto('/mock-drafts');

    const card = page.getByTestId(`public-mock-draft-${String(LOBBY_ID)}`);
    await expect(card).toBeVisible();
    await expect(card).toContainText("HostHarry's lobby");
    await expect(card).toContainText('1 / 3 · 2 open');
    await expect(card).toContainText('NL');

    await page
      .getByTestId(`public-mock-draft-join-${String(LOBBY_ID)}`)
      .click();
    await page.getByLabel('Team name').fill('Hub Joiners');
    await page
      .getByTestId(`public-mock-draft-confirm-${String(LOBBY_ID)}`)
      .click();

    await expect(page).toHaveURL(
      new RegExp(`/baseball/mock-draft/${String(LOBBY_ID)}$`),
    );
    expect(joinVariables).toEqual({
      draftId: LOBBY_ID,
      teamName: 'Hub Joiners',
    });
    await expect(page.getByTestId('mock-draft-lobby')).toBeVisible();
    await expect(page.getByTestId('mock-draft-seat-2')).toContainText(
      'Hub Joiners',
    );
  });

  test('lists a completed mock draft and opens its results', async ({
    page,
  }) => {
    const state = { navigated: false };

    await routeGraphQL(
      page,
      {
        getmymockdrafts: (route) =>
          fulfillJson(route, {
            data: {
              myMockDrafts: connection('MyMockDraftConnection', [
                COMPLETED_DRAFT,
              ]),
            },
          }),
        // The room reads its own completed state; answering the first room
        // query marks the hand-off, after which the room's queries go empty.
        getdraftroom: (route) => {
          state.navigated = true;
          return fulfillJson(route, { data: { draftRoom: null } });
        },
      },
      state,
    );

    await page.goto('/mock-drafts?tab=mine');

    const card = page.getByTestId(`my-mock-draft-${String(COMPLETED_ID)}`);
    await expect(card).toBeVisible();
    await expect(
      page.getByTestId(`my-mock-draft-status-${String(COMPLETED_ID)}`),
    ).toHaveText(/completed/i);

    const open = page.getByTestId(`my-mock-draft-open-${String(COMPLETED_ID)}`);
    await expect(open).toHaveText('View results');
    await open.click();

    await expect(page).toHaveURL(
      new RegExp(`/baseball/mock-draft/${String(COMPLETED_ID)}$`),
    );
  });

  test('lists a pending invite with accept and decline', async ({ page }) => {
    await routeGraphQL(
      page,
      {
        myinvites: (route) =>
          fulfillJson(route, {
            data: {
              myInvites: connection('InvitationConnection', [
                {
                  __typename: 'Invitation',
                  id: 12,
                  kind: 'MOCK',
                  status: 'pending',
                  draftId: LOBBY_ID,
                  leagueId: null,
                  sport: 'baseball',
                  targetName: "HostHarry's mock draft",
                  invitedUserId: 2,
                  invitedUsername: 'me',
                  invitedById: 1,
                  invitedByUsername: 'HostHarry',
                  reservedSlot: 3,
                  expiresAt: null,
                  createdAt: '2026-10-01T00:00:00.000Z',
                },
              ]),
            },
          }),
      },
      { navigated: false },
    );

    await page.goto('/mock-drafts?tab=invites');

    await expect(page.getByTestId('hub-invite-12')).toContainText(
      "HostHarry invited you to HostHarry's mock draft",
    );
    await expect(page.getByTestId('invite-accept-12')).toBeVisible();
    await expect(page.getByTestId('invite-decline-12')).toBeVisible();
  });
});
