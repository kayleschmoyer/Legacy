import React from 'react';
import { act } from '@testing-library/react';
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

// NFLHome seeds search/showArchived from sessionStorage (mirrors LS-6284 /
// FBH-030 for baseball) so state survives a sport-switch remount — clear it
// between tests so one test's typed search doesn't leak into the next.
beforeEach(() => {
  sessionStorage.clear();
});

const ROLE_LEAGUES: NFLHomeLeague[] = [
  {
    id: 10,
    name: 'Commish League',
    draftStatus: 'completed',
    permissionLevel: 'commissioner',
  },
  {
    id: 11,
    name: 'GM League',
    draftStatus: 'completed',
    permissionLevel: 'general_manager',
  },
  {
    id: 12,
    name: 'Member League',
    draftStatus: 'completed',
    permissionLevel: 'member',
  },
];

const FROZEN_LEAGUE: NFLHomeLeague = {
  id: 20,
  name: 'Frozen Fossils',
  draftStatus: 'completed',
  currentWeekNumber: 10,
  tierFrozenAt: '2024-03-01T00:00:00.000Z',
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

  it('omits the Retry button when onRetry is not provided (LS-6260)', () => {
    render(
      <NFLHome
        leagues={makeLeagues(5)}
        error
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );

    expect(
      screen.queryByTestId('football-leagues-retry-button'),
    ).not.toBeInTheDocument();
  });

  it('renders a Retry button in the error state and invokes onRetry when pressed (LS-6260)', () => {
    const onRetry = jest.fn();
    render(
      <NFLHome
        leagues={makeLeagues(5)}
        error
        onCreateLeague={noop}
        onViewLeague={noop}
        onRetry={onRetry}
      />,
    );

    const retryButton = screen.getByTestId('football-leagues-retry-button');
    expect(retryButton).toBeInTheDocument();
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders the empty state when there are no leagues', () => {
    render(<NFLHome leagues={[]} onCreateLeague={noop} onViewLeague={noop} />);

    expect(screen.getByText('No football leagues yet')).toBeInTheDocument();
  });

  it('renders a Join with invite code button in the empty state when onJoinLeague is provided (LS-6271)', () => {
    const onJoinLeague = jest.fn();
    render(
      <NFLHome
        leagues={[]}
        onCreateLeague={noop}
        onViewLeague={noop}
        onJoinLeague={onJoinLeague}
      />,
    );

    const joinButton = screen.getByTestId('join-league-empty-state-button');
    expect(joinButton).toBeInTheDocument();
    fireEvent.click(joinButton);
    expect(onJoinLeague).toHaveBeenCalledTimes(1);
  });

  it('omits the empty-state Join button when onJoinLeague is not provided (LS-6271)', () => {
    render(<NFLHome leagues={[]} onCreateLeague={noop} onViewLeague={noop} />);

    expect(
      screen.queryByTestId('join-league-empty-state-button'),
    ).not.toBeInTheDocument();
  });
});

