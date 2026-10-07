import React from 'react';
import { fireEvent, render, within } from '@testing-library/react';
import type { ScrollView as ScrollViewHandle } from 'react-native';
import { useMedia } from 'tamagui';
import { formatDraftDate } from '@legacy-sports/utils';
import {
  homeContentTopPadding,
  type HomeLeagueSummary,
  HomeScreen,
  type HomeScreenProps,
  LeagueListRow,
} from './HomeScreen';

// `useMedia` is stubbed to `jest.fn(() => ({}))` by the package-wide `tamagui`
// mock in jest-setup-web.js — every breakpoint false (desktop) by default.
// Reset explicitly in `beforeEach` (rather than relying on that default) so
// the narrow-viewport describe block below can override it per test without
// leaking into unrelated wide-viewport tests.

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

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useMedia as jest.Mock).mockReturnValue({});
  });

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

    it('renders a formatted draft date for a secondary pre-draft league without throwing (LS-8755 / LS-9161)', () => {
      // `LeagueListRow` calls `formatDraftDate` (from `@legacy-sports/utils`)
      // for any secondary league that is pre-draft with a scheduled time.
      // `formatDraftDate` was previously defined only in that package's web
      // barrel (`index.ts`) and missing from the mobile barrel
      // (`mobile.ts`/`index.native.ts`), so it resolved to `undefined` on
      // device and crashed the Home dashboard with "TypeError: undefined is
      // not a function" (LS-8755, Rollbar item #201 / LS-9161) — no prior
      // test rendered this branch, so the regression shipped undetected.
      const preDraftScheduledLeague: HomeLeagueSummary = {
        leagueId: 45,
        leagueName: 'Scheduled Draft League',
        sport: 'baseball',
        leaguePhase: 'pre-draft',
        draftScheduledAt: '2026-09-01T20:00:00.000Z',
      };
      const { getByText } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league, preDraftScheduledLeague]}
        />,
      );
      expect(getByText('Scheduled Draft League')).toBeTruthy();
      expect(getByText('Draft scheduled')).toBeTruthy();
    });

    it('shows a "Live Season" badge on both sport cards in the compact "Pick your sport" section (LS-9035: football is live)', () => {
      const { getByText, getAllByText } = render(
        <HomeScreen {...baseProps} leagues={[league]} />,
      );
      expect(getByText('Pick your sport')).toBeTruthy();
      expect(getAllByText('Live Season').length).toBe(2);
    });

    it("passes the clicked card's sport to onCreateLeague (LS-9127)", () => {
      const onCreateLeague = jest.fn();
      const { getByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          onCreateLeague={onCreateLeague}
        />,
      );
      fireEvent.click(getByTestId('sport-card-create-football'));
      expect(onCreateLeague).toHaveBeenCalledWith('football');

      fireEvent.click(getByTestId('sport-card-create-baseball'));
      expect(onCreateLeague).toHaveBeenCalledWith('baseball');
    });
  });

  describe('"currently in" sport indicator (LS-6285)', () => {
    const footballLeague: HomeLeagueSummary = {
      leagueId: 46,
      leagueName: 'Gridiron Dynasty',
      sport: 'football',
      leaguePhase: 'active',
    };

    it("badges the majority sport's card and not the other, on the returning-user dashboard", () => {
      const { getByTestId, queryByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          primarySport="baseball"
        />,
      );
      expect(getByTestId('sport-card-primary-baseball')).toBeTruthy();
      expect(queryByTestId('sport-card-primary-football')).toBeNull();
    });

    it('reserves the same badge slot on the non-primary card too, so the two banners stay aligned (LS-9500)', () => {
      const { getAllByText } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          primarySport="baseball"
        />,
      );
      // The "Your Sport" text renders on both cards (invisible on the
      // non-primary one) so each card reserves identical vertical space
      // for the badge slot instead of only the primary card growing taller.
      expect(getAllByText('Your Sport')).toHaveLength(2);
    });

    it('does not reserve the badge slot on either card when primarySport is null (tie), so no extra space is added (LS-9500)', () => {
      const { queryAllByText } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league, footballLeague]}
          primarySport={null}
        />,
      );
      expect(queryAllByText('Your Sport')).toHaveLength(0);
    });

    it('shows no indicator on either card when primarySport is null (tie)', () => {
      const { queryByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league, footballLeague]}
          primarySport={null}
        />,
      );
      expect(queryByTestId('sport-card-primary-baseball')).toBeNull();
      expect(queryByTestId('sport-card-primary-football')).toBeNull();
    });

    it('shows no indicator on either card in the new-user empty state, even if primarySport were passed', () => {
      const { queryByTestId } = render(
        <HomeScreen {...baseProps} leagues={[]} primarySport="baseball" />,
      );
      expect(queryByTestId('sport-card-primary-baseball')).toBeNull();
      expect(queryByTestId('sport-card-primary-football')).toBeNull();
    });
  });

  describe('keyboard accessibility (LS-8916, LS-10713)', () => {
    // LS-10713: the league cards must never be a `role=button` that wraps
    // other interactive controls — screen readers flatten a button's children
    // into its name, and the inner actions double up Tab stops. Every action
    // is its own sibling control instead.
    const INTERACTIVE =
      '[data-accessibility-role="button"], [data-accessibility-role="link"], [tabindex]';

    function expectNoNestedInteractives(container: HTMLElement) {
      const nested = Array.from(
        container.querySelectorAll<HTMLElement>(INTERACTIVE),
      ).filter((el) => el.querySelector(INTERACTIVE) != null);
      expect(
        nested.map(
          (el) =>
            el.getAttribute('data-accessibility-label') ??
            el.getAttribute('data-testid'),
        ),
      ).toEqual([]);
    }

    function focusableLabels(container: HTMLElement): (string | null)[] {
      return Array.from(
        container.querySelectorAll<HTMLElement>('[tabindex="0"]'),
      ).map((el) => el.getAttribute('data-accessibility-label'));
    }

    const preDraftRow: HomeLeagueSummary = {
      leagueId: 77,
      leagueName: 'QA New League',
      sport: 'baseball',
      leaguePhase: 'pre-draft',
      draftScheduledAt: '2026-11-01T18:00:00.000Z',
    };

    it('renders no interactive control nested inside another on the baseball dashboard', () => {
      const { getByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league, preDraftRow]}
          onSetLineup={jest.fn()}
          onMockDraft={jest.fn()}
        />,
      );
      expectNoNestedInteractives(getByTestId('home-content'));
    });

    it('renders no interactive control nested inside another on the football playboard hero', () => {
      const footballLeague: HomeLeagueSummary = {
        leagueId: 51,
        leagueName: 'Steel Curtain Era',
        sport: 'football',
        leaguePhase: 'active',
      };
      const { getByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[footballLeague]}
          onSetLineup={jest.fn()}
        />,
      );
      const hero = getByTestId('home-playboard-hero');
      expect(hero.getAttribute('data-accessibility-role')).toBeNull();
      expect(hero.getAttribute('tabindex')).toBeNull();
      expectNoNestedInteractives(hero);
    });

    it('exposes each hero action as exactly one distinct Tab stop', () => {
      const { getByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          onSetLineup={jest.fn()}
        />,
      );
      const hero = getByTestId('home-hero-card');
      expect(hero.getAttribute('data-accessibility-role')).toBeNull();
      expect(hero.getAttribute('tabindex')).toBeNull();
      expect(focusableLabels(hero)).toEqual(['View League', 'Set Lineup']);
    });

    it('still opens the league when the hero card body is clicked', () => {
      const onViewLeague = jest.fn();
      const { getByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          onViewLeague={onViewLeague}
        />,
      );
      fireEvent.click(getByTestId('home-hero-card'));
      expect(onViewLeague).toHaveBeenCalledWith(league);
    });

    it('opens the league from the hero View League button via Enter or Space', () => {
      const onViewLeague = jest.fn();
      const { getByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          onViewLeague={onViewLeague}
        />,
      );
      const viewLeague = getByTestId('home-hero-view-league');
      fireEvent.keyDown(viewLeague, { key: 'Enter' });
      expect(onViewLeague).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(viewLeague, { key: ' ' });
      expect(onViewLeague).toHaveBeenCalledTimes(2);
    });

    it('still opens the league when the playboard hero body is clicked', () => {
      const footballLeague: HomeLeagueSummary = {
        leagueId: 51,
        leagueName: 'Steel Curtain Era',
        sport: 'football',
        leaguePhase: 'active',
      };
      const onViewLeague = jest.fn();
      const { getByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[footballLeague]}
          onViewLeague={onViewLeague}
        />,
      );
      fireEvent.click(getByTestId('home-playboard-hero'));
      expect(onViewLeague).toHaveBeenCalledWith(footballLeague);
    });

    it('gives a LeagueListRow separate open-league and mock-draft Tab stops', () => {
      const onPress = jest.fn();
      const onMockDraft = jest.fn();
      const { container } = render(
        <LeagueListRow
          summary={preDraftRow}
          onPress={onPress}
          onMockDraft={onMockDraft}
        />,
      );
      expectNoNestedInteractives(container);
      expect(focusableLabels(container)).toEqual([
        'Open QA New League',
        'Run a mock draft for QA New League',
      ]);
    });

    it('fires onPress on a LeagueListRow open control when Enter or Space is pressed', () => {
      const summary: HomeLeagueSummary = {
        leagueId: 43,
        leagueName: 'Second League',
        sport: 'baseball',
        leaguePhase: 'active',
      };
      const onPress = jest.fn();
      const { container } = render(
        <LeagueListRow summary={summary} onPress={onPress} />,
      );
      const open = container.querySelector(
        '[data-accessibility-label="Open Second League"]',
      ) as HTMLElement;
      expect(open).toBeTruthy();
      fireEvent.keyDown(open, { key: 'Enter' });
      expect(onPress).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(open, { key: ' ' });
      expect(onPress).toHaveBeenCalledTimes(2);
      fireEvent.keyDown(open, { key: 'Tab' });
      expect(onPress).toHaveBeenCalledTimes(2);
    });

    it('opens the league once when the row body is clicked, and not when Mock Draft is', () => {
      const onPress = jest.fn();
      const onMockDraft = jest.fn();
      const { getByText } = render(
        <LeagueListRow
          summary={preDraftRow}
          onPress={onPress}
          onMockDraft={onMockDraft}
        />,
      );
      fireEvent.click(getByText('Draft scheduled'));
      expect(onPress).toHaveBeenCalledTimes(1);
      fireEvent.click(getByText('QA New League'));
      expect(onPress).toHaveBeenCalledTimes(2);
      fireEvent.click(getByText('Mock Draft'));
      expect(onMockDraft).toHaveBeenCalledTimes(1);
      expect(onPress).toHaveBeenCalledTimes(2);
    });
  });

  describe('quick actions (LS-9048)', () => {
    it('renders the quick-action row and fires its handlers', () => {
      const onCreateLeague = jest.fn();
      const onJoinLeague = jest.fn();
      const onBrowseStats = jest.fn();
      const onStartMockDraft = jest.fn();
      const { getByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          onCreateLeague={onCreateLeague}
          onJoinLeague={onJoinLeague}
          onBrowseStats={onBrowseStats}
          onStartMockDraft={onStartMockDraft}
        />,
      );
      fireEvent.click(getByTestId('home-quick-create-league'));
      fireEvent.click(getByTestId('home-quick-join-league'));
      fireEvent.click(getByTestId('home-quick-mock-draft'));
      fireEvent.click(getByTestId('home-quick-browse-stats'));
      expect(onCreateLeague).toHaveBeenCalledTimes(1);
      expect(onJoinLeague).toHaveBeenCalledTimes(1);
      expect(onStartMockDraft).toHaveBeenCalledTimes(1);
      expect(onBrowseStats).toHaveBeenCalledTimes(1);
    });

    it('disables the Mock Draft pill at the weekly cap', () => {
      const onStartMockDraft = jest.fn();
      const { getByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          onStartMockDraft={onStartMockDraft}
          mockDraftAtCap
        />,
      );
      fireEvent.click(getByTestId('home-quick-mock-draft'));
      expect(onStartMockDraft).not.toHaveBeenCalled();
    });

    it('omits the Mock Draft pill when no onStartMockDraft handler is provided', () => {
      const { queryByTestId } = render(
        <HomeScreen {...baseProps} leagues={[league]} />,
      );
      expect(queryByTestId('home-quick-mock-draft')).toBeNull();
    });
  });

  describe('football playboard hero (LS-9035)', () => {
    const footballLeague: HomeLeagueSummary = {
      leagueId: 51,
      leagueName: 'Steel Curtain Era',
      sport: 'football',
      leaguePhase: 'active',
      eraFilter: 'super_bowl_era',
      matchupId: 9,
      matchupStatus: 'in_progress',
      userScore: 84.5,
      opponentScore: 79.2,
      opponentTeamName: 'Steel Curtain',
      rank: 2,
      totalTeams: 10,
      teamCount: 10,
      currentWeekNumber: 9,
      totalMatchups: 17,
    };

    it('renders the playboard hero instead of the ticket hero for a football top league', () => {
      const { getByTestId, queryByTestId } = render(
        <HomeScreen {...baseProps} leagues={[footballLeague]} />,
      );
      expect(getByTestId('home-playboard-hero')).toBeTruthy();
      expect(queryByTestId('home-hero-card')).toBeNull();
    });

    it('renders the league identity, live header, and bug team plates', () => {
      const { getByText } = render(
        <HomeScreen {...baseProps} leagues={[footballLeague]} />,
      );
      expect(getByText('Steel Curtain Era')).toBeTruthy();
      expect(getByText(/Live · Week 9\/17/)).toBeTruthy();
      expect(getByText('Rank #2')).toBeTruthy();
      expect(getByText('84.5')).toBeTruthy();
      expect(getByText('79.2')).toBeTruthy();
      expect(getByText('SC')).toBeTruthy();
    });

    it('fires onViewLeague and onSetLineup from the playboard action buttons', () => {
      const onViewLeague = jest.fn();
      const onSetLineup = jest.fn();
      const { getByText } = render(
        <HomeScreen
          {...baseProps}
          leagues={[footballLeague]}
          onViewLeague={onViewLeague}
          onSetLineup={onSetLineup}
        />,
      );
      fireEvent.click(getByText('View League'));
      expect(onViewLeague).toHaveBeenCalledWith(footballLeague);
      fireEvent.click(getByText('Set Lineup'));
      expect(onSetLineup).toHaveBeenCalledWith(footballLeague);
    });

    it('still renders the baseball ticket hero when the top league is baseball', () => {
      const { getByTestId, queryByTestId } = render(
        <HomeScreen {...baseProps} leagues={[league]} />,
      );
      expect(getByTestId('home-hero-card')).toBeTruthy();
      expect(queryByTestId('home-playboard-hero')).toBeNull();
    });
  });

  describe('hero join-draft CTA (LS-10593)', () => {
    const draftingLeague: HomeLeagueSummary = {
      ...league,
      leaguePhase: 'pre-draft',
      draftStatus: 'in-progress',
      draftMode: 'snake',
    };

    it('renders Join Draft on the ticket hero while the draft is live and opens the draft room', () => {
      const onJoinDraft = jest.fn();
      const onViewLeague = jest.fn();
      const { getByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[draftingLeague]}
          onViewLeague={onViewLeague}
          onJoinDraft={onJoinDraft}
        />,
      );
      const button = getByTestId('home-hero-join-draft');
      expect(within(button).getByText('Join Draft')).toBeTruthy();
      fireEvent.click(button);
      expect(onJoinDraft).toHaveBeenCalledTimes(1);
      expect(onJoinDraft).toHaveBeenCalledWith(draftingLeague);
      // The card itself is pressable — the CTA must not also open the league.
      expect(onViewLeague).not.toHaveBeenCalled();
    });

    it('does not fire the card press handler on keyboard activation of Join Draft', () => {
      const onJoinDraft = jest.fn();
      const onViewLeague = jest.fn();
      const { getByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[draftingLeague]}
          onViewLeague={onViewLeague}
          onJoinDraft={onJoinDraft}
        />,
      );
      fireEvent.keyDown(getByTestId('home-hero-join-draft'), { key: 'Enter' });
      expect(onJoinDraft).toHaveBeenCalledTimes(1);
      expect(onViewLeague).not.toHaveBeenCalled();
    });

    it('labels the CTA Return to Draft while the draft is paused', () => {
      const { getByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[{ ...draftingLeague, draftStatus: 'paused' }]}
          onJoinDraft={jest.fn()}
        />,
      );
      expect(
        within(getByTestId('home-hero-join-draft')).getByText(
          'Return to Draft',
        ),
      ).toBeTruthy();
    });

    it('replaces Set Lineup with the draft CTA and keeps View League', () => {
      const onViewLeague = jest.fn();
      const { getByTestId, queryByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[draftingLeague]}
          onViewLeague={onViewLeague}
          onSetLineup={jest.fn()}
          onJoinDraft={jest.fn()}
        />,
      );
      expect(queryByTestId('home-hero-set-lineup')).toBeNull();
      fireEvent.click(getByTestId('home-hero-view-league'));
      expect(onViewLeague).toHaveBeenCalledTimes(1);
      expect(onViewLeague).toHaveBeenCalledWith(draftingLeague);
    });

    it.each([['not-started'], ['queued'], ['completed'], [null]])(
      'hides the CTA when draftStatus is %s',
      (draftStatus) => {
        const { queryByTestId, getByTestId } = render(
          <HomeScreen
            {...baseProps}
            leagues={[{ ...league, draftStatus }]}
            onSetLineup={jest.fn()}
            onJoinDraft={jest.fn()}
          />,
        );
        expect(queryByTestId('home-hero-join-draft')).toBeNull();
        expect(getByTestId('home-hero-set-lineup')).toBeTruthy();
      },
    );

    it('hides the CTA when no onJoinDraft handler is supplied', () => {
      const { queryByTestId } = render(
        <HomeScreen {...baseProps} leagues={[draftingLeague]} />,
      );
      expect(queryByTestId('home-hero-join-draft')).toBeNull();
    });

    it('renders Join Draft on the football playboard hero while drafting', () => {
      const footballDrafting: HomeLeagueSummary = {
        ...draftingLeague,
        leagueId: 77,
        sport: 'football',
      };
      const onJoinDraft = jest.fn();
      const onViewLeague = jest.fn();
      const { getByTestId, queryByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[footballDrafting]}
          onViewLeague={onViewLeague}
          onSetLineup={jest.fn()}
          onJoinDraft={onJoinDraft}
        />,
      );
      expect(queryByTestId('home-playboard-set-lineup')).toBeNull();
      fireEvent.click(getByTestId('home-playboard-join-draft'));
      expect(onJoinDraft).toHaveBeenCalledWith(footballDrafting);
      expect(onViewLeague).not.toHaveBeenCalled();
    });

    it('renders Join Draft on the hero in the narrow layout', () => {
      (useMedia as jest.Mock).mockReturnValue({ xs: true, sm: true });
      const onJoinDraft = jest.fn();
      const { getByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[draftingLeague]}
          onJoinDraft={onJoinDraft}
        />,
      );
      fireEvent.click(getByTestId('home-hero-join-draft'));
      expect(onJoinDraft).toHaveBeenCalledWith(draftingLeague);
    });
  });

  describe('no-current-matchup hero state (LS-9047)', () => {
    it('renders the baseball standing block (record + rank) in place of the score zone', () => {
      // `league` has no matchupId/matchupStatus — the no-matchup branch.
      const { getByText } = render(
        <HomeScreen {...baseProps} leagues={[league]} />,
      );
      expect(getByText('Active · Week 8/14')).toBeTruthy();
      expect(getByText('6-2')).toBeTruthy();
      expect(getByText('Record')).toBeTruthy();
      expect(getByText('#1')).toBeTruthy();
      expect(getByText('of 10')).toBeTruthy();
    });

    it('renders the football bye-week header and standing row on the bug', () => {
      const byeWeekLeague: HomeLeagueSummary = {
        leagueId: 52,
        leagueName: 'Steel Curtain Era',
        sport: 'football',
        leaguePhase: 'active',
        wins: 5,
        losses: 3,
        rank: 2,
        totalTeams: 10,
        teamCount: 10,
        currentWeekNumber: 9,
        totalMatchups: 17,
      };
      const { getByText, getByTestId } = render(
        <HomeScreen {...baseProps} leagues={[byeWeekLeague]} />,
      );
      expect(getByText('Bye week · Week 9/17')).toBeTruthy();
      expect(getByText('Standing')).toBeTruthy();
      expect(getByText('#2')).toBeTruthy();
      expect(getByText('5-3')).toBeTruthy();
      expect(getByTestId('home-playboard-hero')).toBeTruthy();
    });
  });

  // Folded in from MobileHomeScreen.spec.tsx (LS-8794) by LS-9055 — the
  // narrow branch now reuses the hero card / league list / quick-action
  // pieces above instead of a separate mobile-only implementation, so this
  // section only covers what's still narrow-specific (greeting, live-matchup
  // ticker) plus the fold's port-forward of AC4.
  describe('narrow-viewport "Scoreboard First" layout (LS-8794, folded by LS-9055)', () => {
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

    beforeEach(() => {
      // `xs`, not `sm`: the narrow gate is keyed to the design system's phone
      // band (≤799). It read `sm` until LS-9898 widened that token to 859,
      // which would have put small tablets on the phone layout.
      (useMedia as jest.Mock).mockReturnValue({ xs: true });
    });

    it('renders the compact greeting instead of the wide GreetingHeader', () => {
      const { getByTestId, getByText, queryByText } = render(
        <HomeScreen {...baseProps} leagues={[league]} />,
      );
      expect(getByTestId('home-greeting')).toBeTruthy();
      expect(getByText('Casey')).toBeTruthy();
      // The wide branch's H1-based greeting shows "Welcome, {name}" copy on
      // the new-user view only; the returning-user H1 greeting has no
      // distinguishing text of its own, so assert structurally via testID
      // instead — `home-greeting` only exists on the narrow branch.
      expect(queryByText('Pick your sport')).toBeNull();
    });

    it('fires onOpenProfile when the avatar is pressed', () => {
      const onOpenProfile = jest.fn();
      const { getByText } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          onOpenProfile={onOpenProfile}
        />,
      );
      fireEvent.click(getByText('C'));
      expect(onOpenProfile).toHaveBeenCalledTimes(1);
    });

    // LS-9783: home caps the inline league list at 2 (hero + 1 row); "Show
    // all leagues" only appears once there's a third league to hide.
    const secondLeague: HomeLeagueSummary = {
      ...league,
      leagueId: 44,
      leagueName: 'Second League',
    };
    const thirdLeague: HomeLeagueSummary = {
      ...league,
      leagueId: 45,
      leagueName: 'Third League',
    };

    it('fires onSeeAllLeagues from "Show all leagues" when there are more than 2 leagues', () => {
      const onSeeAllLeagues = jest.fn();
      const { getByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league, secondLeague, thirdLeague]}
          onSeeAllLeagues={onSeeAllLeagues}
        />,
      );
      fireEvent.click(getByTestId('home-see-all-leagues'));
      expect(onSeeAllLeagues).toHaveBeenCalledTimes(1);
    });

    it('omits "Show all leagues" when a handler is supplied but there are 2 or fewer leagues', () => {
      const { queryByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league, secondLeague]}
          onSeeAllLeagues={jest.fn()}
        />,
      );
      expect(queryByTestId('home-see-all-leagues')).toBeNull();
    });

    it('omits "Show all leagues" when no handler is supplied', () => {
      const { queryByTestId } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league, secondLeague, thirdLeague]}
        />,
      );
      expect(queryByTestId('home-see-all-leagues')).toBeNull();
    });

    it('caps the inline league list at 2 leagues (hero + one row)', () => {
      const { getByText, queryByText } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league, secondLeague, thirdLeague]}
          onSeeAllLeagues={jest.fn()}
        />,
      );
      // `league` is the hero (rendered via the hero card, not a list row);
      // `secondLeague` fills the one remaining inline slot.
      expect(getByText('Second League')).toBeTruthy();
      expect(queryByText('Third League')).toBeNull();
    });

    describe('live matchup ticker', () => {
      it('is hidden entirely when no league has a live matchup', () => {
        const { queryByTestId } = render(
          <HomeScreen {...baseProps} leagues={[league]} />,
        );
        expect(queryByTestId('home-live-ticker')).toBeNull();
      });

      it('renders week, scores and the opponent when a matchup is in progress', () => {
        // `liveLeague` is also the most-urgent (hero) league, so its score
        // legitimately appears twice — once in the ticker banner, once in
        // the hero card below. Scope assertions to the ticker itself.
        const { getByTestId } = render(
          <HomeScreen {...baseProps} leagues={[league, liveLeague]} />,
        );
        const ticker = within(getByTestId('home-live-ticker'));
        expect(ticker.getByText('Live · Week 8')).toBeTruthy();
        expect(ticker.getByText(/^Closes /)).toBeTruthy();
        expect(ticker.getByText('12.5')).toBeTruthy();
        expect(ticker.getByText('9.3')).toBeTruthy();
        expect(ticker.getByText('Rival FC')).toBeTruthy();
      });

      it('falls back to 0.0 rather than throwing on a non-numeric score (LS-8668)', () => {
        const malformed: HomeLeagueSummary = {
          ...liveLeague,
          userScore: 'DNP' as unknown as number,
        };
        expect(() =>
          render(<HomeScreen {...baseProps} leagues={[malformed]} />),
        ).not.toThrow();
      });

      it('fires onSetLineup for the live league', () => {
        const onSetLineup = jest.fn();
        const { getByTestId } = render(
          <HomeScreen
            {...baseProps}
            leagues={[league, liveLeague]}
            onSetLineup={onSetLineup}
          />,
        );
        fireEvent.click(getByTestId('home-ticker-set-lineup'));
        expect(onSetLineup).toHaveBeenCalledWith(liveLeague);
      });

      it('fires onViewMatchup for the live league', () => {
        const onViewMatchup = jest.fn();
        const { getByTestId } = render(
          <HomeScreen
            {...baseProps}
            leagues={[liveLeague]}
            onViewMatchup={onViewMatchup}
          />,
        );
        fireEvent.click(getByTestId('home-ticker-matchup'));
        expect(onViewMatchup).toHaveBeenCalledWith(liveLeague);
      });

      it('falls back to onViewLeague when no onViewMatchup handler is supplied', () => {
        const onViewLeague = jest.fn();
        const { getByTestId } = render(
          <HomeScreen
            {...baseProps}
            leagues={[liveLeague]}
            onViewLeague={onViewLeague}
          />,
        );
        fireEvent.click(getByTestId('home-ticker-matchup'));
        expect(onViewLeague).toHaveBeenCalledWith(liveLeague);
      });
    });

    // AC4 — the hero card, glass league rows and quick-action pills are the
    // exact same components the wide branch renders (see the "returning-user
    // dashboard", "quick actions (LS-9048)" and "football playboard hero
    // (LS-9035)" describe blocks above), so this only proves they show up on
    // the narrow branch too rather than re-asserting their internals.
    describe('ported wide-viewport features (AC4)', () => {
      it('renders the baseball ticket hero for a baseball top league', () => {
        const { getByTestId } = render(
          <HomeScreen {...baseProps} leagues={[league]} />,
        );
        expect(getByTestId('home-hero-card')).toBeTruthy();
      });

      it('renders the football playboard hero for a football top league', () => {
        const footballLeague: HomeLeagueSummary = {
          ...league,
          leagueId: 51,
          leagueName: 'Steel Curtain Era',
          sport: 'football',
        };
        const { getByTestId } = render(
          <HomeScreen {...baseProps} leagues={[footballLeague]} />,
        );
        expect(getByTestId('home-playboard-hero')).toBeTruthy();
      });

      it('renders a glass secondary league row', () => {
        const secondary: HomeLeagueSummary = {
          ...league,
          leagueId: 99,
          leagueName: 'Second League',
        };
        const { getByText } = render(
          <HomeScreen {...baseProps} leagues={[league, secondary]} />,
        );
        expect(getByText('Second League')).toBeTruthy();
      });

      it('renders the quick-action pill row and fires its handlers', () => {
        const onCreateLeague = jest.fn();
        const { getByTestId } = render(
          <HomeScreen
            {...baseProps}
            leagues={[league]}
            onCreateLeague={onCreateLeague}
          />,
        );
        fireEvent.click(getByTestId('home-quick-create-league'));
        expect(onCreateLeague).toHaveBeenCalledTimes(1);
      });

      it('renders the On This Day panel, preferring the condensed node', () => {
        const { getByText, queryByText } = render(
          <HomeScreen
            {...baseProps}
            leagues={[league]}
            onThisDay={<span>FULL-FEED</span>}
            onThisDayCondensed={<span>CONDENSED-FEED</span>}
          />,
        );
        expect(getByText('CONDENSED-FEED')).toBeTruthy();
        expect(queryByText('FULL-FEED')).toBeNull();
      });

      it('falls back to the full On This Day node when no condensed node is supplied', () => {
        const { getByText } = render(
          <HomeScreen
            {...baseProps}
            leagues={[league]}
            onThisDay={<span>FULL-FEED</span>}
          />,
        );
        expect(getByText('FULL-FEED')).toBeTruthy();
      });
    });

    // Matches MobileHomeScreen's deliberate pre-fold behavior — the narrow
    // layout still has no archived-leagues affordance.
    it('does not render the archived-leagues toggle', () => {
      const { queryByText } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          archivedCount={3}
          onShowArchived={jest.fn()}
        />,
      );
      expect(queryByText('Show 3 archived leagues')).toBeNull();
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

    it('shows the local-time next-free-draft date at cap when resetsAt is set', () => {
      const resetsAt = '2026-10-09T16:00:00.000Z';
      const { getByText, queryByText } = render(
        <HomeScreen
          {...baseProps}
          onStartMockDraft={jest.fn()}
          mockDraftAtCap
          mockDraftResetsAt={resetsAt}
        />,
      );
      expect(
        getByText(
          `You've used your free mock drafts this week. Upgrade, or your next free draft opens ${formatDraftDate(resetsAt)}.`,
        ),
      ).toBeTruthy();
      expect(queryByText(/check back next week/i)).toBeNull();
    });

    it('keeps the "check back next week" fallback at cap when resetsAt is null', () => {
      const { getByText } = render(
        <HomeScreen
          {...baseProps}
          onStartMockDraft={jest.fn()}
          mockDraftAtCap
          mockDraftResetsAt={null}
        />,
      );
      expect(
        getByText(
          "You've used your free mock drafts this week. Upgrade or check back next week.",
        ),
      ).toBeTruthy();
    });
  });

  describe('loading and error states', () => {
    it('renders the loading skeleton', () => {
      const { getByTestId } = render(<HomeScreen {...baseProps} loading />);
      expect(getByTestId('home-skeleton')).toBeTruthy();
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

  describe('archived leagues (LS-8633)', () => {
    it('fires onShowArchived when the show-archived button is pressed', () => {
      const onShowArchived = jest.fn();
      const { getByText } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          onShowArchived={onShowArchived}
        />,
      );
      fireEvent.click(getByText('Show archived leagues'));
      expect(onShowArchived).toHaveBeenCalledTimes(1);
    });

    it('does not render the show-archived button when onShowArchived is absent', () => {
      const { queryByText } = render(
        <HomeScreen {...baseProps} leagues={[league]} />,
      );
      expect(queryByText('Show archived leagues')).toBeNull();
    });

    it('shows a loading spinner while archived leagues are being fetched', () => {
      const { getByText, queryByText } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          showArchived
          archivedLoading
        />,
      );
      expect(getByText('Loading archived leagues…')).toBeTruthy();
      expect(queryByText('No archived leagues.')).toBeNull();
    });

    it('renders the archived list when archived leagues are present', () => {
      const archived: HomeLeagueSummary = { ...league, leagueId: 99 };
      const { getByText } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          showArchived
          archivedLeagues={[archived]}
        />,
      );
      expect(getByText('Archived')).toBeTruthy();
    });

    it('renders an explicit empty state instead of nothing when there are zero archived leagues (LS-8633)', () => {
      const { getByText } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          showArchived
          archivedLoading={false}
          archivedLeagues={[]}
        />,
      );
      expect(getByText('No archived leagues.')).toBeTruthy();
    });

    it('fires onHideArchived from the empty state, giving the user a way back (LS-8633)', () => {
      const onHideArchived = jest.fn();
      const { getByText } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          showArchived
          archivedLoading={false}
          archivedLeagues={[]}
          onHideArchived={onHideArchived}
        />,
      );
      fireEvent.click(getByText('▾ Archived'));
      expect(onHideArchived).toHaveBeenCalledTimes(1);
    });

    it('fires onHideArchived from the header when the archived list is non-empty', () => {
      const archived: HomeLeagueSummary = { ...league, leagueId: 99 };
      const onHideArchived = jest.fn();
      const { getByText } = render(
        <HomeScreen
          {...baseProps}
          leagues={[league]}
          showArchived
          archivedLeagues={[archived]}
          onHideArchived={onHideArchived}
        />,
      );
      fireEvent.click(getByText('▾ Archived'));
      expect(onHideArchived).toHaveBeenCalledTimes(1);
    });
  });

  describe('top safe-area inset (LS-8625)', () => {
    // The global `tamagui` jest mock strips layout props (including
    // paddingTop) before they reach the DOM, so this only asserts that
    // passing topInset through every render branch doesn't throw. The
    // paddingTop wiring itself is covered by reading HomeScreen.tsx's five
    // ScrollView returns (loading, error, new-user, and the narrow/wide
    // returning-user branches) and by home.spec.tsx (HomeTab forwards
    // topInset).
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

    it('accepts topInset on the narrow returning-user branch without throwing', () => {
      (useMedia as jest.Mock).mockReturnValue({ xs: true });
      expect(() =>
        render(<HomeScreen {...baseProps} leagues={[league]} topInset={44} />),
      ).not.toThrow();
    });
  });

  // LS-9248 — mobile's Home tab scrolls this screen back to the top when the
  // tab regains focus, which only works if every render branch attaches the
  // ref. A branch that forgets it silently keeps the user's old offset.
  describe('scrollRef (LS-9248)', () => {
    const renderWithRef = (props: Partial<HomeScreenProps>) => {
      const ref = React.createRef<ScrollViewHandle>();
      render(<HomeScreen {...baseProps} {...props} scrollRef={ref} />);
      return ref;
    };

    it('attaches the ref on the new-user branch', () => {
      expect(renderWithRef({}).current).not.toBeNull();
    });

    it('attaches the ref on the returning-user branch', () => {
      expect(renderWithRef({ leagues: [league] }).current).not.toBeNull();
    });

    it('attaches the ref on the narrow returning-user branch', () => {
      (useMedia as jest.Mock).mockReturnValue({ xs: true });
      expect(renderWithRef({ leagues: [league] }).current).not.toBeNull();
    });

    it('attaches the ref on the loading branch', () => {
      expect(renderWithRef({ loading: true }).current).not.toBeNull();
    });

    it('attaches the ref on the error branch', () => {
      expect(renderWithRef({ error: true }).current).not.toBeNull();
    });
  });
});
