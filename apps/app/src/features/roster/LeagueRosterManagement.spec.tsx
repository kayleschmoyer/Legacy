import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import type {
  AppTeamMemberFragment,
  LeaguePositionFragment,
} from '@legacy-sports/graphql';
import { LeagueRosterManagement } from './LeagueRosterManagement';

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('tamagui', () => {
  const { View, Text: RNText } =
    jest.requireActual<RNComponents>('react-native');
  return {
    createTokens: (tokens: unknown) => tokens,
    ScrollView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    YStack: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    XStack: ({ children }: { children: React.ReactNode }) => (
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
    RosterScoreboard: ({
      week,
      onWeekChange,
    }: {
      week: number;
      onWeekChange: (w: number) => void;
    }) => (
      <View>
        <RNText>week-nav</RNText>
        <RNText onPress={() => onWeekChange(week - 1)}>go-prev</RNText>
        <RNText onPress={() => onWeekChange(week + 1)}>go-next</RNText>
      </View>
    ),
    RosterActionBar: () => <RNText>action-bar</RNText>,
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
    OtherTeamViewingBanner: ({
      teamName,
      onBackToMyRoster,
    }: {
      teamName: string;
      onBackToMyRoster: () => void;
    }) => (
      <View>
        <RNText>{`viewing-${teamName}`}</RNText>
        <RNText onPress={onBackToMyRoster}>back-to-my-roster</RNText>
      </View>
    ),
  };
});

// The wrapper fetches the viewed week's matchup scoreline itself (LS-9355);
// stub the generated hook so no ApolloProvider is needed here.
jest.mock('@legacy-sports/graphql', () => ({
  useGetMatchupsByWeekQuery: jest.fn(() => ({ data: undefined })),
}));

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
    expect(screen.getByText('action-bar')).toBeTruthy();
  });

  it('hides week navigation when no current week is provided', () => {
    render(<LeagueRosterManagement {...baseProps} />);
    expect(screen.queryByText('week-nav')).toBeNull();
  });

  it('keeps the board editable and shows the upcoming-week banner on future weeks (LS-9768)', () => {
    render(
      <LeagueRosterManagement {...baseProps} currentWeek={3} totalWeeks={10} />,
    );
    // Advance from current week (3 → 4): a future week.
    fireEvent.press(screen.getByText('go-next'));
    expect(screen.getByText('banner-future')).toBeTruthy();
    // Future weeks are editable — only a finalized past week is read-only.
    expect(screen.getByText('board-readonly-false')).toBeTruthy();
    // Pending banners and the action bar only show on the current week.
    expect(screen.queryByText('pending-trades')).toBeNull();
    expect(screen.queryByText('action-bar')).toBeNull();
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

  it('shows the other-team-viewing banner, hides week nav/pending banners, and forces the board read-only', () => {
    const onBackToMyRoster = jest.fn();
    render(
      <LeagueRosterManagement
        {...baseProps}
        currentWeek={3}
        totalWeeks={10}
        viewingTeamName="Rival Squad"
        onBackToMyRoster={onBackToMyRoster}
      />,
    );
    expect(screen.getByText('viewing-Rival Squad')).toBeTruthy();
    expect(screen.getByText('board-readonly-true')).toBeTruthy();
    expect(screen.queryByText('week-nav')).toBeNull();
    expect(screen.queryByText('banner-current')).toBeNull();
    expect(screen.queryByText('pending-trades')).toBeNull();
    expect(screen.queryByText('pending-waivers')).toBeNull();
    expect(screen.queryByText('action-bar')).toBeNull();

    fireEvent.press(screen.getByText('back-to-my-roster'));
    expect(onBackToMyRoster).toHaveBeenCalledTimes(1);
  });

  // ── Cap-remaining summary (LS-6338) ────────────────────────────────────────

  it('shows the cap-remaining summary for salary-cap leagues', () => {
    render(
      <LeagueRosterManagement
        {...baseProps}
        salaryCapEnabled
        capSpace={12500}
      />,
    );
    expect(screen.getByText('Cap Remaining')).toBeTruthy();
    expect(screen.getByText('$12,500')).toBeTruthy();
  });

  it('hides the cap-remaining summary for non-cap leagues', () => {
    render(
      <LeagueRosterManagement
        {...baseProps}
        salaryCapEnabled={false}
        capSpace={12500}
      />,
    );
    expect(screen.queryByText('Cap Remaining')).toBeNull();
  });

  it('hides the cap-remaining summary when capSpace is unknown', () => {
    render(<LeagueRosterManagement {...baseProps} salaryCapEnabled />);
    expect(screen.queryByText('Cap Remaining')).toBeNull();
  });
});
