import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { Input, ScrollView, Spinner, Text, XStack, YStack } from 'tamagui';
import { breakpoints } from '@legacy-sports/design-tokens';
import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
  LeagueTeam,
} from './types';
import {
  OPEN_SLOTS_EMPTY_MESSAGE,
  OPEN_SLOTS_EMPTY_SEARCH_MESSAGE,
} from './openSlotsCopy';
import { DraftGrid } from './DraftGrid';
import { DraftBoardTimeline } from './DraftBoardTimeline';
import {
  BENCH_SLOT,
  buildDepthChartBuckets,
  buildRosterSlotInstances,
  nextPrioritySlotKey,
  openStarterSlotLabels,
  rosterSlotFillCounts,
} from './rosterSlots';
import { DraftPlayerDock } from './DraftPlayerDock';
import {
  dockPickLabel,
  dockRowColumns,
  type DockRowColumns,
  formatAvailableCount,
  formatOpenSlots,
  openSlotPositions,
  playerFitsOpenSlot,
} from './draftDock';
import { computeMyUpcomingPicks, formatClock } from './nativeDraftBoard';
import { PlayerCard } from './PlayerCard';
import { formatEligiblePositions, getPositionColor } from './utils';
import { STAT_COLUMNS_BY_SPORT } from './statColumns';
import { useDraftViewportTier } from './hooks/useDraftViewport';
import { useLocalInputText } from './hooks/useLocalInputText';
import type { SportKind } from '../../config/sports';
import { getPositionLabel } from '../roster/rosterEligibility';
import { csp } from '../players/crossPlatformStyle';
import { tamaguiStyled } from '../../utils/tamaguiStyled';

// PlayerDetailModal is web-specific; consumers can provide their own via composition.
// Inline a no-op stub so the component compiles in all environments.
const PlayerDetailModal: React.FC<{
  playerId: number | null;
  playerName?: string;
  position?: string;
  open: boolean;
  onOpenChange: React.Dispatch<React.SetStateAction<boolean>>;
}> = () => null;

// Baseball position-filter pills (LS-9241) — a curated display collapse of
// stat positions (not the full ALLOWED_POSITIONS_BY_SPORT['baseball']
// slot-type key set, which also includes roster-only slots like DH/IF/XDH).
const BASEBALL_POSITIONS: readonly string[] = [
  'ALL',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'OF',
  'P',
];

// Football position-filter pills, keyed by the league's defensiveFormat
// (LS-9475) — a 'dst' league can only ever return DST-slot players, an
// 'idp' league only DL/LB/DB, so offering the other format's pill would
// always return zero players. Derived from `defensiveFormat` directly
// (rather than the league's `leaguePositions`) so this is correct for mock
// drafts too — a mock draft has no `league_positions` at all (LS-10076), so
// its slots come from the sport defaults on `draftRoom.rules`. Neither
// list includes BENCH or SFLEX (Superflex, LS-6337) — BENCH's eligibility
// list is every football position, and SFLEX is a premium roster slot, not
// a draftable stat position.
const FOOTBALL_POSITIONS_DST: readonly string[] = [
  'ALL',
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DST',
  'FLEX',
];
const FOOTBALL_POSITIONS_IDP: readonly string[] = [
  'ALL',
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DL',
  'LB',
  'DB',
  'FLEX',
];

export function footballPositionPills(
  defensiveFormat: string | null | undefined,
): readonly string[] {
  return defensiveFormat === 'idp'
    ? FOOTBALL_POSITIONS_IDP
    : FOOTBALL_POSITIONS_DST;
}

export function positionPillsForSport(
  sport: SportKind,
  defensiveFormat: string | null | undefined,
): readonly string[] {
  return sport === 'football'
    ? footballPositionPills(defensiveFormat)
    : BASEBALL_POSITIONS;
}

// ── Styled primitives ───────────────────────────────────────────────────────
// tamaguiStyled() isolates Tamagui's any-typed styled() API from strict lint;
// casting the result to a concrete component type keeps call sites lint-clean.
// The $md breakpoint keys below mirror the tightening `styles.ts` applies to
// .d-main / .d-controls / .d-search-wrap / .d-view-tabs / .d-view-tab /
// .d-pills / .d-pill on narrow viewports.
//
// `$md` here is now the design-token `$md` band (860–979, LS-9896) that the
// mock is annotated against — it used to run @tamagui/config's stock
// `maxWidth: 1020` instead (LS-9860), which was tolerable only because every
// one of these keys is cosmetic (padding, gap, wrap, overflow). Anything
// *structural* — which layout applies at which width — still reads
// `useDraftViewportTier()` or a `styles.ts` breakpoint instead, not a `$md`
// style prop: those need to keep working in consumers without a
// TamaguiProvider (see useDraftViewport.ts), which a `$md` prop cannot.
type StyledComponent = React.ComponentType<Record<string, unknown>>;

const MainContainer = tamaguiStyled(YStack, {
  // Docks this component into the still-CSS-Grid `.d-layout` container in
  // EliteDraftBoardScreen.tsx (raw HTML/CSS, out of scope for this ticket —
  // see LS-9057). `gridArea` is NOT a recognized Tamagui style token, so
  // Tamagui's styled() silently drops it instead of forwarding it to the
  // underlying web element (confirmed via computed style: LS-9344) — grid
  // placement is applied via `style={csp({ gridArea: 'main' })}` at the JSX
  // usage site below instead, the same escape hatch already used for
  // `gridColumn` elsewhere in this file.
  flex: 1,
  paddingVertical: 16,
  paddingHorizontal: 22,
  $md: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
}) as StyledComponent;

const ViewTabsRow = tamaguiStyled(XStack, {
  gap: 0,
  borderBottomWidth: 1,
  borderBottomColor: 'var(--d-border)',
  marginBottom: 14,
  flexShrink: 0,
  $md: {
    overflow: 'scroll',
  },
}) as StyledComponent;

const ControlsBar = tamaguiStyled(XStack, {
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  flexShrink: 0,
  marginBottom: 18,
  $md: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
}) as StyledComponent;

const SearchWrap = tamaguiStyled(XStack, {
  flex: 1,
  minWidth: 180,
  position: 'relative',
  alignItems: 'center',
  $md: {
    minWidth: 0,
  },
}) as StyledComponent;

