import React from 'react';
import { LeagueActivityFeed } from './LeagueActivityFeed';
import { render } from '../../test-utils';
import { useGetLeagueActivityQuery } from '../../api/db/graphql.generated';

jest.mock('../../api/db/graphql.generated');

const mockEvents = [
  {
    id: 1,
    eventType: 'TRADE_COMPLETED',
    actorUsername: 'brad',
    occurredAt: new Date().toISOString(),
  },
  {
    id: 2,
    eventType: 'WAIVER_CLAIM',
    actorUsername: 'alex',
    occurredAt: new Date().toISOString(),
  },
  {
    id: 3,
    eventType: 'DRAFT_PICK',
    actorUsername: 'sam',
    occurredAt: new Date().toISOString(),
  },
];

function setupMock(
  overrides: Partial<ReturnType<typeof useGetLeagueActivityQuery>> = {},
) {
  jest.mocked(useGetLeagueActivityQuery).mockReturnValue({
    data: { leagueActivity: mockEvents },
    loading: false,
    error: undefined,
    ...overrides,
  } as unknown as ReturnType<typeof useGetLeagueActivityQuery>);
}

describe('LeagueActivityFeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders event type badges', () => {
    setupMock();
    const { getByText } = render(<LeagueActivityFeed leagueId={1} />);
    expect(getByText('Trade')).toBeTruthy();
    expect(getByText('Waiver')).toBeTruthy();
    expect(getByText('Draft')).toBeTruthy();
  });

  it('renders actor usernames in event descriptions', () => {
    setupMock();
    const { getByText } = render(<LeagueActivityFeed leagueId={1} />);
    expect(getByText(/brad:/)).toBeTruthy();
    expect(getByText(/alex:/)).toBeTruthy();
    expect(getByText(/sam:/)).toBeTruthy();
  });

  it('shows spinner when loading with no cached events', () => {
    setupMock({ data: undefined, loading: true });
    const { container } = render(<LeagueActivityFeed leagueId={1} />);
    // Should not contain event content
    expect(container.innerHTML).not.toContain('Trade');
    // Container should have content (the spinner)
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('shows error message on error', () => {
    setupMock({
      data: undefined,
      error: new Error('Network error') as unknown as ReturnType<
        typeof useGetLeagueActivityQuery
      >['error'],
    });
    const { getByText } = render(<LeagueActivityFeed leagueId={1} />);
    expect(getByText('Failed to load activity feed')).toBeTruthy();
  });

  it('shows empty state when no events', () => {
    setupMock({ data: { leagueActivity: [] } });
    const { getByText } = render(<LeagueActivityFeed leagueId={1} />);
    expect(getByText('No activity yet')).toBeTruthy();
  });

  it('passes limit prop to the query hook', () => {
    setupMock();
    render(<LeagueActivityFeed leagueId={1} limit={5} />);
    expect(useGetLeagueActivityQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { leagueId: 1, limit: 5 },
      }),
    );
  });
});
