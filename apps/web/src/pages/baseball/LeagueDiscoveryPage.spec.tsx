/**
 * Regression tests for LS-6274 / LS-6273: the "Create a League" CTA in the
 * search empty state must route to the create flow for the sport the page
 * is currently showing, not always to baseball (this page is shared between
 * `/baseball/leagues` and `/football/leagues` via the `sport` prop). A
 * football user whose search matched nothing previously clicked Create and
 * landed on the baseball create flow instead of football's.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

jest.mock('@legacy-sports/graphql', () => ({
  GetPublicLeagues: {},
  Sport: { Baseball: 'BASEBALL', Football: 'FOOTBALL' },
  useGetPublicLeaguesQuery: () => ({
    data: { publicLeagues: [] },
    loading: false,
    error: undefined,
    refetch: jest.fn(),
  }),
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
