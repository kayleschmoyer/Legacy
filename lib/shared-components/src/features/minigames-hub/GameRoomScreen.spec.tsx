import React from 'react';
import { fireEvent } from '@testing-library/react';
import {
  GameRoomScreen,
  type GameRoomScreenProps,
  resumeStatusLine,
} from './GameRoomScreen';
import { render } from '../../test-utils';

const NO_PERSONAL_STATS = {
  draftsWon: null,
  dayStreak: null,
  gamesPlayed: null,
};

function renderScreen(overrides: Partial<GameRoomScreenProps> = {}) {
  const props: GameRoomScreenProps = {
    activeGamesCount: 2,
    bestScore: 7,
    tokens: 40,
    resumeGame: null,
    personalStats: { draftsWon: 3, dayStreak: 5, gamesPlayed: 21 },
    onSelectGame: jest.fn(),
    onResumeGame: jest.fn(),
    ...overrides,
  };

  return { props, ...render(<GameRoomScreen {...props} />) };
}

describe('GameRoomScreen', () => {
  it('renders the header, every section, and all three game rows', () => {
    const { getByText, getByTestId } = renderScreen();

    expect(getByText('Minigames')).toBeTruthy();
    expect(getByText('Game Room')).toBeTruthy();
    expect(getByText('All Games')).toBeTruthy();
    expect(getByTestId('games-your-numbers')).toBeTruthy();
    expect(getByTestId('games-coming-soon')).toBeTruthy();
    expect(
      getByText('Trade Deadline · Pennant Picks · Box Score Quiz'),
    ).toBeTruthy();

    expect(getByTestId('games-entry-season-draft')).toBeTruthy();
    expect(getByTestId('games-entry-disclosure')).toBeTruthy();
    expect(getByTestId('games-entry-twenty-questions')).toBeTruthy();
  });

  it('renders the Active / Best / Tokens stat chips with live values', () => {
    const { getByText } = renderScreen();

    expect(getByText('Active')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
    expect(getByText('Best')).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
    expect(getByText('Tokens')).toBeTruthy();
    expect(getByText('40')).toBeTruthy();
  });

  it('falls back to an em dash for every stat that is null', () => {
    const { getAllByText } = renderScreen({
      activeGamesCount: null,
      bestScore: null,
      tokens: null,
      personalStats: NO_PERSONAL_STATS,
    });

    // 3 stat chips + 3 Your Numbers cells.
    expect(getAllByText('—')).toHaveLength(6);
  });

  it('keeps the row accessibility contract from the previous layout', () => {
    const { getByTestId } = renderScreen();
    const row = getByTestId('games-entry-disclosure');

    // The Tamagui jest mocks mirror the RN accessibility props onto inert
    // `data-*` attributes — see `withTestAttrs` in jest-setup-mobile.js.
    expect(row.getAttribute('data-accessibility-role')).toBe('button');
    expect(row.getAttribute('data-accessibility-label')).toBe(
      'Who Am I? — Solo · 2–3 min',
    );
  });

  it('calls onSelectGame with the pressed game id', () => {
    const { props, getByTestId } = renderScreen();

    fireEvent.click(getByTestId('games-entry-twenty-questions'));

    expect(props.onSelectGame).toHaveBeenCalledWith('twenty-questions');
  });

  describe('resume banner', () => {
    const RESUME_GAME = {
      gameId: 42,
      gameName: 'Dead Ball Era Showdown',
      round: 3,
      totalRounds: 9,
      playerCount: 4,
      players: null,
      myPlayerId: null,
    };

    it('is absent from the tree when there is no actionable game', () => {
      const { queryByTestId } = renderScreen({ resumeGame: null });

      expect(queryByTestId('games-resume-banner')).toBeNull();
    });

    it('renders the game name and status line when a game is waiting', () => {
      const { getByTestId, getByText } = renderScreen({
        resumeGame: RESUME_GAME,
      });

      expect(getByTestId('games-resume-banner')).toBeTruthy();
      expect(getByText('Your Turn · Season Draft')).toBeTruthy();
      expect(getByText('Dead Ball Era Showdown')).toBeTruthy();
      expect(getByText('Round 3 of 9 · vs. 3 others')).toBeTruthy();
      expect(getByText('Resume')).toBeTruthy();
    });

    it('calls onResumeGame with the game when tapped', () => {
      const { props, getByTestId } = renderScreen({ resumeGame: RESUME_GAME });

      fireEvent.click(getByTestId('games-resume-banner'));

      expect(props.onResumeGame).toHaveBeenCalledWith(RESUME_GAME);
    });
  });

  describe('resumeStatusLine', () => {
    it('joins the round and opponent counts when myPlayerId is null', () => {
      expect(
        resumeStatusLine({
          gameId: 1,
          gameName: 'g',
          round: 2,
          totalRounds: 9,
          playerCount: 6,
          players: null,
          myPlayerId: null,
        }),
      ).toBe('Round 2 of 9 · vs. 5 others');
    });

    it('singularises a lone opponent', () => {
      expect(
        resumeStatusLine({
          gameId: 1,
          gameName: 'g',
          round: 1,
          totalRounds: 9,
          playerCount: 2,
          players: null,
          myPlayerId: null,
        }),
      ).toBe('Round 1 of 9 · vs. 1 other');
    });

    it('drops the round half when it cannot be derived', () => {
      expect(
        resumeStatusLine({
          gameId: 1,
          gameName: 'g',
          round: null,
          totalRounds: null,
          playerCount: 3,
          players: null,
          myPlayerId: null,
        }),
      ).toBe('vs. 2 others');
    });

    it('drops the opponent half for a solo game', () => {
      expect(
        resumeStatusLine({
          gameId: 1,
          gameName: 'g',
          round: 4,
          totalRounds: 9,
          playerCount: 1,
          players: null,
          myPlayerId: null,
        }),
      ).toBe('Round 4 of 9');
    });

    it('returns null when nothing is derivable', () => {
      expect(
        resumeStatusLine({
          gameId: 1,
          gameName: 'g',
          round: null,
          totalRounds: null,
          playerCount: null,
          players: null,
          myPlayerId: null,
        }),
      ).toBeNull();
    });

    it('names opponents and excludes the caller when myPlayerId is set', () => {
      expect(
        resumeStatusLine({
          gameId: 1,
          gameName: 'g',
          round: 2,
          totalRounds: 9,
          playerCount: 3,
          myPlayerId: 10,
          players: [
            { id: 10, playerName: 'Me' },
            { id: 11, playerName: 'Alice' },
            { id: 12, playerName: 'Bob' },
          ],
        }),
      ).toBe('Round 2 of 9 · vs. Alice, Bob');
    });

    it('truncates opponent names beyond two to "+n more"', () => {
      expect(
        resumeStatusLine({
          gameId: 1,
          gameName: 'g',
          round: 1,
          totalRounds: 9,
          playerCount: 5,
          myPlayerId: 10,
          players: [
            { id: 10, playerName: 'Me' },
            { id: 11, playerName: 'Alice' },
            { id: 12, playerName: 'Bob' },
            { id: 13, playerName: 'Cy' },
            { id: 14, playerName: 'Dot' },
          ],
        }),
      ).toBe('Round 1 of 9 · vs. Alice, Bob +2 more');
    });

    it('falls back to the "n others" count when myPlayerId is null but players is present', () => {
      expect(
        resumeStatusLine({
          gameId: 1,
          gameName: 'g',
          round: 1,
          totalRounds: 9,
          playerCount: 3,
          myPlayerId: null,
          players: [
            { id: 10, playerName: 'Me' },
            { id: 11, playerName: 'Alice' },
            { id: 12, playerName: 'Bob' },
          ],
        }),
      ).toBe('Round 1 of 9 · vs. 2 others');
    });
  });
});
