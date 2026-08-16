// ---------------------------------------------------------------------------
// Pure helpers for the native (mobile) draft board redesign.
//
// The mobile draft room is a single scrolling surface built around a compact
// board grid — rows are rounds, columns are teams in draft order — instead of
// the web screen's multi-pane layout. Everything view-independent lives here so
// it can be unit tested without a renderer.
// ---------------------------------------------------------------------------

import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
  LeagueTeam,
} from './types';

/** Fewest rounds the mini board ever renders, so an early draft still reads as a board. */
export const MIN_BOARD_ROUNDS = 5;

/**
 * Two-letter abbreviation for a board column header / announcement avatar.
 * Uses the initial of each word, so "Dinger Dynasty" → "DD" and a single-word
 * name falls back to its first two characters ("Thunder" → "TH").
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const fromWords = words.map((w) => w[0]).join('');
  const source = fromWords.length > 1 ? fromWords : words[0];
  return source.slice(0, 2).toUpperCase();
}

/** `m:ss` clock label for the countdown ring. Negative input clamps to `0:00`. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * How many rounds the board should render. Grows with the draft (so a long
 * draft stays complete) but never drops below MIN_BOARD_ROUNDS.
 */
export function resolveBoardRounds({
  teamCount,
  pickCount,
  currentRound,
  maxPickRound,
}: {
  teamCount: number;
  pickCount: number;
  currentRound: number | null;
  maxPickRound: number;
}): number {
  if (teamCount <= 0) return MIN_BOARD_ROUNDS;
  return Math.max(
    Math.ceil((pickCount + teamCount) / teamCount),
    currentRound ?? 1,
    maxPickRound,
    MIN_BOARD_ROUNDS,
  );
}

export interface BoardCell {
  key: string;
  round: number;
  teamId: string;
  /** The pick made in this round by this team, or null when still unfilled. */
  pick: DraftPickRecord | null;
  /** Position label to paint the cell with, or null when unfilled/unknown. */
  position: string | null;
  /** Player name for the inspect caption. */
  playerName: string | null;
  /** This cell is the pick currently on the clock. */
  isCurrent: boolean;
  /** This cell belongs to the viewer's team column. */
  isMine: boolean;
}

/**
 * Flattens the board into a row-major cell list (round 1 first, teams left to
 * right) ready to drop into a fixed-column grid.
 *
 * Cells are keyed off `pickHistory`'s round + teamId rather than recomputed
 * snake math, so linear drafts and executed draft-slot trades land in the right
 * column without this helper knowing the draft's ordering rules.
 */
export function buildBoardCells({
  teams,
  picks,
  currentPickInfo,
  myTeamId,
  statsLookup,
  rounds,
}: {
  teams: LeagueTeam[];
  picks: DraftPickRecord[];
  currentPickInfo: CurrentDraftPickInfo | null;
  myTeamId: number | null;
  statsLookup: Map<number, DraftPlayer>;
  rounds: number;
}): BoardCell[] {
  const byRoundTeam = new Map<string, DraftPickRecord>();
  for (const pick of picks) {
    byRoundTeam.set(`${pick.round}-${pick.teamId}`, pick);
  }

  const currentTeamId =
    currentPickInfo?.teamId != null ? String(currentPickInfo.teamId) : null;

  const cells: BoardCell[] = [];
  for (let round = 1; round <= rounds; round++) {
    for (const team of teams) {
      const teamId = String(team.id);
      const pick = byRoundTeam.get(`${round}-${teamId}`) ?? null;
      const player = pick ? (statsLookup.get(pick.playerId) ?? null) : null;
      const playerName = pick
        ? (player?.name ??
          (pick.player
            ? `${pick.player.firstName} ${pick.player.lastName}`.trim()
            : `Player #${pick.playerId}`))
        : null;
      cells.push({
        key: `${round}-${teamId}`,
        round,
        teamId,
        pick,
        position:
          player?.position ?? pick?.player?.eligiblePositions?.[0] ?? null,
        playerName,
        isCurrent:
          !pick &&
          currentPickInfo?.round === round &&
          currentTeamId === teamId &&
          !currentPickInfo.isComplete,
        isMine: myTeamId !== null && teamId === String(myTeamId),
      });
    }
  }
  return cells;
}

/**
 * Caption shown under the board. Defaults to the "how to use this" hint and
 * switches to a description of whichever cell the user tapped.
 */
export function describeBoardCell(
  cell: BoardCell | null,
  teamName: string,
): string {
  if (!cell) return 'Tap a cell to inspect a pick. Gold column is your team.';
  if (!cell.pick) {
    return `R${cell.round} · ${teamName} — ${cell.isCurrent ? 'on the clock' : 'on deck'}`;
  }
  const position = cell.position ? ` (${cell.position})` : '';
  return `R${cell.round} · ${teamName} — ${cell.playerName ?? 'Unknown'}${position}`;
}

