import React from 'react';
import { render, screen } from '@testing-library/react-native';

import LeagueDiscoveryScreen from './league-discovery';

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockPublicLeagues: unknown[] = [];

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn() }),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetPublicLeaguesQuery: () => ({
    data: { publicLeagues: mockPublicLeagues },
    loading: false,
    error: undefined,
    refetch: jest.fn(),
  }),
  useJoinPublicLeagueMutation: () => [jest.fn(), { loading: false }],
}));

// formatDraftStatusForBadge is exercised for real via the lightweight
// '@legacy-sports/shared-components/utils' entry point (LS-8635) — no mock,
// so this test verifies the actual integration with the shared mapping.

jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../__test-utils__/tamagui-mocks')
  >('../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

describe('LeagueDiscoveryScreen — Browse Leagues (LS-8635)', () => {
  beforeEach(() => {
    mockPublicLeagues = [];
  });

  it('shows a humanized label for a pre-draft league instead of the raw enum value', () => {
    mockPublicLeagues = [
      {
        id: 1,
        name: 'Legacy League',
        maxRosterSize: 25,
        draftStatus: 'not-started',
        isFull: false,
        availableSpots: 4,
      },
    ];
    render(<LeagueDiscoveryScreen />);

    expect(screen.getByText('Draft Scheduled')).toBeTruthy();
    expect(screen.queryByText('not-started')).toBeNull();
  });

  it('shows a humanized label for an in-progress draft', () => {
    mockPublicLeagues = [
      {
        id: 2,
        name: 'Drafting League',
        maxRosterSize: 25,
        draftStatus: 'in-progress',
        isFull: false,
        availableSpots: 0,
      },
    ];
    render(<LeagueDiscoveryScreen />);

    expect(screen.getByText('Drafting')).toBeTruthy();
  });

  it('falls back to "Open" when the league has no draft status', () => {
    mockPublicLeagues = [
      {
        id: 3,
        name: 'Open League',
        maxRosterSize: 25,
        draftStatus: null,
        isFull: false,
        availableSpots: 10,
      },
    ];
    render(<LeagueDiscoveryScreen />);

    // Two matches: the "Open" status filter chip and this league's badge.
    expect(screen.getAllByText('Open')).toHaveLength(2);
  });
});