const PillsRow = tamaguiStyled(XStack, {
  gap: 4,
  flexWrap: 'wrap',
  $md: {
    flexWrap: 'nowrap',
    overflow: 'scroll',
    paddingBottom: 4,
  },
}) as StyledComponent;

const DepthGrid = tamaguiStyled(YStack, {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 10,
  // Column count itself is driven by `depthGridColumns` (`useDepthGridColumns()`
  // below) since Tamagui's `styled()` breakpoints can't express a
  // percentage that depends on more than two tiers; these two keys only
  // carry the narrow-viewport gap tightening from the original CSS.
  $gtSm: {
    gap: 10,
  },
  $md: {
    gap: 8,
  },
}) as StyledComponent;

// Depth-chart slot derivation moved to `rosterSlots.ts` (LS-10004) so the
// bottom-pinned slot strip can share it without importing this component
// module. Re-exported here because existing callers (and their tests) import
// it from this path.
export { BENCH_SLOT, buildDepthChartBuckets };
export type { DepthChartBucket } from './rosterSlots';

type ViewMode = 'grid' | 'list' | 'compact' | 'board' | 'table' | 'depth';
type SortKey = string;
type SortDir = 'asc' | 'desc';

interface DraftPlayerBoardProps {
  viewMode: ViewMode;
  /** Active league sport — drives data-table stat headers. Defaults to 'baseball' upstream. */
  sport: SportKind;
  /** League's defensive format ('dst' | 'idp') — drives which football
   *  position-filter pills are offered (LS-9475). Ignored for baseball. */
  defensiveFormat?: string | null;
  selectedPosition: string;
  searchTerm: string;
  availablePlayersLoading: boolean;
  commPickMode: boolean;
  isOwner: boolean;
  isMyPick: boolean;
  /** Premium (LS-9253): every team's turn is pickable — no CPU auto-picker
   *  exists in this mode. Kept separate from commPickMode so the Force-Pick
   *  red styling/"Force Pick" label stay exclusive to real commissioner
   *  overrides; this should read as a first-class pick action. */
  controlAllTeams: boolean;
  pickLoading: boolean;
  myTeamId: number | null;
  draftId: number | null;
  filteredPlayers: DraftPlayer[];
  myTeam: DraftPlayer[];
  positionCounts: Record<string, number>;
  /** League's configured roster slots (from `leaguePositions`), used to group
   *  the My Depth Chart tab by the real per-league slot config (LS-8785). */
  leaguePositions: ReadonlyArray<{ id: number; positionType: string }>;
  /** League's max roster size, sizes the depth chart's BENCH bucket. Falls
   *  back to the sport's default when the league hasn't set one. */
  maxRosterSize: number | null;
  watchlist: number[];
  queuedPlayerIds: ReadonlySet<number>;
  autoPickTeamIds: ReadonlySet<string>;
  boardOrderedTeams: LeagueTeam[];
  pickHistory: DraftPickRecord[];
  currentPickInfo: CurrentDraftPickInfo | null;
  statsLookup: Map<number, DraftPlayer>;
  leagueTeamsLength: number;
  hasMorePlayers: boolean;
  loadingMore: boolean;
  onlineTeamIds: ReadonlySet<string>;
  /** Seconds left on the current pick. Feeds the Draft Board timeline's clock
   *  header below the `desktop` tier (LS-10003) and the player dock's bar at
   *  every tier (LS-10005). Already-loaded screen state, not a new query. */
  timeRemaining?: number;
  /** Seconds the current pick started with — the timeline ring's denominator. */
  pickTimeLimitSeconds?: number;
  /** Offline mock draft (LS-9144): the pick clock does not run. */
  untimed?: boolean;
  /** Commissioner has paused the draft. */
  draftPaused?: boolean;
  /** The draft's `draftOrder` — numbers the board grid's empty cells
   *  (LS-10506). */
  draftOrder?: string | null;
  onSetSearchTerm: (v: string) => void;
  onSetSelectedPosition: (v: string) => void;
  /** Names/lifts the server's open-roster-slot filter (LS-10593). */
  openSlotsBanner?: React.ReactNode;
  onSetViewMode: (v: ViewMode) => void;
  onSetWatchlist: React.Dispatch<React.SetStateAction<number[]>>;
  onDraftPlayer: (playerId: number) => void;
  onCommissionerPick: (playerId: number) => void;
  onToggleQueue: (playerId: number) => void;
  onLoadMore: () => void;
  /** Drag-to-draft (LS-8068): lifted to the screen so the rail can highlight
   *  eligible slots and commit the pick on drop. */
  onPlayerDragStart?: (player: DraftPlayer) => void;
  onPlayerDragEnd?: () => void;
}

const VIEW_TABS: Array<{ mode: ViewMode; label: string }> = [
  { mode: 'grid', label: 'Cards' },
  { mode: 'table', label: 'Data Table' },
  { mode: 'board', label: 'Draft Board' },
  { mode: 'depth', label: 'My Depth Chart' },
];

/**
 * Depth-grid column count, kept in lockstep with the `.d-depth-grid`
 * `grid-template-columns` rules in `styles.ts` — both now derive their
 * boundaries from the same design-token breakpoints (LS-9860), where before
 * this hook used ad-hoc 1201/901/641px `matchMedia` queries that did not line
 * up with the stylesheet's 1200/900px ones.
 *
 * Reads `useDraftViewportTier()` rather than Tamagui's `useMedia()`, which
 * needs a `TamaguiProvider` context this component's consumers don't all
 * supply (e.g. `apps/web/src/components/EliteDraftBoard.a11y.spec.tsx`
 * renders it bare); the tier hook is provider-free and works on native too.
 *
 * The `desktop` tier splits once more internally — the mock gives $lg
 * (980–1119) three columns and $xl/$xxl (1120+) four — which is the one place
 * this feature needs a finer distinction than the three named tiers carry.
 * Below `desktop` there is no such split: `.d-depth-grid` has a single
 * two-column rule covering both the tablet and phone tiers, and this returns
 * the same, where the old hook dropped to one column below 641px and so
 * disagreed with its own stylesheet.
 */
