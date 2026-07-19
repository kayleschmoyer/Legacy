import React from 'react';
import { screen } from '@testing-library/react';

import {
  MatchupStatus,
  useGetLeagueTeamsQuery,
  useGetMatchupsByWeekQuery,
} from '@legacy-sports/graphql';
import type { MatchupFragment } from '@legacy-sports/graphql';
import { MatchupDetailLayout } from './MatchupDetailLayout';
import { render } from '../../test-utils';

jest.mock('@legacy-sports/graphql');

function setupMocks() {
  jest.mocked(useGetLeagueTeamsQuery).mockReturnValue({
    data: { leagueTeams: [] },
    loading: false,
    error: undefined,
  } as unknown as ReturnType<typeof useGetLeagueTeamsQuery>);

  jest.mocked(useGetMatchupsByWeekQuery).mockReturnValue({
    data: { getMatchupsByWeek: [] },
    loading: false,
  } as unknown as ReturnType<typeof useGetMatchupsByWeekQuery>);
}

const createMatchup = (
  overrides: Partial<MatchupFragment> = {},
): MatchupFragment => ({
  __typename: 'Matchup',
  id: '1',
  weekNumber: 3,
  leagueId: 10,
  team1Id: 1,
  team2Id: 2,
  team1Score: 85.5,
  team2Score: 72.3,
  status: MatchupStatus.InProgress,
  statsLoadingStatus: null,
  gamesPerMatchup: 7,
  pitcherStartsPerMatchup: 2,
  selectedGamesCount: 5,
  startTime: null,
  endTime: null,
  ...overrides,
});

function formatExpected(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

describe('MatchupDetailLayout matchup times', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('appends a timezone abbreviation to the displayed start time', () => {
    render(
      <MatchupDetailLayout
        matchup={createMatchup({ startTime: '2026-06-05T20:00:00Z' })}
        leagueId={10}
        onMatchupChange={jest.fn()}
        scoreboard={<div />}
      />,
    );

    const expected = formatExpected('2026-06-05T20:00:00Z');

    expect(screen.getByText(`Start: ${expected}`)).toBeTruthy();
    // Regression guard for the bare toLocaleString() bug (LS-5885): the raw
    // locale string carries no timezone label, so it must not equal the
    // timezone-labeled output we now render.
    expect(expected).not.toBe(
      new Date('2026-06-05T20:00:00Z').toLocaleString(),
    );
  });

  it('appends a timezone abbreviation to the displayed end time', () => {
    render(
      <MatchupDetailLayout
        matchup={createMatchup({ endTime: '2026-06-05T23:30:00Z' })}
        leagueId={10}
        onMatchupChange={jest.fn()}
        scoreboard={<div />}
      />,
    );

    const expected = formatExpected('2026-06-05T23:30:00Z');

    expect(screen.getByText(`End: ${expected}`)).toBeTruthy();
  });

  it('does not render a time section when start/end times are absent', () => {
    render(
      <MatchupDetailLayout
        matchup={createMatchup()}
        leagueId={10}
        onMatchupChange={jest.fn()}
        scoreboard={<div />}
      />,
    );

    expect(screen.queryByText(/^Start:/)).toBeNull();
    expect(screen.queryByText(/^End:/)).toBeNull();
  });
});
