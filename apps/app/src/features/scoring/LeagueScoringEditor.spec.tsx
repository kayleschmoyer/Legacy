import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';
import { Alert } from 'react-native';

// ── Component under test ─────────────────────────────────────────────────────
import * as scoringLib from '@legacy-sports/scoring';
import { LeagueScoringEditor } from './LeagueScoringEditor';

// ── Typed module imports for jest.mocked() ───────────────────────────────────
import * as graphqlLib from '../../api/db/graphql.generated';

// ── Mock type helpers ────────────────────────────────────────────────────────
type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock react-native Alert and LayoutAnimation
jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
jest.mock('react-native/Libraries/LayoutAnimation/LayoutAnimation', () => ({
  configureNext: jest.fn(),
  Presets: { easeInEaseOut: {} },
}));

// Mock @legacy-sports/scoring
const mockStat1 = {
  id: 1,
  displayName: 'Singles',
  group: 'batting',
  multiplier: 1.0,
  defaultMultiplier: 1.0,
  leagueMultiplier: null,
};
const mockStat2 = {
  id: 2,
  displayName: 'Home Runs',
  group: 'batting',
  multiplier: 4.0,
  defaultMultiplier: 4.0,
  leagueMultiplier: 5.0, // overridden
};
const mockStat3 = {
  id: 3,
  displayName: 'Strikeouts',
  group: 'pitching',
  multiplier: 2.0,
  defaultMultiplier: 2.0,
  leagueMultiplier: null,
};

const mockStats = [mockStat1, mockStat2, mockStat3];

const mockGroupedStats = {
  batting: [mockStat1, mockStat2],
  pitching: [mockStat3],
};

const mockFormValues = { 1: '1.00', 2: '5.00', 3: '2.00' };

jest.mock('@legacy-sports/scoring', () => ({
  collectProfileStats: jest.fn(() => mockStats),
  groupStatsByGroup: jest.fn(() => mockGroupedStats),
  createInitialValues: jest.fn(() => ({ 1: '1.00', 2: '5.00', 3: '2.00' })),
  createInitialErrors: jest.fn(() => ({ 1: null, 2: null, 3: null })),
  formatMultiplier: jest.fn((v: number) => v.toFixed(2)),
  validateStat: jest.fn(() => null),
  valuesToUpdates: jest.fn(() => []),
  isStatDirty: jest.fn(() => false),
  isStatOverridden: jest.fn(
    (stat: { leagueMultiplier: number | null }) =>
      stat.leagueMultiplier !== null,
  ),
  SCORING_GROUP_ORDER: ['batting', 'pitching'],
  SCORING_GROUP_COPY: {
    batting: {
      title: 'Batting',
      description: 'Offensive stats',
      accent: '#3B82F6',
    },
    pitching: {
      title: 'Pitching',
      description: 'Pitching stats',
      accent: '#EF4444',
    },
  },
}));

// Mock the mutation
const mockUpdateScoring = jest.fn().mockResolvedValue({});
jest.mock('../../api/db/graphql.generated', () => ({
  useUpdateLeagueScoringProfileMutation: jest.fn(() => [
    mockUpdateScoring,
    { loading: false },
  ]),
}));

