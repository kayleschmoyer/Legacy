/**
 * DraftBoardTimeline — the Draft Board view below the `desktop` viewport tier
 * (LS-10003).
 *
 * The mock's own note: "Full grid is a $gtLg layout. Below that the board
 * reads as a round-by-round timeline — the same picks, ordered by time instead
 * of by team." (docs/design/B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/
 * project/components/DraftGrid.html, `.board-timeline`.) This is that
 * treatment: a sticky clock header with the countdown ring, then collapsible
 * round sections, one row per pick.
 *
 * It is a presentation fork of `DraftGrid`, not a second data source — every
 * prop here is one `DraftPlayerBoard` already holds for the grid, and the
 * projection itself lives in `draftTimeline.ts`. No queries are added.
 *
 * Raw DOM rather than Tamagui primitives, matching its sibling `DraftGrid`:
 * both render into the still-CSS-Grid `.d-main` pane and are styled by the
 * `d-tl-*` / `d-draft-grid-*` rules in `styles.ts`. That also keeps this file
 * on the web-only path the Draft Board view already occupies — the phone tier
 * swaps the whole screen for `CompactLiveDraftBoard`, so native never reaches
 * either component.
 */
import React, { useEffect, useMemo, useState } from 'react';

import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
  LeagueTeam,
} from './types';
import {
  buildTimelineRounds,
  defaultOpenRound,
  type TimelinePick,
  timelinePickMeta,
} from './draftTimeline';
import { formatClock } from './nativeDraftBoard';
import { getPositionColor } from './utils';
import type { SportKind } from '../../config/sports';

const RING_SIZE = 46;
const RING_RADIUS = 19;
const RING_STROKE = 4;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export interface DraftBoardTimelineProps {
  /** Teams in draft order — the same `boardOrderedTeams` the grid columns use. */
  teams: LeagueTeam[];
  picks: DraftPickRecord[];
  currentPickInfo: CurrentDraftPickInfo | null;
  myTeamId: number | null;
  statsLookup: Map<number, DraftPlayer>;
  /** Active league sport — drives the row's position-color stripe (LS-8784).
   *  Required, not defaulted, for the same reason `DraftGrid` requires it: a
   *  baseball default silently mis-colors a football board. */
  sport: SportKind;
  /** Seconds left on the current pick, for the header ring. */
  timeRemaining: number;
  /** Seconds the pick started with — the ring's denominator. */
  pickTimeLimitSeconds: number;
  /** Offline mock draft (LS-9144): the clock does not run. */
  untimed?: boolean;
  /** Commissioner has paused the draft. */
  paused?: boolean;
}

/** The countdown ring beside the on-the-clock team — the mock's `.tl-ring`. */
function TimelineClockRing({
  timeRemaining,
  pickTimeLimitSeconds,
  untimed,
  paused,
}: {
  timeRemaining: number;
  pickTimeLimitSeconds: number;
  untimed: boolean;
  paused: boolean;
}): React.JSX.Element {
  // Guard the divisor so the arc never renders NaN on an untimed or
  // not-yet-initialized clock.
  const fraction =
    untimed || paused
      ? 1
      : pickTimeLimitSeconds > 0
        ? Math.min(1, Math.max(0, timeRemaining / pickTimeLimitSeconds))
        : 0;
  const label = untimed ? '∞' : paused ? '‖' : formatClock(timeRemaining);

  return (
    <div className="d-tl-ring">
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="var(--d-panel-border)"
          strokeWidth={RING_STROKE}
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="var(--d-accent)"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - fraction)}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </svg>
      <div className="d-tl-ring-time">{label}</div>
    </div>
  );
}

