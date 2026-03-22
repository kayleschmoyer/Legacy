import React from 'react';
import { MatchupRecapPanel } from './MatchupRecapPanel';
import { render } from '../../test-utils';
import { useGetMatchupRecapQuery } from '../../api/db/graphql.generated';

jest.mock('../../api/db/graphql.generated');

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

function setupMock(
  overrides: Partial<ReturnType<typeof useGetMatchupRecapQuery>> = {},
) {
  jest.mocked(useGetMatchupRecapQuery).mockReturnValue({
    data: mockRecapData,
    loading: false,
    error: undefined,
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

  it('renders null when there is an error', () => {
    setupMock({
      data: undefined,
      error: new Error('Network error') as unknown as ReturnType<
        typeof useGetMatchupRecapQuery
      >['error'],
    });
    const { container } = render(<MatchupRecapPanel matchupId={1} />);
    expect(container.innerHTML).toBe('');
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
});