// Mock tamagui
jest.mock('tamagui', () => {
  const { View, Text, TextInput } = jest.requireActual<
    typeof import('react-native')
  >('react-native') as RNComponents & {
    TextInput: React.ComponentType<{
      value?: string;
      onChangeText?: (text: string) => void;
      testID?: string;
    }>;
  };
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    Button: ({
      children,
      onPress,
      disabled,
      testID,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      testID?: string;
      [key: string]: unknown;
    }) => (
      <Text testID={testID} onPress={disabled ? undefined : onPress}>
        {children}
      </Text>
    ),
    Card: ({
      children,
      testID,
    }: {
      children: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <View testID={testID}>{children}</View>,
    H4: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    Input: ({
      value,
      onChangeText,
      testID,
    }: {
      value?: string;
      onChangeText?: (text: string) => void;
      testID?: string;
      [key: string]: unknown;
    }) => (
      <TextInput value={value} onChangeText={onChangeText} testID={testID} />
    ),
    ScrollView: ({
      children,
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <View>{children}</View>,
    Separator: () => <View testID="separator" />,
    Spinner: ({
      testID,
    }: {
      testID?: string;
      size?: string;
      color?: string;
    }) => <View testID={testID ?? 'spinner'} />,
    Text: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <Text testID={testID}>{children}</Text>,
    XStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <View testID={testID}>{children}</View>,
    YStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <View testID={testID}>{children}</View>,
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockProfile = { id: 1, leagueId: 42 } as Parameters<
  typeof LeagueScoringEditor
>[0]['profile'];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LeagueScoringEditor', () => {
  const defaultProps = {
    leagueId: 42,
    profile: mockProfile,
    loading: false,
    error: null,
    onRefetch: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(graphqlLib.useUpdateLeagueScoringProfileMutation)
      .mockReturnValue([mockUpdateScoring, { loading: false }] as ReturnType<
        typeof graphqlLib.useUpdateLeagueScoringProfileMutation
      >);
    jest.mocked(scoringLib.valuesToUpdates).mockReturnValue([]);
    jest.mocked(scoringLib.collectProfileStats).mockReturnValue(mockStats);
    jest.mocked(scoringLib.groupStatsByGroup).mockReturnValue(mockGroupedStats);
    jest.mocked(scoringLib.createInitialValues).mockReturnValue(mockFormValues);
    jest
      .mocked(scoringLib.createInitialErrors)
      .mockReturnValue({ 1: null, 2: null, 3: null });
  });

  describe('loading state', () => {
    it('shows spinner when loading', () => {
      render(<LeagueScoringEditor {...defaultProps} loading={true} />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });

    it('shows loading text when loading', () => {
      render(<LeagueScoringEditor {...defaultProps} loading={true} />);
      expect(screen.getByText('Loading scoring profile…')).toBeTruthy();
    });
  });

  describe('error state', () => {
    it('shows error message when error is provided', () => {
      render(
        <LeagueScoringEditor
          {...defaultProps}
          error={new Error('Failed to fetch')}
        />,
      );
      expect(
        screen.getByText(/Failed to load scoring profile: Failed to fetch/),
      ).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no stats are available', () => {
      jest.mocked(scoringLib.collectProfileStats).mockReturnValue([]);
      jest.mocked(scoringLib.groupStatsByGroup).mockReturnValue({});

      render(<LeagueScoringEditor {...defaultProps} />);
      expect(
        screen.getByText('No scoring stats are available yet for this league.'),
      ).toBeTruthy();
    });
  });

  describe('normal rendering', () => {
    it('renders the Scoring Settings header', () => {
      render(<LeagueScoringEditor {...defaultProps} />);
      expect(screen.getByText('Scoring Settings')).toBeTruthy();
    });

    it('renders group titles from SCORING_GROUP_COPY', () => {
      render(<LeagueScoringEditor {...defaultProps} />);
      expect(screen.getByText('Batting')).toBeTruthy();
      expect(screen.getByText('Pitching')).toBeTruthy();
    });

    it('renders stat display names', () => {
      render(<LeagueScoringEditor {...defaultProps} />);
      expect(screen.getByText('Singles')).toBeTruthy();
      expect(screen.getByText('Home Runs')).toBeTruthy();
      expect(screen.getByText('Strikeouts')).toBeTruthy();
    });

    it('renders Save and Reset All buttons', () => {
      render(<LeagueScoringEditor {...defaultProps} />);
      expect(screen.getByText('Reset All')).toBeTruthy();
      expect(screen.getByText('Save')).toBeTruthy();
    });
  });

  describe('unsaved changes', () => {
    it('shows unsaved changes badge when there are pending updates', () => {
      jest
        .mocked(scoringLib.valuesToUpdates)
        .mockReturnValue([{ id: 1, multiplier: 2.0 }]);

      render(<LeagueScoringEditor {...defaultProps} />);
      expect(screen.getByText(/1 unsaved change$/)).toBeTruthy();
    });

    it('uses plural form for multiple unsaved changes', () => {
      jest.mocked(scoringLib.valuesToUpdates).mockReturnValue([
        { id: 1, multiplier: 2.0 },
        { id: 2, multiplier: 3.0 },
      ]);

      render(<LeagueScoringEditor {...defaultProps} />);
      expect(screen.getByText(/2 unsaved changes/)).toBeTruthy();
    });
  });

  describe('save action', () => {
    it('calls mutation on save when there are pending updates', async () => {
      jest
        .mocked(scoringLib.valuesToUpdates)
        .mockReturnValue([{ id: 1, multiplier: 2.0 }]);

      render(<LeagueScoringEditor {...defaultProps} />);

      fireEvent.press(screen.getByText('Save (1)'));

      await waitFor(() => {
        expect(mockUpdateScoring).toHaveBeenCalledWith({
          variables: {
            leagueId: 42,
            updates: [{ id: 1, multiplier: 2.0 }],
          },
        });
      });
    });

    it('calls onRefetch after successful save', async () => {
      jest
        .mocked(scoringLib.valuesToUpdates)
        .mockReturnValue([{ id: 1, multiplier: 2.0 }]);

      render(<LeagueScoringEditor {...defaultProps} />);
      fireEvent.press(screen.getByText('Save (1)'));

      await waitFor(() => {
        expect(defaultProps.onRefetch).toHaveBeenCalled();
      });
    });

    it('shows Alert on successful save', async () => {
      jest
        .mocked(scoringLib.valuesToUpdates)
        .mockReturnValue([{ id: 1, multiplier: 2.0 }]);

      render(<LeagueScoringEditor {...defaultProps} />);
      fireEvent.press(screen.getByText('Save (1)'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Success',
          'Scoring settings have been updated.',
        );
      });
    });

    it('shows save error when mutation fails', async () => {
      mockUpdateScoring.mockRejectedValueOnce(new Error('Network error'));
      jest
        .mocked(scoringLib.valuesToUpdates)
        .mockReturnValue([{ id: 1, multiplier: 2.0 }]);

      render(<LeagueScoringEditor {...defaultProps} />);
      fireEvent.press(screen.getByText('Save (1)'));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeTruthy();
      });
    });
  });

  describe('validation', () => {
    it('shows validation error message when there are field errors', () => {
      jest
        .mocked(scoringLib.validateStat)
        .mockReturnValue('Value must be a number');
      jest
        .mocked(scoringLib.createInitialErrors)
        .mockReturnValue({ 1: 'Value must be a number', 2: null, 3: null });

      render(<LeagueScoringEditor {...defaultProps} />);
      expect(
        screen.getByText('Fix highlighted fields before saving.'),
      ).toBeTruthy();
    });
  });
});
