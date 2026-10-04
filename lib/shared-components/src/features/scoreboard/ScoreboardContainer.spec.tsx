import React from 'react';
import { Text } from 'tamagui';
import { ScoreboardContainer } from './ScoreboardContainer';
import { partitionScoreboardGames, shouldPollScoreboard } from './partition';
import {
  maxScoreboardDateISO,
  offsetDate,
  SCOREBOARD_MAX_FUTURE_DAYS,
  todayISO,
} from './dateUtils';
import type { ScoreboardGame } from '../../components/scoreboard/types';
import { fireEvent, render } from '../../test-utils';

function makeGame(
  gamePk: number,
  status: ScoreboardGame['status'],
): ScoreboardGame {
  return {
    gamePk,
    status,
    homeTeam: {
      teamName: 'Home',
      abbreviation: 'HOM',
      runs: 0,
      hits: 0,
      errors: 0,
    },
    awayTeam: {
      teamName: 'Away',
      abbreviation: 'AWY',
      runs: 0,
      hits: 0,
      errors: 0,
    },
  };
}

const dateNav = <Text>injected-date-nav</Text>;

function renderContainer(
  props: Partial<React.ComponentProps<typeof ScoreboardContainer>> = {},
) {
  return render(
    <ScoreboardContainer
      date="2026-04-01"
      sport="all"
      onSportChange={() => undefined}
      games={[]}
      dateNav={dateNav}
      {...props}
    />,
  );
}

describe('partitionScoreboardGames', () => {
  it('routes Postponed games into their own bucket, not Upcoming', () => {
    const { upcomingGames, postponedGames } = partitionScoreboardGames([
      makeGame(1, 'Postponed'),
    ]);
    expect(postponedGames.map((g) => g.gamePk)).toEqual([1]);
    expect(upcomingGames).toHaveLength(0);
  });

  it('partitions Live, Upcoming, Final, and Postponed independently', () => {
    const { liveGames, upcomingGames, finalGames, postponedGames } =
      partitionScoreboardGames([
        makeGame(1, 'Live'),
        makeGame(2, 'Preview'),
        makeGame(3, 'Final'),
        makeGame(4, 'Postponed'),
        makeGame(5, 'Suspended'),
      ]);
    expect(liveGames.map((g) => g.gamePk)).toEqual([1]);
    expect(upcomingGames.map((g) => g.gamePk)).toEqual([2, 5]);
    expect(finalGames.map((g) => g.gamePk)).toEqual([3]);
    expect(postponedGames.map((g) => g.gamePk)).toEqual([4]);
  });
});

describe('shouldPollScoreboard', () => {
  it('polls when any game is live, regardless of date', () => {
    expect(shouldPollScoreboard([makeGame(1, 'Live')], '2000-01-01')).toBe(
      true,
    );
  });

  it('polls for upcoming games only when the date is today', () => {
    const upcoming = [makeGame(1, 'Preview')];
    expect(shouldPollScoreboard(upcoming, todayISO())).toBe(true);
    expect(shouldPollScoreboard(upcoming, '2000-01-01')).toBe(false);
  });

  it('does not poll when all games are final', () => {
    expect(shouldPollScoreboard([makeGame(1, 'Final')], todayISO())).toBe(
      false,
    );
  });
});

