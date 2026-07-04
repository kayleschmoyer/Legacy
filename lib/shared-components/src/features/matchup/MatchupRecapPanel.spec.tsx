import React from 'react';
import { useGetMatchupRecapQuery } from '@legacy-sports/graphql';
import { MatchupRecapPanel } from './MatchupRecapPanel';
import { fireEvent, render } from '../../test-utils';

jest.mock('@legacy-sports/graphql');

const mockLoggerError = jest.fn();
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    error: (...args: unknown[]) => {
      mockLoggerError(...args);
    },
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockRecapData = {
  getMatchupById: {
    recap: {
      headline: 'Thunder Crush Eagles',
      narrative: 'In a dominant display of power hitting...',
      highlights: ['Mike Trout: 3 HR, 7 RBI', 'Shohei Ohtani: 12 K, 0 ER'],
      matchupType: 'blowout',
    },
  },
};

const mockRefetch = jest.fn();

function setupMock(
  overrides: Partial<ReturnType<typeof useGetMatchupRecapQuery>> = {},
) {
  jest.mocked(useGetMatchupRecapQuery).mockReturnValue({
    data: mockRecapData,
    loading: false,
    error: undefined,
    refetch: mockRefetch,
    ...overrides,
  } as unknown as ReturnType<typeof useGetMatchupRecapQuery>);
}

describe('MatchupRecapPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the headline when data is loaded', () => {
    setupMock();
    const { getByText } = render(<MatchupRecapPanel matchupId={1} />);
    expect(getByText('Thunder Crush Eagles')).toBeTruthy();
  });

  it('renders the narrative text', () => {
    setupMock();
    const { getByText } = render(<MatchupRecapPanel matchupId={1} />);
    expect(getByText('In a dominant display of power hitting...')).toBeTruthy();
  });

  it('renders highlights', () => {
    setupMock();
    const { getByText } = render(<MatchupRecapPanel matchupId={1} />);
    expect(getByText('Mike Trout: 3 HR, 7 RBI')).toBeTruthy();
    expect(getByText('Shohei Ohtani: 12 K, 0 ER')).toBeTruthy();
  });

  it('renders a spinner when loading', () => {
    setupMock({ data: undefined, loading: true });
    const { container } = render(<MatchupRecapPanel matchupId={1} />);
    // Spinner renders an element in the container; the component should not
    // render the card content while loading.
    expect(container.innerHTML).not.toContain('Thunder Crush Eagles');
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('shows a retryable error message instead of a blank space on error', () => {
    setupMock({
      data: undefined,
      error: new Error('Network error') as unknown as ReturnType<
        typeof useGetMatchupRecapQuery
      >['error'],
    });
    const { getByText } = render(<MatchupRecapPanel matchupId={1} />);
    expect(
      getByText('Matchup recap unavailable — we are working on it.'),
    ).toBeTruthy();
    expect(getByText('Retry')).toBeTruthy();
  });

  it('calls refetch when the retry button is pressed after an error', () => {
    setupMock({
      data: undefined,
      error: new Error('Network error') as unknown as ReturnType<
        typeof useGetMatchupRecapQuery
      >['error'],
    });
    const { getByText } = render(<MatchupRecapPanel matchupId={1} />);
    fireEvent.click(getByText('Retry'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('logs the error to LOGGER (Rollbar-forwarded) when the query fails', () => {
    const testError = new Error('Network error') as unknown as ReturnType<
      typeof useGetMatchupRecapQuery
    >['error'];
    setupMock({ data: undefined, error: testError });
    render(<MatchupRecapPanel matchupId={1} />);
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Failed to load matchup recap',
      testError,
      { matchupId: 1 },
    );
  });

  it('shows a "recap pending" message (not a blank space) when there is no recap yet', () => {
    setupMock({
      data: { getMatchupById: { recap: null } },
      error: undefined,
    });
    const { getByText, queryByText } = render(
      <MatchupRecapPanel matchupId={1} />,
    );
    expect(
      getByText('Recap will be generated after the matchup is finalized.'),
    ).toBeTruthy();
    expect(queryByText('Retry')).toBeNull();
  });

  it('shows BLOWOUT badge for blowout matchupType', () => {
    setupMock();
    const { getByText } = render(<MatchupRecapPanel matchupId={1} />);
    expect(getByText('BLOWOUT')).toBeTruthy();
  });

  it('shows CLOSE GAME badge for close matchupType', () => {
    setupMock({
      data: {
        getMatchupById: {
          recap: {
            ...mockRecapData.getMatchupById.recap,
            matchupType: 'close',
          },
        },
      },
    });
    const { getByText } = render(<MatchupRecapPanel matchupId={1} />);
    expect(getByText('CLOSE GAME')).toBeTruthy();
  });

  it('renders the MATCHUP RECAP header', () => {
    setupMock();
    const { getByText } = render(<MatchupRecapPanel matchupId={1} />);
    expect(getByText('MATCHUP RECAP')).toBeTruthy();
  });

  it('always re-asks the server instead of trusting a stale cache entry (LS-5875)', () => {
    setupMock();
    render(<MatchupRecapPanel matchupId={1} />);
    expect(useGetMatchupRecapQuery).toHaveBeenCalledWith(
      expect.objectContaining({ fetchPolicy: 'cache-and-network' }),
    );
  });
});
