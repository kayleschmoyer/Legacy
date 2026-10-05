/**
 * MockDraftsHub (LS-10079): browse public lobbies and join by id, resume or
 * review your own mock drafts, answer pending invites.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  GetMyMockDrafts,
  GetPublicMockDrafts,
  JoinMockDraft,
  MyInvites,
} from '@legacy-sports/graphql';
import { formatLobbyTimeLeft, MockDraftsHub } from './MockDraftsHub';
import { MockedProvider } from '../../test-utils/MockedProvider';

type Mocks = Parameters<typeof MockedProvider>[0]['mocks'];

const lobby = {
  __typename: 'PublicMockDraft' as const,
  draftId: 41,
  sport: 'baseball',
  hostUsername: 'HostHarry',
  playerPool: 'nl',
  filledSeats: 3,
  totalSeats: 8,
  openSeats: 4,
  pickTimeLimitSeconds: 60,
  rounds: 25,
  lobbyExpiresAt: '2099-01-01T00:00:00.000Z',
  createdAt: '2026-10-01T00:00:00.000Z',
};

function publicPage(
  nodes: unknown[],
  variables: Record<string, unknown> = {},
  page: { endCursor?: string | null; hasNextPage?: boolean } = {},
): Mocks[number] {
  return {
    request: {
      query: GetPublicMockDrafts,
      variables: {
        sport: 'baseball',
        playerPool: null,
        first: 20,
        ...variables,
      },
    },
    result: {
      data: {
        publicMockDrafts: {
          __typename: 'PublicMockDraftConnection',
          nodes,
          endCursor: page.endCursor ?? null,
          hasNextPage: page.hasNextPage ?? false,
        },
      },
    },
  };
}

function myDraft(overrides: Record<string, unknown>) {
  return {
    __typename: 'MyMockDraft' as const,
    draftId: 1,
    sport: 'baseball',
    status: 'in-progress',
    listStatus: 'LIVE',
    mode: 'ONLINE',
    isPublic: true,
    isHost: false,
    hostUsername: 'HostHarry',
    playerPool: 'all',
    rounds: 25,
    filledSeats: 2,
    totalSeats: 8,
    lobbyExpiresAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

function renderHub(mocks: Mocks, initialTab?: 'join' | 'mine' | 'invites') {
  const onOpenDraft = jest.fn();
  const onInviteAccepted = jest.fn();
  const onCreateMockDraft = jest.fn();
  render(
    <MockedProvider mocks={mocks}>
      <MockDraftsHub
        initialTab={initialTab}
        onOpenDraft={onOpenDraft}
        onInviteAccepted={onInviteAccepted}
        onCreateMockDraft={onCreateMockDraft}
      />
    </MockedProvider>,
  );
  return { onOpenDraft, onInviteAccepted, onCreateMockDraft };
}

describe('MockDraftsHub', () => {
  it('lists a public lobby and joins it by draft id', async () => {
    const { onOpenDraft } = renderHub([
      publicPage([lobby]),
      {
        request: {
          query: JoinMockDraft,
          variables: { draftId: 41, teamName: 'Sluggers' },
        },
        result: {
          data: {
            joinMockDraft: {
              __typename: 'JoinMockDraftResult',
              draftId: 41,
              seatId: 9,
              sport: 'baseball',
            },
          },
        },
      },
    ]);

    const card = await screen.findByTestId('public-mock-draft-41');
    expect(card.textContent).toContain("HostHarry's lobby");
    expect(card.textContent).toContain('3 / 8 · 4 open');
    expect(card.textContent).toContain('NL');
    expect(card.textContent).toContain('60s');

    fireEvent.click(screen.getByTestId('public-mock-draft-join-41'));
    fireEvent.change(screen.getByLabelText('Team name'), {
      target: { value: '  Sluggers ' },
    });
    fireEvent.click(screen.getByTestId('public-mock-draft-confirm-41'));

    await waitFor(() =>
      expect(onOpenDraft).toHaveBeenCalledWith({
        draftId: 41,
        sport: 'baseball',
      }),
    );
  });

  it('keeps the user on the card with a generic message when the join fails', async () => {
    const { onOpenDraft } = renderHub([
      publicPage([lobby]),
      {
        request: {
          query: JoinMockDraft,
          variables: { draftId: 41, teamName: 'Sluggers' },
        },
        error: new Error('This mock draft is full'),
      },
    ]);

    await screen.findByTestId('public-mock-draft-41');
    fireEvent.click(screen.getByTestId('public-mock-draft-join-41'));
    fireEvent.change(screen.getByLabelText('Team name'), {
      target: { value: 'Sluggers' },
    });
    fireEvent.click(screen.getByTestId('public-mock-draft-confirm-41'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't join this draft");
    expect(alert.textContent).not.toContain('This mock draft is full');
    expect(onOpenDraft).not.toHaveBeenCalled();
  });

  it('shows an empty state that offers to start a mock draft', async () => {
    const { onCreateMockDraft } = renderHub([publicPage([])]);

    expect(
      await screen.findByTestId('mock-drafts-join-empty'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mock-drafts-create'));
    expect(onCreateMockDraft).toHaveBeenCalledWith('baseball');
  });

  it('appends the next page on Load more', async () => {
    renderHub([
      publicPage([lobby], {}, { endCursor: 'CURSOR1', hasNextPage: true }),
      publicPage([{ ...lobby, draftId: 40, hostUsername: 'Second' }], {
        after: 'CURSOR1',
      }),
    ]);

    await screen.findByTestId('public-mock-draft-41');
    fireEvent.click(screen.getByTestId('mock-drafts-join-more'));

    expect(
      await screen.findByTestId('public-mock-draft-40'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('public-mock-draft-41')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId('mock-drafts-join-more')).toBeNull(),
    );
  });

  it('resumes a live draft and opens a completed one for its results', async () => {
    const { onOpenDraft } = renderHub(
      [
        {
          request: {
            query: GetMyMockDrafts,
            variables: { status: null, first: 20 },
          },
          result: {
            data: {
              myMockDrafts: {
                __typename: 'MyMockDraftConnection',
                nodes: [
                  myDraft({ draftId: 7 }),
                  myDraft({
                    draftId: 6,
                    status: 'completed',
                    listStatus: 'COMPLETED',
                    mode: 'OFFLINE',
                    isHost: true,
                    completedAt: '2026-10-02T00:00:00.000Z',
                  }),
                ],
                endCursor: null,
                hasNextPage: false,
              },
            },
          },
        },
      ],
      'mine',
    );

    const live = await screen.findByTestId('my-mock-draft-open-7');
    expect(live.textContent).toBe('Resume');
    const done = screen.getByTestId('my-mock-draft-open-6');
    expect(done.textContent).toBe('View results');
    expect(screen.getByTestId('my-mock-draft-6').textContent).toContain(
      'Your mock draft',
    );

    fireEvent.click(done);
    expect(onOpenDraft).toHaveBeenCalledWith({ draftId: 6, sport: 'baseball' });
  });

  it('lists pending invites with accept and decline', async () => {
    renderHub(
      [
        {
          request: { query: MyInvites, variables: { first: 20 } },
          result: {
            data: {
              myInvites: {
                __typename: 'InvitationConnection',
                nodes: [
                  {
                    __typename: 'Invitation',
                    id: 12,
                    kind: 'MOCK',
                    status: 'pending',
                    draftId: 41,
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
                ],
                endCursor: null,
                hasNextPage: false,
              },
            },
          },
        },
      ],
      'invites',
    );

    const card = await screen.findByTestId('hub-invite-12');
    expect(card.textContent).toContain(
      "HostHarry invited you to HostHarry's mock draft",
    );
    expect(screen.getByTestId('invite-accept-12')).toBeInTheDocument();
    expect(screen.getByTestId('invite-decline-12')).toBeInTheDocument();
  });
});

describe('formatLobbyTimeLeft', () => {
  const now = new Date('2026-10-01T00:00:00.000Z');

  it('formats hours and minutes, minutes alone, and expiry', () => {
    expect(formatLobbyTimeLeft('2026-10-01T05:30:00.000Z', now)).toBe('5h 30m');
    expect(formatLobbyTimeLeft('2026-10-01T00:12:00.000Z', now)).toBe('12m');
    expect(formatLobbyTimeLeft('2026-09-30T23:00:00.000Z', now)).toBe(
      'Expired',
    );
    expect(formatLobbyTimeLeft(null, now)).toBe('—');
  });
});
