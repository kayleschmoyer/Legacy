import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AvailableDraftPlayer,
  DraftPlayer,
  HighlightVideoSummary,
  NotablePlaySummary,
} from './types';
import { PickAnnouncement } from './PickAnnouncement';
import { PickSplashHighlightVideo } from './PickSplashHighlightVideo';
import { PickSplashStatGraphic } from './PickSplashStatGraphic';
import { getMlbHeadshotUrl } from './draftUtils';
import type { SportKind } from '../../config/sports';

// ---------------------------------------------------------------------------
// SplashQueue — FIFO pick-reveal queue for the spectator screen (LS-8942)
//
// The member draft room shows at most one announcement and lets newer picks
// clobber older ones (the drafter needs their board back). Spectators are the
// opposite: every pick deserves guaranteed screen time, so picks queue FIFO
// and each splash holds for a minimum duration — compressing when the queue
// falls behind live, and dropping the oldest entries in a flood.
// ---------------------------------------------------------------------------

/** One queued pick reveal. */
export interface SplashPick {
  player: DraftPlayer | AvailableDraftPlayer;
  /** Overall pick number — also the queue's dedup/undo key. */
  overallPick: number;
  round: number;
  roundPickNumber: number;
  isAuto: boolean;
  teamName: string;
}

export interface SplashQueueOptions {
  /** Hold per splash under normal pacing. */
  minSplashMs?: number;
  /** Hold per splash while catching up (queue backlog). */
  catchUpSplashMs?: number;
  /** Total queued picks (active + pending) above which holds compress. */
  catchUpQueueLength?: number;
  /** Pending backlog above which only the newest picks are kept. */
  floodQueueLength?: number;
  /** How many pending picks survive a flood trim. */
  floodKeepNewest?: number;
  /** Exit-animation time before the next splash enters. */
  exitMs?: number;
}

/**
 * FIFO splash queue state machine. Platform-neutral — the web `SplashQueue`
 * component below and the native spectator screen both drive their pick
 * announcement from this hook.
 *
 * Historical picks are never replayed on mount by construction: nothing is
 * shown unless it was explicitly `enqueue`d, and the screen only enqueues
 * from live WebSocket pick events (never from the fetched pick history).
 */
export function useSplashQueue({
  minSplashMs = 8000,
  catchUpSplashMs = 4000,
  catchUpQueueLength = 3,
  floodQueueLength = 8,
  floodKeepNewest = 3,
  exitMs = 400,
}: SplashQueueOptions = {}) {
  const [pending, setPending] = useState<SplashPick[]>([]);
  const [active, setActive] = useState<SplashPick | null>(null);
  const [leaving, setLeaving] = useState(false);
  const seenRef = useRef<Set<number>>(new Set());
  // Separate refs for the two timer stages: the hold effect's cleanup clears
  // only the hold timer, so the exit timer it hands off to survives the
  // `leaving` re-render.
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const enqueue = useCallback(
    (pick: SplashPick) => {
      // Each overall pick splashes at most once (WS dedup safety net).
      if (seenRef.current.has(pick.overallPick)) return;
      seenRef.current.add(pick.overallPick);
      setPending((prev) => {
        const next = [...prev, pick];
        return next.length > floodQueueLength
          ? next.slice(-floodKeepNewest)
          : next;
      });
    },
    [floodQueueLength, floodKeepNewest],
  );

  /** Begin the exit animation for the active splash. */
  const dismiss = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    setLeaving(true);
    exitTimerRef.current = setTimeout(() => {
      setActive(null);
      setLeaving(false);
    }, exitMs);
  }, [exitMs]);

  // Mirror of `active` so imperative callbacks (removePick) can inspect it
  // without carrying it as a dependency.
  const activeRef = useRef<SplashPick | null>(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  /** Pick undone — drop it wherever it is (pending or on screen). */
  const removePick = useCallback((overallPick: number) => {
    setPending((prev) => prev.filter((p) => p.overallPick !== overallPick));
    if (activeRef.current?.overallPick === overallPick) {
      // Cut straight to gone — an undone pick shouldn't linger through an
      // exit animation.
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      setLeaving(false);
      setActive(null);
    }
  }, []);

  // Advance: promote the oldest pending pick whenever the stage is free.
  useEffect(() => {
    if (active || pending.length === 0) return;
    const [next, ...rest] = pending;
    setPending(rest);
    setActive(next);
    setLeaving(false);
  }, [active, pending]);

  // Backlog size mirrored into a ref so the hold effect can size a splash's
  // duration without depending on `pending` — enqueues during a hold must not
  // restart the active splash's timer.
  const pendingCountRef = useRef(0);
  useEffect(() => {
    pendingCountRef.current = pending.length;
  }, [pending]);

  // Hold: keep the active splash up for its duration, then start its exit.
  // Duration is decided when the splash enters, from the total backlog at
  // that moment (active + pending).
  useEffect(() => {
    if (!active || leaving) return undefined;
    const totalQueued = pendingCountRef.current + 1;
    const holdMs =
      totalQueued > catchUpQueueLength ? catchUpSplashMs : minSplashMs;
    holdTimerRef.current = setTimeout(dismiss, holdMs);
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, [
    active,
    leaving,
    catchUpQueueLength,
    catchUpSplashMs,
    minSplashMs,
    dismiss,
  ]);

  // Clear any in-flight timers on unmount.
  useEffect(
    () => () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    },
    [],
  );

  return {
    active,
    leaving,
    pendingCount: pending.length,
    enqueue,
    removePick,
    dismiss,
  } as const;
}

