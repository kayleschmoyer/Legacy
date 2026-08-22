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

  it('renders the loading skeleton instead of the list', () => {
    render(
      <NFLHome
        leagues={makeLeagues(5)}
        loading
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );

    expect(screen.getByTestId('football-leagues-skeleton')).toBeInTheDocument();
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

describe('NFLHome — CTA copy consistency (LS-6268, FBH-014)', () => {
  // Native, web full hero, and web compact hero all render through this one
  // shared hero — there is no separate compact variant to diverge from "Create
  // League" the way the pre-LS-7819 web-only FootballLandingPage could.
  it('renders "Create League" on the hero CTA for a returning user with leagues', () => {
    render(
      <NFLHome
        leagues={makeLeagues(2)}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );
    const button = screen.getByTestId('create-league-button');
    expect(within(button).getByText('Create League')).toBeInTheDocument();
  });

  it('renders "Create League" on the hero CTA for a first-time user with no leagues', () => {
    render(<NFLHome leagues={[]} onCreateLeague={noop} onViewLeague={noop} />);
    const button = screen.getByTestId('create-league-button');
    expect(within(button).getByText('Create League')).toBeInTheDocument();
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

  it('renders a "Setup" status badge when draftStatus is null (LS-6259)', () => {
    const league: NFLHomeLeague = {
      id: 5,
      name: 'Brand New League',
      draftStatus: null,
      currentWeekNumber: null,
    };
    render(
      <NFLHome leagues={[league]} onCreateLeague={noop} onViewLeague={noop} />,
    );
    expect(screen.getByText('Setup')).toBeInTheDocument();
  });
});

describe('NFLHome — player discovery entry point (LS-5411)', () => {
  it('does not render the Browse Players CTA when onBrowsePlayers is omitted', () => {
    render(<NFLHome leagues={[]} onCreateLeague={noop} onViewLeague={noop} />);
    expect(
      screen.queryByTestId('browse-players-button'),
    ).not.toBeInTheDocument();
  });

  it('renders the Browse Players CTA and invokes onBrowsePlayers when pressed', () => {
    const onBrowsePlayers = jest.fn();
    render(
      <NFLHome
        leagues={[]}
        onCreateLeague={noop}
        onViewLeague={noop}
        onBrowsePlayers={onBrowsePlayers}
      />,
    );
    fireEvent.click(screen.getByTestId('browse-players-button'));
    expect(onBrowsePlayers).toHaveBeenCalledTimes(1);
  });

  it('omits the trending players section when trendingPlayers is not passed', () => {
    render(<NFLHome leagues={[]} onCreateLeague={noop} onViewLeague={noop} />);
    expect(
      screen.queryByTestId('trending-players-preview'),
    ).not.toBeInTheDocument();
  });

  it('renders a preview row for each trending player', () => {
    render(
      <NFLHome
        leagues={[]}
        onCreateLeague={noop}
        onViewLeague={noop}
        trendingPlayers={[
          { id: 1, firstName: 'Pat', lastName: 'Mahomes', position: 'QB' },
          { id: 2, firstName: 'Josh', lastName: 'Allen', position: 'QB' },
        ]}
      />,
    );
    expect(screen.getByTestId('trending-players-preview')).toBeInTheDocument();
    expect(screen.getByTestId('trending-player-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('trending-player-row-2')).toBeInTheDocument();
  });
});

describe('NFLHome — league-cap indicator (LS-8928)', () => {
  it('omits the indicator when leagueCap is not provided', () => {
    render(<NFLHome leagues={[]} onCreateLeague={noop} onViewLeague={noop} />);
    expect(screen.queryByText(/Your leagues:/)).not.toBeInTheDocument();
  });

  it('renders the persistent count/limit indicator with cross-sport copy', () => {
    render(
      <NFLHome
        leagues={[]}
        onCreateLeague={noop}
        onViewLeague={noop}
        leagueCap={{ count: 2, limit: 3, atLimit: false, onUpgrade: noop }}
      />,
    );
    expect(
      screen.getByTestId('football-league-cap-indicator'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Your leagues: 2\/3.*counts across every sport/),
    ).toBeInTheDocument();
  });

  it('shows "Upgrade to add more" copy and invokes onUpgrade when at cap', () => {
    const onUpgrade = jest.fn();
    render(
      <NFLHome
        leagues={[]}
        onCreateLeague={noop}
        onViewLeague={noop}
        leagueCap={{ count: 3, limit: 3, atLimit: true, onUpgrade }}
      />,
    );
    const upgradeCta = screen.getByText('— Upgrade to add more');
    fireEvent.click(upgradeCta);
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('shows "Upgrade to Premium" copy when under cap', () => {
    render(
      <NFLHome
        leagues={[]}
        onCreateLeague={noop}
        onViewLeague={noop}
        leagueCap={{ count: 1, limit: 3, atLimit: false, onUpgrade: noop }}
      />,
    );
    expect(screen.getByText('— Upgrade to Premium')).toBeInTheDocument();
  });
});

describe('NFLHome — Join League CTA (LS-6288)', () => {
  it('does not render the Join League CTA when onJoinLeague is omitted', () => {
    render(<NFLHome leagues={[]} onCreateLeague={noop} onViewLeague={noop} />);
    expect(screen.queryByTestId('join-league-button')).not.toBeInTheDocument();
  });

  it('renders the Join League CTA and invokes onJoinLeague when pressed', () => {
    const onJoinLeague = jest.fn();
    render(
      <NFLHome
        leagues={[]}
        onCreateLeague={noop}
        onViewLeague={noop}
        onJoinLeague={onJoinLeague}
      />,
    );

    const joinBtn = screen.getByTestId('join-league-button');
    expect(joinBtn).toBeInTheDocument();
    expect(screen.getByText('Join League')).toBeInTheDocument();

    fireEvent.click(joinBtn);
    expect(onJoinLeague).toHaveBeenCalledTimes(1);
  });

  it('renders the Join League CTA in the empty-state layout, matching native parity', () => {
    render(
      <NFLHome
        leagues={[]}
        onCreateLeague={noop}
        onViewLeague={noop}
        onJoinLeague={noop}
      />,
    );
    expect(screen.getByText('No football leagues yet')).toBeInTheDocument();
    expect(screen.getByTestId('join-league-button')).toBeInTheDocument();
  });
});

describe('NFLHome — join-still-free reassurance (LS-6289 / FBH-035)', () => {
  it('shows the reassurance note and keeps Join enabled when at the owned-league cap', () => {
    render(
      <NFLHome
        leagues={[]}
        onCreateLeague={noop}
        onViewLeague={noop}
        onJoinLeague={noop}
        leagueCap={{ count: 3, limit: 3, atLimit: true, onUpgrade: noop }}
      />,
    );
    expect(
      screen.getByTestId('football-join-still-free-notice'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/you can still join leagues for free/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId('join-league-button')).toBeEnabled();
  });

  it('omits the reassurance note when under the owned-league cap', () => {
    render(
      <NFLHome
        leagues={[]}
        onCreateLeague={noop}
        onViewLeague={noop}
        leagueCap={{ count: 1, limit: 3, atLimit: false, onUpgrade: noop }}
      />,
    );
    expect(
      screen.queryByTestId('football-join-still-free-notice'),
    ).not.toBeInTheDocument();
  });

  it('omits the reassurance note when leagueCap is not provided', () => {
    render(<NFLHome leagues={[]} onCreateLeague={noop} onViewLeague={noop} />);
    expect(
      screen.queryByTestId('football-join-still-free-notice'),
    ).not.toBeInTheDocument();
  });
});

describe('NFLHome — empty-state upgrade on-ramp (LS-6272)', () => {
  it('keeps the neutral copy and Create CTA when leagueCap is not provided', () => {
    render(<NFLHome leagues={[]} onCreateLeague={noop} onViewLeague={noop} />);
    expect(
      screen.getByText('Create your first football league to get started.'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('create-first-league-button'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('upgrade-from-empty-state-button'),
    ).not.toBeInTheDocument();
  });

  it('mentions the free-tier league limit when under cap', () => {
    render(
      <NFLHome
        leagues={[]}
        onCreateLeague={noop}
        onViewLeague={noop}
        leagueCap={{ count: 1, limit: 3, atLimit: false, onUpgrade: noop }}
      />,
    );
    expect(
      screen.getByText(
        'Create your first football league to get started. Free plan includes 3 leagues across every sport.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('create-first-league-button'),
    ).toBeInTheDocument();
  });

  it('swaps to the upgrade CTA and at-limit copy when the free tier is maxed out', () => {
    const onUpgrade = jest.fn();
    render(
      <NFLHome
        leagues={[]}
        onCreateLeague={noop}
        onViewLeague={noop}
        leagueCap={{ count: 3, limit: 3, atLimit: true, onUpgrade }}
      />,
    );
    expect(
      screen.getByText(
        "You've reached the free plan's limit of 3 leagues across every sport. Upgrade to Premium to create more.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('create-first-league-button'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('upgrade-from-empty-state-button'));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
});

describe('NFLHome — hero layout stability (LS-6277 / FBH-023)', () => {
  // The hero previously swapped between a full ~600px variant (zero leagues)
  // and a compact ~80px variant (≥1 league) once the leagues query resolved,
  // causing a violent CLS-triggering layout shift. The hero is now a single
  // fixed-shape element — only its copy varies by hasLeagues/loading — so
  // these assert the side panel (the structural piece that used to
  // disappear in the compact variant) is always present, in every
  // loading/hasLeagues combination.
  it('renders the same hero shape while the leagues query is loading', () => {
    render(
      <NFLHome
        leagues={[]}
        loading
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );

    expect(screen.getByTestId('football-hero')).toBeInTheDocument();
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('Quick Wins')).toBeInTheDocument();
  });

  it('renders the same hero shape once resolved with zero leagues', () => {
    render(<NFLHome leagues={[]} onCreateLeague={noop} onViewLeague={noop} />);

    expect(screen.getByTestId('football-hero')).toBeInTheDocument();
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('Quick Wins')).toBeInTheDocument();
  });

  it('renders the same hero shape once resolved with one or more leagues', () => {
    render(
      <NFLHome
        leagues={makeLeagues(2)}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );

    expect(screen.getByTestId('football-hero')).toBeInTheDocument();
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('Quick Wins')).toBeInTheDocument();
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
