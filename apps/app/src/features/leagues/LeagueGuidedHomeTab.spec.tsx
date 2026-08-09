import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';
import {
  computeStandingsWindow,
  LeagueGuidedHomeTab,
  type LeagueGuidedHomeTabProps,
  type RankedStanding,
} from './LeagueGuidedHomeTab';

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

// Declared at module scope (not inside the `tamagui` jest.mock factory
// below) — babel-plugin-jest-hoist's out-of-scope-variable check does not
// reliably recognize a `type` alias declared and referenced within the same
// factory function, and flags it as an invalid outer-scope reference.
type PassthroughProps = { children?: React.ReactNode } & Record<
  string,
  unknown
>;

jest.mock('@legacy-sports/graphql', () => ({
  MatchupStatus: {
    Cancelled: 'cancelled',
    Completed: 'completed',
    InProgress: 'in_progress',
    Scheduled: 'scheduled',
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('@legacy-sports/shared-components', () => {
  const { View, Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BrandIcon: ({ name }: { name: string }) => (
      <View testID={`brand-icon-${name}`} />
    ),
    Chip: ({ label }: { label: string }) => <Text>{label}</Text>,
    getDraftStatusChipDef: (status: string | null | undefined) => {
      if (!status) return null;
      if (status === 'active' || status === 'completed') {
        return { tone: 'active', label: 'Season Active' };
      }
      if (status === 'drafting' || status === 'in-progress') {
        return { tone: 'live', label: 'Drafting · Live' };
      }
      return { tone: 'pre', label: 'Pre-Draft' };
    },
    LeagueActivityFeed: ({ limit }: { limit: number }) => (
      <View
        testID="league-activity-feed"
        accessibilityValue={{ text: String(limit) }}
      />
    ),
    LeagueScoringSummary: ({ profileName }: { profileName: string }) => (
      <View testID="league-scoring-summary">
        <Text>{profileName}</Text>
      </View>
    ),
    PanelCard: ({ children }: { children?: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

jest.mock('@legacy-sports/shared-components/ui', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MatchupCard: ({
      away,
      home,
      status,
      onPress,
    }: {
      away: { name: string };
      home: { name: string };
      status: string;
      onPress?: () => void;
    }) => (
      <View
        testID="matchup-card"
        accessibilityLabel={`${away.name} vs ${home.name} (${status})`}
        onTouchEnd={onPress}
      />
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
  // Forward every prop straight through (including onPress,
  // accessibilityRole, accessibilityLabel, testID) so `fireEvent.press` and
  // `getByRole` behave the same as they would against the real Tamagui
  // components — RNTL's fireEvent just invokes `element.props.onPress`
  // regardless of the underlying host component. Real Tamagui auto-derives
  // `accessible={true}` for elements with an explicit interactive `role`;
  // RNTL's getByRole requires `accessible` to be set for non-Text host
  // components (see isAccessibilityElement), so this plain passthrough mock
  // replicates that default rather than requiring every call site in
  // LeagueGuidedHomeTab.tsx to pass `accessible` explicitly.
  const withAccessibleDefault = (rest: PassthroughProps) =>
    (rest.accessible as boolean | undefined) ??
    (rest.role != null || rest.accessibilityRole != null ? true : undefined);
  return {
    Text: ({ children, ...rest }: PassthroughProps) => (
      <Text {...rest} accessible={withAccessibleDefault(rest)}>
        {children}
      </Text>
    ),
    XStack: ({ children, ...rest }: PassthroughProps) => (
      <View {...rest} accessible={withAccessibleDefault(rest)}>
        {children}
      </View>
    ),
    YStack: ({ children, ...rest }: PassthroughProps) => (
      <View {...rest} accessible={withAccessibleDefault(rest)}>
        {children}
      </View>
    ),
  };
});

const STANDINGS: RankedStanding[] = Array.from({ length: 8 }, (_, i) => ({
  rank: i + 1,
  teamId: i + 1,
  name: `Team ${i + 1}`,
  record: `${8 - i}-${i}`,
  isMine: i === 3, // rank 4
}));

const BASE_PROPS: LeagueGuidedHomeTabProps = {
  league: {
    name: 'The Sandlot Dynasty',
    scoringLabel: 'Standard 5x5',
    draftStatus: 'active',
    currentWeekNumber: 14,
    totalMatchups: 21,
    maxRosterSize: 25,
    // 12, not 5 — avoids colliding with the "5" standings-window rank text
    // (window shows ranks 1/4/5 for this fixture).
    gamesPerMatchup: 12,
  },
  leagueId: 42,
  teamCount: 10,
  isCommissioner: false,
  waiverEnabled: false,
  inviteCode: 'ABC123',
  onInviteShare: jest.fn(),
  rankedStandings: STANDINGS,
  userTeamId: 4,
  matchups: [],
  pendingTradeCount: 0,
  chatUnreadCount: 0,
  nextAction: null,
  showDuesPanel: false,
  onNavigateTab: jest.fn(),
  onMatchupPress: jest.fn(),
};

describe('LeagueGuidedHomeTab', () => {
  describe('header', () => {
    it('renders the league name, subline, and status chip', () => {
      render(<LeagueGuidedHomeTab {...BASE_PROPS} />);
      expect(screen.getByText('The Sandlot Dynasty')).toBeTruthy();
      expect(
        screen.getByText('Week 14 of 21 · 10 teams · Standard 5x5'),
      ).toBeTruthy();
      // The active tone is shortened to "Active" per the design spec (10px
      // chip) — "Season Active" is the tab-bar hero's longer label.
      expect(screen.getByText('Active')).toBeTruthy();
      expect(screen.queryByText('Season Active')).toBeNull();
    });
  });

  describe('up next card', () => {
    it('does not render when nextAction is null', () => {
      render(<LeagueGuidedHomeTab {...BASE_PROPS} nextAction={null} />);
      expect(screen.queryByText('Up next for you')).toBeNull();
    });

    it('renders the headline, body, and CTA and fires onPress', () => {
      const onPress = jest.fn();
      render(
        <LeagueGuidedHomeTab
          {...BASE_PROPS}
          nextAction={{
            headline: '2 starter slots are empty for Week 14.',
            body: 'Fill your lineup before first pitch.',
            ctaLabel: 'Set my lineup',
            onPress,
          }}
        />,
      );
      expect(screen.getByText('Up next for you')).toBeTruthy();
      expect(
        screen.getByText('2 starter slots are empty for Week 14.'),
      ).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Set my lineup' }));
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('matchup card', () => {
    it('does not render when the viewer has no team', () => {
      render(<LeagueGuidedHomeTab {...BASE_PROPS} userTeamId={null} />);
      expect(screen.queryByTestId('matchup-card')).toBeNull();
    });

    it('renders a bye card when no matchup exists for the current week', () => {
      render(<LeagueGuidedHomeTab {...BASE_PROPS} matchups={[]} />);
      const card = screen.getByTestId('matchup-card');
      expect(card.props.accessibilityLabel).toContain('(bye)');
      expect(card.props.accessibilityLabel).toContain('Team 4');
    });

    it('maps team ids to names via rankedStandings for a live matchup', () => {
      render(
        <LeagueGuidedHomeTab
          {...BASE_PROPS}
          matchups={[
            {
              id: '900',
              weekNumber: 14,
              team1Id: 4,
              team2Id: 1,
              team1Score: 61.2,
              team2Score: 59.8,
              status: 'in_progress',
            } as never,
          ]}
        />,
      );
      const card = screen.getByTestId('matchup-card');
      expect(card.props.accessibilityLabel).toBe('Team 4 vs Team 1 (live)');
    });

    it('fires onMatchupPress with the matchup id on tap', () => {
      const onMatchupPress = jest.fn();
      render(
        <LeagueGuidedHomeTab
          {...BASE_PROPS}
          onMatchupPress={onMatchupPress}
          matchups={[
            {
              id: '900',
              weekNumber: 14,
              team1Id: 4,
              team2Id: 1,
              status: 'scheduled',
            } as never,
          ]}
        />,
      );
      fireEvent(screen.getByTestId('matchup-card'), 'touchEnd');
      expect(onMatchupPress).toHaveBeenCalledWith(900);
    });
  });

  describe('nav tile grid', () => {
    it('renders the 6 base tiles', () => {
      render(<LeagueGuidedHomeTab {...BASE_PROPS} />);
      for (const label of [
        'Roster',
        'Matchups',
        'Standings',
        'Trades',
        'Chat',
        'History',
      ]) {
        expect(screen.getByText(label)).toBeTruthy();
      }
      expect(screen.queryByText('Waivers')).toBeNull();
      expect(screen.queryByText('Settings')).toBeNull();
    });

    it('adds a Waivers tile when waiverEnabled', () => {
      render(<LeagueGuidedHomeTab {...BASE_PROPS} waiverEnabled />);
      expect(screen.getByText('Waivers')).toBeTruthy();
    });

    it('adds a Settings tile for commissioners', () => {
      render(<LeagueGuidedHomeTab {...BASE_PROPS} isCommissioner />);
      expect(screen.getByText('Settings')).toBeTruthy();
    });

    it('shows the pending trade count and chat unread count as badges', () => {
      // Chosen to not collide with the standings-peek rank digits (1/4/5)
      // that also render in this fixture.
      render(
        <LeagueGuidedHomeTab
          {...BASE_PROPS}
          pendingTradeCount={3}
          chatUnreadCount={6}
        />,
      );
      expect(screen.getByText('3')).toBeTruthy();
      expect(screen.getByText('6')).toBeTruthy();
    });

    it('calls onNavigateTab with the tapped tile id', () => {
      const onNavigateTab = jest.fn();
      render(
        <LeagueGuidedHomeTab {...BASE_PROPS} onNavigateTab={onNavigateTab} />,
      );
      fireEvent.press(screen.getByRole('button', { name: 'Roster' }));
      expect(onNavigateTab).toHaveBeenCalledWith('roster');
    });
  });

  describe('league info section', () => {
    it('shows Roster Size and Games / Matchup for non-commissioners', () => {
      render(<LeagueGuidedHomeTab {...BASE_PROPS} isCommissioner={false} />);
      expect(screen.getByText('League Info')).toBeTruthy();
      expect(screen.getByText('Roster Size')).toBeTruthy();
      expect(screen.getByText('25')).toBeTruthy();
      expect(screen.getByText('Games / Matchup')).toBeTruthy();
      expect(screen.getByText('12')).toBeTruthy();
    });

    it('falls back to "—" when roster size or games per matchup is missing', () => {
      render(
        <LeagueGuidedHomeTab
          {...BASE_PROPS}
          league={{
            ...BASE_PROPS.league,
            maxRosterSize: null,
            gamesPerMatchup: null,
          }}
        />,
      );
      expect(screen.getAllByText('—')).toHaveLength(2);
    });

    it('does not render the scoring summary when scoringSettings is not provided', () => {
      render(<LeagueGuidedHomeTab {...BASE_PROPS} />);
      expect(screen.queryByTestId('league-scoring-summary')).toBeNull();
    });

    it('renders the read-only scoring summary for non-commissioners when scoringSettings is provided', () => {
      render(
        <LeagueGuidedHomeTab
          {...BASE_PROPS}
          isCommissioner={false}
          scoringLoading={false}
          scoringError={null}
          scoringProfileName="Sandlot Standard"
          scoringSettings={{ batting: {}, fielding: {}, pitching: {} }}
        />,
      );
      expect(screen.getByTestId('league-scoring-summary')).toBeTruthy();
      expect(screen.getByText('Sandlot Standard')).toBeTruthy();
    });
  });

  describe('standings peek', () => {
    it('renders the leader, viewer row (highlighted), and the team behind', () => {
      render(<LeagueGuidedHomeTab {...BASE_PROPS} />);
      expect(screen.getByText("You're 4th of 10")).toBeTruthy();
      expect(screen.getByText('Team 1')).toBeTruthy(); // leader
      expect(screen.getByText('Team 4')).toBeTruthy(); // viewer
      expect(screen.getByText('Team 5')).toBeTruthy(); // behind
      expect(screen.queryByText('Team 2')).toBeNull();
    });

    it('navigates to the standings tab from the "Standings →" link', () => {
      const onNavigateTab = jest.fn();
      render(
        <LeagueGuidedHomeTab {...BASE_PROPS} onNavigateTab={onNavigateTab} />,
      );
      fireEvent(screen.getByText('Standings →'), 'press');
      expect(onNavigateTab).toHaveBeenCalledWith('standings');
    });
  });

  describe('activity condensed', () => {
    const getActivityFeedLimitText = (): string =>
      (
        screen.getByTestId('league-activity-feed').props as unknown as {
          accessibilityValue: { text: string };
        }
      ).accessibilityValue.text;

    it('defaults to a 3-item limit and expands to 15 on "See all"', () => {
      render(<LeagueGuidedHomeTab {...BASE_PROPS} />);
      expect(getActivityFeedLimitText()).toBe('3');
      fireEvent(screen.getByText('See all →'), 'press');
      expect(getActivityFeedLimitText()).toBe('15');
    });
  });

  describe('invite friends panel', () => {
    it('is hidden for non-commissioners', () => {
      render(<LeagueGuidedHomeTab {...BASE_PROPS} isCommissioner={false} />);
      expect(screen.queryByText('Invite Friends')).toBeNull();
    });

    it('renders for commissioners and fires onInviteShare', () => {
      const onInviteShare = jest.fn();
      render(
        <LeagueGuidedHomeTab
          {...BASE_PROPS}
          isCommissioner
          onInviteShare={onInviteShare}
        />,
      );
      expect(screen.getByText('Invite Friends')).toBeTruthy();
      expect(screen.getByText('ABC123')).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Share' }));
      expect(onInviteShare).toHaveBeenCalledTimes(1);
    });
  });

  describe('dues panel', () => {
    it('renders LeagueDuesPaymentStatus only when showDuesPanel is true', () => {
      const { rerender } = render(
        <LeagueGuidedHomeTab {...BASE_PROPS} showDuesPanel={false} />,
      );
      expect(screen.queryByTestId('league-dues-payment-status')).toBeNull();

      rerender(<LeagueGuidedHomeTab {...BASE_PROPS} showDuesPanel />);
      expect(screen.getByTestId('league-dues-payment-status')).toBeTruthy();
    });
  });
});

describe('computeStandingsWindow', () => {
  it('returns the top 3 when the viewer has no team', () => {
    const noMine = STANDINGS.map((s) => ({ ...s, isMine: false }));
    expect(computeStandingsWindow(noMine).map((r) => r.rank)).toEqual([
      1, 2, 3,
    ]);
  });

  it('clamps at the top of the table (viewer is the leader)', () => {
    const leaderIsMine = STANDINGS.map((s) => ({ ...s, isMine: s.rank === 1 }));
    expect(computeStandingsWindow(leaderIsMine).map((r) => r.rank)).toEqual([
      1, 2, 3,
    ]);
  });

  it('clamps at the bottom of the table and still includes the leader', () => {
    const lastIsMine = STANDINGS.map((s) => ({
      ...s,
      isMine: s.rank === STANDINGS.length,
    }));
    const window = computeStandingsWindow(lastIsMine).map((r) => r.rank);
    expect(window).toContain(1);
    expect(window).toContain(STANDINGS.length);
    expect(window.length).toBe(3);
  });

  it('windows to [leader, me, next] in the middle of the table (leader replaces "team ahead")', () => {
    expect(computeStandingsWindow(STANDINGS).map((r) => r.rank)).toEqual([
      1, 4, 5,
    ]);
  });

  it('returns an empty array for an empty table', () => {
    expect(computeStandingsWindow([])).toEqual([]);
  });
});
