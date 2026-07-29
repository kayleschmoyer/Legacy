import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import type { HomeLeagueSummary } from './HomeScreen';
import {
  homeContentTopPadding,
  MobileHomeScreen,
  type MobileHomeScreenProps,
} from './MobileHomeScreen';

const baseProps: MobileHomeScreenProps = {
  userName: 'Casey',
  leagues: [],
  onViewLeague: jest.fn(),
  onCreateLeague: jest.fn(),
  onJoinLeague: jest.fn(),
  onBrowseStats: jest.fn(),
  onViewSport: jest.fn(),
};

const activeLeague: HomeLeagueSummary = {
  leagueId: 42,
  leagueName: 'Iron Horse Dynasty',
  sport: 'baseball',
  leaguePhase: 'active',
  eraFilter: 'dead_ball',
  isCommissioner: true,
  wins: 6,
  losses: 2,
  rank: 1,
  totalTeams: 10,
  teamCount: 10,
  currentWeekNumber: 8,
  totalMatchups: 14,
};

const liveLeague: HomeLeagueSummary = {
  leagueId: 43,
  leagueName: 'Deadball Diamonds',
  sport: 'baseball',
  leaguePhase: 'active',
  matchupId: 7,
  matchupStatus: 'in_progress',
  userScore: 12.5,
  opponentScore: 9.25,
  opponentTeamName: 'Rival FC',
  currentWeekNumber: 8,
  totalMatchups: 14,
  matchupEndTime: '2026-05-10T20:00:00.000Z',
  wins: 4,
  losses: 4,
  teamCount: 12,
};

// LS-8808 defect 3: the greeting sat flush against the Android status bar.
// The inset now lands on the scroll *content*, and this is the arithmetic
// behind it — style props themselves are stripped by the Tamagui jest mock.
describe('homeContentTopPadding (LS-8808)', () => {
  it('adds the full top safe-area inset to the page gutter', () => {
    expect(homeContentTopPadding(44)).toBe(62);
  });

  it('falls back to the page gutter alone on platforms without an inset', () => {
    expect(homeContentTopPadding(0)).toBe(18);
  });

  it('ignores negative and non-finite insets', () => {
    expect(homeContentTopPadding(-20)).toBe(18);
    expect(homeContentTopPadding(Number.NaN)).toBe(18);
  });
});

