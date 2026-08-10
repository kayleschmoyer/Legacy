import React from 'react';
import { NFLHome, type NFLHomeLeague } from './NFLHome';
import { fireEvent, render, screen, within } from '../../test-utils';

// LS-6257 (FBH-003) — the leagues list previously rendered every league
// eagerly (plain ScrollView + .map() on web, ScrollView + .map() on native).
// These tests cover the data-flow contract that survived the switch to a
// windowed list (@tanstack/react-virtual on web, FlatList on native): every
// league still renders exactly once, click-through still fires
// onViewLeague, and the pre-existing auth/loading/error/empty states are
// untouched. Actual windowing behaviour is exercised by the jest mocks for
// FlatList / useVirtualizer, which render every item — so these tests
// assert correctness of output, not the windowing optimization itself.

function makeLeagues(count: number): NFLHomeLeague[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `League ${i + 1}`,
    draftStatus: 'completed',
    currentWeekNumber: 4,
    weekAdvanceStatus: null,
  }));
}

const noop = () => {
  // Intentionally empty — default handler for props this suite doesn't assert on.
};

describe('NFLHome — leagues list virtualization (LS-6257)', () => {
  it('renders a row for every league, including heavy users with 10+ leagues', () => {
    const leagues = makeLeagues(15);
    render(
      <NFLHome leagues={leagues} onCreateLeague={noop} onViewLeague={noop} />,
    );

    leagues.forEach((league) => {
      expect(
        screen.getByTestId(`football-league-row-${league.id}`),
      ).toBeInTheDocument();
      expect(screen.getByText(league.name ?? '')).toBeInTheDocument();
    });
  });

  it('invokes onViewLeague when a row is pressed', () => {
    const leagues = makeLeagues(3);
    const onViewLeague = jest.fn();
    render(
      <NFLHome
        leagues={leagues}
        onCreateLeague={noop}
        onViewLeague={onViewLeague}
      />,
    );

    fireEvent.click(screen.getByTestId('football-league-row-2'));
    expect(onViewLeague).toHaveBeenCalledWith(2);
  });

  it('renders the sign-in CTA when unauthenticated, without rendering the list', () => {
    render(
      <NFLHome
        leagues={makeLeagues(5)}
        isAuthenticated={false}
        onCreateLeague={noop}
        onViewLeague={noop}
        onSignIn={noop}
      />,
    );

    expect(
      screen.getByText('Sign in to manage your fantasy football leagues'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('football-league-row-1'),
    ).not.toBeInTheDocument();
  });

  it('renders the loading state instead of the list', () => {
    render(
      <NFLHome
        leagues={makeLeagues(5)}
        loading
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );

    expect(
      screen.queryByTestId('football-league-row-1'),
    ).not.toBeInTheDocument();
  });

  it('renders the error state instead of the list', () => {
    render(
      <NFLHome
        leagues={makeLeagues(5)}
        error
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );

    expect(screen.getByText('Could not load your leagues')).toBeInTheDocument();
    expect(
      screen.queryByTestId('football-league-row-1'),
    ).not.toBeInTheDocument();
  });

  it('renders the empty state when there are no leagues', () => {
    render(<NFLHome leagues={[]} onCreateLeague={noop} onViewLeague={noop} />);

    expect(screen.getByText('No football leagues yet')).toBeInTheDocument();
  });
});

describe('NFLHome — league row metadata (LS-6256)', () => {
  it('renders the roster size under the league name when maxRosterSize is present', () => {
    const league: NFLHomeLeague = {
      id: 1,
      name: 'Grid Iron Legends',
      draftStatus: 'completed',
      currentWeekNumber: 4,
      maxRosterSize: 16,
    };
    render(
      <NFLHome leagues={[league]} onCreateLeague={noop} onViewLeague={noop} />,
    );
    expect(screen.getByText('Grid Iron Legends')).toBeInTheDocument();
    expect(screen.getByText('16-slot roster')).toBeInTheDocument();
  });

  it('omits the roster-size line when maxRosterSize is absent', () => {
    const league: NFLHomeLeague = {
      id: 2,
      name: 'No Roster Info League',
      draftStatus: 'completed',
      currentWeekNumber: 4,
    };
    render(
      <NFLHome leagues={[league]} onCreateLeague={noop} onViewLeague={noop} />,
    );
    expect(screen.queryByText(/-slot roster/)).not.toBeInTheDocument();
  });

  it('renders "Advancing" badge when weekAdvanceStatus is processing', () => {
    const league: NFLHomeLeague = {
      id: 3,
      name: 'Advancing League',
      draftStatus: 'completed',
      currentWeekNumber: 6,
      weekAdvanceStatus: 'processing',
    };
    render(
      <NFLHome leagues={[league]} onCreateLeague={noop} onViewLeague={noop} />,
    );
    expect(screen.getByText('Advancing')).toBeInTheDocument();
  });

  it('renders "Advance failed" badge when weekAdvanceStatus is failed', () => {
    const league: NFLHomeLeague = {
      id: 4,
      name: 'Failed League',
      draftStatus: 'completed',
      currentWeekNumber: 3,
      weekAdvanceStatus: 'failed',
    };
    render(
      <NFLHome leagues={[league]} onCreateLeague={noop} onViewLeague={noop} />,
    );
    expect(screen.getByText('Advance failed')).toBeInTheDocument();
  });
});

describe('NFLHome — matchup highlight card (LS-5407)', () => {
  it('renders the highlight card with both team names and the week when a matchup is scheduled', () => {
    const league: NFLHomeLeague = {
      id: 1,
      name: 'Test Football League',
      draftStatus: 'completed',
      currentWeekNumber: 3,
    };
    render(
      <NFLHome
        leagues={[league]}
        onCreateLeague={noop}
        onViewLeague={noop}
        matchupHighlight={{
          leagueId: 1,
          leagueName: 'Test Football League',
          weekNumber: 3,
          awayTeamName: 'Alpha Offense',
          homeTeamName: 'Beta Defense',
          status: 'pre',
        }}
      />,
    );

    const card = screen.getByTestId('matchup-highlight-card');
    expect(card).toBeInTheDocument();
    expect(within(card).getByText('Alpha Offense')).toBeInTheDocument();
    expect(within(card).getByText('Beta Defense')).toBeInTheDocument();
    expect(within(card).getByText(/Week 3/)).toBeInTheDocument();
  });

  it('omits the highlight card when no matchup is scheduled', () => {
    const league: NFLHomeLeague = {
      id: 1,
      name: 'Test Football League',
      draftStatus: 'not-started',
      currentWeekNumber: null,
    };
    render(
      <NFLHome
        leagues={[league]}
        onCreateLeague={noop}
        onViewLeague={noop}
        matchupHighlight={null}
      />,
    );

    expect(
      screen.queryByTestId('matchup-highlight-card'),
    ).not.toBeInTheDocument();
  });
});
