import React from 'react';
import { fireEvent } from '@testing-library/react';
import {
  useGetOnThisDayEventsQuery,
  useGetOnThisDayQuery,
} from '@legacy-sports/graphql';
import { OnThisDayFeed, parseGameIdentifierDate } from './OnThisDayFeed';
import { render } from '../../test-utils';

jest.mock('@legacy-sports/graphql');

/** Entries come back ranked by fantasy score, highest first (LS-8670). */
const mockEntries = [
  {
    playerId: 1,
    gameIdentifier: 'g1',
    entryType: 'batting',
    firstName: 'Babe',
    lastName: 'Ruth',
    season: 1927,
    hits: 3,
    atBats: 4,
    homeRuns: 2,
    rbi: 5,
  },
  {
    playerId: 2,
    gameIdentifier: 'g2',
    entryType: 'batting',
    firstName: 'Lou',
    lastName: 'Gehrig',
    season: 1931,
    hits: 2,
    atBats: 5,
    rbi: 3,
  },
  {
    playerId: 3,
    gameIdentifier: 'g3',
    entryType: 'pitching',
    firstName: 'Walter',
    lastName: 'Johnson',
    season: 1913,
    inningsPitched: 9,
    strikeouts: 12,
    earnedRuns: 0,
  },
];

const mockEvents = [
  {
    id: 10,
    eventType: 'TR',
    year: 1960,
    playerName: 'Roger Maris',
    description: 'Traded to the New York Yankees',
  },
];

function setupMocks({
  entries = mockEntries,
  events = mockEvents,
}: {
  entries?: typeof mockEntries;
  events?: typeof mockEvents;
} = {}) {
  jest.mocked(useGetOnThisDayQuery).mockReturnValue({
    data: { onThisDay: entries },
    loading: false,
    error: undefined,
  } as unknown as ReturnType<typeof useGetOnThisDayQuery>);
  jest.mocked(useGetOnThisDayEventsQuery).mockReturnValue({
    data: { onThisDayEvents: events },
    loading: false,
    error: undefined,
  } as unknown as ReturnType<typeof useGetOnThisDayEventsQuery>);
}

describe('OnThisDayFeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('renders the full feed by default, so the web dashboard is unchanged', () => {
    const { getByText, queryByText } = render(<OnThisDayFeed />);
    expect(getByText('On This Day')).toBeTruthy();
    expect(getByText('Transactions & Signings')).toBeTruthy();
    expect(queryByText('More')).toBeNull();
  });

  describe('condensed mode (LS-8794)', () => {
    it('shows only the top-ranked entry and hides the transactions section', () => {
      const { getByText, queryByText } = render(<OnThisDayFeed condensed />);
      expect(getByText('Babe Ruth')).toBeTruthy();
      expect(queryByText('Lou Gehrig')).toBeNull();
      expect(queryByText('Walter Johnson')).toBeNull();
      expect(queryByText('Transactions & Signings')).toBeNull();
    });

    it('expands to the full feed in place when "More" is pressed', () => {
      const { getByText, queryByText } = render(<OnThisDayFeed condensed />);
      fireEvent.click(getByText('More'));
      expect(getByText('Transactions & Signings')).toBeTruthy();
      expect(queryByText('More')).toBeNull();
    });

    it('omits "More" when there is nothing further to show', () => {
      setupMocks({ entries: [mockEntries[0]], events: [] });
      const { getByText, queryByText } = render(<OnThisDayFeed condensed />);
      expect(getByText('Babe Ruth')).toBeTruthy();
      expect(queryByText('More')).toBeNull();
    });
  });

  describe('onPlayerPress (LS-9763)', () => {
    it('passes the full entry context, including a gameDate parsed from gameIdentifier', () => {
      setupMocks({
        entries: [
          {
            ...mockEntries[0],
            brefId: 'ruthba01',
            gameIdentifier: 'NYA192709300',
          },
        ],
      });
      const onPlayerPress = jest.fn();
      const { getByText } = render(
        <OnThisDayFeed onPlayerPress={onPlayerPress} />,
      );

      fireEvent.click(getByText('Babe Ruth'));

      expect(onPlayerPress).toHaveBeenCalledWith({
        playerId: 1,
        brefId: 'ruthba01',
        season: 1927,
        gameIdentifier: 'NYA192709300',
        gameDate: '1927-09-30',
      });
    });

    it('passes a null gameDate when gameIdentifier cannot be parsed', () => {
      setupMocks({
        entries: [{ ...mockEntries[0], gameIdentifier: 'g1' }],
      });
      const onPlayerPress = jest.fn();
      const { getByText } = render(
        <OnThisDayFeed onPlayerPress={onPlayerPress} />,
      );

      fireEvent.click(getByText('Babe Ruth'));

      expect(onPlayerPress).toHaveBeenCalledWith(
        expect.objectContaining({ playerId: 1, gameDate: null }),
      );
    });
  });
});

describe('parseGameIdentifierDate (LS-9763)', () => {
  it('parses the ISO date out of a bref-style gameIdentifier', () => {
    expect(parseGameIdentifierDate('NYA192709300')).toBe('1927-09-30');
    expect(parseGameIdentifierDate('SLN196808010')).toBe('1968-08-01');
  });

  it('returns null for a missing or malformed identifier', () => {
    expect(parseGameIdentifierDate(null)).toBeNull();
    expect(parseGameIdentifierDate(undefined)).toBeNull();
    expect(parseGameIdentifierDate('')).toBeNull();
    expect(parseGameIdentifierDate('too-short')).toBeNull();
    expect(parseGameIdentifierDate('NYA19XX09300')).toBeNull();
  });
});