describe('NFLHome — frozen league navigation warning (LS-6293, FBH-039)', () => {
  function makeFrozenLeague(): NFLHomeLeague {
    return {
      id: 1,
      name: 'Frozen League',
      draftStatus: 'completed',
      currentWeekNumber: 4,
      weekAdvanceStatus: null,
      tierFrozenAt: '2026-08-01T00:00:00.000Z',
    };
  }

  it('renders a Read-only badge on a frozen league row', () => {
    render(
      <NFLHome
        leagues={[makeFrozenLeague()]}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );

    // A tierFrozenAt league is archived (LS-6262 / FBH-008), collapsed by
    // default — expand it to reach the row.
    fireEvent.click(screen.getByText(/Archived leagues \(1\)/));

    expect(screen.getByText('Read-only')).toBeInTheDocument();
  });

  it('does not render the Read-only badge for an active league', () => {
    const leagues = makeLeagues(1);
    render(
      <NFLHome leagues={leagues} onCreateLeague={noop} onViewLeague={noop} />,
    );

    expect(screen.queryByText('Read-only')).not.toBeInTheDocument();
  });

  it('warns before navigating into a frozen league instead of navigating immediately', () => {
    const onViewLeague = jest.fn();
    render(
      <NFLHome
        leagues={[makeFrozenLeague()]}
        onCreateLeague={noop}
        onViewLeague={onViewLeague}
      />,
    );

    // A tierFrozenAt league is archived (LS-6262 / FBH-008), collapsed by
    // default — expand it to reach the row.
    fireEvent.click(screen.getByText(/Archived leagues \(1\)/));
    fireEvent.click(screen.getByTestId('football-league-row-1'));

    expect(onViewLeague).not.toHaveBeenCalled();
    expect(screen.getByText('Read-only league')).toBeInTheDocument();
  });

  it('navigates only after the user confirms "View anyway"', () => {
    const onViewLeague = jest.fn();
    render(
      <NFLHome
        leagues={[makeFrozenLeague()]}
        onCreateLeague={noop}
        onViewLeague={onViewLeague}
      />,
    );

    fireEvent.click(screen.getByText(/Archived leagues \(1\)/));
    fireEvent.click(screen.getByTestId('football-league-row-1'));
    fireEvent.click(screen.getByText('View anyway'));

    expect(onViewLeague).toHaveBeenCalledWith(1);
  });

  it('does not navigate when the frozen-league warning is cancelled', () => {
    const onViewLeague = jest.fn();
    render(
      <NFLHome
        leagues={[makeFrozenLeague()]}
        onCreateLeague={noop}
        onViewLeague={onViewLeague}
      />,
    );

    fireEvent.click(screen.getByText(/Archived leagues \(1\)/));
    fireEvent.click(screen.getByTestId('football-league-row-1'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(onViewLeague).not.toHaveBeenCalled();
    expect(screen.queryByText('Read-only league')).not.toBeInTheDocument();
  });

  it('does not warn for an active (non-frozen) league row', () => {
    const leagues = makeLeagues(1);
    const onViewLeague = jest.fn();
    render(
      <NFLHome
        leagues={leagues}
        onCreateLeague={noop}
        onViewLeague={onViewLeague}
      />,
    );

    fireEvent.click(screen.getByTestId('football-league-row-1'));

    expect(onViewLeague).toHaveBeenCalledWith(1);
    expect(screen.queryByText('Read-only league')).not.toBeInTheDocument();
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

describe('NFLHome — premium welcome empty state (LS-6275/FBH-021)', () => {
  it('renders a premium-welcome state instead of the generic empty state when isPremium is true and there are no leagues', () => {
    render(
      <NFLHome
        leagues={[]}
        isPremium
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );

    expect(
      screen.getByText('Welcome, premium subscriber!'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No football leagues yet'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('football-premium-welcome-state'),
    ).toBeInTheDocument();
  });

  it('still renders the "Create your first football league" CTA in the premium-welcome state', () => {
    const onCreateLeague = jest.fn();
    render(
      <NFLHome
        leagues={[]}
        isPremium
        onCreateLeague={onCreateLeague}
        onViewLeague={noop}
      />,
    );

    const cta = screen.getByTestId('create-first-league-button');
    expect(cta).toBeInTheDocument();
    fireEvent.click(cta);
    expect(onCreateLeague).toHaveBeenCalledTimes(1);
  });

  it('renders the generic empty state (not the premium-welcome state) when isPremium is false or omitted', () => {
    render(
      <NFLHome
        leagues={[]}
        isPremium={false}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );

    expect(screen.getByText('No football leagues yet')).toBeInTheDocument();
    expect(
      screen.queryByText('Welcome, premium subscriber!'),
    ).not.toBeInTheDocument();
  });

  it('does not show the premium-welcome state when the user has leagues, even if isPremium is true', () => {
    render(
      <NFLHome
        leagues={makeLeagues(1)}
        isPremium
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );

    expect(
      screen.queryByText('Welcome, premium subscriber!'),
    ).not.toBeInTheDocument();
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

describe('NFLHome — frozen/archived league differentiator (LS-6258/FBH-004)', () => {
  it('collapses tier-frozen leagues into the archived disclosure section, hidden by default', () => {
    const active: NFLHomeLeague = {
      id: 1,
      name: 'Active League',
      draftStatus: 'completed',
      currentWeekNumber: 4,
    };
    const frozen: NFLHomeLeague = {
      id: 2,
      name: 'Frozen League',
      draftStatus: 'completed',
      currentWeekNumber: 14,
      tierFrozenAt: '2026-05-01T00:00:00.000Z',
    };
    render(
      <NFLHome
        leagues={[active, frozen]}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );

    expect(screen.getByTestId('football-league-row-1')).toBeInTheDocument();
    expect(
      screen.queryByTestId('football-league-row-2'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('football-archived-leagues-toggle'),
    ).toHaveTextContent('Archived leagues (1)');
  });

  it('reveals the frozen league row with a "Read-only" badge (not the stale draft status) after expanding the disclosure', () => {
    const frozen: NFLHomeLeague = {
      id: 2,
      name: 'Frozen League',
      draftStatus: 'completed',
      currentWeekNumber: 14,
      frozenAt: '2026-05-01T00:00:00.000Z',
    };
    render(
      <NFLHome leagues={[frozen]} onCreateLeague={noop} onViewLeague={noop} />,
    );

    fireEvent.click(screen.getByTestId('football-archived-leagues-toggle'));

    expect(screen.getByTestId('football-league-row-2')).toBeInTheDocument();
    expect(
      screen.getByTestId('football-league-frozen-badge-2'),
    ).toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(screen.queryByText('Week 14')).not.toBeInTheDocument();
  });

  it('invokes onViewLeague after confirming the read-only warning dialog on a revealed frozen league row', () => {
    const onViewLeague = jest.fn();
    const frozen: NFLHomeLeague = {
      id: 2,
      name: 'Frozen League',
      draftStatus: 'completed',
      tierFrozenAt: '2026-05-01T00:00:00.000Z',
    };
    render(
      <NFLHome
        leagues={[frozen]}
        onCreateLeague={noop}
        onViewLeague={onViewLeague}
      />,
    );

    fireEvent.click(screen.getByTestId('football-archived-leagues-toggle'));
    fireEvent.click(screen.getByTestId('football-league-row-2'));
    expect(onViewLeague).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('View anyway'));
    expect(onViewLeague).toHaveBeenCalledWith(2);
  });

  it('still lists the archived league in the disclosure when every league is frozen', () => {
    const frozen: NFLHomeLeague = {
      id: 2,
      name: 'Frozen League',
      draftStatus: 'completed',
      tierFrozenAt: '2026-05-01T00:00:00.000Z',
    };
    render(
      <NFLHome leagues={[frozen]} onCreateLeague={noop} onViewLeague={noop} />,
    );

    expect(
      screen.getByTestId('football-archived-leagues-toggle'),
    ).toHaveTextContent('Archived leagues (1)');
    fireEvent.click(screen.getByTestId('football-archived-leagues-toggle'));
    expect(
      screen.getByTestId('football-league-frozen-badge-2'),
    ).toBeInTheDocument();
  });

  it('omits the archived-leagues disclosure when no leagues are frozen', () => {
    const active: NFLHomeLeague = {
      id: 1,
      name: 'Active League',
      draftStatus: 'completed',
    };
    render(
      <NFLHome leagues={[active]} onCreateLeague={noop} onViewLeague={noop} />,
    );

    expect(
      screen.queryByTestId('football-archived-leagues-toggle'),
    ).not.toBeInTheDocument();
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

describe('NFLHome — unlimited-leagues badge (LS-6270/FBH-016)', () => {
  it('omits the badge when hasUnlimitedLeagues is not provided', () => {
    render(<NFLHome leagues={[]} onCreateLeague={noop} onViewLeague={noop} />);
    expect(
      screen.queryByTestId('football-unlimited-leagues-badge'),
    ).not.toBeInTheDocument();
  });

  it('omits the badge when hasUnlimitedLeagues is false', () => {
    render(
      <NFLHome
        leagues={[]}
        onCreateLeague={noop}
        onViewLeague={noop}
        hasUnlimitedLeagues={false}
      />,
    );
    expect(
      screen.queryByTestId('football-unlimited-leagues-badge'),
    ).not.toBeInTheDocument();
  });

  it('renders the badge near the Create CTA when hasUnlimitedLeagues is true', () => {
    render(
      <NFLHome
        leagues={[]}
        onCreateLeague={noop}
        onViewLeague={noop}
        hasUnlimitedLeagues
      />,
    );
    expect(
      screen.getByTestId('football-unlimited-leagues-badge'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Unlimited leagues unlocked/)).toBeInTheDocument();
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

describe('NFLHome — resume last league shortcut (LS-6294 / FBH-040)', () => {
  it('omits the shortcut card when resumeLeague is not provided', () => {
    render(<NFLHome leagues={[]} onCreateLeague={noop} onViewLeague={noop} />);
    expect(
      screen.queryByTestId('football-resume-league-card'),
    ).not.toBeInTheDocument();
  });

  it('renders the shortcut card with the league name when resumeLeague is provided', () => {
    render(
      <NFLHome
        leagues={[]}
        onCreateLeague={noop}
        onViewLeague={noop}
        resumeLeague={{ id: 5, name: 'Dynasty Warriors', onPress: noop }}
      />,
    );
    expect(
      screen.getByTestId('football-resume-league-card'),
    ).toBeInTheDocument();
    expect(screen.getByText('Dynasty Warriors')).toBeInTheDocument();
    expect(screen.getByText('Resume last league')).toBeInTheDocument();
  });

  it('falls back to a generic label when the league has no name', () => {
    render(
      <NFLHome
        leagues={[]}
        onCreateLeague={noop}
        onViewLeague={noop}
        resumeLeague={{ id: 5, name: null, onPress: noop }}
      />,
    );
    expect(screen.getByText('Unnamed League')).toBeInTheDocument();
  });

  it('invokes onPress when the shortcut card is activated', () => {
    const onPress = jest.fn();
    render(
      <NFLHome
        leagues={[]}
        onCreateLeague={noop}
        onViewLeague={noop}
        resumeLeague={{ id: 5, name: 'Dynasty Warriors', onPress }}
      />,
    );
    fireEvent.click(screen.getByTestId('football-resume-league-card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('NFLHome — empty-state upgrade on-ramp (LS-6272)', () => {
  it('keeps the neutral copy and Create CTA when leagueCap is not provided', () => {
    render(<NFLHome leagues={[]} onCreateLeague={noop} onViewLeague={noop} />);
    expect(
      screen.getByText(
        'Create your first football league, or join one with an invite code.',
      ),
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
        'Create your first football league, or join one with an invite code. Free plan includes 3 leagues across every sport.',
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
  // loading/hasLeagues combination. Asserted by testID rather than copy since
  // the panel's copy itself varies by hasLeagues (LS-10666).
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
    expect(screen.getByTestId('nfl-home-getting-started')).toBeInTheDocument();
    expect(screen.getByText('Quick Wins')).toBeInTheDocument();
  });

  it('renders the same hero shape once resolved with zero leagues', () => {
    render(<NFLHome leagues={[]} onCreateLeague={noop} onViewLeague={noop} />);

    expect(screen.getByTestId('football-hero')).toBeInTheDocument();
    expect(screen.getByTestId('nfl-home-getting-started')).toBeInTheDocument();
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
    expect(screen.getByTestId('nfl-home-getting-started')).toBeInTheDocument();
    expect(screen.getByText('Quick Wins')).toBeInTheDocument();
  });
});

describe('NFLHome — matchup highlight cards (LS-5407, LS-6265)', () => {
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
        matchupHighlights={[
          {
            leagueId: 1,
            leagueName: 'Test Football League',
            weekNumber: 3,
            awayTeamName: 'Alpha Offense',
            homeTeamName: 'Beta Defense',
            status: 'pre',
          },
        ]}
      />,
    );

    const section = screen.getByTestId('matchup-highlight-section');
    expect(section).toBeInTheDocument();
    expect(screen.getByText("This Week's Matchup")).toBeInTheDocument();
    const card = screen.getByTestId('matchup-highlight-card-1');
    expect(within(card).getByText('Alpha Offense')).toBeInTheDocument();
    expect(within(card).getByText('Beta Defense')).toBeInTheDocument();
    expect(within(card).getByText(/Week 3/)).toBeInTheDocument();
  });

  it('omits the highlight section when no matchup is scheduled', () => {
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
        matchupHighlights={[]}
      />,
    );

    expect(
      screen.queryByTestId('matchup-highlight-section'),
    ).not.toBeInTheDocument();
  });

  it('renders the defined bye-week empty state instead of hiding the card (FBH-010)', () => {
    const league: NFLHomeLeague = {
      id: 1,
      name: 'Test Football League',
      draftStatus: 'completed',
      currentWeekNumber: 9,
    };
    render(
      <NFLHome
        leagues={[league]}
        onCreateLeague={noop}
        onViewLeague={noop}
        matchupHighlights={[
          {
            leagueId: 1,
            leagueName: 'Test Football League',
            weekNumber: 9,
            awayTeamName: 'Alpha Offense',
            homeTeamName: '',
            status: 'bye',
            noOpponent: true,
          },
        ]}
      />,
    );

    const card = screen.getByTestId('matchup-highlight-card-1');
    expect(card).toBeInTheDocument();
    expect(within(card).getByText('Alpha Offense')).toBeInTheDocument();
    expect(within(card).getByText('No opponent')).toBeInTheDocument();
    expect(within(card).getByText(/BYE/)).toBeInTheDocument();
  });

  it('renders one card per league when multiple leagues have a scheduled matchup (LS-6265)', () => {
    const leagues: NFLHomeLeague[] = [
      { id: 1, name: 'League One', draftStatus: 'completed' },
      { id: 2, name: 'League Two', draftStatus: 'completed' },
    ];
    render(
      <NFLHome
        leagues={leagues}
        onCreateLeague={noop}
        onViewLeague={noop}
        matchupHighlights={[
          {
            leagueId: 1,
            leagueName: 'League One',
            weekNumber: 3,
            awayTeamName: 'Alpha Offense',
            homeTeamName: 'Beta Defense',
            status: 'pre',
          },
          {
            leagueId: 2,
            leagueName: 'League Two',
            weekNumber: 3,
            awayTeamName: 'Gamma Squad',
            homeTeamName: 'Delta Crew',
            status: 'live',
          },
        ]}
      />,
    );

    expect(screen.getByText("This Week's Matchups")).toBeInTheDocument();
    const firstCard = screen.getByTestId('matchup-highlight-card-1');
    const secondCard = screen.getByTestId('matchup-highlight-card-2');
    expect(within(firstCard).getByText('League One')).toBeInTheDocument();
    expect(within(firstCard).getByText('Alpha Offense')).toBeInTheDocument();
    expect(within(secondCard).getByText('League Two')).toBeInTheDocument();
    expect(within(secondCard).getByText('Gamma Squad')).toBeInTheDocument();
  });
});

describe('NFLHome — league search (LS-6262 / FBH-008)', () => {
  it('filters the league list via search', () => {
    jest.useFakeTimers();
    const leagues = makeLeagues(2);
    render(
      <NFLHome leagues={leagues} onCreateLeague={noop} onViewLeague={noop} />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Search leagues/i), {
      target: { value: 'League 1' },
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.getByText('League 1')).toBeInTheDocument();
    expect(screen.queryByText('League 2')).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  it('shows "No leagues match your search" when search yields no results', () => {
    jest.useFakeTimers();
    render(
      <NFLHome
        leagues={makeLeagues(2)}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Search leagues/i), {
      target: { value: 'xyznotfound' },
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(
      screen.getByText('No leagues match your search'),
    ).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('restores a previously entered search term across a remount', () => {
    jest.useFakeTimers();
    const leagues = makeLeagues(2);
    const { unmount } = render(
      <NFLHome leagues={leagues} onCreateLeague={noop} onViewLeague={noop} />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Search leagues/i), {
      target: { value: 'League 1' },
    });
    unmount();

    render(
      <NFLHome leagues={leagues} onCreateLeague={noop} onViewLeague={noop} />,
    );
    expect(screen.getByPlaceholderText(/Search leagues/i)).toHaveValue(
      'League 1',
    );
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.getByText('League 1')).toBeInTheDocument();
    expect(screen.queryByText('League 2')).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  it('does not render the search box when the user has no leagues', () => {
    render(<NFLHome leagues={[]} onCreateLeague={noop} onViewLeague={noop} />);
    expect(
      screen.queryByPlaceholderText(/Search leagues/i),
    ).not.toBeInTheDocument();
  });
});

describe('NFLHome — role filter (LS-6262 / FBH-008)', () => {
  it('does not render the role filter bar when no league has permissionLevel data', () => {
    render(
      <NFLHome
        leagues={makeLeagues(2)}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );
    expect(
      screen.queryByTestId('football-role-filter-bar'),
    ).not.toBeInTheDocument();
  });

  it('shows the role filter bar only when leagues have permissionLevel data', () => {
    const { rerender } = render(
      <NFLHome
        leagues={makeLeagues(2)}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );
    expect(
      screen.queryByTestId('football-role-filter-bar'),
    ).not.toBeInTheDocument();

    rerender(
      <NFLHome
        leagues={ROLE_LEAGUES}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );
    expect(screen.getByTestId('football-role-filter-bar')).toBeInTheDocument();
  });

  it('filters leagues by role when a filter button is pressed', () => {
    render(
      <NFLHome
        leagues={ROLE_LEAGUES}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );
    const filterBar = screen.getByTestId('football-role-filter-bar');
    fireEvent.click(within(filterBar).getByText('Commissioner'));
    expect(screen.getByText('Commish League')).toBeInTheDocument();
    expect(screen.queryByText('GM League')).not.toBeInTheDocument();
    expect(screen.queryByText('Member League')).not.toBeInTheDocument();
  });

  it('groups every non-commissioner role into the Member filter', () => {
    render(
      <NFLHome
        leagues={ROLE_LEAGUES}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );
    const filterBar = screen.getByTestId('football-role-filter-bar');
    fireEvent.click(within(filterBar).getByText('Member'));
    expect(screen.getByText('GM League')).toBeInTheDocument();
    expect(screen.getByText('Member League')).toBeInTheDocument();
    expect(screen.queryByText('Commish League')).not.toBeInTheDocument();
  });
});

describe('NFLHome — frozen / archived leagues (LS-6262 / FBH-008)', () => {
  it('excludes tier-frozen leagues from the active list and shows the archived toggle', () => {
    render(
      <NFLHome
        leagues={[...makeLeagues(2), FROZEN_LEAGUE]}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );
    expect(screen.queryByText('Frozen Fossils')).not.toBeInTheDocument();
    expect(screen.getByText(/Archived leagues \(1\)/)).toBeInTheDocument();
  });

  it('expands the archived section when the toggle is clicked', () => {
    render(
      <NFLHome
        leagues={[...makeLeagues(2), FROZEN_LEAGUE]}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );
    fireEvent.click(screen.getByText(/Archived leagues \(1\)/));
    expect(screen.getByText('Frozen Fossils')).toBeInTheDocument();
  });

  it('does not render the archived section when all leagues are active', () => {
    render(
      <NFLHome
        leagues={makeLeagues(2)}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );
    expect(screen.queryByText(/Archived leagues/)).not.toBeInTheDocument();
  });

  it('restores an expanded archived section across a remount', () => {
    const leagues = [...makeLeagues(2), FROZEN_LEAGUE];
    const { unmount } = render(
      <NFLHome leagues={leagues} onCreateLeague={noop} onViewLeague={noop} />,
    );
    fireEvent.click(screen.getByText(/Archived leagues \(1\)/));
    expect(screen.getByText('Frozen Fossils')).toBeInTheDocument();
    unmount();

    render(
      <NFLHome leagues={leagues} onCreateLeague={noop} onViewLeague={noop} />,
    );
    expect(screen.getByText('Frozen Fossils')).toBeInTheDocument();
  });
});

describe('NFLHome — "All Sports" switcher option (LS-6286 / FBH-032)', () => {
  it('renders the "All Sports" option when onGoToAllSports is supplied', () => {
    render(
      <NFLHome
        leagues={makeLeagues(1)}
        onCreateLeague={noop}
        onViewLeague={noop}
        onGoToAllSports={noop}
      />,
    );
    expect(screen.getByTestId('sport-switcher-all')).toBeInTheDocument();
  });

  it('does not render the "All Sports" option when onGoToAllSports is omitted', () => {
    render(
      <NFLHome
        leagues={makeLeagues(1)}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );
    expect(screen.queryByTestId('sport-switcher-all')).not.toBeInTheDocument();
  });

  it('invokes onGoToAllSports when the option is pressed', () => {
    const onGoToAllSports = jest.fn();
    render(
      <NFLHome
        leagues={makeLeagues(1)}
        onCreateLeague={noop}
        onViewLeague={noop}
        onGoToAllSports={onGoToAllSports}
      />,
    );
    fireEvent.click(screen.getByTestId('sport-switcher-all'));
    expect(onGoToAllSports).toHaveBeenCalledTimes(1);
  });

  it('renders both the single-sport switch button and "All Sports" together', () => {
    render(
      <NFLHome
        leagues={makeLeagues(1)}
        onCreateLeague={noop}
        onViewLeague={noop}
        onSwitchSport={noop}
        onGoToAllSports={noop}
      />,
    );
    expect(screen.getByTestId('sport-switcher-baseball')).toBeInTheDocument();
    expect(screen.getByTestId('sport-switcher-all')).toBeInTheDocument();
  });
});

describe('NFLHome — getting-started panel copy (LS-10666)', () => {
  it('hides the onboarding copy from a manager with active leagues', () => {
    render(
      <NFLHome
        leagues={makeLeagues(2)}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );
    const panel = screen.getByTestId('nfl-home-getting-started');
    expect(screen.queryByText('Build your first roster')).toBeNull();
    expect(screen.queryByText(/Create or join a league/)).toBeNull();
    expect(
      within(panel).getByText('Your week at a glance'),
    ).toBeInTheDocument();
  });

  it('shows the onboarding copy to a manager with no leagues', () => {
    render(<NFLHome leagues={[]} onCreateLeague={noop} onViewLeague={noop} />);
    const panel = screen.getByTestId('nfl-home-getting-started');
    expect(within(panel).getByText('Getting Started')).toBeInTheDocument();
    expect(
      within(panel).getByText('Build your first roster'),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(/Create or join a league/),
    ).toBeInTheDocument();
  });

  it('shows the onboarding copy when every league is archived', () => {
    render(
      <NFLHome
        leagues={[FROZEN_LEAGUE]}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );
    expect(screen.getByText('Build your first roster')).toBeInTheDocument();
  });

  it('keeps the panel mounted but hidden while leagues are loading', () => {
    // Same fixed shape as the loaded state (LS-6277 / FBH-023), so the hero
    // height doesn't shift, but no copy is shown until we know which applies.
    const { rerender } = render(
      <NFLHome
        leagues={[]}
        loading
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );
    const loadingPanel = screen.getByTestId('nfl-home-getting-started');
    expect(loadingPanel).toHaveAttribute('aria-hidden', 'true');
    expect(loadingPanel).toHaveStyle({ opacity: 0 });

    rerender(
      <NFLHome
        leagues={makeLeagues(1)}
        onCreateLeague={noop}
        onViewLeague={noop}
      />,
    );
    const loadedPanel = screen.getByTestId('nfl-home-getting-started');
    expect(loadedPanel).not.toHaveAttribute('aria-hidden');
    expect(
      within(loadedPanel).getByText('Your week at a glance'),
    ).toBeVisible();
  });
});
