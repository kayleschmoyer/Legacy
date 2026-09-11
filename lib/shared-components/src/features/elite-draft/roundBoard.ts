// ---------------------------------------------------------------------------
// Pure helpers for the phone-tier ROUND view of the draft board (LS-10000).
//
// The phone board is round-scoped rather than a narrowed desktop grid: numbered
// round tabs, a round summary carrying the position mix and the snake
// direction, then one tile per team laid out three-across so a whole round is
// a single screenful. Design source:
//   docs/design/B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/project/
//     DraftRoomMobile.html      — the two `.mob-round` containers
//     scripts/draft.js          — `renderRound()` / `head()`, the data shape
//     styles/mobile.css         — the `.mob-round` block, the state vocabulary
//
// Everything view-independent lives here so it can be unit tested without a
// renderer, mirroring `nativeDraftBoard.ts` (whose `buildBoardCells` supplies
// this module's input).
// ---------------------------------------------------------------------------

import type { BoardCell } from './nativeDraftBoard';
import { snakePickInRound } from './nativeDraftBoard';
import type { DraftPlayer, LeagueTeam } from './types';

/**
 * A round tab's appearance. `done` rounds are fully drafted and read as
 * secondary text; `active` is the round the board is showing; `upcoming`
 * rounds are the faintest tier.
 */
export type RoundTabState = 'done' | 'active' | 'upcoming';

/**
 * A tile's visual state, in precedence order. `on-the-clock` wins over
 * `mine` so the viewer's own turn reads as the live pick rather than as a
 * roster entry; `mine` distinguishes the viewer's completed picks from
 * everyone else's `drafted`.
 */
export type RoundTileState = 'on-the-clock' | 'mine' | 'drafted' | 'upcoming';

export interface RoundTile {
  key: string;
  teamId: string;
  teamName: string;
  /** Drives the ★ prefix on the team name, independent of `state` — the
   *  viewer's own tile is starred whether it is on the clock, drafted, or
   *  still upcoming. */
  isMine: boolean;
  state: RoundTileState;
  /** `"{round}.{pickInRound}"`, zero-padded to two digits (`4.07`). */
  pickLabel: string;
  /** Null for every state except `mine` / `drafted`. */
  playerName: string | null;
  position: string | null;
  /** Career franchise abbreviation, or null when none is on file (LS-9832) —
   *  never a fabricated placeholder. */
  club: string | null;
}

/** One segment of the round summary's position-mix bar. */
export interface RoundMixSegment {
  position: string;
  count: number;
}

export interface RoundSummary {
  round: number;
  /** Picks completed in this round. */
  picksMade: number;
  /** Picks the round contains in total — one per team. */
  totalPicks: number;
  /** `"#37–48"` — the overall-pick span this round covers. */
  rangeLabel: string;
  /** Snake order for this round: odd rounds run left to right, even rounds
   *  reverse. Mirrors {@link snakePickInRound}, which numbers the tiles. */
  snakeDirection: 'left-to-right' | 'right-to-left';
  /** Position mix among completed picks, most-drafted first. Empty for a
   *  round that has not started. */
  mix: RoundMixSegment[];
  /** False only when the round has no picks and is not the current round —
   *  the design's "unlocks when round N completes" state. */
  hasStarted: boolean;
  /** The round that must complete before this one opens, or null once
   *  `hasStarted`. Round 1 never reports a predecessor. */
  unlocksAfterRound: number | null;
}

/**
 * Slices the flat, row-major {@link BoardCell} list `buildBoardCells` produces
 * down to a single round's cells. Returns an empty array for a round outside
 * the built range rather than a short/undefined-padded slice.
 */
export function cellsForRound({
  cells,
  round,
  teamCount,
}: {
  cells: BoardCell[];
  round: number;
  teamCount: number;
}): BoardCell[] {
  if (teamCount <= 0 || round < 1) return [];
  const start = (round - 1) * teamCount;
  if (start >= cells.length) return [];
  return cells.slice(start, start + teamCount);
}

/**
 * Builds the round's twelve tiles from its cells, in board (draft-order)
 * column order — the same order the wide grid reads left to right, so a team's
 * position in the round is consistent across tiers.
 */
