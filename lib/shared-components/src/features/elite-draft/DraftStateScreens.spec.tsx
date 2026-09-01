/**
 * LS-4647 / LS-9060: LoadingScreen must mirror the populated DraftTopBand +
 * main + DraftRail layout shapes so the loading → populated reveal is a
 * content swap, not a reflow. Pins the high-level skeleton structure
 * (topband, main pane with card grid, right rail with panel placeholders) so
 * silent removal of any of those regions fails fast in CI. Ported from
 * className/querySelector assertions to testID lookups when DraftStateScreens
 * moved off styles.ts onto Tamagui primitives (LS-9060) — there are no more
 * CSS classes on these elements to select against.
 */
import React from 'react';
import {
  AuctionNotSupportedScreen,
  AutomatedDraftScreen,
  LeagueErrorScreen,
  LoadingScreen,
  NoLeagueScreen,
  PlayersErrorScreen,
} from './DraftStateScreens';
import { render } from '../../test-utils';
import { Platform } from '../../platform-components';

// LS-9364's CSS Grid assertion checks an inline `display: grid` /
// `gridTemplateColumns` style. Those keys have no React Native equivalent and
// are stripped by `csp()` on native (see crossPlatformStyle.ts), so the
// assertion is meaningful on web only — same pattern as
// PlayersStatsTable.spec.tsx's `describeWeb`.
const itWeb = Platform.OS === 'web' ? it : it.skip;

describe('LoadingScreen (LS-4647 / LS-9060)', () => {
  it('renders the layout shell with topband, main, and rail skeletons', () => {
    const { getByTestId } = render(<LoadingScreen />);

    expect(getByTestId('draft-board-loading')).toBeTruthy();
    expect(getByTestId('draft-loading-layout')).toBeTruthy();
    expect(getByTestId('draft-loading-topband')).toBeTruthy();
    expect(getByTestId('draft-loading-main')).toBeTruthy();
    expect(getByTestId('draft-loading-rail')).toBeTruthy();
  });

  it('renders topband sub-regions (status, timer, slab, autopick)', () => {
    const { getByTestId } = render(<LoadingScreen />);

    expect(getByTestId('draft-loading-tb-status')).toBeTruthy();
    expect(getByTestId('draft-loading-tb-timer')).toBeTruthy();
    expect(getByTestId('draft-loading-tb-clock')).toBeTruthy();
    expect(getByTestId('draft-loading-tb-autopick')).toBeTruthy();
  });

  it('renders a 9-card main pane skeleton grid', () => {
    const { getByTestId } = render(<LoadingScreen />);

    const grid = getByTestId('draft-loading-player-grid');
    expect(grid.children.length).toBe(9);
  });

  // LS-9364: the skeleton grid must use the same CSS Grid template as the
  // real player-pool grid (DraftPlayerBoard's `gridCols` for viewMode
  // 'grid') — a `flexWrap` container gives each SkeletonCard no definite
  // width for its percentage-width bars to resolve against, collapsing the
  // card and reflowing the whole grid once real data replaces the skeleton.
  itWeb(
    'sizes the skeleton grid with the same CSS Grid template as the real player-pool grid',
    () => {
      const { getByTestId } = render(<LoadingScreen />);

      const grid = getByTestId('draft-loading-player-grid');
      expect(grid.style.display).toBe('grid');
      expect(grid.style.gridTemplateColumns).toBe(
        'repeat(auto-fill, minmax(320px, 1fr))',
      );
    },
  );

  it('renders a stack of rail panel skeletons', () => {
    const { getAllByTestId } = render(<LoadingScreen />);

    expect(getAllByTestId('draft-loading-rail-panel').length).toBe(4);
  });

  it('exposes loading state to assistive tech', () => {
    const { getByTestId } = render(<LoadingScreen />);
    const root = getByTestId('draft-board-loading');

    expect(root.getAttribute('role')).toBe('status');
    expect(root.getAttribute('aria-busy')).toBe('true');
    expect(root.getAttribute('aria-label')).toBe('Loading draft board');
  });
});

describe('NoLeagueScreen', () => {
  it('renders the empty-state copy and navigates on button click', () => {
    const onNavigate = jest.fn();
    const { getByText } = render(<NoLeagueScreen onNavigate={onNavigate} />);

    expect(getByText('Live Draft Board')).toBeTruthy();
    getByText('Go to Leagues').click();
    expect(onNavigate).toHaveBeenCalledWith('/baseball');
  });
});

describe('LeagueErrorScreen', () => {
  it('shows an unauthorized-specific message when isUnauthorized', () => {
    const { getByText } = render(
      <LeagueErrorScreen isUnauthorized onNavigate={jest.fn()} />,
    );

    expect(getByText('Access Denied')).toBeTruthy();
    expect(getByText("You don't have access to this draft room.")).toBeTruthy();
  });

  it('shows a not-found message when not unauthorized', () => {
    const { getByText } = render(
      <LeagueErrorScreen isUnauthorized={false} onNavigate={jest.fn()} />,
    );

    expect(getByText('League Not Found')).toBeTruthy();
  });
});

describe('PlayersErrorScreen', () => {
  it('renders the provided error message and retries on click', () => {
    const onRetry = jest.fn();
    const { getByText } = render(
      <PlayersErrorScreen message="Network error" onRetry={onRetry} />,
    );

    expect(getByText('Network error')).toBeTruthy();
    getByText('Try Again').click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic message when none is provided', () => {
    const { getByText } = render(
      <PlayersErrorScreen message="" onRetry={jest.fn()} />,
    );

    expect(
      getByText('An error occurred while fetching player data.'),
    ).toBeTruthy();
  });
});

describe('AutomatedDraftScreen', () => {
  it('renders the automated-draft copy with no action button', () => {
    const { getByText, queryByRole } = render(<AutomatedDraftScreen />);

    expect(getByText('Draft in Progress')).toBeTruthy();
    expect(queryByRole('button')).toBeNull();
  });
});

describe('AuctionNotSupportedScreen (LS-9207)', () => {
  it('navigates to the league when a leagueId is present', () => {
    const onNavigate = jest.fn();
    const { getByText } = render(
      <AuctionNotSupportedScreen leagueId={42} onNavigate={onNavigate} />,
    );

    expect(getByText('Auction Draft')).toBeTruthy();
    getByText('Back to League').click();
    expect(onNavigate).toHaveBeenCalledWith('/baseball/league/42');
  });

  it('falls back to the leagues list when leagueId is null', () => {
    const onNavigate = jest.fn();
    const { getByText } = render(
      <AuctionNotSupportedScreen leagueId={null} onNavigate={onNavigate} />,
    );

    getByText('Back to League').click();
    expect(onNavigate).toHaveBeenCalledWith('/baseball');
  });
});