const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

/**
 * Surname for the board grid, where a cell is barely wider than the position
 * label. Generational suffixes are dropped so "Bobby Witt Jr." reads as "Witt"
 * rather than "Jr.".
 */
export function shortPlayerName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return name;
  for (let i = words.length - 1; i >= 0; i--) {
    const bare = words[i].replace(/\./g, '').toLowerCase();
    if (!NAME_SUFFIXES.has(bare)) return words[i];
  }
  return words[words.length - 1];
}

/** Batting-average display style: three decimals with no leading zero (`.332`). */
function formatAvg(avg: number): string {
  const fixed = avg.toFixed(3);
  return fixed.startsWith('0.') ? fixed.slice(1) : fixed;
}

/**
 * Last-pick ticker line: `"{r}.{p} — {Player}, {POS} ({Team})"` (Draft Room
 * v2 persistent chrome, LS-9397).
 */
export function formatLastPickLine(
  pick: DraftPickRecord,
  statsLookup: Map<number, DraftPlayer>,
  teamName: string,
): string {
  const player = statsLookup.get(pick.playerId) ?? null;
  const playerName =
    player?.name ??
    (pick.player
      ? `${pick.player.firstName} ${pick.player.lastName}`.trim()
      : `Player #${pick.playerId}`);
  const position = player?.position ?? pick.player?.eligiblePositions?.[0];
  return `${pick.round}.${pick.pickNumber} — ${playerName}, ${position ?? '—'} (${teamName})`;
}

export interface UpcomingPick {
  round: number;
  /** 1-based pick number within the round. */
  roundPickNumber: number;
  overallPick: number;
  /** Players between the current pick and this one — how many rows down the
   *  inline "YOUR PICK" marker (LS-9399) sits in the available-players list. */
  picksUntil: number;
}

/**
 * The viewer's next `count` picks, computed from standard snake order (round
 * direction alternates — mirrors the Board tab's `R{n}` arrow, README "Board
 * tab" §3). `myTeamIndex` is the viewer's 0-based slot in the draft's team
 * order (`boardOrderedTeams`); a negative index (team not found) yields no
 * picks. Only strictly-future picks are returned — the pick currently on the
 * clock, even if it's the viewer's, is never "next" (Players tab inline
 * markers, LS-9399).
 */
export function computeMyUpcomingPicks({
  currentPickInfo,
  teamCount,
  myTeamIndex,
  count = 2,
}: {
  currentPickInfo: CurrentDraftPickInfo | null;
  teamCount: number;
  myTeamIndex: number;
  count?: number;
}): UpcomingPick[] {
  if (!currentPickInfo || teamCount <= 0 || myTeamIndex < 0) return [];
  const currentOverall = currentPickInfo.overallPick;
  const results: UpcomingPick[] = [];
  // Bounded scan — at most one of my picks per round, so `count` rounds past
  // the current one always finds `count` future picks (or the draft ends).
  for (
    let round = currentPickInfo.round;
    results.length < count && round <= currentPickInfo.round + count;
    round++
  ) {
    const roundPickNumber =
      round % 2 === 1 ? myTeamIndex + 1 : teamCount - myTeamIndex;
    const overallPick = (round - 1) * teamCount + roundPickNumber;
    if (overallPick > currentOverall) {
      results.push({
        round,
        roundPickNumber,
        overallPick,
        picksUntil: overallPick - currentOverall,
      });
    }
  }
  return results;
}

/**
 * "F. Lastname" abbreviation for the Board tab grid cell (README "Board tab",
 * LS-9398) — reuses {@link shortPlayerName}'s suffix-stripping so "Bobby Witt
 * Jr." reads as "B. Witt" rather than "B. Jr.".
 */
export function abbreviatedPlayerName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return fullName.trim();
  return `${words[0].charAt(0)}. ${shortPlayerName(fullName)}`;
}

/**
 * 1-indexed pick number within a round for a snake-ordered board column
 * (LS-9398 Board tab empty cells) — odd rounds run left-to-right, even
 * rounds reverse, mirroring the `→`/`←` gutter arrow.
 */
export function snakePickInRound({
  round,
  columnIndex,
  teamCount,
}: {
  round: number;
  columnIndex: number;
  teamCount: number;
}): number {
  const reversed = round % 2 === 0;
  return (reversed ? teamCount - 1 - columnIndex : columnIndex) + 1;
}

/** Compact stat line under a player's name on the draft list. */
export function statLineFor(player: DraftPlayer): string {
  if (player.isPitcher) {
    const era = player.era != null ? player.era.toFixed(2) : '—';
    const k = player.strikeouts ?? '—';
    return `ERA ${era} · K ${k} · W ${player.wins ?? 0}-${player.losses ?? 0}`;
  }
  return `AVG ${formatAvg(player.avg)} · HR ${player.hr} · RBI ${player.rbi}`;
}
