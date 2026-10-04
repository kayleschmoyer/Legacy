/**
 * JoinByCodeScreen (LS-10078): one code box for both invite kinds. The
 * preview decides which join mutation runs and where the user lands.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  JoinLeagueByCode,
  JoinMockDraft,
  ResolveInviteCode,
} from '@legacy-sports/graphql';
import { JoinByCodeScreen } from './JoinByCodeScreen';
import { MockedProvider } from '../../test-utils/MockedProvider';

type Mocks = Parameters<typeof MockedProvider>[0]['mocks'];

const mockPreview = {
  __typename: 'MockDraftInvitePreview' as const,
  code: 'MOCK2345',
  draftId: 77,
  sport: 'baseball',
  hostUsername: 'HostHarry',
  playerPool: 'nl',
  filledSeats: 1,
  totalSeats: 4,
  openSeats: 2,
  pickTimeLimitSeconds: 60,
  rounds: 25,
  lobbyExpiresAt: '2099-01-01T00:00:00.000Z',
  isJoinable: true,
  isAlreadySeated: false,
};

const leaguePreview = {
  __typename: 'LeagueInvitePreview' as const,
  code: 'LEAG2345',
  leagueId: 55,
  sport: 'football',
  name: 'Sandlot Legends',
  totalTeams: 8,
  openTeams: 3,
  draftScheduledAt: null,
  isAlreadyMember: false,
};

function resolveMock(code: string, preview: unknown): Mocks[number] {
  return {
    request: { query: ResolveInviteCode, variables: { code } },
    result: { data: { resolveInviteCode: preview } },
  };
}

function renderScreen(mocks: Mocks, initialCode: string) {
  const onJoined = jest.fn();
  render(
    <MockedProvider mocks={mocks}>
      <JoinByCodeScreen
        initialCode={initialCode}
        onJoined={onJoined}
        onCancel={jest.fn()}
      />
    </MockedProvider>,
  );
  return { onJoined };
}

describe('JoinByCodeScreen', () => {
  it('previews a mock-draft code and joins it with joinMockDraft', async () => {
    const { onJoined } = renderScreen(
      [
        resolveMock('MOCK2345', mockPreview),
        {
          request: {
            query: JoinMockDraft,
            variables: { inviteCode: 'MOCK2345', teamName: 'Dodgers' },
          },
          result: {
            data: {
              joinMockDraft: {
                __typename: 'JoinMockDraftResult',
                draftId: 77,
                seatId: 3,
                sport: 'baseball',
              },
            },
          },
        },
      ],
      'mock2345',
    );

    const preview = await screen.findByTestId('join-preview-mock');
    expect(preview.textContent).toContain("HostHarry's mock draft");
    expect(preview.textContent).toContain('1 of 4 filled · 2 open');
    expect(preview.textContent).toContain('NL');

    fireEvent.change(screen.getByLabelText('Team name'), {
      target: { value: 'Dodgers' },
    });
    fireEvent.click(screen.getByTestId('join-submit'));

    await waitFor(() =>
      expect(onJoined).toHaveBeenCalledWith({
        kind: 'mock',
        draftId: 77,
        sport: 'baseball',
      }),
    );
  });

  it('previews a league code and joins it with joinLeagueByCode', async () => {
    const { onJoined } = renderScreen(
      [
        resolveMock('LEAG2345', leaguePreview),
        {
          request: {
            query: JoinLeagueByCode,
            variables: { inviteCode: 'LEAG2345', teamName: 'Dodgers' },
          },
          result: {
            data: {
              joinLeagueByCode: {
                __typename: 'Team',
                id: 9,
                name: 'Dodgers',
                leagueId: 55,
              },
            },
          },
        },
      ],
      'LEAG2345',
    );

    const preview = await screen.findByTestId('join-preview-league');
    expect(preview.textContent).toContain('Sandlot Legends');
    expect(preview.textContent).toContain('3 of 8');

    fireEvent.change(screen.getByLabelText('Team name'), {
      target: { value: 'Dodgers' },
    });
    fireEvent.click(screen.getByTestId('join-submit'));

    await waitFor(() =>
      expect(onJoined).toHaveBeenCalledWith({
        kind: 'league',
        leagueId: 55,
        sport: 'football',
      }),
    );
  });

  it('says so when the code matches nothing', async () => {
    renderScreen([resolveMock('ZZZZ2345', null)], 'ZZZZ2345');
    expect(await screen.findByTestId('join-not-found')).toBeTruthy();
    expect(screen.queryByTestId('join-submit')).toBeNull();
  });

  it('offers no join for a lobby that is full or closed', async () => {
    renderScreen(
      [
        resolveMock('MOCK2345', {
          ...mockPreview,
          openSeats: 0,
          isJoinable: false,
        }),
      ],
      'MOCK2345',
    );
    expect(await screen.findByTestId('join-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('join-submit')).toBeNull();
  });

  it('recognises a lobby the viewer already sits in', async () => {
    renderScreen(
      [resolveMock('MOCK2345', { ...mockPreview, isAlreadySeated: true })],
      'MOCK2345',
    );
    expect(await screen.findByTestId('join-already-in')).toBeTruthy();
    expect(screen.queryByTestId('join-submit')).toBeNull();
  });
});