export function buildRoundTiles({
  cells,
  teams,
  round,
  statsLookup,
}: {
  cells: BoardCell[];
  teams: LeagueTeam[];
  round: number;
  statsLookup: Map<number, DraftPlayer>;
}): RoundTile[] {
  const teamCount = teams.length;
  const nameById = new Map(teams.map((team) => [String(team.id), team.name]));

  return cells.map((cell, columnIndex) => {
    const pickInRound = cell.pick
      ? cell.pick.pickNumber
      : snakePickInRound({ round, columnIndex, teamCount });
    const player = cell.pick
      ? (statsLookup.get(cell.pick.playerId) ?? null)
      : null;

    let state: RoundTileState;
    if (cell.isCurrent) state = 'on-the-clock';
    else if (!cell.pick) state = 'upcoming';
    else if (cell.isMine) state = 'mine';
    else state = 'drafted';

    return {
      key: cell.key,
      teamId: cell.teamId,
      teamName: nameById.get(cell.teamId) ?? cell.teamId,
      isMine: cell.isMine,
      state,
      pickLabel: `${round}.${String(pickInRound).padStart(2, '0')}`,
      playerName: cell.pick ? cell.playerName : null,
      position: cell.pick ? cell.position : null,
      club: player?.club ?? cell.pick?.player?.club ?? null,
    };
  });
}

/**
 * Accessible one-line description of a tile — the only channel that carries a
 * tile's state to a screen reader, since the visual difference between
 * `mine`, `drafted`, `on-the-clock` and `upcoming` is border and tint alone.
 *
 * Also the surface the specs assert state against: Tamagui strips `testID`
 * and `data-*` from components that carry accessibility props in the
 * production web build (LS-5976), so state must not be published only there.
 */
export function describeRoundTile(tile: RoundTile): string {
  const head = `${tile.teamName}, pick ${tile.pickLabel}`;
  switch (tile.state) {
    case 'on-the-clock':
      return tile.isMine
        ? `${head}, your pick — on the clock`
        : `${head}, on the clock`;
    case 'upcoming':
      return `${head}, upcoming`;
    case 'mine':
    case 'drafted': {
      const player = tile.playerName ?? 'Unknown player';
      const position = tile.position ? `, ${tile.position}` : '';
      const owner = tile.state === 'mine' ? ' — your pick' : '';
      return `${head}, ${player}${position}${owner}`;
    }
  }
}

/**
 * Round summary line: how far the round has got, the overall-pick span it
 * covers, its snake direction, and the position mix among the picks already
 * made. `currentRound` is what separates "not started yet" from "in progress
 * with nothing drafted": the round on the clock has started even though its
 * first pick has not landed.
 */
export function buildRoundSummary({
  cells,
  round,
  teamCount,
  currentRound,
}: {
  cells: BoardCell[];
  round: number;
  teamCount: number;
  currentRound: number | null;
}): RoundSummary {
  const made = cells.filter((cell) => cell.pick !== null);

  const counts = new Map<string, number>();
  for (const cell of made) {
    const position = cell.position;
    if (!position) continue;
    counts.set(position, (counts.get(position) ?? 0) + 1);
  }
  // Most-drafted first; ties broken alphabetically so the bar and its key are
  // stable across re-renders rather than reordering on every pick.
  const mix: RoundMixSegment[] = [...counts.entries()]
    .map(([position, count]) => ({ position, count }))
    .sort((a, b) =>
      b.count !== a.count
        ? b.count - a.count
        : a.position.localeCompare(b.position),
    );

  const hasStarted =
    made.length > 0 || (currentRound !== null && round <= currentRound);

  return {
    round,
    picksMade: made.length,
    totalPicks: teamCount,
    rangeLabel: `#${(round - 1) * teamCount + 1}–${round * teamCount}`,
    snakeDirection: round % 2 === 0 ? 'right-to-left' : 'left-to-right',
    mix,
    hasStarted,
    unlocksAfterRound: hasStarted || round <= 1 ? null : round - 1,
  };
}

/**
 * Tab appearance for one round. A round is `done` once every one of its picks
 * is in — not merely once the clock has moved past it — so a round left
 * incomplete by a paused or rewound draft does not read as finished.
 */
export function resolveRoundTabState({
  round,
  activeRound,
  picksMade,
  teamCount,
}: {
  round: number;
  activeRound: number;
  picksMade: number;
  teamCount: number;
}): RoundTabState {
  if (round === activeRound) return 'active';
  if (teamCount > 0 && picksMade >= teamCount) return 'done';
  return 'upcoming';
}

/**
 * Which round the board should open on: the round on the clock, clamped into
 * the range the board actually renders. Falls back to the last round carrying
 * a pick (a completed draft opens on its final round) and finally to round 1.
 */
export function resolveInitialRound({
  currentRound,
  maxPickRound,
  rounds,
}: {
  currentRound: number | null;
  maxPickRound: number;
  rounds: number;
}): number {
  const preferred = currentRound ?? (maxPickRound > 0 ? maxPickRound : 1);
  return Math.min(Math.max(preferred, 1), Math.max(rounds, 1));
}
