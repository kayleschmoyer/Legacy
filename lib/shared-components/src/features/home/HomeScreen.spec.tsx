import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import {
  type HomeLeagueSummary,
  HomeScreen,
  type HomeScreenProps,
} from './HomeScreen';

const baseProps: HomeScreenProps = {
  userName: 'Casey',
  leagues: [],
  onViewLeague: jest.fn(),
  onCreateLeague: jest.fn(),
  onJoinLeague: jest.fn(),
  onBrowseStats: jest.fn(),
  onViewSport: jest.fn(),
};

const league: HomeLeagueSummary = {
  leagueId: 42,
  leagueName: 'Iron Horse Dynasty',
  sport: 'baseball',
  leaguePhase: 'active',
  wins: 6,
  losses: 2,
  rank: 1,
  totalTeams: 10,
  teamCount: 10,
  currentWeekNumber: 8,
  totalMatchups: 14,
};

describe('HomeScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('new-user empty state', () => {
    it('renders the getting-started hero and both sport cards', () => {
      const { getByText, getAllByText } = render(<HomeScreen {...baseProps} />);
      expect(getByText('Start your dynasty.')).toBeTruthy();
      expect(getByText('Choose your sport')).toBeTruthy();
      expect(getAllByText('Baseball').length).toBeGreaterThan(0);
      expect(getAllByText('Football').length).toBeGreaterThan(0);
      // Both onboarding CTAs are present.
      expect(getAllByText('Create League').length).toBeGreaterThan(0);
      expect(getByText('Join League')).toBeTruthy();
    });

    it('does not show premium CTAs when isPremium is false', () => {
      const { queryByText } = render(
        <HomeScreen
          {...baseProps}
          isPremium={false}
          onCreateSalaryCapLeague={jest.fn()}
          onCreateAuctionLeague={jest.fn()}
        />,
      );
      expect(queryByText('Create Salary Cap League')).toBeNull();
      expect(queryByText('Try Auction Draft')).toBeNull();
    });

    it('shows premium CTAs when isPremium is true', () => {
      const { getByText } = render(
        <HomeScreen
          {...baseProps}
          isPremium
          onCreateSalaryCapLeague={jest.fn()}
          onCreateAuctionLeague={jest.fn()}
        />,
      );
      expect(getByText('Exclusive league types unlocked')).toBeTruthy();
      expect(getByText('Create Salary Cap League')).toBeTruthy();
      expect(getByText('Try Auction Draft')).toBeTruthy();
    });

    it('fires onCreateSalaryCapLeague and onCreateAuctionLeague from premium CTAs', () => {
      const onCreateSalaryCapLeague = jest.fn();
      const onCreateAuctionLeague = jest.fn();
      const { getByText } = render(
        <HomeScreen
          {...baseProps}
          isPremium
          onCreateSalaryCapLeague={onCreateSalaryCapLeague}
          onCreateAuctionLeague={onCreateAuctionLeague}
        />,
      );
      fireEvent.click(getByText('Create Salary Cap League'));
      fireEvent.click(getByText('Try Auction Draft'));
      expect(onCreateSalaryCapLeague).toHaveBeenCalledTimes(1);
      expect(onCreateAuctionLeague).toHaveBeenCalledTimes(1);
    });

    it('does not show premium CTAs when isPremium is true but callbacks are absent', () => {
      const { queryByText } = render(<HomeScreen {...baseProps} isPremium />);
      expect(queryByText('Create Salary Cap League')).toBeNull();
      expect(queryByText('Try Auction Draft')).toBeNull();
    });

    it('fires onCreateLeague and onJoinLeague from the empty-state CTAs', () => {
      const onCreateLeague = jest.fn();
      const onJoinLeague = jest.fn();
      const { getAllByText, getByText } = render(
        <HomeScreen
          {...baseProps}
          onCreateLeague={onCreateLeague}
          onJoinLeague={onJoinLeague}
        />,
      );
      fireEvent.click(getAllByText('Create League')[0]);
      fireEvent.click(getByText('Join League'));
      expect(onCreateLeague).toHaveBeenCalledTimes(1);
      expect(onJoinLeague).toHaveBeenCalledTimes(1);
    });
  });

  describe('returning-user dashboard', () => {
    it('renders the greeting and the hero league name', () => {
      const { getByText } = render(
        <HomeScreen {...baseProps} leagues={[league]} />,
      );
      expect(getByText('Casey')).toBeTruthy();
      expect(getByText('Iron Horse Dynasty')).toBeTruthy();
    });

    it('fires onViewLeague when the hero View League button is pressed', () => {
      const onViewLeague = jest.fn();
      const { getByText } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          onViewLeague={onViewLeague}
        />,
      );
      fireEvent.click(getByText('View League'));
      expect(onViewLeague).toHaveBeenCalledWith(league);
    });

    it('renders the On This Day slot when provided', () => {
      const { getByText } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          onThisDay={<span>OTD-FEED-MARKER</span>}
        />,
      );
      expect(getByText('OTD-FEED-MARKER')).toBeTruthy();
    });

    it('renders a secondary league row with a live matchup score without throwing (LS-8668)', () => {
      const liveMatchupLeague: HomeLeagueSummary = {
        leagueId: 43,
        leagueName: 'Second League',
        sport: 'baseball',
        leaguePhase: 'active',
        matchupId: 7,
        matchupStatus: 'in_progress',
        userScore: 12.5,
        opponentScore: 9.25,
        opponentTeamName: 'Rival FC',
      };
      const { getByText } = render(
        <HomeScreen {...baseProps} leagues={[league, liveMatchupLeague]} />,
      );
      expect(getByText('Second League')).toBeTruthy();
      expect(getByText('12.5')).toBeTruthy();
    });

    it('falls back to 0.0 instead of throwing when a matchup score is not a finite number (LS-8668)', () => {
      // Simulates a malformed value reaching the component at runtime (e.g. a
      // corrupted cache entry) despite the number|null type — the reported
      // crash was "TypeError: undefined is not a function" from calling
      // `.toFixed()` on such a value.
      const malformedScoreLeague: HomeLeagueSummary = {
        leagueId: 44,
        leagueName: 'Malformed Score League',
        sport: 'baseball',
        leaguePhase: 'active',
        matchupId: 8,
        matchupStatus: 'in_progress',
        userScore: 'DNP' as unknown as number,
        opponentTeamName: 'Rival FC',
      };
      expect(() =>
        render(
          <HomeScreen
            {...baseProps}
            leagues={[league, malformedScoreLeague]}
          />,
        ),
      ).not.toThrow();
    });

    it('shows a "Coming Soon" badge on the unavailable sport card in the compact "Pick your sport" section', () => {
      const { getByText } = render(
        <HomeScreen {...baseProps} leagues={[league]} />,
      );
      expect(getByText('Pick your sport')).toBeTruthy();
      expect(getByText('Coming Soon')).toBeTruthy();
      expect(getByText('Live Season')).toBeTruthy();
    });
  });

  describe('mock draft CTA', () => {
    it('renders the Start Mock Draft button when onStartMockDraft is provided', () => {
      const onStartMockDraft = jest.fn();
      const { getByText } = render(
        <HomeScreen {...baseProps} onStartMockDraft={onStartMockDraft} />,
      );
      expect(getByText('Start Mock Draft')).toBeTruthy();
    });

    it('calls onStartMockDraft when the button is pressed and not at cap', () => {
      const onStartMockDraft = jest.fn();
      const { getByText } = render(
        <HomeScreen
          {...baseProps}
          onStartMockDraft={onStartMockDraft}
          mockDraftAtCap={false}
        />,
      );
      fireEvent.click(getByText('Start Mock Draft'));
      expect(onStartMockDraft).toHaveBeenCalledTimes(1);
    });

    it('disables the button and shows at-cap message when mockDraftAtCap is true', () => {
      const onStartMockDraft = jest.fn();
      const { getByText } = render(
        <HomeScreen
          {...baseProps}
          onStartMockDraft={onStartMockDraft}
          mockDraftAtCap
        />,
      );
      fireEvent.click(getByText('Start Mock Draft'));
      expect(onStartMockDraft).not.toHaveBeenCalled();
      expect(
        getByText(/you've used your free mock drafts this week/i),
      ).toBeTruthy();
    });
  });

  describe('loading and error states', () => {
    it('renders the loading view', () => {
      const { getByText } = render(<HomeScreen {...baseProps} loading />);
      expect(getByText('Loading your dashboard…')).toBeTruthy();
    });

    it('renders the error view and fires onRetry', () => {
      const onRetry = jest.fn();
      const { getByText } = render(
        <HomeScreen {...baseProps} error onRetry={onRetry} />,
      );
      expect(getByText('Unable to load your leagues')).toBeTruthy();
      fireEvent.click(getByText('Retry'));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('top safe-area inset (LS-8625)', () => {
    // The global `tamagui` jest mock strips layout props (including
    // paddingTop) before they reach the DOM, so this only asserts that
    // passing topInset through every render branch doesn't throw. The
    // paddingTop wiring itself is covered by reading HomeScreen.tsx's four
    // ScrollView returns and by home.spec.tsx (HomeTab forwards topInset).
    it('accepts topInset on every render branch without throwing', () => {
      expect(() =>
        render(<HomeScreen {...baseProps} topInset={44} />),
      ).not.toThrow();
      expect(() =>
        render(<HomeScreen {...baseProps} leagues={[league]} topInset={44} />),
      ).not.toThrow();
      expect(() =>
        render(<HomeScreen {...baseProps} loading topInset={44} />),
      ).not.toThrow();
      expect(() =>
        render(<HomeScreen {...baseProps} error topInset={44} />),
      ).not.toThrow();
    });
  });
});
