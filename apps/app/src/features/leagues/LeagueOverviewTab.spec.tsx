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
  const { View, Text } = jest.requireActual<RNComponents>('react-native');
  return {
    Chip: ({ label }: { label: string }) => <Text>{label}</Text>,
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

jest.mock('../scoring/LeagueScoringReadOnly', () => {
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    LeagueScoringReadOnly: () => <View testID="league-scoring-read-only" />,
  };
});

jest.mock('tamagui', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  ) as RNComponents;
  return {
    createTokens: (tokens: unknown) => tokens,
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
  isMember: true,
  isDrafting: false,
  isPremium: false,
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
  it('always renders the activity and dues panels', () => {
    render(<LeagueOverviewTab {...BASE_PROPS} />);
    expect(screen.getByText('Recent Activity')).toBeTruthy();
    expect(screen.getByTestId('league-activity-feed')).toBeTruthy();
    expect(screen.getByTestId('league-dues-payment-status')).toBeTruthy();
  });

  it('renders the on-this-day panel for baseball leagues', () => {
    render(<LeagueOverviewTab {...BASE_PROPS} />);
    expect(screen.getByTestId('on-this-day-feed')).toBeTruthy();
  });

  it('omits the on-this-day panel for football leagues — its content is baseball-only, so a tap would route to a mismatched player id (LS-6326)', () => {
    render(
      <LeagueOverviewTab
        {...BASE_PROPS}
        league={{ ...BASE_PROPS.league, sport: Sport.Football }}
      />,
    );
    expect(screen.queryByTestId('on-this-day-feed')).toBeNull();
  });

  it('does not render the dues payment panel for non-member spectators (LS-6325)', () => {
    render(<LeagueOverviewTab {...BASE_PROPS} isMember={false} />);
    expect(screen.queryByTestId('league-dues-payment-status')).toBeNull();
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

  it('fires onTeamPress with the row teamId when a Quick Standings row is pressed (LS-5446)', () => {
    const onTeamPress = jest.fn();
    render(
      <LeagueOverviewTab
        {...BASE_PROPS}
        rankedStandings={STANDINGS}
        onTeamPress={onTeamPress}
      />,
    );
    fireEvent.press(screen.getByTestId('overview-standings-row-1'));
    expect(onTeamPress).toHaveBeenCalledWith(1);
  });

  it('does not make Quick Standings rows pressable when onTeamPress is not provided', () => {
    render(<LeagueOverviewTab {...BASE_PROPS} rankedStandings={STANDINGS} />);
    expect(screen.queryByTestId('overview-standings-row-1')).toBeNull();
    expect(screen.getByText('Team 1')).toBeTruthy();
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

  it('omits the football Scoring Rules section on the baseball screen', () => {
    render(<LeagueOverviewTab {...BASE_PROPS} footballScoringProfile={null} />);
    expect(screen.queryByTestId('league-scoring-read-only')).toBeNull();
  });

  it('renders a read-only Scoring Rules card for football members (LS-6327)', () => {
    render(
      <LeagueOverviewTab
        {...BASE_PROPS}
        league={{ ...BASE_PROPS.league, sport: Sport.Football }}
        isCommissioner={false}
        footballScoringProfile={null}
      />,
    );
    expect(screen.getByText('Scoring Rules')).toBeTruthy();
    expect(screen.getByTestId('league-scoring-read-only')).toBeTruthy();
  });

  it('omits the football Scoring Rules section when no scoring profile prop is passed', () => {
    render(
      <LeagueOverviewTab
        {...BASE_PROPS}
        league={{ ...BASE_PROPS.league, sport: Sport.Football }}
      />,
    );
    expect(screen.queryByTestId('league-scoring-read-only')).toBeNull();
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

  it('omits the Premium Configuration section for a plain league', () => {
    render(<LeagueOverviewTab {...BASE_PROPS} />);
    expect(screen.queryByText('Premium Configuration')).toBeNull();
  });

  it('renders a chip for each active premium feature (LS-6330)', () => {
    render(
      <LeagueOverviewTab
        {...BASE_PROPS}
        league={{
          ...BASE_PROPS.league,
          sport: Sport.Football,
          waiverEnabled: true,
          waiverType: 'faab',
          salaryCapEnabled: true,
          playoffFormat: '6-team',
          defensiveFormat: 'idp',
        }}
      />,
    );
    expect(screen.getByText('Premium Configuration')).toBeTruthy();
    expect(screen.getByText('FAAB')).toBeTruthy();
    expect(screen.getByText('Salary Cap')).toBeTruthy();
    expect(screen.getByText('6-Team Playoff')).toBeTruthy();
    expect(screen.getByText('IDP')).toBeTruthy();
  });

  it('omits the IDP chip for a baseball league (defensiveFormat is football-only)', () => {
    render(
      <LeagueOverviewTab
        {...BASE_PROPS}
        league={{
          ...BASE_PROPS.league,
          sport: Sport.Baseball,
          defensiveFormat: 'idp',
        }}
      />,
    );
    expect(screen.queryByText('Premium Configuration')).toBeNull();
    expect(screen.queryByText('IDP')).toBeNull();
  });

  it('does not render a FAAB chip when waivers are disabled', () => {
    render(
      <LeagueOverviewTab
        {...BASE_PROPS}
        league={{
          ...BASE_PROPS.league,
          waiverEnabled: false,
          waiverType: 'faab',
        }}
      />,
    );
    expect(screen.queryByText('FAAB')).toBeNull();
  });

  describe('Premium Draft Settings indicator (FLD-052 / LS-6304)', () => {
    const idpFootballLeague = {
      ...BASE_PROPS.league,
      sport: Sport.Football,
      defensiveFormat: 'idp',
    };

    it('renders a "Premium Draft Settings" chip on the join-draft banner for a free viewer joining an IDP draft', () => {
      render(
        <LeagueOverviewTab
          {...BASE_PROPS}
          league={idpFootballLeague}
          isDrafting
          isPremium={false}
        />,
      );
      expect(screen.getByText('Premium Draft Settings')).toBeTruthy();
    });

    it('omits the chip for a premium viewer', () => {
      render(
        <LeagueOverviewTab
          {...BASE_PROPS}
          league={idpFootballLeague}
          isDrafting
          isPremium
        />,
      );
      expect(screen.queryByText('Premium Draft Settings')).toBeNull();
    });

    it('omits the chip when the league does not use IDP', () => {
      render(
        <LeagueOverviewTab
          {...BASE_PROPS}
          league={{ ...BASE_PROPS.league, sport: Sport.Football }}
          isDrafting
          isPremium={false}
        />,
      );
      expect(screen.queryByText('Premium Draft Settings')).toBeNull();
    });

    it('omits the chip when no draft is in progress', () => {
      render(
        <LeagueOverviewTab
          {...BASE_PROPS}
          league={idpFootballLeague}
          isDrafting={false}
          isPremium={false}
        />,
      );
      expect(screen.queryByText('Premium Draft Settings')).toBeNull();
    });

    // LS-9617: auction drafts are the same paid-tier signal as IDP.
    const auctionLeague = {
      ...BASE_PROPS.league,
      selectionMethod: 'auction',
    };

    it('renders the chip for a free viewer joining an auction draft', () => {
      render(
        <LeagueOverviewTab
          {...BASE_PROPS}
          league={auctionLeague}
          isDrafting
          isPremium={false}
        />,
      );
      expect(screen.getByText('Premium Draft Settings')).toBeTruthy();
    });

    it('omits the chip for a premium viewer joining an auction draft', () => {
      render(
        <LeagueOverviewTab
          {...BASE_PROPS}
          league={auctionLeague}
          isDrafting
          isPremium
        />,
      );
      expect(screen.queryByText('Premium Draft Settings')).toBeNull();
    });

    it('omits the chip when selectionMethod is standard (non-auction, non-IDP)', () => {
      render(
        <LeagueOverviewTab
          {...BASE_PROPS}
          league={{ ...BASE_PROPS.league, selectionMethod: 'standard' }}
          isDrafting
          isPremium={false}
        />,
      );
      expect(screen.queryByText('Premium Draft Settings')).toBeNull();
    });
  });
});
