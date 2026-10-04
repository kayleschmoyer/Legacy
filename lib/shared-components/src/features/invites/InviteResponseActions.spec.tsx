/**
 * InviteResponseActions (LS-10078): Accept/Decline on a DRAFT_INVITE
 * notification, and how a lapsed invite answers.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CombinedGraphQLErrors } from '@apollo/client';
import { RespondToInvite } from '@legacy-sports/graphql';
import {
  inviteIdFromNotification,
  InviteResponseActions,
} from './InviteResponseActions';
import { MockedProvider } from '../../test-utils/MockedProvider';

const invite = {
  __typename: 'Invitation' as const,
  id: 901,
  kind: 'mock',
  status: 'accepted',
  draftId: 77,
  leagueId: null,
  sport: 'baseball',
  targetName: "HostHarry's mock draft",
  invitedUserId: 1,
  invitedUsername: 'me',
  invitedById: 2,
  invitedByUsername: 'HostHarry',
  reservedSlot: 3,
  expiresAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
};

describe('InviteResponseActions', () => {
  it('accepting a mock invite reports the draft to open', async () => {
    const onAccepted = jest.fn();
    const onResponded = jest.fn();
    render(
      <MockedProvider
        mocks={[
          {
            request: {
              query: RespondToInvite,
              variables: { inviteId: 901, accept: true },
            },
            result: { data: { respondToInvite: invite } },
          },
        ]}
      >
        <InviteResponseActions
          inviteId={901}
          onAccepted={onAccepted}
          onResponded={onResponded}
        />
      </MockedProvider>,
    );

    fireEvent.click(screen.getByTestId('invite-accept-901'));

    await waitFor(() =>
      expect(onAccepted).toHaveBeenCalledWith({
        kind: 'mock',
        draftId: 77,
        sport: 'baseball',
      }),
    );
    expect(onResponded).toHaveBeenCalled();
    expect(await screen.findByTestId('invite-accepted-901')).toBeTruthy();
  });

  it('declining answers in place without navigating', async () => {
    const onAccepted = jest.fn();
    render(
      <MockedProvider
        mocks={[
          {
            request: {
              query: RespondToInvite,
              variables: { inviteId: 901, accept: false },
            },
            result: {
              data: { respondToInvite: { ...invite, status: 'declined' } },
            },
          },
        ]}
      >
        <InviteResponseActions inviteId={901} onAccepted={onAccepted} />
      </MockedProvider>,
    );

    fireEvent.click(screen.getByTestId('invite-decline-901'));

    expect(await screen.findByTestId('invite-declined-901')).toBeTruthy();
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('shows why a revoked or expired invite cannot be accepted', async () => {
    const message =
      'This invite is no longer available. It may have been revoked or expired.';
    render(
      <MockedProvider
        mocks={[
          {
            request: {
              query: RespondToInvite,
              variables: { inviteId: 901, accept: true },
            },
            error: new CombinedGraphQLErrors({
              errors: [{ message, extensions: { code: 'BAD_USER_INPUT' } }],
            }),
          },
        ]}
      >
        <InviteResponseActions inviteId={901} />
      </MockedProvider>,
    );

    fireEvent.click(screen.getByTestId('invite-accept-901'));

    expect(await screen.findByText(/no longer available/)).toBeTruthy();
    expect(screen.getByTestId('invite-accept-901')).toBeTruthy();
  });
});

describe('inviteIdFromNotification', () => {
  it('reads the invite id from a DRAFT_INVITE notification', () => {
    expect(
      inviteIdFromNotification({
        notificationType: 'DRAFT_INVITE',
        metadata: JSON.stringify({ inviteId: 12, target: { kind: 'league' } }),
      }),
    ).toBe(12);
  });

  it('ignores other notification types and malformed metadata', () => {
    expect(
      inviteIdFromNotification({
        notificationType: 'TRADE_OFFER',
        metadata: JSON.stringify({ inviteId: 12 }),
      }),
    ).toBeNull();
    expect(
      inviteIdFromNotification({
        notificationType: 'DRAFT_INVITE',
        metadata: '{not json',
      }),
    ).toBeNull();
  });
});
