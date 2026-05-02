/**
 * Domain types for shared scoreboard UI primitives.
 * Mirrors the shape returned by the `GetScoreboard` GraphQL query so the
 * components can be fed directly with query results, but is decoupled from
 * the generated types so this library has no `apps/web` dependency.
 */

export interface ScoreboardTeam {
  teamName: string;
  abbreviation: string;
  runs: number;
  hits: number;
  errors: number;
  linescoreInnings?: number[] | null;
}

/**
 * Possible game statuses returned by the GraphQL `GetScoreboard` query —
 * see the `ScoreboardGame.status` field doc in the schema. The trailing
 * `string & {}` keeps the union open so callers can pass through any
 * future status string without a cast.
 */
export type GameStatus =
  | 'Preview'
  | 'Live'
  | 'Final'
  | 'Postponed'
  | 'Suspended'
  | (string & {});

export interface ScoreboardGame {
  gamePk: number;
  status: GameStatus;
  startTime?: string | null;
  inning?: number | null;
  inningHalf?: string | null;
  outs?: number | null;
  homeTeam: ScoreboardTeam;
  awayTeam: ScoreboardTeam;
}
