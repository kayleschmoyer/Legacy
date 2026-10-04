import React from 'react';
import { CombinedGraphQLErrors } from '@apollo/client';
import {
  RosterOverLimitBanner,
  RosterOverLimitNotice,
} from './RosterOverLimitBanner';
import { fireEvent, render, screen, waitFor } from '../../test-utils';

const mockReleasePlayer = jest.fn();
let mockRosterLimitData: unknown;
const mockTeamMembersData = {
  teamMembers: [
    {
      id: 100,
      playerId: 1,
      player: { id: 1, firstName: 'Yogi', lastName: 'Berra' },
    },
  ],
};

jest.mock('@legacy-sports/graphql', () => ({
  useGetTeamRosterLimitQuery: jest.fn(() => ({ data: mockRosterLimitData })),
  useReleasePlayerMutation: jest.fn(() => [mockReleasePlayer, {}]),
  useGetTeamMembersQuery: jest.fn((opts: { skip?: boolean }) => ({
    data: opts.skip ? undefined : mockTeamMembersData,
  })),
}));

const PLAYERS = [
  { playerId: 1, name: 'Yogi Berra' },
  { playerId: 2, name: 'Ed Delahanty' },
];

describe('RosterOverLimitBanner (LS-10477)', () => {
  it('tells the manager how many players to release', () => {
    render(
      <RosterOverLimitBanner
        rosterSize={28}
        maxRosterSize={26}
        playersToRelease={2}
        players={PLAYERS}
        onRelease={jest.fn()}
      />,
    );
    expect(
      screen.getByText('Roster over the limit — release 2 players'),
    ).toBeTruthy();
  });

  it('requires a second tap to confirm a release', () => {
    const onRelease = jest.fn();
    render(
      <RosterOverLimitBanner
        rosterSize={27}
        maxRosterSize={26}
        playersToRelease={1}
        players={PLAYERS}
        onRelease={onRelease}
      />,
    );
    fireEvent.click(screen.getByText('Release players'));
    fireEvent.click(screen.getByLabelText('Release Yogi Berra'));
    expect(onRelease).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Confirm release Yogi Berra'));
    expect(onRelease).toHaveBeenCalledWith(1);
  });

  it('shows the server error message', () => {
    render(
      <RosterOverLimitBanner
        rosterSize={27}
        maxRosterSize={26}
        playersToRelease={1}
        players={PLAYERS}
        onRelease={jest.fn()}
        errorMessage="That player is not on your roster"
      />,
    );
    expect(screen.getByText('That player is not on your roster')).toBeTruthy();
  });
});

describe('RosterOverLimitNotice (LS-10477)', () => {
  beforeEach(() => {
    mockReleasePlayer.mockReset();
  });

  const overLimitData = {
    team: {
      id: 7,
      rosterLimitStatus: {
        rosterSize: 27,
        maxRosterSize: 26,
        isOverLimit: true,
        playersToRelease: 1,
      },
    },
  };

  it('renders nothing when the team is at or under the limit', () => {
    mockRosterLimitData = {
      ...overLimitData,
      team: {
        ...overLimitData.team,
        rosterLimitStatus: {
          rosterSize: 26,
          maxRosterSize: 26,
          isOverLimit: false,
          playersToRelease: 0,
        },
      },
    };
    render(<RosterOverLimitNotice leagueId={3} teamId={7} />);
    expect(screen.queryByTestId('roster-over-limit-banner')).toBeNull();
  });

  it('releases the confirmed player through the releasePlayer mutation', async () => {
    mockRosterLimitData = overLimitData;
    mockReleasePlayer.mockResolvedValue({});
    render(<RosterOverLimitNotice leagueId={3} teamId={7} />);

    fireEvent.click(screen.getByText('Release players'));
    fireEvent.click(screen.getByLabelText('Release Yogi Berra'));
    fireEvent.click(screen.getByLabelText('Confirm release Yogi Berra'));

    await waitFor(() =>
      expect(mockReleasePlayer).toHaveBeenCalledWith({
        variables: { leagueId: 3, playerId: 1 },
      }),
    );
  });

  function releaseYogi() {
    fireEvent.click(screen.getByText('Release players'));
    fireEvent.click(screen.getByLabelText('Release Yogi Berra'));
    fireEvent.click(screen.getByLabelText('Confirm release Yogi Berra'));
  }

  it('surfaces the server message when the release is rejected', async () => {
    mockRosterLimitData = overLimitData;
    mockReleasePlayer.mockRejectedValue(
      new CombinedGraphQLErrors({
        errors: [{ message: 'That player is not on your roster' }],
      }),
    );
    render(<RosterOverLimitNotice leagueId={3} teamId={7} />);
    releaseYogi();

    expect(
      await screen.findByText('That player is not on your roster'),
    ).toBeTruthy();
  });

  it('shows a generic message for a non-GraphQL failure', async () => {
    mockRosterLimitData = overLimitData;
    mockReleasePlayer.mockRejectedValue(new Error('Failed to fetch'));
    render(<RosterOverLimitNotice leagueId={3} teamId={7} />);
    releaseYogi();

    expect(
      await screen.findByText(
        'Could not release that player. Please try again.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
  });
});