describe('dateUtils', () => {
  it('bounds future browsing to one year past today (LS-10456)', () => {
    expect(SCOREBOARD_MAX_FUTURE_DAYS).toBe(365);
    expect(maxScoreboardDateISO()).toBe(offsetDate(todayISO(), 365));
    expect(maxScoreboardDateISO() > todayISO()).toBe(true);
  });

  it('offsets dates across month boundaries', () => {
    expect(offsetDate('2026-04-01', -1)).toBe('2026-03-31');
    expect(offsetDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('ScoreboardContainer', () => {
  it('renders the MLB heading, sport filter, and injected date nav', () => {
    const { getByTestId, getByText } = renderContainer();
    expect(getByTestId('scoreboard-heading')).toBeTruthy();
    expect(getByTestId('scoreboard-sport-all')).toBeTruthy();
    expect(getByTestId('scoreboard-sport-mlb')).toBeTruthy();
    expect(getByTestId('scoreboard-sport-nfl')).toBeTruthy();
    expect(getByText('injected-date-nav')).toBeTruthy();
  });

  it('shows the empty state when there are no games', () => {
    const { getByTestId } = renderContainer({ games: [] });
    expect(getByTestId('scoreboard-empty')).toBeTruthy();
  });

  it('uses upcoming-schedule copy for an empty future date (LS-10456)', () => {
    const { getByTestId, getByText } = renderContainer({
      date: offsetDate(todayISO(), 30),
      games: [],
    });
    expect(getByTestId('scoreboard-empty')).toBeTruthy();
    expect(getByText(/Nothing is on the schedule for .* yet/)).toBeTruthy();
  });

  it('uses past-tense copy for an empty past date', () => {
    const { getByText } = renderContainer({
      date: offsetDate(todayISO(), -30),
      games: [],
    });
    expect(getByText(/The league was dark on/)).toBeTruthy();
  });

  it('keeps the today copy pointing at tomorrow’s slate', () => {
    const { getByText } = renderContainer({ date: todayISO(), games: [] });
    expect(getByText(/jump ahead to tomorrow’s slate/)).toBeTruthy();
  });

  it('names the future date when its schedule is unavailable', () => {
    const { getByTestId, getByText } = renderContainer({
      date: offsetDate(todayISO(), 30),
      isUnavailable: true,
    });
    expect(getByTestId('scoreboard-unavailable')).toBeTruthy();
    expect(getByText(/hasn’t been published yet/)).toBeTruthy();
  });

  it('renders scheduled games for a future date in the Upcoming section', () => {
    const { getByTestId, getAllByText, queryByTestId } = renderContainer({
      date: offsetDate(todayISO(), 7),
      games: [makeGame(2001, 'Preview'), makeGame(2002, 'Preview')],
    });
    expect(getByTestId('game-card-2001')).toBeTruthy();
    expect(getByTestId('game-card-2002')).toBeTruthy();
    expect(getAllByText('Upcoming').length).toBeGreaterThan(0);
    expect(queryByTestId('scoreboard-empty')).toBeNull();
  });

  it('renders game cards grouped by status when games are present', () => {
    const { getByTestId, queryByTestId } = renderContainer({
      games: [makeGame(1001, 'Live'), makeGame(1002, 'Final')],
    });
    expect(getByTestId('game-card-1001')).toBeTruthy();
    expect(getByTestId('game-card-1002')).toBeTruthy();
    expect(queryByTestId('scoreboard-empty')).toBeNull();
  });

  it('shows the NFL placeholder and hides games when NFL is selected', () => {
    const { getByTestId, queryByTestId } = renderContainer({
      sport: 'nfl',
      games: [makeGame(1001, 'Live')],
    });
    expect(getByTestId('scoreboard-nfl-coming-soon')).toBeTruthy();
    expect(queryByTestId('game-card-1001')).toBeNull();
  });

  it('uses NFL section labels instead of MLB labels when NFL is selected', () => {
    const { getByTestId } = renderContainer({ sport: 'nfl' });
    const eyebrow = getByTestId('scoreboard-eyebrow').textContent;
    expect(eyebrow).toContain('National Football League');
    expect(eyebrow).not.toContain('Major League Baseball');
    expect(getByTestId('scoreboard-heading').textContent).toBe(
      'NFL Scoreboard',
    );
  });

  it('keeps MLB section labels when MLB is selected', () => {
    const { getByTestId } = renderContainer({ sport: 'mlb' });
    const eyebrow = getByTestId('scoreboard-eyebrow').textContent;
    expect(eyebrow).toContain('Major League Baseball');
    expect(eyebrow).not.toContain('National Football League');
    expect(getByTestId('scoreboard-heading').textContent).toBe(
      'MLB Scoreboard',
    );
  });

  it('shows the error card when hasError is set', () => {
    const { getByTestId } = renderContainer({ hasError: true });
    expect(getByTestId('scoreboard-error')).toBeTruthy();
  });

  it('fires onSportChange when a sport option is pressed', () => {
    const onSportChange = jest.fn();
    const { getByTestId } = renderContainer({ onSportChange });
    fireEvent.click(getByTestId('scoreboard-sport-nfl'));
    expect(onSportChange).toHaveBeenCalledWith('nfl');
  });
});
