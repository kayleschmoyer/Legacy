import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import { LeagueRosterManagement } from './LeagueRosterManagement';
import type {
  AppTeamMemberFragment,
  LeaguePositionFragment,
} from '../../api/db/graphql.generated';

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('tamagui', () => {
  const { View, Text: RNText } =
    jest.requireActual<RNComponents>('react-native');
  return {
    ScrollView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    YStack: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    Text: ({ children }: { children: React.ReactNode }) => (
      <RNText>{children}</RNText>
    ),
  };
});

// Lightweight stand-ins for the shared roster components so the wrapper's
// composition (week state, read-only gating, banner gating) is what's tested.
jest.mock('@legacy-sports/shared-components/roster', () => {
  const { View, Text: RNText } =
    jest.requireActual<RNComponents>('react-native');
  return {
    RosterBoard: ({ readOnly }: { readOnly?: boolean }) => (
      <RNText>{`board-readonly-${String(!!readOnly)}`}</RNText>
    ),
    RosterWeekNavigation: ({
      week,
      onWeekChange,
    }: {
      week: number;
      onWeekChange: (w: number) => void;
    }) => (
      <View>
        <RNText>week-nav</RNText>
        <RNText onPress={() => onWeekChange(week - 1)}>go-prev</RNText>
      </View>
    ),
    RosterStatusBanners: ({
      isPast,
      isFuture,
    }: {
      isPast: boolean;
      isFuture: boolean;
    }) => (
      <RNText>{`banner-${isPast ? 'past' : isFuture ? 'future' : 'current'}`}</RNText>
    ),
    PendingTradeOffers: () => <RNText>pending-trades</RNText>,
    PendingWaiverClaims: () => <RNText>pending-waivers</RNText>,
  };
});

// ── Test data ────────────────────────────────────────────────────────────────

const POSITIONS: LeaguePositionFragment[] = [
  { __typename: 'LeaguePosition', id: 1, leagueId: 10, positionType: 'SP' },
];
const PLAYERS: AppTeamMemberFragment[] = [];

const baseProps = {
  positions: POSITIONS,
  teamPlayers: PLAYERS,
  onPlayerAssign: jest.fn(),
  onPlayerRemove: jest.fn(),
  leagueId: 10,
  myTeamId: 50,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LeagueRosterManagement', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the board, week nav, and pending banners on the current week', () => {
    render(
      <LeagueRosterManagement {...baseProps} currentWeek={3} totalWeeks={10} />,
    );
    expect(screen.getByText('week-nav')).toBeTruthy();
    expect(screen.getByText('banner-current')).toBeTruthy();
    expect(screen.getByText('pending-trades')).toBeTruthy();
    expect(screen.getByText('pending-waivers')).toBeTruthy();
    expect(screen.getByText('board-readonly-false')).toBeTruthy();
  });

  it('hides week navigation when no current week is provided', () => {
    render(<LeagueRosterManagement {...baseProps} />);
    expect(screen.queryByText('week-nav')).toBeNull();
  });

  it('makes the board read-only and shows the historical banner on past weeks', () => {
    render(
      <LeagueRosterManagement {...baseProps} currentWeek={3} totalWeeks={10} />,
    );
    // Step back from the current week (3 → 2): a finalized past week.
    fireEvent.press(screen.getByText('go-prev'));
    expect(screen.getByText('banner-past')).toBeTruthy();
    expect(screen.getByText('board-readonly-true')).toBeTruthy();
    // Pending banners only show on the current week.
    expect(screen.queryByText('pending-trades')).toBeNull();
  });
});
