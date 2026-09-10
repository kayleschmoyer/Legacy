// ---------------------------------------------------------------------------
// Timeline projection (LS-10003)
// ---------------------------------------------------------------------------
//
// Below the `desktop` viewport tier the mock replaces the rounds × teams grid
// with a round-by-round timeline — "the same picks, ordered by time instead of
// by team" (docs/design/B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/
// project/components/DraftGrid.html, `.board-timeline`). This module owns that
// second projection of the board data.
//
// It is deliberately a pure re-shaping of exactly the inputs `DraftGrid`
// already receives: no query, no fetch, no clock of its own. Splitting it out
// of the component (the `nativeDraftBoard.ts` pattern) is what lets the snake
// ordering and the made/now/up state machine be asserted directly in a spec
// without rendering.

import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
  LeagueTeam,
} from './types';
import { initialsOf } from './nativeDraftBoard';

/** Where a slot sits relative to the pick currently on the clock. */
export type TimelinePickState = 'made' | 'now' | 'up';

export interface TimelinePick {
  /** Stable React key — `${round}-${teamId}`, matching `BoardCell.key`. */
  key: string;
  round: number;
  /** 1-indexed slot within the round, in snake order. */
  pickInRound: number;
  /** Overall pick number. Taken from the record when the pick was made, so an
   *  executed draft-slot trade keeps its real number rather than a recomputed
   *  one. */
  overallPick: number;
  teamId: string;
  teamName: string;
  /** Two-letter team monogram for the row's left rail. */
  monogram: string;
  /** Null for a slot nobody has picked in yet. */
  playerName: string | null;
  /** Null when unfilled or when the player's position is unknown. */
  position: string | null;
  state: TimelinePickState;
  /** This slot belongs to the viewer's team. */
  isMine: boolean;
}

export interface TimelineRound {
  round: number;
  picks: TimelinePick[];
  /** How many of this round's slots have been picked. */
  madeCount: number;
  /** Total slots in the round (one per team). */
  totalCount: number;
  /** The pick on the clock falls in this round. */
  isCurrent: boolean;
}

/**
 * Projects the board into rounds, newest first, each round's picks in snake
 * order.
 *
 * Round *ordering* is descending because the timeline reads backwards from
 * now: the mock stacks the live round at the top with the completed rounds
 * collapsed beneath it. Within a round the picks run forwards, in the order
 * they are taken.
 *
 * Rounds are capped at the current round (or the deepest round any pick
 * reached, whichever is further along) rather than at the board's full
 * `maxRounds`. The grid renders every future round because its columns need a
 * fixed height; the timeline has no such constraint, and a stack of dozens of
 * identical empty future rounds is noise, not information.
 *
 * Slots are matched by `round` + `teamId` — the same key `buildBoardCells`
 * uses — so a traded draft slot lands on the team that actually owns it
 * without this helper reimplementing the draft's ordering rules.
 */
export function buildTimelineRounds({
  teams,
  picks,
  currentPickInfo,
  myTeamId,
  statsLookup,
}: {
  teams: LeagueTeam[];
  picks: DraftPickRecord[];
  currentPickInfo: CurrentDraftPickInfo | null;
  myTeamId: number | null;
  statsLookup: Map<number, DraftPlayer>;
}): TimelineRound[] {
  const teamCount = teams.length;
  if (teamCount === 0) return [];

  const byRoundTeam = new Map<string, DraftPickRecord>();
  let deepestPickRound = 0;
  for (const pick of picks) {
    byRoundTeam.set(`${pick.round}-${pick.teamId}`, pick);
    if (pick.round > deepestPickRound) deepestPickRound = pick.round;
  }

  const draftComplete = currentPickInfo?.isComplete === true;
  const currentRound =
    currentPickInfo != null && !draftComplete ? currentPickInfo.round : null;
  const currentTeamId =
    currentPickInfo?.teamId != null ? String(currentPickInfo.teamId) : null;

  // At least round 1, so an untouched draft still renders a shell rather than
  // an empty pane.
  const lastRound = Math.max(1, currentRound ?? 0, deepestPickRound);

  const rounds: TimelineRound[] = [];
  for (let round = lastRound; round >= 1; round--) {
    const roundPicks: TimelinePick[] = [];
    let madeCount = 0;

    // Snake order: the slot's column index mirrors `snakePickInRound`'s
    // mapping, read in the other direction — for each slot, which column
    // holds it. Odd rounds run left to right, even rounds reverse.
    for (let slot = 1; slot <= teamCount; slot++) {
      const columnIndex = round % 2 === 0 ? teamCount - slot : slot - 1;
      const team = teams[columnIndex];
      const teamId = String(team.id);
      const pick = byRoundTeam.get(`${round}-${teamId}`) ?? null;
      const player = pick ? (statsLookup.get(pick.playerId) ?? null) : null;

      // Matched on team, not on `pickNumber`: `buildBoardCells` keys the
      // grid's current cell the same way, and a traded slot changes which
      // team holds a given `pickNumber` without changing which team is
      // actually on the clock.
      const isNow =
        pick === null && currentRound === round && currentTeamId === teamId;

      if (pick) madeCount++;

      roundPicks.push({
        key: `${round}-${teamId}`,
        round,
        pickInRound: slot,
        overallPick: pick?.overallPick ?? (round - 1) * teamCount + slot,
        teamId,
        teamName: team.name,
        monogram: initialsOf(team.name),
        playerName: pick
          ? (player?.name ??
            (pick.player
              ? `${pick.player.firstName} ${pick.player.lastName}`.trim()
              : `Player #${pick.playerId}`))
          : null,
        position: pick
          ? (player?.position ?? pick.player?.eligiblePositions?.[0] ?? null)
          : null,
        state: pick ? 'made' : isNow ? 'now' : 'up',
        isMine: myTeamId !== null && teamId === String(myTeamId),
      });
    }

    rounds.push({
      round,
      picks: roundPicks,
      madeCount,
      totalCount: teamCount,
      isCurrent: currentRound === round,
    });
  }

  return rounds;
}

/**
 * Which round the timeline opens with. The current round when the draft is
 * live; otherwise the newest round rendered, so a finished (or not yet
 * started) draft still opens onto something rather than an all-collapsed
 * stack. Null when there is nothing to render.
 */
export function defaultOpenRound(rounds: TimelineRound[]): number | null {
  if (rounds.length === 0) return null;
  return rounds.find((r) => r.isCurrent)?.round ?? rounds[0].round;
}

/** Sub-line under a pick's name: `POS · Team Name`, matching the mock's
 *  `.tl-pick .mt`. Falls back to the team alone when the position is
 *  unknown, rather than printing a placeholder dash as if it were data. */
export function timelinePickMeta(pick: TimelinePick): string {
  return pick.position ? `${pick.position} · ${pick.teamName}` : pick.teamName;
}
