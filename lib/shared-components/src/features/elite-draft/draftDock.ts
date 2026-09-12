/**
 * Pure projections behind the Draft Board player dock (LS-10005).
 *
 * The dock re-hosts the player browser the Cards / Data Table views already
 * drive — the same server-filtered `filteredPlayers`, the same search and
 * position state, the same pick routing — so nothing here fetches or filters.
 * These helpers only reshape state `DraftPlayerBoard` already holds into what
 * the dock bar and rows display, and are split out so each rule can be
 * asserted without rendering.
 */
import { breakpoints } from '@legacy-sports/design-tokens';

import type { CurrentDraftPickInfo, DraftPlayer } from './types';
import type { DraftViewportTier } from './hooks/useDraftViewport';

/** A depth-chart bucket as `buildDepthChartBuckets` returns it — only the
 *  fields the dock reads. */
export interface DockSlotBucket {
  positionType: string;
  total: number;
  players: readonly DraftPlayer[];
  /** Stat positions this slot accepts; `null` for the catch-all BENCH. */
  accepts: ReadonlySet<string> | null;
}

export type DockRowColumns = 1 | 2 | 3;

/**
 * How many player rows sit side by side in the open dock.
 *
 * The mock sets this on its review-harness frames rather than on a width
 * query (`styles/mobile.css`): `.vp-tablet` (the 860 · $md frame) is 1-up,
 * the default — which the 980 · $lg frame falls to — is 2-up, and
 * `.vp-desktop` / `.vp-wide` (the 1280 and 1440 · $xxl frames) are 3-up.
 * On the design-token scale that is: 1-up below the `desktop` tier, 2-up from
 * `breakpoints.lg`, 3-up from `breakpoints.xxl`. The harness has no frame in
 * the $xl band (1120–1279), so it keeps the $lg frame's two columns — the
 * wider row — until the width the 3-up rule was actually drawn at.
 */
export function dockRowColumns(
  tier: DraftViewportTier,
  width: number,
): DockRowColumns {
  if (tier !== 'desktop') return 1;
  return width >= breakpoints.xxl ? 3 : 2;
}

/** Roster slots the viewer still has to fill, in league slot order. BENCH is
 *  excluded: it takes anyone, so it is never a "need". */
export function openSlotPositions(
  buckets: readonly DockSlotBucket[],
): string[] {
  return buckets
    .filter((b) => b.accepts !== null && b.players.length < b.total)
    .map((b) => b.positionType);
}

/** Whether a player could fill one of the viewer's open starter slots — the
 *  mock's `.prow.fits` highlight. */
export function playerFitsOpenSlot(
  player: DraftPlayer,
  buckets: readonly DockSlotBucket[],
): boolean {
  const positions = player.eligiblePositions?.length
    ? player.eligiblePositions
    : [player.position];
  return buckets.some(
    (b) =>
      b.accepts !== null &&
      b.players.length < b.total &&
      positions.some((p) => b.accepts?.has(p)),
  );
}

/**
 * The dock bar's headline — the mock's "Your pick · #42".
 *
 * On the viewer's turn it is that pick; otherwise it points at the viewer's
 * next pick when they have a team in the draft order, and falls back to the
 * pick on the clock for anyone who does not (a spectating commissioner).
 */
export function dockPickLabel({
  currentPickInfo,
  isMyPick,
  myNextOverallPick,
}: {
  currentPickInfo: CurrentDraftPickInfo | null;
  isMyPick: boolean;
  myNextOverallPick: number | null;
}): string {
  if (!currentPickInfo || currentPickInfo.isComplete) {
    return 'Available players';
  }
  if (isMyPick) return `Your pick · #${currentPickInfo.overallPick}`;
  if (myNextOverallPick !== null) {
    return `Your next pick · #${myNextOverallPick}`;
  }
  return `On the clock · #${currentPickInfo.overallPick}`;
}

/**
 * "1,148 available". The available-player query is paged and returns no
 * total, so while more pages remain the loaded count is a floor, and says so
 * with a trailing "+" rather than presenting a page size as the pool size.
 */
export function formatAvailableCount(loaded: number, hasMore: boolean): string {
  return `${loaded.toLocaleString('en-US')}${hasMore ? '+' : ''} available`;
}

/** "open slots: 1B, SS" — capped so an empty roster early in the draft does
 *  not push the bar past one line. */
export function formatOpenSlots(open: readonly string[], max = 4): string {
  if (open.length === 0) return 'roster full';
  const shown = open.slice(0, max).join(', ');
  const rest = open.length - max;
  return `open slots: ${shown}${rest > 0 ? ` +${rest}` : ''}`;
}
