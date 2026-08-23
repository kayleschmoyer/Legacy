import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import type { AppLeagueFragment } from '@legacy-sports/graphql';
import { CommissionerScreen } from './CommissionerScreen';

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

// LS-9423: deep icon imports resolve through moduleNameMapper to the
// '@tamagui/lucide-icons' barrel, so mock that specifier, not the deep path.
jest.mock('@tamagui/lucide-icons', () => ({
  ChevronDown: () => null,
  ChevronUp: () => null,
}));

jest.mock('@legacy-sports/shared-components/commissioner', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    createTokens: (tokens: unknown) => tokens,
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
    RosterRequirementsControl: () => (
      <View testID="roster-requirements-control" />
    ),
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

const mockLeagueScoringEditor = jest.fn<void, [Record<string, unknown>]>();
jest.mock('../scoring/LeagueScoringEditor', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    LeagueScoringEditor: (props: Record<string, unknown>) => {
      mockLeagueScoringEditor(props);
      return <View testID="league-scoring-editor" />;
    },
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

const mockUseHasEntitlement = jest.fn(() => false);
jest.mock('../subscription/useSubscription', () => ({
  useHasEntitlement: (key: string) => mockUseHasEntitlement(key),
}));

jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Baseball: 'baseball', Football: 'football' },
}));

