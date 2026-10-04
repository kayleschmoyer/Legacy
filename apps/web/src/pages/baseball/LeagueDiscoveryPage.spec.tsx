/**
 * Regression tests for LS-6274 / LS-6273: the "Create a League" CTA in the
 * search empty state must route to the create flow for the sport the page
 * is currently showing, not always to baseball (this page is shared between
 * `/baseball/leagues` and `/football/leagues` via the `sport` prop). A
 * football user whose search matched nothing previously clicked Create and
 * landed on the baseball create flow instead of football's.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LeagueDiscoveryPage } from './LeagueDiscoveryPage';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
  const actual =
    jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

// Must match LEAGUES_PAGE_SIZE in LeagueDiscoveryPage.tsx — the "load more"
// heuristic treats a full page as a signal more results may exist.
const PAGE_SIZE = 20;

function makePublicLeague(id: number) {
  return {
    id,
    name: `League ${id}`,
    draftStatus: 'not-started',
    playerPool: 'all',
    availableSpots: 6,
    totalSpots: 10,
    maxRosterSize: 25,
    isFull: false,
    isAlreadyMember: false,
  };
}

const mockFetchMore = jest.fn();
let mockQueryResult: {
  data: { publicLeagues: ReturnType<typeof makePublicLeague>[] } | undefined;
  loading: boolean;
  error: Error | undefined;
  refetch: jest.Mock;
  fetchMore: jest.Mock;
};

function setMockQueryResult(overrides: Partial<typeof mockQueryResult> = {}) {
  mockQueryResult = {
    data: { publicLeagues: [] },
    loading: false,
    error: undefined,
    refetch: jest.fn(),
    fetchMore: mockFetchMore,
    ...overrides,
  };
}

jest.mock('@legacy-sports/graphql', () => ({
  GetPublicLeagues: {},
  Sport: { Baseball: 'BASEBALL', Football: 'FOOTBALL' },
  useGetPublicLeaguesQuery: () => mockQueryResult,
  useJoinPublicLeagueMutation: () => [jest.fn(), { loading: false }],
}));

function renderForSport(sport: 'baseball' | 'football') {
  return render(
    <MemoryRouter>
      <LeagueDiscoveryPage sport={sport} />
    </MemoryRouter>,
  );
}

describe('LeagueDiscoveryPage search empty state', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockFetchMore.mockClear();
    setMockQueryResult();
  });

  it('renders a Create CTA and routes to the baseball create flow for sport="baseball"', () => {
    renderForSport('baseball');

    fireEvent.change(screen.getByPlaceholderText('Search leagues by name…'), {
      target: { value: 'zzz-no-match' },
    });

    expect(
      screen.getByText(/no leagues matched your search/i),
    ).toBeInTheDocument();

    const createButtons = screen.getAllByRole('button', {
      name: /create a league/i,
    });
    // The header always renders a persistent Create CTA; the empty-state
    // section renders its own copy below the "no leagues matched" message.
    fireEvent.click(createButtons[createButtons.length - 1]);

    expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/create');
  });

  it('renders a Create CTA and routes to the football create flow for sport="football"', () => {
    renderForSport('football');

    fireEvent.change(screen.getByPlaceholderText('Search leagues by name…'), {
      target: { value: 'zzz-no-match' },
    });

    expect(
      screen.getByText(/no leagues matched your search/i),
    ).toBeInTheDocument();

    const createButtons = screen.getAllByRole('button', {
      name: /create a league/i,
    });
    fireEvent.click(createButtons[createButtons.length - 1]);

    expect(mockNavigate).toHaveBeenCalledWith('/football/league/create');
  });
});

// ── LS-10251: pagination / infinite-scroll ─────────────────────────────────

describe('LeagueDiscoveryPage pagination', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockFetchMore.mockClear();
  });

  it('shows a "Load More Leagues" control when a full page comes back', () => {
    const firstPage = Array.from({ length: PAGE_SIZE }, (_, i) =>
      makePublicLeague(i + 1),
    );
    setMockQueryResult({ data: { publicLeagues: firstPage } });

    renderForSport('baseball');

    expect(screen.getAllByTestId(/^league-card-[0-9]+$/)).toHaveLength(
      PAGE_SIZE,
    );
    expect(
      screen.getByTestId('discovery-load-more-button'),
    ).toBeInTheDocument();
  });

  it('does not show a "Load More Leagues" control when fewer than a full page comes back', () => {
    const shortPage = [makePublicLeague(1), makePublicLeague(2)];
    setMockQueryResult({ data: { publicLeagues: shortPage } });

    renderForSport('baseball');

    expect(screen.getAllByTestId(/^league-card-[0-9]+$/)).toHaveLength(2);
    expect(
      screen.queryByTestId('discovery-load-more-button'),
    ).not.toBeInTheDocument();
  });

  it('appends the next page and hides the control once fewer results come back', async () => {
    const firstPage = Array.from({ length: PAGE_SIZE }, (_, i) =>
      makePublicLeague(i + 1),
    );
    const secondPage = [
      makePublicLeague(PAGE_SIZE + 1),
      makePublicLeague(PAGE_SIZE + 2),
    ];
    setMockQueryResult({ data: { publicLeagues: firstPage } });
    mockFetchMore.mockResolvedValue({
      data: { publicLeagues: secondPage },
    });

    renderForSport('baseball');

    fireEvent.click(screen.getByTestId('discovery-load-more-button'));

    expect(mockFetchMore).toHaveBeenCalledWith({
      variables: { offset: PAGE_SIZE },
    });

    await waitFor(() => {
      expect(screen.getAllByTestId(/^league-card-[0-9]+$/)).toHaveLength(
        PAGE_SIZE + secondPage.length,
      );
    });

    expect(
      screen.queryByTestId('discovery-load-more-button'),
    ).not.toBeInTheDocument();
  });

  it('resets the accumulated pages when the base query result changes (e.g. a new search)', () => {
    const firstPage = Array.from({ length: PAGE_SIZE }, (_, i) =>
      makePublicLeague(i + 1),
    );
    setMockQueryResult({ data: { publicLeagues: firstPage } });

    const { rerender } = renderForSport('baseball');
    expect(screen.getAllByTestId(/^league-card-[0-9]+$/)).toHaveLength(
      PAGE_SIZE,
    );

    const filteredPage = [makePublicLeague(999)];
    setMockQueryResult({ data: { publicLeagues: filteredPage } });
    rerender(
      <MemoryRouter>
        <LeagueDiscoveryPage sport="baseball" />
      </MemoryRouter>,
    );

    expect(screen.getAllByTestId(/^league-card-[0-9]+$/)).toHaveLength(1);
  });
});
