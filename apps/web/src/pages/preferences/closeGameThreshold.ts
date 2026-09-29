// A 1pt floor makes nearly every matchup "close" on every score update, which
// fans out close-game alerts (LS-7086). 5pt is the smallest margin that still
// reads as a genuinely close game.
export const CLOSE_GAME_MIN = 5;
export const CLOSE_GAME_MAX = 200;
export const CLOSE_GAME_DEFAULT = 50;

export function clampCloseGame(n: number): number {
  if (Number.isNaN(n)) return CLOSE_GAME_DEFAULT;
  return Math.min(CLOSE_GAME_MAX, Math.max(CLOSE_GAME_MIN, Math.round(n)));
}
