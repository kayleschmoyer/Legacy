import {
  clampCloseGame,
  CLOSE_GAME_DEFAULT,
  CLOSE_GAME_MAX,
  CLOSE_GAME_MIN,
} from './closeGameThreshold';

describe('clampCloseGame', () => {
  it('floors the threshold at 5pts so 1pt alert spam is not selectable', () => {
    expect(CLOSE_GAME_MIN).toBe(5);
    expect(clampCloseGame(1)).toBe(5);
    expect(clampCloseGame(0)).toBe(5);
    expect(clampCloseGame(-10)).toBe(5);
    expect(clampCloseGame(4)).toBe(5);
  });

  it('accepts values from the floor up to the ceiling', () => {
    expect(clampCloseGame(5)).toBe(5);
    expect(clampCloseGame(50)).toBe(50);
    expect(clampCloseGame(CLOSE_GAME_MAX)).toBe(CLOSE_GAME_MAX);
    expect(clampCloseGame(CLOSE_GAME_MAX + 1)).toBe(CLOSE_GAME_MAX);
  });

  it('rounds fractional input and falls back to the default for NaN', () => {
    expect(clampCloseGame(7.6)).toBe(8);
    expect(clampCloseGame(Number.NaN)).toBe(CLOSE_GAME_DEFAULT);
  });
});