/** One `.tl-pick` row. */
function TimelinePickRow({
  pick,
  sport,
}: {
  pick: TimelinePick;
  sport: SportKind;
}): React.JSX.Element {
  const posColor = pick.position
    ? getPositionColor(sport, pick.position)
    : undefined;

  const className = [
    'd-tl-pick',
    pick.state === 'now' ? 'now' : '',
    pick.state === 'up' ? 'up' : '',
    pick.isMine ? 'me-team' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // The mock reads the on-the-clock row as the clock itself: the name slot
  // says who is up and the trailing slot carries the countdown, which the
  // sticky header already renders. Repeating the countdown here would give
  // the row a second live region, so the trailing slot stays the position
  // column and the row is distinguished by its gold treatment instead.
  const name =
    pick.state === 'made'
      ? (pick.playerName ?? '—')
      : pick.state === 'now'
        ? 'On the clock'
        : '—';

  return (
    <div
      className={className}
      data-pos={pick.position ?? undefined}
      data-state={pick.state}
      data-testid={`draft-timeline-pick-${pick.round}-${pick.teamId}`}
      style={
        posColor && pick.state === 'made' && !pick.isMine
          ? { borderLeftColor: posColor }
          : undefined
      }
    >
      <span className="d-tl-pick-num">{`#${pick.overallPick}`}</span>
      <span className="d-tl-pick-team" title={pick.teamName}>
        {pick.monogram}
      </span>
      <div className="d-tl-pick-body">
        <div className="d-tl-pick-name">{name}</div>
        <div className="d-tl-pick-meta">
          {pick.state === 'now' && pick.isMine
            ? `${pick.teamName} · your pick`
            : timelinePickMeta(pick)}
        </div>
      </div>
      <span
        className="d-tl-pick-pos"
        style={posColor ? { color: posColor } : undefined}
      >
        {pick.position ?? ''}
      </span>
    </div>
  );
}

export function DraftBoardTimeline({
  teams,
  picks,
  currentPickInfo,
  myTeamId,
  statsLookup,
  sport,
  timeRemaining,
  pickTimeLimitSeconds,
  untimed = false,
  paused = false,
}: DraftBoardTimelineProps): React.JSX.Element | null {
  const rounds = useMemo(
    () =>
      buildTimelineRounds({
        teams,
        picks,
        currentPickInfo,
        myTeamId,
        statsLookup,
      }),
    [teams, picks, currentPickInfo, myTeamId, statsLookup],
  );

  const initialOpen = defaultOpenRound(rounds);
  const [openRound, setOpenRound] = useState<number | null>(initialOpen);

  // Follow the draft as it advances into a new round, but only while the user
  // has not taken over: once they open a different round by hand, that choice
  // stands until they change it again. `sawRound` tracks the round the
  // timeline last auto-opened, so a re-render at the same round never yanks
  // their section shut.
  const [sawRound, setSawRound] = useState<number | null>(initialOpen);
  useEffect(() => {
    if (initialOpen !== null && initialOpen !== sawRound) {
      setSawRound(initialOpen);
      setOpenRound(initialOpen);
    }
  }, [initialOpen, sawRound]);

  if (rounds.length === 0) return null;

  const onClockTeam =
    currentPickInfo != null && !currentPickInfo.isComplete
      ? (teams.find((t) => String(t.id) === String(currentPickInfo.teamId)) ??
        null)
      : null;
  const isMine =
    onClockTeam !== null &&
    myTeamId !== null &&
    String(onClockTeam.id) === String(myTeamId);

  return (
    <div className="d-tl-view" data-testid="draft-board-timeline">
      {onClockTeam && currentPickInfo && (
        <div className="d-tl-clock">
          <div>
            <div className="d-tl-clock-eyebrow">
              {`${isMine ? "You're on the clock" : 'On the clock'} · Pick #${currentPickInfo.overallPick}`}
            </div>
            <div className="d-tl-clock-team">{onClockTeam.name}</div>
            <div className="d-tl-clock-sub">
              {`Round ${currentPickInfo.round} · Pick ${currentPickInfo.pickNumber} of ${teams.length}${isMine ? ' · You' : ''}`}
            </div>
          </div>
          <TimelineClockRing
            timeRemaining={timeRemaining}
            pickTimeLimitSeconds={pickTimeLimitSeconds}
            untimed={untimed}
            paused={paused}
          />
        </div>
      )}

      {rounds.map((round) => {
        const open = round.round === openRound;
        const countLabel =
          round.madeCount === round.totalCount
            ? `${round.totalCount} picks`
            : `${round.madeCount} of ${round.totalCount} picks`;
        const sectionId = `d-tl-round-${round.round}`;

        return (
          <div
            key={round.round}
            className={`d-tl-round${open ? ' open' : ''}`}
            data-testid={`draft-timeline-round-${round.round}`}
          >
            <button
              type="button"
              className="d-tl-round-head"
              data-testid={`draft-timeline-round-head-${round.round}`}
              aria-expanded={open}
              aria-controls={sectionId}
              onClick={() => setOpenRound(open ? null : round.round)}
            >
              <span className="d-tl-round-label">{`Round ${round.round}`}</span>
              <span className="d-tl-round-count">{countLabel}</span>
              <span className="d-tl-round-chev" aria-hidden="true">
                {open ? '▾' : '▸'}
              </span>
            </button>
            {open && (
              <div className="d-tl-picks" id={sectionId}>
                {round.picks.map((pick) => (
                  <TimelinePickRow key={pick.key} pick={pick} sport={sport} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default DraftBoardTimeline;