jest.mock('@legacy-sports/utils', () => ({
  ENTITLEMENTS: { custom_scoring_multipliers: 'custom_scoring_multipliers' },
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

/** Opens an accordion section by tapping its header (LS-6306: sections other
 * than "Next Step" start collapsed and must be opened to render content). */
function openSection(id: string) {
  fireEvent.press(screen.getByTestId(`commissioner-accordion-header-${id}`));
}

describe('CommissionerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('baseball league', () => {
    it('renders commissioner settings heading', () => {
      render(
        <CommissionerScreen
          leagueId={1}
          league={mockBaseballLeague as unknown as AppLeagueFragment}
          onLeagueDeleted={mockOnLeagueDeleted}
        />,
      );
      expect(screen.getByText('Commissioner Settings')).toBeTruthy();
    });

    it('opens the Next Step section by default and keeps others collapsed', () => {
      render(
        <CommissionerScreen
          leagueId={1}
          league={mockBaseballLeague as unknown as AppLeagueFragment}
          onLeagueDeleted={mockOnLeagueDeleted}
        />,
      );
      expect(screen.getByTestId('next-step-control')).toBeTruthy();
      expect(screen.queryByTestId('league-settings-control')).toBeNull();
      expect(screen.queryByTestId('draft-settings-control')).toBeNull();
      expect(screen.queryByTestId('delete-league-control')).toBeNull();
      expect(screen.queryByTestId('commissioner-audit-log')).toBeNull();
    });

    it('renders DraftSettingsControl for baseball once Draft Settings is opened', () => {
      render(
        <CommissionerScreen
          leagueId={1}
          league={mockBaseballLeague as unknown as AppLeagueFragment}
          onLeagueDeleted={mockOnLeagueDeleted}
        />,
      );
      openSection('draft-settings');
      expect(screen.getByTestId('draft-settings-control')).toBeTruthy();
    });

    it('renders every core commissioner control once its section is opened', () => {
      render(
        <CommissionerScreen
          leagueId={1}
          league={mockBaseballLeague as unknown as AppLeagueFragment}
          onLeagueDeleted={mockOnLeagueDeleted}
        />,
      );
      // 'next-step' is open by default.
      expect(screen.getByTestId('next-step-control')).toBeTruthy();

      openSection('league-settings');
      expect(screen.getByTestId('league-settings-control')).toBeTruthy();

      openSection('draft-order');
      expect(screen.getByTestId('draft-order-control')).toBeTruthy();

      openSection('league-branding');
      expect(screen.getByTestId('league-branding-control')).toBeTruthy();

      openSection('league-dues');
      expect(screen.getByTestId('league-dues-setup')).toBeTruthy();

      openSection('season-awards');
      expect(screen.getByTestId('season-awards-control')).toBeTruthy();

      openSection('scoring');
      expect(screen.getByTestId('league-scoring-editor')).toBeTruthy();

      openSection('achievement-restrictions');
      expect(
        screen.getByTestId('achievement-restrictions-control'),
      ).toBeTruthy();

      openSection('waiver-processing');
      expect(screen.getByTestId('waiver-process-control')).toBeTruthy();

      openSection('danger-zone');
      expect(screen.getByTestId('delete-league-control')).toBeTruthy();

      openSection('audit-log');
      expect(screen.getByTestId('commissioner-audit-log')).toBeTruthy();
    });

    it('only keeps one section open at a time', () => {
      render(
        <CommissionerScreen
          leagueId={1}
          league={mockBaseballLeague as unknown as AppLeagueFragment}
          onLeagueDeleted={mockOnLeagueDeleted}
        />,
      );
      openSection('league-settings');
      expect(screen.getByTestId('league-settings-control')).toBeTruthy();
      expect(screen.queryByTestId('next-step-control')).toBeNull();
    });
  });

  describe('football league', () => {
    it('does not render DraftSettingsControl for football', () => {
      render(
        <CommissionerScreen
          leagueId={1}
          league={mockFootballLeague as unknown as AppLeagueFragment}
          onLeagueDeleted={mockOnLeagueDeleted}
        />,
      );
      expect(
        screen.queryByTestId('commissioner-accordion-header-draft-settings'),
      ).toBeNull();
    });

    it('renders RosterRequirementsControl for football (LS-9099)', () => {
      render(
        <CommissionerScreen
          leagueId={1}
          league={mockFootballLeague as unknown as AppLeagueFragment}
          onLeagueDeleted={mockOnLeagueDeleted}
        />,
      );
      openSection('roster-requirements');
      expect(screen.getByTestId('roster-requirements-control')).toBeTruthy();
    });

    it('does not render a Roster Requirements section for baseball', () => {
      render(
        <CommissionerScreen
          leagueId={1}
          league={mockBaseballLeague as unknown as AppLeagueFragment}
          onLeagueDeleted={mockOnLeagueDeleted}
        />,
      );
      expect(
        screen.queryByTestId(
          'commissioner-accordion-header-roster-requirements',
        ),
      ).toBeNull();
    });

    it('renders core commissioner controls for football once opened', () => {
      render(
        <CommissionerScreen
          leagueId={1}
          league={mockFootballLeague as unknown as AppLeagueFragment}
          onLeagueDeleted={mockOnLeagueDeleted}
        />,
      );
      expect(screen.getByTestId('next-step-control')).toBeTruthy();

      openSection('league-settings');
      expect(screen.getByTestId('league-settings-control')).toBeTruthy();

      openSection('danger-zone');
      expect(screen.getByTestId('delete-league-control')).toBeTruthy();

      openSection('audit-log');
      expect(screen.getByTestId('commissioner-audit-log')).toBeTruthy();
    });

    it('forwards sport, defensiveFormat, isPremium, and onUpgrade to LeagueScoringEditor', () => {
      mockUseHasEntitlement.mockReturnValue(true);

      render(
        <CommissionerScreen
          leagueId={1}
          league={
            {
              ...mockFootballLeague,
              defensiveFormat: 'idp',
            } as unknown as AppLeagueFragment
          }
          onLeagueDeleted={mockOnLeagueDeleted}
        />,
      );
      openSection('scoring');

      expect(mockUseHasEntitlement).toHaveBeenCalledWith(
        'custom_scoring_multipliers',
      );
      expect(mockLeagueScoringEditor).toHaveBeenCalledWith(
        expect.objectContaining({
          sport: 'football',
          defensiveFormat: 'idp',
          isPremium: true,
        }),
      );
      const forwardedProps = mockLeagueScoringEditor.mock.calls[0]?.[0];
      expect(typeof forwardedProps?.onUpgrade).toBe('function');
    });
  });
});