/** Normalize a WS-payload player into the DraftPlayer shape the card needs. */
function toDraftPlayer(
  player: DraftPlayer | AvailableDraftPlayer,
): DraftPlayer {
  if ('name' in player) return player;
  return {
    id: player.id,
    name: `${player.firstName} ${player.lastName}`.trim(),
    position: player.eligiblePositions?.[0] ?? 'UTIL',
    eligiblePositions: player.eligiblePositions ?? undefined,
    avg: 0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    games: 0,
    hits: 0,
    obp: 0,
    slg: 0,
  };
}

export interface SplashQueueProps {
  active: SplashPick | null;
  leaving: boolean;
  pendingCount: number;
  onDismiss: () => void;
  /** Broadcaster quip for the active pick. */
  commentaryFor?: (pick: SplashPick) => string | undefined;
  /** playerId → MLB Stats API id for the headshot URL; null hides the photo. */
  mlbPlayerIdFor?: (playerId: number) => number | null;
  /** playerId → cached notable play for the stat graphic (LS-9095); null hides it. */
  notablePlayFor?: (playerId: number) => NotablePlaySummary | null;
  /** playerId → validated highlight video for the video tier (LS-9113); null falls back to the graphic. */
  highlightVideoFor?: (playerId: number) => HighlightVideoSummary | null;
  /** The draft's sport — picks the pick card's stat set and branding (LS-10827). */
  sport?: SportKind;
}

/**
 * Web presentational layer: renders the reused `PickAnnouncement` (dismissal
 * is externally controlled via `leaving`/`onDismiss`, driven by
 * `useSplashQueue`) plus spectator chrome — drafting team name, headshot,
 * and the catch-up queue indicator.
 */
export function SplashQueue({
  active,
  leaving,
  pendingCount,
  onDismiss,
  commentaryFor,
  mlbPlayerIdFor,
  notablePlayFor,
  highlightVideoFor,
  sport,
}: SplashQueueProps): React.JSX.Element | null {
  const [headshotFailed, setHeadshotFailed] = useState(false);
  const activePickNumber = active?.overallPick;
  useEffect(() => {
    setHeadshotFailed(false);
  }, [activePickNumber]);

  if (!active) return null;

  const player = toDraftPlayer(active.player);
  const mlbId = mlbPlayerIdFor?.(player.id) ?? null;

  // Headshot + team ride in the card's header slot and the media/queue badge
  // in its footer, so they flow with the card instead of floating over it —
  // the old fixed overlay covered the pick label and card banner on the
  // watch screen (LS-10593).
  const header = (
    <div className="d-splash-chrome-head">
      {mlbId != null && !headshotFailed ? (
        <img
          className="d-splash-headshot"
          src={getMlbHeadshotUrl(mlbId)}
          alt={player.name}
          onError={() => setHeadshotFailed(true)}
        />
      ) : (
        <div
          className="d-splash-headshot d-splash-headshot-fallback"
          aria-hidden="true"
        >
          <span role="img" aria-label="player silhouette">
            ⚾
          </span>
        </div>
      )}
      <div className="d-splash-team">{active.teamName}</div>
    </div>
  );

  const footer = (
    <div className="d-splash-chrome-foot">
      {/* Highlight tier (LS-9113): validated YouTube clip when cached,
          LS-9095 stat graphic otherwise. Keyed per pick so the player is
          created and destroyed with each splash — the queue's single
          `active` slot is what guarantees exactly one autoplaying player
          per page. */}
      <PickSplashHighlightVideo
        key={active.overallPick}
        video={highlightVideoFor?.(player.id) ?? null}
        playerName={player.name}
        fallback={
          <PickSplashStatGraphic play={notablePlayFor?.(player.id) ?? null} />
        }
      />
      {pendingCount > 0 && (
        <div className="d-splash-queue-badge" data-testid="splash-queue-badge">
          +{pendingCount} more {pendingCount === 1 ? 'pick' : 'picks'}
        </div>
      )}
    </div>
  );

  return (
    <PickAnnouncement
      player={player}
      pickNumber={active.overallPick}
      round={active.round}
      roundPickNumber={active.roundPickNumber}
      isMyPick={false}
      isAuto={active.isAuto}
      leaving={leaving}
      onDismiss={onDismiss}
      commentary={commentaryFor?.(active)}
      header={header}
      footer={footer}
      sport={sport}
    />
  );
}