function useDepthGridColumns(): number {
  const tier = useDraftViewportTier();
  const { width } = useWindowDimensions();
  if (tier !== 'desktop') return 2;
  return width >= breakpoints.xl ? 4 : 3;
}

/** The player dock's rows-per-line (LS-10005) — 1-up / 2-up / 3-up. Same
 *  provider-free tier + width inputs as `useDepthGridColumns`; the mapping
 *  itself lives in `draftDock.ts`. */
function useDockRowColumns(): DockRowColumns {
  const tier = useDraftViewportTier();
  const { width } = useWindowDimensions();
  return dockRowColumns(tier, width);
}

// Colors are sourced exclusively from the CSS custom properties `styles.ts`
// injects (every consumer of this component renders `<style>{CSS}</style>`
// before it) rather than hex/rgba literals, per the theme-compliance ratchet
// (LS-8518/8519) — `scripts/check-theme-compliance.mjs`.
const ACCENT = 'var(--d-accent)';
const ACCENT_DARK = 'var(--d-accent-dark)';
const ACCENT_DIM = 'var(--d-accent-dim)';
const BORDER = 'var(--d-border)';
const SURFACE = 'var(--d-surface)';
// Commissioner "Force Pick" override reuses the danger token — no dedicated
// purple brand token exists, and this communicates "bypasses draft order"
// more clearly than an arbitrary color would.
const COMM_OVERRIDE = 'var(--d-danger)';
const PANEL_SHADOW = 'var(--d-panel-shadow)';
const TEXT = 'var(--d-text)';
const TEXT_SECONDARY = 'var(--d-text-secondary)';
const TEXT_MUTED = 'var(--d-text-muted)';
const PANEL = 'var(--d-panel)';
// Depth chart's priority-slot marker (design `.depth-slot .slot-row.need`:
// `border-color: var(--seam); color: var(--seam-bright);`) — deliberately
// the seam-red family, not the slot strip's gold `.sb-slot.need`: the two
// "need" markers use different accents by design. Theme tokens only (no
// literal hex/rgba) — the theme-compliance ratchet (LS-8519) fails CI on
// new hardcoded colors.
const NEED_BORDER = 'var(--d-seam-red)';
const NEED_TEXT = 'var(--brandSeamRedLight)';

/** Data Table column header that's clickable to sort (Rank/Pos/Player/ADP and
 * the per-sport stat columns). */
function SortableColumnHeader({
  label,
  sortKeyValue,
  sortKey,
  sortDir,
  onPress,
  width,
  align = 'left',
}: {
  label: string;
  sortKeyValue: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onPress: (key: SortKey) => void;
  width?: number;
  align?: 'left' | 'right';
}) {
  const active = sortKey === sortKeyValue;
  return (
    <XStack
      role="columnheader"
      accessibilityRole="button"
      aria-sort={
        active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
      }
      onPress={() => onPress(sortKeyValue)}
      cursor="pointer"
      flex={width ? undefined : 1}
      width={width}
      justifyContent={align === 'right' ? 'flex-end' : 'flex-start'}
      paddingVertical={9}
      paddingHorizontal={12}
      style={csp({
        background: PANEL,
        borderBottom: `1px solid ${BORDER}`,
      })}
    >
      <Text
        fontFamily="'Big Shoulders Display', 'Arial Narrow', sans-serif"
        fontWeight="700"
        fontSize={10}
        letterSpacing={1.4}
        textTransform="uppercase"
        color={active ? ACCENT : TEXT_SECONDARY}
        whiteSpace="nowrap"
      >
        {label}
        {active && (sortDir === 'asc' ? ' ↑' : ' ↓')}
      </Text>
    </XStack>
  );
}

/** Data Table column header that's plain, non-sortable text (LS-10164:
 * Team/Career — the design's Data Table doesn't mark these with a sort
 * indicator, unlike ADP and the stat columns). */
function PlainColumnHeader({ label, width }: { label: string; width: number }) {
  return (
    <XStack
      width={width}
      justifyContent="flex-start"
      paddingVertical={9}
      paddingHorizontal={12}
      style={csp({
        background: PANEL,
        borderBottom: `1px solid ${BORDER}`,
      })}
    >
      <Text
        fontFamily="'Big Shoulders Display', 'Arial Narrow', sans-serif"
        fontWeight="700"
        fontSize={10}
        letterSpacing={1.4}
        textTransform="uppercase"
        color={TEXT_SECONDARY}
        whiteSpace="nowrap"
      >
        {label}
      </Text>
    </XStack>
  );
}

/** Data Table "Career" cell text (LS-10164), e.g. "1914–1935". Em-dash when
 * no start year is on file — mirrors PlayerCard/BaseballCard's
 * formatCareerSpan, but this table only needs the label, not the season
 * count those cards also render. */
function formatCareerSpanLabel(
  startYear: number | null | undefined,
  endYear: number | null | undefined,
): string {
  if (startYear == null) return '—';
  const end = endYear ?? startYear;
  return end === startYear ? `${startYear}` : `${startYear}–${end}`;
}

/**
 * Search field + position-filter pills — the player browser's filter
 * control. One component, two hosts: the Cards / Data Table views' controls
 * bar, and the Draft Board's player dock (LS-10005). Both drive the same
 * screen-level `searchTerm` / `selectedPosition` state, so a filter set in one
 * is still set in the other.
 */
