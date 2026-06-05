import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import { CommissionerScreen } from './CommissionerScreen';
import type { LeagueFragment } from '../../api/db/graphql.generated';

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../__test-utils__/tamagui-mocks')
  >('../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

jest.mock('@legacy-sports/shared-components/commissioner', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    AchievementRestrictionsControl: () => (
      <View testID="achievement-restrictions-control" />
    ),
    CommissionerAuditLog: () => <View testID="commissioner-audit-log" />,
    CommissionerNoteControl: () => <View testID="commissioner-note-control" />,
    DeleteLeagueControl: () => <View testID="delete-league-control" />,
    DraftOrderControl: () => <View testID="draft-order-control" />,
    DraftSettingsControl: () => <View testID="draft-settings-control" />,
    LeagueBrandingControl: () => <View testID="league-branding-control" />,
    LeagueSettingsControl: () => <View testID="league-settings-control" />,
    NextStepControl: () => <View testID="next-step-control" />,
    SeasonAwardsControl: () => <View testID="season-awards-control" />,
    WaiverProcessControl: () => <View testID="waiver-process-control" />,
  };
});

jest.mock('./LeagueDuesSetup', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    LeagueDuesSetup: () => <View testID="league-dues-setup" />,
  };
});

jest.mock('../scoring/LeagueScoringEditor', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    LeagueScoringEditor: () => <View testID="league-scoring-editor" />,
  };
});

jest.mock('../../common/scoring/LeagueScoringProvider', () => ({
  useLeagueScoringSettings: jest.fn(() => ({
    profile: null,
    loading: false,
    error: undefined,
    refetch: jest.fn(),
  })),
}));

jest.mock('../matchup/hooks/useMatchup', () => ({
  useMatchupsForLeague: jest.fn(() => ({ matchups: [], loading: false })),
  useCurrentWeek: jest.fn(() => ({ currentWeek: null })),
}));

jest.mock('../subscription', () => ({
  useSubscription: jest.fn(() => ({ isPremium: false })),
}));

jest.mock('../../api/db/graphql.generated', () => ({
  Sport: { Baseball: 'baseball', Football: 'football' },
}));

// ── Test data ─────────────────────────────────────────────────────────────────

const mockBaseballLeague = {
  id: 1,
  name: 'Test Baseball League',
  sport: 'baseball',
  draftStatus: 'pre-draft',
  gamesPerMatchup: 7,
  pitcherStartsPerMatchup: 1,
  minCareerGames: 50,
  minCareerSeasons: 3,
  totalMatchups: 10,
  playoffEnabled: true,
  playoffFormat: '4-team',
  playoffMultiWeek: false,
  salaryCapEnabled: false,
  salaryCap: null,
  playerPool: null,
  eraFilter: null,
  baseballHofOnly: null,
  customEraStartYear: null,
  customEraEndYear: null,
  frozenAt: null,
  seasonNumber: 2024,
  logoUrl: null,
  bannerUrl: null,
  primaryColor: null,
  secondaryColor: null,
  lmNotes: '',
};

const mockFootballLeague = {
  ...mockBaseballLeague,
  name: 'Test Football League',
  sport: 'football',
};

const mockOnLeagueDeleted = jest.fn();

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CommissionerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('baseball league', () => {
    it('renders commissioner settings heading', () => {
      render(
        <CommissionerScreen
          leagueId={1}
          league={mockBaseballLeague as unknown as LeagueFragment}
          onLeagueDeleted={mockOnLeagueDeleted}
        />,
      );
      expect(screen.getByText('Commissioner Settings')).toBeTruthy();
    });

    it('renders DraftSettingsControl for baseball', () => {
      render(
        <CommissionerScreen
          leagueId={1}
          league={mockBaseballLeague as unknown as LeagueFragment}
          onLeagueDeleted={mockOnLeagueDeleted}
        />,
      );
      expect(screen.getByTestId('draft-settings-control')).toBeTruthy();
    });

    it('renders core commissioner controls', () => {
      render(
        <CommissionerScreen
          leagueId={1}
          league={mockBaseballLeague as unknown as LeagueFragment}
          onLeagueDeleted={mockOnLeagueDeleted}
        />,
      );
      expect(screen.getByTestId('next-step-control')).toBeTruthy();
      expect(screen.getByTestId('league-settings-control')).toBeTruthy();
      expect(screen.getByTestId('draft-order-control')).toBeTruthy();
      expect(screen.getByTestId('league-branding-control')).toBeTruthy();
      expect(screen.getByTestId('league-dues-setup')).toBeTruthy();
      expect(screen.getByTestId('season-awards-control')).toBeTruthy();
      expect(screen.getByTestId('league-scoring-editor')).toBeTruthy();
      expect(
        screen.getByTestId('achievement-restrictions-control'),
      ).toBeTruthy();
      expect(screen.getByTestId('waiver-process-control')).toBeTruthy();
      expect(screen.getByTestId('delete-league-control')).toBeTruthy();
      expect(screen.getByTestId('commissioner-audit-log')).toBeTruthy();
    });
  });

  describe('football league', () => {
    it('does not render DraftSettingsControl for football', () => {
      render(
        <CommissionerScreen
          leagueId={1}
          league={mockFootballLeague as unknown as LeagueFragment}
          onLeagueDeleted={mockOnLeagueDeleted}
        />,
      );
      expect(screen.queryByTestId('draft-settings-control')).toBeNull();
    });

    it('renders core commissioner controls for football', () => {
      render(
        <CommissionerScreen
          leagueId={1}
          league={mockFootballLeague as unknown as LeagueFragment}
          onLeagueDeleted={mockOnLeagueDeleted}
        />,
      );
      expect(screen.getByTestId('next-step-control')).toBeTruthy();
      expect(screen.getByTestId('league-settings-control')).toBeTruthy();
      expect(screen.getByTestId('delete-league-control')).toBeTruthy();
      expect(screen.getByTestId('commissioner-audit-log')).toBeTruthy();
    });
  });
});