describe('MobileHomeScreen (LS-8794)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('delegated states', () => {
    it('renders the shared loading view', () => {
      const { getByText } = render(<MobileHomeScreen {...baseProps} loading />);
      expect(getByText('Loading your dashboard…')).toBeTruthy();
    });

    it('renders the shared error view', () => {
      const { getByText } = render(<MobileHomeScreen {...baseProps} error />);
      expect(getByText('Unable to load your leagues')).toBeTruthy();
    });

    it('renders the shared new-user view when there are no leagues', () => {
      const { getByText } = render(<MobileHomeScreen {...baseProps} />);
      expect(getByText('Start your dynasty.')).toBeTruthy();
    });

    it('prefers the full On This Day node in the delegated states', () => {
      const { getByText, queryByText } = render(
        <MobileHomeScreen
          {...baseProps}
          onThisDay={<span>FULL-FEED</span>}
          onThisDayCondensed={<span>CONDENSED-FEED</span>}
        />,
      );
      expect(getByText('FULL-FEED')).toBeTruthy();
      expect(queryByText('CONDENSED-FEED')).toBeNull();
    });
  });

  describe('greeting row', () => {
    it('renders the eyebrow, display name and avatar initial', () => {
      const { getByText } = render(
        <MobileHomeScreen {...baseProps} leagues={[activeLeague]} />,
      );
      expect(getByText('Welcome back')).toBeTruthy();
      expect(getByText('Casey')).toBeTruthy();
      expect(getByText('C')).toBeTruthy();
    });

    it('fires onOpenProfile when the avatar is pressed', () => {
      const onOpenProfile = jest.fn();
      const { getByText } = render(
        <MobileHomeScreen
          {...baseProps}
          leagues={[activeLeague]}
          onOpenProfile={onOpenProfile}
        />,
      );
      fireEvent.click(getByText('C'));
      expect(onOpenProfile).toHaveBeenCalledTimes(1);
    });
  });

  describe('live matchup ticker (AC2)', () => {
    it('is hidden entirely when no league has a live matchup', () => {
      const { queryByText } = render(
        <MobileHomeScreen {...baseProps} leagues={[activeLeague]} />,
      );
      expect(queryByText('Set Lineup')).toBeNull();
      expect(queryByText('Matchup')).toBeNull();
      expect(queryByText('My Team')).toBeNull();
      // The rest of the layout still renders, flowed up.
      expect(queryByText('Your Leagues')).toBeTruthy();
    });

    it('renders week, scores and the opponent when a matchup is in progress', () => {
      const { getByText } = render(
        <MobileHomeScreen
          {...baseProps}
          leagues={[activeLeague, liveLeague]}
        />,
      );
      expect(getByText('Live · Week 8')).toBeTruthy();
      expect(getByText(/^Closes /)).toBeTruthy();
      expect(getByText('12.5')).toBeTruthy();
      expect(getByText('9.3')).toBeTruthy();
      expect(getByText('Rival FC')).toBeTruthy();
    });

    it('falls back to 0.0 rather than throwing on a non-numeric score (LS-8668)', () => {
      const malformed: HomeLeagueSummary = {
        ...liveLeague,
        userScore: 'DNP' as unknown as number,
      };
      const { getByText } = render(
        <MobileHomeScreen {...baseProps} leagues={[malformed]} />,
      );
      expect(getByText('0.0')).toBeTruthy();
    });

    it('fires onSetLineup for the live league', () => {
      const onSetLineup = jest.fn();
      const { getByText } = render(
        <MobileHomeScreen
          {...baseProps}
          leagues={[activeLeague, liveLeague]}
          onSetLineup={onSetLineup}
        />,
      );
      fireEvent.click(getByText('Set Lineup'));
      expect(onSetLineup).toHaveBeenCalledWith(liveLeague);
    });

    it('fires onViewMatchup for the live league', () => {
      const onViewMatchup = jest.fn();
      const { getByText } = render(
        <MobileHomeScreen
          {...baseProps}
          leagues={[liveLeague]}
          onViewMatchup={onViewMatchup}
        />,
      );
      fireEvent.click(getByText('Matchup'));
      expect(onViewMatchup).toHaveBeenCalledWith(liveLeague);
    });

    // LS-8808 defects 1 & 2: the gradient header broke out of the card and the
    // card surface vanished on Android. The Tamagui jest mock strips style
    // props, so structure is what jsdom can assert — the header must stay a
    // child of the card, and both of its end labels must render.
    it('keeps the gradient header and the scoreboard row inside the ticker card (LS-8808)', () => {
      const { getByTestId } = render(
        <MobileHomeScreen {...baseProps} leagues={[liveLeague]} />,
      );
      const card = getByTestId('home-live-ticker');
      const header = getByTestId('home-live-ticker-header');

      expect(card.contains(header)).toBe(true);
      expect(header.textContent).toContain('Live · Week 8');
      expect(header.textContent).toContain('Closes ');
      expect(card.textContent).toContain('My Team');
      expect(card.textContent).toContain('12.5');
    });

    it('falls back to onViewLeague when no onViewMatchup handler is supplied', () => {
      const onViewLeague = jest.fn();
      const { getByText } = render(
        <MobileHomeScreen
          {...baseProps}
          leagues={[liveLeague]}
          onViewLeague={onViewLeague}
        />,
      );
      fireEvent.click(getByText('Matchup'));
      expect(onViewLeague).toHaveBeenCalledWith(liveLeague);
    });
  });

  describe('league rail', () => {
    it('renders a card per league with the era descriptor and commissioner suffix', () => {
      const { getByText, getAllByText } = render(
        <MobileHomeScreen
          {...baseProps}
          leagues={[activeLeague, liveLeague]}
        />,
      );
      expect(getByText('Iron Horse Dynasty')).toBeTruthy();
      expect(getByText('Deadball Diamonds')).toBeTruthy();
      expect(
        getByText('Dead Ball era · 1901–1919 · Commissioner'),
      ).toBeTruthy();
      expect(getAllByText('Record').length).toBe(2);
    });

    it('shows the section count and the record/rank stat pair', () => {
      const { getByText } = render(
        <MobileHomeScreen
          {...baseProps}
          leagues={[activeLeague, liveLeague]}
        />,
      );
      expect(getByText('Your Leagues')).toBeTruthy();
      expect(getByText('· 2')).toBeTruthy();
      expect(getByText('6-2')).toBeTruthy();
      expect(getByText('#1')).toBeTruthy();
      expect(getByText('of 10')).toBeTruthy();
    });

    it('falls back to the team count when the league has no rank', () => {
      const { getByText } = render(
        <MobileHomeScreen {...baseProps} leagues={[liveLeague]} />,
      );
      expect(getByText('Teams')).toBeTruthy();
      expect(getByText('12')).toBeTruthy();
    });

    it('labels a live league card "Live" and an active one "Active"', () => {
      const { getByText } = render(
        <MobileHomeScreen
          {...baseProps}
          leagues={[activeLeague, liveLeague]}
        />,
      );
      expect(getByText('Live')).toBeTruthy();
      expect(getByText('Active')).toBeTruthy();
    });

    it('fires onViewLeague when a rail card is pressed', () => {
      const onViewLeague = jest.fn();
      const { getByText } = render(
        <MobileHomeScreen
          {...baseProps}
          leagues={[activeLeague]}
          onViewLeague={onViewLeague}
        />,
      );
      fireEvent.click(getByText('Iron Horse Dynasty'));
      expect(onViewLeague).toHaveBeenCalledWith(activeLeague);
    });

    it('fires onSeeAllLeagues from "See all"', () => {
      const onSeeAllLeagues = jest.fn();
      const { getByText } = render(
        <MobileHomeScreen
          {...baseProps}
          leagues={[activeLeague]}
          onSeeAllLeagues={onSeeAllLeagues}
        />,
      );
      fireEvent.click(getByText('See all'));
      expect(onSeeAllLeagues).toHaveBeenCalledTimes(1);
    });

    it('omits "See all" when no handler is supplied', () => {
      const { queryByText } = render(
        <MobileHomeScreen {...baseProps} leagues={[activeLeague]} />,
      );
      expect(queryByText('See all')).toBeNull();
    });
  });

  describe('quick actions', () => {
    it('renders the 2×2 action grid', () => {
      const { getByText } = render(
        <MobileHomeScreen {...baseProps} leagues={[activeLeague]} />,
      );
      expect(getByText('Create League')).toBeTruthy();
      expect(getByText('Join League')).toBeTruthy();
      expect(getByText('Mock Draft')).toBeTruthy();
      expect(getByText('Browse Stats')).toBeTruthy();
    });

    it('fires the create, join and stats handlers', () => {
      const onCreateLeague = jest.fn();
      const onJoinLeague = jest.fn();
      const onBrowseStats = jest.fn();
      const { getByText } = render(
        <MobileHomeScreen
          {...baseProps}
          leagues={[activeLeague]}
          onCreateLeague={onCreateLeague}
          onJoinLeague={onJoinLeague}
          onBrowseStats={onBrowseStats}
        />,
      );
      fireEvent.click(getByText('Create League'));
      fireEvent.click(getByText('Join League'));
      fireEvent.click(getByText('Browse Stats'));
      expect(onCreateLeague).toHaveBeenCalledTimes(1);
      expect(onJoinLeague).toHaveBeenCalledTimes(1);
      expect(onBrowseStats).toHaveBeenCalledTimes(1);
    });

    it('does not fire the mock-draft handler when the user is at their weekly cap', () => {
      const onStartMockDraft = jest.fn();
      const { getByText } = render(
        <MobileHomeScreen
          {...baseProps}
          leagues={[activeLeague]}
          onStartMockDraft={onStartMockDraft}
          mockDraftAtCap
        />,
      );
      fireEvent.click(getByText('Mock Draft'));
      expect(onStartMockDraft).not.toHaveBeenCalled();
    });
  });

  describe('condensed On This Day', () => {
    it('renders the condensed node in the compact layout', () => {
      const { getByText, queryByText } = render(
        <MobileHomeScreen
          {...baseProps}
          leagues={[activeLeague]}
          onThisDay={<span>FULL-FEED</span>}
          onThisDayCondensed={<span>CONDENSED-FEED</span>}
        />,
      );
      expect(getByText('CONDENSED-FEED')).toBeTruthy();
      expect(queryByText('FULL-FEED')).toBeNull();
    });

    it('falls back to the full node when no condensed node is supplied', () => {
      const { getByText } = render(
        <MobileHomeScreen
          {...baseProps}
          leagues={[activeLeague]}
          onThisDay={<span>FULL-FEED</span>}
        />,
      );
      expect(getByText('FULL-FEED')).toBeTruthy();
    });
  });

  describe('removed surfaces', () => {
    it('drops the hero card, sport cards, archived toggle and stats CTA', () => {
      const { queryByText } = render(
        <MobileHomeScreen
          {...baseProps}
          leagues={[activeLeague]}
          archivedCount={3}
          onShowArchived={jest.fn()}
        />,
      );
      expect(queryByText('View League')).toBeNull();
      expect(queryByText('Pick your sport')).toBeNull();
      expect(queryByText('Show 3 archived leagues')).toBeNull();
      expect(queryByText('Explore player statistics')).toBeNull();
    });
  });
});