function DraftPlayerFilters({
  positions,
  selectedPosition,
  searchTerm,
  loading: availablePlayersLoading,
  onSetSearchTerm,
  onSetSelectedPosition,
}: {
  positions: readonly string[];
  selectedPosition: string;
  searchTerm: string;
  loading: boolean;
  onSetSearchTerm: (v: string) => void;
  onSetSelectedPosition: (v: string) => void;
}): React.JSX.Element {
  const [searchText, handleSearchChange] = useLocalInputText(
    searchTerm,
    onSetSearchTerm,
  );
  return (
    <>
      <SearchWrap>
        <YStack position="absolute" left={12} zIndex={1} pointerEvents="none">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke={TEXT_MUTED}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            width={15}
            height={15}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </YStack>
        <Input
          flex={1}
          size="$3"
          borderRadius={10}
          borderWidth={1}
          borderColor={BORDER}
          backgroundColor={PANEL}
          color={TEXT}
          fontSize={13}
          paddingLeft={38}
          paddingRight={searchText ? 34 : 14}
          placeholder="Search available players..."
          placeholderTextColor={TEXT_MUTED}
          aria-label="Search players"
          value={searchText}
          onChangeText={handleSearchChange}
        />
        {searchText ? (
          <YStack
            role="button"
            tabIndex={0}
            accessibilityRole="button"
            aria-label="Clear search"
            onPress={() => handleSearchChange('')}
            cursor="pointer"
            position="absolute"
            right={8}
            padding={4}
            borderRadius={999}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke={TEXT_MUTED}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="14"
              height="14"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </YStack>
        ) : availablePlayersLoading ? (
          <YStack position="absolute" right={12}>
            <Spinner size="small" color={ACCENT} />
          </YStack>
        ) : null}
      </SearchWrap>
      <PillsRow
        role="radiogroup"
        accessibilityRole="radiogroup"
        aria-label="Filter by position"
        onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
          const idx = positions.indexOf(selectedPosition);
          let next = idx;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            next = (idx + 1) % positions.length;
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            next = (idx - 1 + positions.length) % positions.length;
          } else if (e.key === 'Home') {
            e.preventDefault();
            next = 0;
          } else if (e.key === 'End') {
            e.preventDefault();
            next = positions.length - 1;
          }
          if (next !== idx) {
            onSetSelectedPosition(positions[next]);
            e.currentTarget
              .querySelectorAll<HTMLButtonElement>('[role="radio"]')
              [next]?.focus();
          }
        }}
      >
        {positions.map((pos) => {
          const active = selectedPosition === pos;
          return (
            <XStack
              key={pos}
              role="radio"
              accessibilityRole="radio"
              aria-checked={active}
              accessibilityState={{ selected: active }}
              tabIndex={active ? 0 : -1}
              onPress={() => onSetSelectedPosition(pos)}
              cursor="pointer"
              paddingVertical={6}
              paddingHorizontal={13}
              borderRadius={999}
              borderWidth={1}
              borderColor={active ? ACCENT_DIM : BORDER}
              style={csp({
                background: active
                  ? `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`
                  : SURFACE,
              })}
              // mirrors the original `.d-pill`'s `$md:` (≤768px) min-height bump
              $md={{ minHeight: 36 }}
            >
              <Text
                fontSize={12}
                fontWeight="600"
                color={active ? 'white' : TEXT_SECONDARY}
              >
                {pos}
              </Text>
            </XStack>
          );
        })}
      </PillsRow>
    </>
  );
}

