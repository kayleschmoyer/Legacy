/**
 * Mock draft room E2E (LS-10076)
 *
 * A mock draft no longer creates a league, so it no longer lands on
 * /:sport/league/:id/draft — it has its own route, /:sport/mock-draft/:draftId,
 * and the board loads itself from `draftRoom(draftId)`. These tests drive that
 * route through the real app router with every GraphQL operation fulfilled
 * locally (route.fulfill only — no live backend).
 *
 * Covered: the ONLINE lobby renders its seats and host controls, and a seat
 * holder who is not the host gets no host controls.
 */

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import {
  draftRoomPayload,
  type SeatSpec,
} from '../mocks/graphql/mock-draft-room.mocks';

const DRAFT_ID = 4242;

const SEATS: SeatSpec[] = [
  { id: 11, slot: 1, seatName: 'HostHarry', userId: 1, controller: 'user' },
  { id: 12, slot: 2, seatName: 'Joiner Jo', userId: 2, controller: 'user' },
  {
    id: 13,
    slot: 3,
    seatName: 'Open Slot 3',
    userId: null,
    controller: 'open',
  },
];

async function setupGraphQL(
  page: Page,
  options: { canHost: boolean; seatId: number | null },
): Promise<void> {
  // The web client posts to `/graphql?ref=<operationName>`, so a
  // `'**/graphql'` glob never matches — use the shared endpoint predicate.
  // A lobby still mounts the board's pick/player/queue queries, so they are
  // answered empty here rather than left to the unmocked-op guard.
  await createGraphQLRouter(page, {
    getdraftroom: (route) =>
      fulfillJson(route, {
        data: {
          draftRoom: draftRoomPayload({
            draftId: DRAFT_ID,
            seats: SEATS,
            ...options,
          }),
        },
      }),
    getdraftmessages: (route) =>
      fulfillJson(route, { data: { draftMessages: [] } }),
    getcurrentdraftpick: (route) =>
      fulfillJson(route, { data: { getCurrentDraftPick: null } }),
    getdraftpicks: (route) =>
      fulfillJson(route, { data: { getDraftPicks: [] } }),
    getavailabledraftplayers: (route) =>
      fulfillJson(route, { data: { getAvailableDraftPlayers: [] } }),
    getmydraftqueue: (route) =>
      fulfillJson(route, { data: { getMyDraftQueue: [] } }),
  });
}

test.describe('Mock draft room @regression', () => {
  test('the host sees the lobby seats and the start control', async ({
    page,
  }) => {
    await setupGraphQL(page, { canHost: true, seatId: 11 });
    await page.goto(`/baseball/mock-draft/${String(DRAFT_ID)}`);
    await page.waitForLoadState('load');

    await expect(page.getByTestId('mock-draft-lobby')).toBeVisible();
    await expect(page.getByText(/2 of 3 seats taken/)).toBeVisible();
    await expect(page.getByTestId('mock-draft-seat-1')).toContainText(
      'HostHarry',
    );
    await expect(page.getByTestId('mock-draft-seat-3')).toContainText('Open');
    await expect(page.getByTestId('mock-draft-start')).toBeVisible();
    await expect(page.getByTestId('mock-draft-toggle-public')).toBeVisible();
    // The host can free another holder's seat, but never their own.
    await expect(page.getByTestId('mock-draft-kick-2')).toBeVisible();
    await expect(page.getByTestId('mock-draft-kick-1')).toHaveCount(0);
  });

  test('the host invites a user, reserving a seat, then revokes it (LS-10078)', async ({
    page,
  }) => {
    await setupGraphQL(page, { canHost: true, seatId: 11 });

    // Registered after setupGraphQL, so it answers first (Playwright routes
    // are LIFO); anything it does not handle falls back to the lobby mocks.
    const state: { pending: boolean; sent: unknown[]; revoked: unknown[] } = {
      pending: false,
      sent: [],
      revoked: [],
    };
    const pendingInvite = {
      __typename: 'Invitation',
      id: 31,
      kind: 'mock',
      status: 'pending',
      draftId: DRAFT_ID,
      leagueId: null,
      sport: 'baseball',
      targetName: "HostHarry's mock draft",
      invitedUserId: 5,
      invitedUsername: 'pal',
      invitedById: 1,
      invitedByUsername: 'HostHarry',
      reservedSlot: 3,
      expiresAt: '2099-01-01T00:00:00.000Z',
      createdAt: '2026-10-01T00:00:00.000Z',
    };
    await createGraphQLRouter(page, {
      getdraftroom: (route) =>
        fulfillJson(route, {
          data: {
            draftRoom: draftRoomPayload({
              draftId: DRAFT_ID,
              seats: SEATS,
              canHost: true,
              seatId: 11,
              reservedSlots: state.pending ? [3] : [],
            }),
          },
        }),
      pendinginvites: (route) =>
        fulfillJson(route, {
          data: { pendingInvites: state.pending ? [pendingInvite] : [] },
        }),
      searchusersfordraft: (route) =>
        fulfillJson(route, {
          data: {
            searchUsers: [
              { __typename: 'User', id: 5, username: 'pal', avatarUrl: null },
            ],
          },
        }),
      senddraftinvite: (route, { variables }) => {
        state.sent.push(variables);
        state.pending = true;
        return fulfillJson(route, { data: { sendDraftInvite: pendingInvite } });
      },
      revokeinvite: (route, { variables }) => {
        state.revoked.push(variables);
        state.pending = false;
        return fulfillJson(route, {
          data: { revokeInvite: { ...pendingInvite, status: 'revoked' } },
        });
      },
    });

    await page.goto(`/baseball/mock-draft/${String(DRAFT_ID)}`);
    await expect(page.getByTestId('draft-invite-panel')).toBeVisible();

    await page.getByLabel('Search usernames').fill('pal');
    await page.getByTestId('draft-invite-send-pal').click();

    await expect(page.getByTestId('draft-invite-pending-31')).toContainText(
      'seat 3 reserved',
    );
    await expect(page.getByTestId('mock-draft-seat-3')).toContainText(
      'Reserved',
    );
    expect(state.sent).toEqual([{ draftId: DRAFT_ID, username: 'pal' }]);

    await page.getByTestId('draft-invite-revoke-31').click();

    await expect(page.getByTestId('draft-invite-pending-31')).toHaveCount(0);
    await expect(page.getByTestId('mock-draft-seat-3')).toContainText('Open');
    expect(state.revoked).toEqual([{ inviteId: 31 }]);
  });

  test('a seat holder who is not the host gets no host controls', async ({
    page,
  }) => {
    await setupGraphQL(page, { canHost: false, seatId: 12 });
    await page.goto(`/baseball/mock-draft/${String(DRAFT_ID)}`);
    await page.waitForLoadState('load');

    await expect(page.getByTestId('mock-draft-lobby')).toBeVisible();
    await expect(page.getByTestId('mock-draft-start')).toHaveCount(0);
    await expect(page.getByTestId('mock-draft-toggle-public')).toHaveCount(0);
    await expect(page.getByTestId('mock-draft-leave')).toBeVisible();
  });
});
