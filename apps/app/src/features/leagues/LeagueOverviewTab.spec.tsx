import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';
import { Sport } from '@legacy-sports/graphql';
import { LeagueOverviewTab } from './LeagueOverviewTab';

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Baseball: 'baseball', Football: 'football' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('@legacy-sports/shared-components', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    LeagueActivityFeed: () => <View testID="league-activity-feed" />,
    LeagueScoringSummary: () => <View testID="league-scoring-summary" />,
    OnThisDayFeed: () => <View testID="on-this-day-feed" />,
    PanelCard: ({ children }: { children?: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

jest.mock('../commissioner/LeagueDuesPaymentStatus', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    LeagueDuesPaymentStatus: () => <View testID="league-dues-payment-status" />,
  };
});

jest.mock('tamagui', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  ) as RNComponents;
  return {
    Button: ({
      children,
      onPress,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      [key: string]: unknown;
    }) => <Text onPress={onPress}>{children}</Text>,
    Text: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <Text testID={testID}>{children}</Text>,
    XStack: ({ children }: { children?: React.ReactNode }) => (
      <View>{children}</View>
    ),
    YStack: ({ children }: { children?: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

const BASE_PROPS = {
  league: {
    lmNotes: null,
    maxRosterSize: 25,
    gamesPerMatchup: 5,
    currentWeekNumber: 14,
    inviteCode: 'ABC123',
    sport: Sport.Baseball,
  },
  leagueId: 42,
  isCommissioner: false,
  isDrafting: false,
  rankedStandings: [],
  startersCount: 9,
  inviteCode: 'ABC123',
  onJoinDraft: jest.fn(),
  onViewAllStandings: jest.fn(),
  onInviteShare: jest.fn(),
  onPlayerPress: jest.fn(),
};

const STANDINGS = Array.from({ length: 8 }, (_, i) => ({
  rank: i + 1,
  teamId: i + 1,
  name: `Team ${i + 1}`,
  record: `${8 - i}-${i}`,
  isMine: i === 0,
}));

describe('LeagueOverviewTab', () => {
  it('always renders the activity, dues, and on-this-day panels', () => {
    render(<LeagueOverviewTab {...BASE_PROPS} />);
    expect(screen.getByText('Recent Activity')).toBeTruthy();
    expect(screen.getByTestId('league-activity-feed')).toBeTruthy();
    expect(screen.getByTestId('league-dues-payment-status')).toBeTruthy();
    expect(screen.getByTestId('on-this-day-feed')).toBeTruthy();
  });

  it('does not render the Draft Is Live banner when a draft is not in progress', () => {
    render(<LeagueOverviewTab {...BASE_PROPS} />);
    expect(screen.queryByText('Draft Is Live')).toBeNull();
  });

  it('renders the Draft Is Live banner and fires onJoinDraft', () => {
    const onJoinDraft = jest.fn();
    render(
      <LeagueOverviewTab
        {...BASE_PROPS}
        isDrafting
        onJoinDraft={onJoinDraft}
      />,
    );
    expect(screen.getByText('Draft Is Live')).toBeTruthy();
    fireEvent.press(screen.getByText('Join Draft'));
    expect(onJoinDraft).toHaveBeenCalledTimes(1);
  });

  it('renders a "Draft Paused" banner with a re-entry action when isPaused is true (LS-8843)', () => {
    const onJoinDraft = jest.fn();
    render(
      <LeagueOverviewTab
        {...BASE_PROPS}
        isDrafting
        isPaused
        onJoinDraft={onJoinDraft}
      />,
    );
    expect(screen.getByText('Draft Paused')).toBeTruthy();
    expect(screen.queryByText('Draft Is Live')).toBeNull();
    fireEvent.press(screen.getByText('Return to Draft Room'));
    expect(onJoinDraft).toHaveBeenCalledTimes(1);
  });

  it('renders the commissioner announcement banner when lmNotes is set', () => {
    render(
      <LeagueOverviewTab
        {...BASE_PROPS}
        league={{ ...BASE_PROPS.league, lmNotes: 'Trade deadline is Week 12.' }}
      />,
    );
    expect(screen.getByText('Commissioner Announcement')).toBeTruthy();
    expect(screen.getByText('Trade deadline is Week 12.')).toBeTruthy();
  });

  it('renders baseball-specific snapshot stat labels', () => {
    render(<LeagueOverviewTab {...BASE_PROPS} />);
    expect(screen.getByText('Games / Matchup')).toBeTruthy();
    expect(screen.getByText('Matchup')).toBeTruthy();
  });

  it('renders football-specific snapshot stat labels', () => {
    render(
      <LeagueOverviewTab
        {...BASE_PROPS}
        league={{ ...BASE_PROPS.league, sport: Sport.Football }}
      />,
    );
    expect(screen.getByText('Weeks / Season')).toBeTruthy();
    expect(screen.getByText('Format')).toBeTruthy();
    expect(screen.getByText('H2H')).toBeTruthy();
  });

  it('omits the Standings section when there are no ranked standings', () => {
    render(<LeagueOverviewTab {...BASE_PROPS} rankedStandings={[]} />);
    expect(screen.queryByText('Standings')).toBeNull();
  });

  it('renders the Standings section, top 6 rows, and the "+N more" overflow row', () => {
    const onViewAllStandings = jest.fn();
    render(
      <LeagueOverviewTab
        {...BASE_PROPS}
        rankedStandings={STANDINGS}
        onViewAllStandings={onViewAllStandings}
      />,
    );
    expect(screen.getByText('Standings')).toBeTruthy();
    expect(screen.getByText('Top 6 · Week 14')).toBeTruthy();
    expect(screen.getByText('Team 1')).toBeTruthy();
    expect(screen.getByText('Team 6')).toBeTruthy();
    expect(screen.queryByText('Team 7')).toBeNull();
    expect(screen.getByText('+ 2 more teams')).toBeTruthy();

    fireEvent.press(screen.getByText('View All →'));
    expect(onViewAllStandings).toHaveBeenCalledTimes(1);
  });

  it('omits the Scoring Rules section when no scoring settings are provided', () => {
    render(<LeagueOverviewTab {...BASE_PROPS} />);
    expect(screen.queryByText('Scoring Rules')).toBeNull();
    expect(screen.queryByTestId('league-scoring-summary')).toBeNull();
  });

  it('renders the Scoring Rules section when scoring settings are provided', () => {
    render(
      <LeagueOverviewTab
        {...BASE_PROPS}
        scoringSettings={{} as never}
        scoringProfileName="Standard 5x5"
      />,
    );
    expect(screen.getByText('Scoring Rules')).toBeTruthy();
    expect(screen.getByTestId('league-scoring-summary')).toBeTruthy();
  });

  it('omits the Invite Friends section for non-commissioners', () => {
    render(<LeagueOverviewTab {...BASE_PROPS} isCommissioner={false} />);
    expect(screen.queryByText('Invite Friends')).toBeNull();
  });

  it('renders the Invite Friends section with the invite code for commissioners and fires onInviteShare', () => {
    const onInviteShare = jest.fn();
    render(
      <LeagueOverviewTab
        {...BASE_PROPS}
        isCommissioner
        onInviteShare={onInviteShare}
      />,
    );
    expect(screen.getByText('Invite Friends')).toBeTruthy();
    expect(screen.getByText('ABC123')).toBeTruthy();

    fireEvent.press(screen.getByText('Share'));
    expect(onInviteShare).toHaveBeenCalledTimes(1);
  });
});