export function DraftPlayerBoard({
  viewMode,
  sport,
  defensiveFormat,
  selectedPosition,
  searchTerm,
  availablePlayersLoading,
  commPickMode,
  isOwner,
  isMyPick,
  controlAllTeams,
  pickLoading,
  myTeamId,
  draftId,
  filteredPlayers,
  myTeam,
  positionCounts: _positionCounts,
  leaguePositions,
  maxRosterSize,
  watchlist,
  queuedPlayerIds,
  autoPickTeamIds,
  boardOrderedTeams,
  pickHistory,
  currentPickInfo,
  statsLookup,
  leagueTeamsLength,
  hasMorePlayers,
  loadingMore,
  onlineTeamIds,
  timeRemaining = 0,
  pickTimeLimitSeconds = 0,
  untimed = false,
  draftPaused = false,
  draftOrder,
  onSetSearchTerm,
  onSetSelectedPosition,
  openSlotsBanner,
  onSetViewMode,
  onSetWatchlist,
  onDraftPlayer,
  onCommissionerPick,
  onToggleQueue,
  onLoadMore,
  onPlayerDragStart,
  onPlayerDragEnd,
}: DraftPlayerBoardProps): React.JSX.Element {
  const depthGridColumns = useDepthGridColumns();
  // Which Draft Board projection to mount (LS-10003). Structural, so it is
  // derived from the design-token tier hook — NOT a `$lg`/`$gtLg` style prop,
  // whose Tamagui media key still resolves against @tamagui/config's stock
  // widths above `sm` and so fires at the wrong px (the LS-9860 bug LS-9895
  // had to repair). `desktop` starts at `breakpoints.lg` (980), which is
  // exactly where the mock's own `@container vp (max-width: 979px)` block
  // hides `.board-grid` and shows `.board-timeline`.
  const showBoardTimeline = useDraftViewportTier() !== 'desktop';
  const dockColumns = useDockRowColumns();

  const gridCols =
    viewMode === 'grid' ? 'repeat(auto-fill, minmax(320px, 1fr))' : '1fr';

  // Player detail modal state
  const [detailPlayerId, setDetailPlayerId] = useState<number | null>(null);
  const [detailPlayerName, setDetailPlayerName] = useState('');
  const [detailPlayerPos, setDetailPlayerPos] = useState<string | undefined>();
  const [detailOpen, setDetailOpen] = useState(false);

  // O(1) watchlist lookup — avoids O(n) Array.includes per card per render
  const watchlistSet = useMemo(() => new Set(watchlist), [watchlist]);

  // Position-filter pill list, sport- and defensiveFormat-driven (LS-9241,
  // LS-9475 — previously a module-level baseball-only constant, so football
  // drafts had no pill that ever matched a football player's position, and
  // later a football-only-DST list that never matched an IDP league).
  const positions = useMemo(
    () => positionPillsForSport(sport, defensiveFormat),
    [sport, defensiveFormat],
  );

  // Guard against a stale selectedPosition surviving a sport change (e.g.
  // the MockDraftPage sport-toggle dev affordance) — reset to 'ALL' when
  // the current selection isn't valid for the new sport's pill list.
  useEffect(() => {
    if (!positions.includes(selectedPosition)) {
      onSetSelectedPosition('ALL');
    }
  }, [positions, selectedPosition, onSetSelectedPosition]);

  // My Depth Chart view: recomputes on every pick (myTeam updates live via the
  // draft WebSocket / pick history refetch), so the view always reflects the
  // latest roster without a manual refresh (LS-8785 AC2).
  const depthChartBuckets = useMemo(
    () => buildDepthChartBuckets(leaguePositions, myTeam, sport, maxRosterSize),
    [leaguePositions, myTeam, sport, maxRosterSize],
  );

  // Depth chart summary line + priority marker (LS-10166) — derived from the
  // same per-slot expansion the bottom-pinned strip and squad strip already
  // use (`rosterSlots.ts`), so the depth chart can never disagree with them
  // about which slot is "the" priority hole.
  const myRosterSlots = useMemo(
    () =>
      buildRosterSlotInstances(leaguePositions, myTeam, sport, maxRosterSize),
    [leaguePositions, myTeam, sport, maxRosterSize],
  );
  const priorityDepthSlotKey = useMemo(
    () => nextPrioritySlotKey(myRosterSlots),
    [myRosterSlots],
  );
  const { filled: depthSlotsFilled, total: depthSlotsTotal } = useMemo(
    () => rosterSlotFillCounts(myRosterSlots),
    [myRosterSlots],
  );
  const nextNeedLabels = useMemo(
    () => openStarterSlotLabels(myRosterSlots),
    [myRosterSlots],
  );
  const myTeamName = useMemo(
    () =>
      boardOrderedTeams.find((t) => String(t.id) === String(myTeamId))?.name ??
      null,
    [boardOrderedTeams, myTeamId],
  );

  // Preserves each player's original rank (1-based position in filteredPlayers)
  // so the Rank column stays accurate even when the table is sorted by another column.
  const rankMap = useMemo(
    () => new Map(filteredPlayers.map((p, i) => [p.id, i + 1])),
    [filteredPlayers],
  );

  // Data table sorting
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleHeaderClick = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDir('desc');
      return key;
    });
  }, []);

  const sortedPlayers = useMemo(() => {
    if (sortKey === 'rank') return filteredPlayers;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filteredPlayers].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      if (sortKey === 'name') {
        aVal = a.name;
        bVal = b.name;
      } else if (sortKey === 'position') {
        aVal = a.position ?? '';
        bVal = b.position ?? '';
      } else if (sortKey === 'adp') {
        aVal = a.adp ?? Infinity;
        bVal = b.adp ?? Infinity;
      } else {
        const col = STAT_COLUMNS_BY_SPORT[sport].find(
          (c) => c.label === sortKey,
        );
        aVal = col ? col.sortValue(a) : 0;
        bVal = col ? col.sortValue(b) : 0;
      }
      if (typeof aVal === 'string') {
        return dir * aVal.localeCompare(bVal as string);
      }
      return dir * (aVal - (bVal as number));
    });
  }, [filteredPlayers, sortKey, sortDir, sport]);

  // A real commissioner force-pick override — never true for Control All
  // Teams mock drafts (LS-9242 hides the commissioner bar there entirely).
  // Kept separate from controlAllTeams so the Force-Pick red styling/label
  // stay exclusive to actual overrides (LS-9253 wants a first-class pick
  // action, not an override).
  const isRealCommPick = commPickMode && isOwner;
  // Whether the Draft button should render at all for a given team's turn.
  const canPickForTeam = isMyPick || controlAllTeams || isRealCommPick;

  // Stable callbacks passed to PlayerCard to prevent re-renders via React.memo
  const handleDraftPlayer = useCallback(
    (playerId: number) => {
      if (isRealCommPick || (controlAllTeams && !isMyPick)) {
        onCommissionerPick(playerId);
      } else {
        onDraftPlayer(playerId);
      }
    },
    [
      isRealCommPick,
      controlAllTeams,
      isMyPick,
      onCommissionerPick,
      onDraftPlayer,
    ],
  );

  const handleToggleWatch = useCallback(
    (playerId: number) => {
      onSetWatchlist((prev) =>
        prev.includes(playerId)
          ? prev.filter((id) => id !== playerId)
          : [...prev, playerId],
      );
    },
    [onSetWatchlist],
  );

  const handleToggleQueuePlayer = useCallback(
    (playerId: number) => {
      onToggleQueue(playerId);
    },
    [onToggleQueue],
  );

  // Use statsLookup (O(1) Map) instead of filteredPlayers.find() (O(n))
  const handlePlayerClick = useCallback(
    (playerId: number) => {
      const player = statsLookup.get(playerId);
      if (!player) return;
      setDetailPlayerId(player.id);
      setDetailPlayerName(player.name);
      setDetailPlayerPos(player.position);
      setDetailOpen(true);
    },
    [statsLookup],
  );

  // ── Player dock (LS-10005) — every value below re-projects state this
  // component already holds; the dock adds no query and no list state. ──
  const openSlots = useMemo(
    () => openSlotPositions(depthChartBuckets),
    [depthChartBuckets],
  );
  const fitsOpenSlot = useCallback(
    (player: DraftPlayer) => playerFitsOpenSlot(player, depthChartBuckets),
    [depthChartBuckets],
  );
  const myNextOverallPick = useMemo(() => {
    const myTeamIndex =
      myTeamId == null
        ? -1
        : boardOrderedTeams.findIndex((t) => String(t.id) === String(myTeamId));
    return (
      computeMyUpcomingPicks({
        currentPickInfo,
        teamCount: boardOrderedTeams.length,
        myTeamIndex,
        draftOrder,
        count: 1,
      })[0]?.overallPick ?? null
    );
  }, [boardOrderedTeams, myTeamId, currentPickInfo, draftOrder]);
  const pickOnClock = currentPickInfo != null && !currentPickInfo.isComplete;
  const dockClockLabel = !pickOnClock
    ? null
    : draftPaused
      ? 'Paused'
      : untimed
        ? null
        : `${formatClock(timeRemaining)} left`;

  const showSearchControls =
    viewMode === 'grid' ||
    viewMode === 'list' ||
    viewMode === 'compact' ||
    viewMode === 'table';

  const STATE_BTN_STYLE = csp({
    background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,
    borderRadius: 8,
    boxShadow: `0 4px 20px ${ACCENT_DIM}`,
  });

  return (
    <>
      <PlayerDetailModal
        playerId={detailPlayerId}
        playerName={detailPlayerName}
        position={detailPlayerPos}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
      <MainContainer
        role="main"
        aria-label="Player draft board"
        data-testid="draft-board"
        style={csp({ gridArea: 'main' })}
      >
        {/* View tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          flexShrink={0}
        >
          <ViewTabsRow
            role="tablist"
            accessibilityRole="tablist"
            aria-label="View mode"
          >
            {VIEW_TABS.map(({ mode, label }) => {
              const active = viewMode === mode;
              return (
                <XStack
                  key={mode}
                  role="tab"
                  accessibilityRole="tab"
                  aria-selected={active}
                  accessibilityState={{ selected: active }}
                  onPress={() => onSetViewMode(mode)}
                  cursor="pointer"
                  paddingVertical={10}
                  paddingHorizontal={16}
                  borderBottomWidth={2}
                  borderBottomColor={active ? ACCENT : 'transparent'}
                  marginBottom={-1}
                  // mirrors the original `.d-view-tab`'s `$md:` (≤768px) padding tighten
                  $md={{ paddingVertical: 12, paddingHorizontal: 14 }}
                >
                  <Text
                    fontFamily="'Big Shoulders Display', 'Arial Narrow', sans-serif"
                    fontWeight="700"
                    fontSize={12}
                    letterSpacing={1.68}
                    textTransform="uppercase"
                    color={active ? ACCENT : TEXT_SECONDARY}
                    whiteSpace="nowrap"
                  >
                    {label}
                  </Text>
                </XStack>
              );
            })}
          </ViewTabsRow>
        </ScrollView>

        {/* Search + position filter — only for player pool views */}
        {showSearchControls && (
          <ControlsBar
            style={csp({
              background: PANEL,
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              paddingVertical: 14,
              paddingHorizontal: 18,
              boxShadow: PANEL_SHADOW,
            })}
          >
            <DraftPlayerFilters
              positions={positions}
              selectedPosition={selectedPosition}
              searchTerm={searchTerm}
              loading={availablePlayersLoading}
              onSetSearchTerm={onSetSearchTerm}
              onSetSelectedPosition={onSetSelectedPosition}
            />
          </ControlsBar>
        )}
        {showSearchControls && openSlotsBanner}

        {/* Draft Board view — the grid at `desktop`, the round-by-round
            timeline below it (LS-10003). Same picks, two projections. */}
        {viewMode === 'board' && showBoardTimeline && (
          <DraftBoardTimeline
            teams={boardOrderedTeams}
            picks={pickHistory}
            currentPickInfo={currentPickInfo}
            myTeamId={myTeamId}
            statsLookup={statsLookup}
            sport={sport}
            timeRemaining={timeRemaining}
            pickTimeLimitSeconds={pickTimeLimitSeconds}
            untimed={untimed}
            paused={draftPaused}
            draftOrder={draftOrder}
          />
        )}
        {viewMode === 'board' && !showBoardTimeline && (
          <DraftGrid
            teams={boardOrderedTeams}
            picks={pickHistory}
            currentPickInfo={currentPickInfo}
            myTeamId={myTeamId}
            statsLookup={statsLookup}
            sport={sport}
            autoPickTeamIds={autoPickTeamIds}
            maxRounds={
              leagueTeamsLength > 0
                ? Math.max(
                    Math.ceil(
                      (pickHistory.length + leagueTeamsLength) /
                        leagueTeamsLength,
                    ),
                    currentPickInfo?.round ?? 1,
                    ...pickHistory.map((p) => p.round),
                    20,
                  )
                : 20
            }
            onlineTeamIds={onlineTeamIds}
            draftOrder={draftOrder}
          />
        )}

        {/* Player dock (LS-10005) — pinned under whichever board projection
            is mounted, at every tier this component renders. The mock places
            `.bd-dock` beside both `.board-timeline` and `.board-grid` and no
            width rule hides it; only its row count varies by tier. */}
        {viewMode === 'board' && openSlotsBanner}
        {viewMode === 'board' && (
          <DraftPlayerDock
            sport={sport}
            pickLabel={dockPickLabel({
              currentPickInfo,
              isMyPick,
              myNextOverallPick,
            })}
            availableLabel={formatAvailableCount(
              filteredPlayers.length,
              hasMorePlayers,
            )}
            openSlotsLabel={formatOpenSlots(openSlots)}
            clockLabel={dockClockLabel}
            columns={dockColumns}
            tools={
              <DraftPlayerFilters
                positions={positions}
                selectedPosition={selectedPosition}
                searchTerm={searchTerm}
                loading={availablePlayersLoading}
                onSetSearchTerm={onSetSearchTerm}
                onSetSelectedPosition={onSetSelectedPosition}
              />
            }
            players={filteredPlayers}
            fitsOpenSlot={fitsOpenSlot}
            canDraft={pickOnClock && canPickForTeam}
            isCommPick={isRealCommPick}
            pickLoading={
              isRealCommPick || (controlAllTeams && !isMyPick)
                ? false
                : pickLoading
            }
            loading={availablePlayersLoading}
            hasMore={hasMorePlayers}
            loadingMore={loadingMore}
            searchTerm={searchTerm}
            onDraftPlayer={handleDraftPlayer}
            onLoadMore={onLoadMore}
          />
        )}

        {/* Data Table view */}
        {viewMode === 'table' && (
          <YStack
            style={csp({
              background: PANEL,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              overflowX: 'auto',
            })}
          >
            <YStack role="table" minWidth="100%">
              <XStack role="row">
                <SortableColumnHeader
                  label="Rank"
                  sortKeyValue="rank"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onPress={handleHeaderClick}
                  width={64}
                  align="right"
                />
                <SortableColumnHeader
                  label="Pos"
                  sortKeyValue="position"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onPress={handleHeaderClick}
                  width={60}
                  align="left"
                />
                <SortableColumnHeader
                  label="Player"
                  sortKeyValue="name"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onPress={handleHeaderClick}
                  align="left"
                />
                {/* Team and Career (LS-10164): the design's Data Table places
                    these between Player and ADP, and doesn't mark them with a
                    sort indicator the way ADP and the stat columns are. */}
                <PlainColumnHeader label="Team" width={64} />
                <PlainColumnHeader label="Career" width={100} />
                <SortableColumnHeader
                  label="ADP"
                  sortKeyValue="adp"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onPress={handleHeaderClick}
                  width={70}
                  align="right"
                />
                {STAT_COLUMNS_BY_SPORT[sport].map((col) => (
                  <XStack
                    key={col.label}
                    role="columnheader"
                    accessibilityRole="button"
                    aria-sort={
                      sortKey === col.label
                        ? sortDir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    onPress={() => handleHeaderClick(col.label)}
                    cursor="pointer"
                    width={70}
                    justifyContent="flex-end"
                    paddingVertical={9}
                    paddingHorizontal={12}
                    style={csp({
                      background: PANEL,
                      borderBottom: `1px solid ${BORDER}`,
                    })}
                  >
                    <Text
                      fontFamily="'Big Shoulders Display', 'Arial Narrow', sans-serif"
                      fontWeight="700"
                      fontSize={10}
                      letterSpacing={1.4}
                      textTransform="uppercase"
                      color={sortKey === col.label ? ACCENT : TEXT_SECONDARY}
                      whiteSpace="nowrap"
                    >
                      {col.label}
                      {sortKey === col.label &&
                        (sortDir === 'asc' ? ' ↑' : ' ↓')}
                    </Text>
                  </XStack>
                ))}
                <XStack width={90} />
              </XStack>
              {sortedPlayers.map((player, idx) => {
                const posColor = getPositionColor(sport, player.position ?? '');
                return (
                  <XStack
                    key={player.id}
                    role="row"
                    accessibilityRole="button"
                    onPress={() => handlePlayerClick(player.id)}
                    cursor="pointer"
                    alignItems="center"
                    opacity={watchlistSet.has(player.id) ? 0.85 : 1}
                    style={csp({
                      borderBottom: `1px solid ${BORDER}`,
                    })}
                  >
                    <XStack width={64} justifyContent="flex-end" padding={8}>
                      <Text color={TEXT_MUTED} fontSize={11}>
                        {rankMap.get(player.id) ?? idx + 1}
                      </Text>
                    </XStack>
                    <XStack minWidth={60} padding={8}>
                      <XStack
                        paddingHorizontal={5}
                        paddingVertical={1}
                        borderRadius={3}
                        backgroundColor={`${posColor}26`}
                      >
                        <Text
                          fontSize={10}
                          fontWeight="700"
                          color={posColor}
                          fontFamily="'Big Shoulders Display', sans-serif"
                          letterSpacing={0.6}
                        >
                          {formatEligiblePositions(player) || '?'}
                        </Text>
                      </XStack>
                    </XStack>
                    <XStack flex={1} padding={8}>
                      <Text fontWeight="600" fontSize={13} color={TEXT}>
                        {player.name}
                      </Text>
                    </XStack>
                    <XStack width={64} padding={8}>
                      <Text fontSize={12} color={TEXT}>
                        {player.club ?? '—'}
                      </Text>
                    </XStack>
                    <XStack width={100} padding={8}>
                      <Text fontSize={12} color={TEXT}>
                        {formatCareerSpanLabel(
                          player.careerStartYear,
                          player.careerEndYear,
                        )}
                      </Text>
                    </XStack>
                    <XStack width={70} justifyContent="flex-end" padding={8}>
                      <Text fontSize={12} color={TEXT}>
                        {player.adp?.toFixed(1) ?? '—'}
                      </Text>
                    </XStack>
                    {STAT_COLUMNS_BY_SPORT[sport].map((col) => (
                      <XStack
                        key={col.label}
                        width={70}
                        justifyContent="flex-end"
                        padding={8}
                      >
                        <Text fontSize={12} color={TEXT}>
                          {col.render(player)}
                        </Text>
                      </XStack>
                    ))}
                    <XStack width={90} justifyContent="flex-end" padding={8}>
                      {canPickForTeam && (
                        <XStack
                          role="button"
                          accessibilityRole="button"
                          disabled={pickLoading}
                          onPress={(e: { stopPropagation: () => void }) => {
                            e.stopPropagation();
                            handleDraftPlayer(player.id);
                          }}
                          cursor="pointer"
                          paddingVertical={3}
                          paddingHorizontal={10}
                          borderRadius={8}
                          style={csp({
                            background: isRealCommPick
                              ? COMM_OVERRIDE
                              : `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,
                          })}
                        >
                          <Text fontSize={11} fontWeight="700" color="white">
                            {isRealCommPick ? 'Force Pick' : 'Draft'}
                          </Text>
                        </XStack>
                      )}
                    </XStack>
                  </XStack>
                );
              })}
              {sortedPlayers.length === 0 && !availablePlayersLoading && (
                <YStack padding={24} alignItems="center">
                  <Text color={TEXT_MUTED}>
                    {searchTerm
                      ? OPEN_SLOTS_EMPTY_SEARCH_MESSAGE
                      : OPEN_SLOTS_EMPTY_MESSAGE}
                  </Text>
                </YStack>
              )}
            </YStack>
          </YStack>
        )}

        {/* My Depth Chart view */}
        {viewMode === 'depth' && (
          <>
            {/* Summary line (design `.result-meta`, LS-10166): team + overall
                fill count on the left, the distinct still-open starter
                position types on the right — same derivation the squad
                strip's "Open slots: …" summary uses, so the two can't
                disagree. */}
            <XStack
              justifyContent="space-between"
              alignItems="center"
              flexWrap="wrap"
              gap={6}
              paddingHorizontal={2}
              marginBottom={8}
            >
              <Text fontSize={12} color={TEXT_SECONDARY}>
                {myTeamName ? `${myTeamName} · ` : ''}
                {depthSlotsFilled} of {depthSlotsTotal} positions filled
              </Text>
              <Text
                fontFamily="'Big Shoulders Display', 'Arial Narrow', sans-serif"
                fontSize={11}
                fontWeight="700"
                letterSpacing={1.1}
                textTransform="uppercase"
                color={TEXT_SECONDARY}
              >
                {nextNeedLabels.length > 0
                  ? `Next need: ${nextNeedLabels.join(', ')}`
                  : 'Roster set'}
              </Text>
            </XStack>
            <DepthGrid>
              {depthChartBuckets.map(({ positionType, total, players }) => {
                const complete = total > 0 && players.length >= total;
                const posColor = getPositionColor(sport, positionType);
                // The pitching staff bucket spans the full grid width and
                // lays its rows out in its own sub-grid (design: `P —
                // Pitching Staff`, `grid-column: span 4`).
                const isPitchingStaff = positionType === 'P';
                return (
                  <YStack
                    key={positionType}
                    flexBasis={
                      isPitchingStaff ? '100%' : `${100 / depthGridColumns}%`
                    }
                    minWidth={0}
                    paddingHorizontal={5}
                    paddingBottom={10}
                  >
                    <YStack
                      style={csp({
                        background: PANEL,
                        border: complete ? undefined : `1px solid ${BORDER}`,
                        borderRadius: 8,
                        padding: 12,
                      })}
                    >
                      <XStack
                        alignItems="center"
                        justifyContent="space-between"
                        marginBottom={8}
                      >
                        <Text
                          color={posColor}
                          fontFamily="'Big Shoulders Display', 'Arial Narrow', sans-serif"
                          fontWeight="800"
                          fontSize={13}
                          letterSpacing={1.3}
                          aria-label={
                            positionType === BENCH_SLOT
                              ? 'Bench'
                              : getPositionLabel(positionType)
                          }
                        >
                          {isPitchingStaff
                            ? 'P — Pitching Staff'
                            : positionType}
                        </Text>
                        <Text
                          fontSize={11}
                          color={complete ? '$statusSuccessFg' : TEXT_SECONDARY}
                        >
                          {players.length} / {total}
                        </Text>
                      </XStack>
                      <YStack
                        style={csp(
                          isPitchingStaff
                            ? {
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: 4,
                              }
                            : {},
                        )}
                      >
                        {Array.from({
                          length: Math.max(total, players.length),
                        }).map((_, i) => {
                          const player = players[i];
                          const isPriority =
                            !player &&
                            `${positionType}-${i}` === priorityDepthSlotKey;
                          return (
                            <XStack
                              key={i}
                              alignItems="center"
                              justifyContent={
                                player ? 'space-between' : 'center'
                              }
                              paddingVertical={5}
                              paddingHorizontal={8}
                              marginBottom={3}
                              borderRadius={4}
                              style={csp({
                                background: player ? PANEL : 'transparent',
                                border: player
                                  ? undefined
                                  : isPriority
                                    ? `1px solid ${NEED_BORDER}`
                                    : `1px dashed ${BORDER}`,
                              })}
                            >
                              {player ? (
                                <>
                                  <Text
                                    fontWeight="600"
                                    fontSize={12}
                                    color={TEXT}
                                    numberOfLines={1}
                                    style={csp({
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    })}
                                  >
                                    {player.name}
                                  </Text>
                                  <Text fontSize={10} color={TEXT_MUTED}>
                                    {formatEligiblePositions(player)}
                                  </Text>
                                </>
                              ) : (
                                <Text
                                  fontSize={12}
                                  color={isPriority ? NEED_TEXT : TEXT_MUTED}
                                  fontStyle={isPriority ? 'normal' : 'italic'}
                                >
                                  {isPriority ? 'Open — priority' : 'Open'}
                                </Text>
                              )}
                            </XStack>
                          );
                        })}
                      </YStack>
                    </YStack>
                  </YStack>
                );
              })}
              {myTeam.length === 0 && (
                <YStack flexBasis="100%" alignItems="center" padding={24}>
                  <Text fontSize={13} color={TEXT_MUTED}>
                    No players drafted yet
                  </Text>
                </YStack>
              )}
            </DepthGrid>
          </>
        )}

        {/* Cards / List / Compact view */}
        {(viewMode === 'grid' ||
          viewMode === 'list' ||
          viewMode === 'compact') && (
          <>
            <YStack
              data-testid="player-pool"
              minHeight={filteredPlayers.length === 0 ? 200 : undefined}
              style={csp({
                display: 'grid',
                gridTemplateColumns: gridCols,
                gap: 14,
              })}
            >
              {filteredPlayers.map((player, idx) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  index={idx}
                  isMyPick={canPickForTeam}
                  isCommPick={isRealCommPick}
                  pickLoading={
                    isRealCommPick || (controlAllTeams && !isMyPick)
                      ? false
                      : pickLoading
                  }
                  isWatched={watchlistSet.has(player.id)}
                  isQueued={queuedPlayerIds.has(player.id)}
                  onDraft={handleDraftPlayer}
                  onToggleWatch={handleToggleWatch}
                  onToggleQueue={
                    myTeamId !== null && draftId
                      ? handleToggleQueuePlayer
                      : undefined
                  }
                  onPlayerClick={handlePlayerClick}
                  onDragStartPlayer={onPlayerDragStart}
                  onDragEndPlayer={onPlayerDragEnd}
                  sport={sport}
                />
              ))}
              {filteredPlayers.length === 0 && !availablePlayersLoading && (
                <YStack
                  style={csp({ gridColumn: '1 / -1' })}
                  alignItems="center"
                  padding={24}
                >
                  <Text fontSize={48} marginBottom={12}>
                    <span role="img" aria-label="search">
                      🔍
                    </span>
                  </Text>
                  <Text fontSize={16} fontWeight="600" color={TEXT}>
                    No players found
                  </Text>
                  <Text fontSize={13} marginTop={4} color={TEXT_MUTED}>
                    {searchTerm
                      ? 'Try a different search term'
                      : OPEN_SLOTS_EMPTY_MESSAGE}
                  </Text>
                </YStack>
              )}
            </YStack>
            {hasMorePlayers &&
              !availablePlayersLoading &&
              filteredPlayers.length > 0 && (
                <YStack
                  alignItems="center"
                  paddingVertical={16}
                  paddingHorizontal={20}
                >
                  <XStack
                    role="button"
                    accessibilityRole="button"
                    disabled={loadingMore}
                    onPress={onLoadMore}
                    cursor="pointer"
                    paddingVertical={12}
                    paddingHorizontal={28}
                    borderRadius={8}
                    style={STATE_BTN_STYLE}
                  >
                    <Text fontSize={14} fontWeight="700" color="white">
                      {loadingMore ? 'Loading…' : 'Load More Players'}
                    </Text>
                  </XStack>
                </YStack>
              )}
          </>
        )}
      </MainContainer>
    </>
  );
}
