import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Input, ScrollView, Spinner, Text, XStack, YStack } from 'tamagui';
import {
  ALLOWED_POSITIONS_BY_SPORT,
  DEFAULT_ROSTER_SIZE_BY_SPORT,
} from '@legacy-sports/utils';
import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
  LeagueTeam,
} from './types';
import { DraftGrid } from './DraftGrid';
import { PlayerCard } from './PlayerCard';
import { getPositionColor } from './utils';
import { STAT_COLUMNS_BY_SPORT } from './statColumns';
import type { SportKind } from '../../config/sports';
import { getPositionLabel, isPitcherSlot } from '../roster/rosterEligibility';
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

// Position-filter pill sets, one per sport (LS-9241). The baseball list is
// a curated display collapse of stat positions (not the full
// ALLOWED_POSITIONS_BY_SPORT['baseball'] slot-type key set, which also
// includes roster-only slots like DH/IF/XDH); the football list mirrors it
// with the football stat positions from ALLOWED_POSITIONS_BY_SPORT.football,
// excluding BENCH (not a meaningful filter value — its eligibility list is
// every football position).
const POSITIONS_BY_SPORT: Record<SportKind, readonly string[]> = {
  baseball: ['ALL', 'C', '1B', '2B', '3B', 'SS', 'OF', 'P'],
  football: [
    'ALL',
    ...Object.keys(ALLOWED_POSITIONS_BY_SPORT.football).filter(
      (pos) => pos !== 'BENCH', // exclude the BENCH slot — not a meaningful filter value
    ),
  ],
};

// ── Styled primitives ───────────────────────────────────────────────────────
// tamaguiStyled() isolates Tamagui's any-typed styled() API from strict lint;
// casting the result to a concrete component type keeps call sites lint-clean.
// $md breakpoint keys mirror the ≤768px rules in the original styles.ts
// (.d-main / .d-controls / .d-search-wrap / .d-view-tabs / .d-view-tab /
// .d-pills / .d-pill), and $lg mirrors the 1200/900px depth-grid rules.
type StyledComponent = React.ComponentType<Record<string, unknown>>;

const MainContainer = tamaguiStyled(YStack, {
  // `gridArea` docks this component into the still-CSS-Grid `.d-layout`
  // container in EliteDraftBoardScreen.tsx (raw HTML/CSS, out of scope for
  // this ticket — see LS-9057). Tamagui forwards unrecognized style keys
  // straight through to the underlying web element's style object.
  gridArea: 'main',
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
  // percentage that depends on more than two tiers; these two keys still
  // carry the ≤900px / ≤768px gap tightening from the original CSS.
  $gtSm: {
    gap: 10,
  },
  $md: {
    gap: 8,
  },
}) as StyledComponent;

/** A single depth-chart slot bucket: one or more league-configured roster
 *  positions of the same canonical type (e.g. all SP/RP rows collapse into
 *  a single 'P' bucket), plus whichever of the user's drafted players have
 *  been greedily assigned to fill it. */
interface DepthChartBucket {
  positionType: string;
  total: number;
  players: DraftPlayer[];
}

const BENCH_SLOT = 'BENCH';

/** A drafted player's eligible position strings, falling back to their
 *  single canonical `position` when granular eligibility wasn't loaded. */
const eligiblePositionsOf = (player: DraftPlayer): string[] =>
  player.eligiblePositions?.length
    ? player.eligiblePositions
    : [player.position];

/**
 * Groups `myTeam`'s drafted players into the league's real configured roster
 * slots (`leaguePositions`, the same data RosterBoard renders elsewhere)
 * instead of a hardcoded, baseball-only slot list (LS-8785). Pitcher slot
 * rows (SP/RP/P) collapse into one 'P' bucket, matching `isPitcherSlot`'s
 * existing cross-sport definition of "the same slot" (LS-8069's fix,
 * generalized). Any players beyond the league's starter slots — including
 * true roster overflow — land in a synthetic BENCH bucket so no drafted
 * player is ever silently dropped from view.
 *
 * Eligibility is checked directly against `ALLOWED_POSITIONS_BY_SPORT[sport]`
 * rather than `rosterEligibility.ts`'s `canPlayerPlayPosition`, which reads
 * the legacy baseball-only `ALLOWED_POSITIONS` alias and would silently
 * reject every football slot.
 */
export function buildDepthChartBuckets(
  leaguePositions: ReadonlyArray<{ positionType: string }>,
  myTeam: DraftPlayer[],
  sport: SportKind,
  maxRosterSize: number | null,
): DepthChartBucket[] {
  const order: string[] = [];
  const totals = new Map<string, number>();
  // Union of every real position type (e.g. both 'SP' and 'RP') that
  // collapsed into a given bucket key, so eligibility checks against the
  // canonical 'P' bucket still accept SP/RP-eligible players.
  const allowedByBucket = new Map<string, Set<string>>();
  const positionEligibility = ALLOWED_POSITIONS_BY_SPORT[sport];
  for (const { positionType } of leaguePositions) {
    const key = isPitcherSlot(positionType) ? 'P' : positionType;
    if (!totals.has(key)) {
      order.push(key);
      allowedByBucket.set(key, new Set());
    }
    totals.set(key, (totals.get(key) ?? 0) + 1);
    for (const accepted of positionEligibility[positionType] ?? []) {
      allowedByBucket.get(key)?.add(accepted);
    }
  }
  const startersTotal = leaguePositions.length;
  const effectiveRosterSize =
    maxRosterSize ?? DEFAULT_ROSTER_SIZE_BY_SPORT[sport];
  order.push(BENCH_SLOT);
  totals.set(BENCH_SLOT, Math.max(0, effectiveRosterSize - startersTotal));

  const buckets = new Map<string, DepthChartBucket>(
    order.map((key) => [
      key,
      { positionType: key, total: totals.get(key) ?? 0, players: [] },
    ]),
  );

  // Fill the most specific (narrowest eligible-position) slots first, so a
  // player eligible for both a dedicated slot and a broad one (DH/FLEX) fills
  // the dedicated slot — mirroring the fix in LS-8069.
  const acceptListSize = (key: string): number =>
    allowedByBucket.get(key)?.size ?? Infinity;
  const fillOrder = order
    .filter((key) => key !== BENCH_SLOT)
    .sort((a, b) => acceptListSize(a) - acceptListSize(b));

  let unassigned = [...myTeam];
  for (const key of fillOrder) {
    const bucket = buckets.get(key);
    const allowed = allowedByBucket.get(key);
    if (!bucket || !allowed) continue;
    const stillUnassigned: DraftPlayer[] = [];
    for (const player of unassigned) {
      const eligible = eligiblePositionsOf(player).some((p) => allowed.has(p));
      if (bucket.players.length < bucket.total && eligible) {
        bucket.players.push(player);
      } else {
        stillUnassigned.push(player);
      }
    }
    unassigned = stillUnassigned;
  }

  // Whatever's left — including true overflow beyond the configured roster
  // size — always lands in BENCH, growing it past `total` if needed.
  const bench = buckets.get(BENCH_SLOT);
  if (bench) {
    bench.players.push(...unassigned);
    bench.total = Math.max(bench.total, bench.players.length);
  }

  // `buckets` was built from the same `order` array, so this always yields
  // one entry per key in the original order (Map preserves insertion order).
  return Array.from(buckets.values());
}

type ViewMode = 'grid' | 'list' | 'compact' | 'board' | 'table' | 'depth';
type SortKey = string;
type SortDir = 'asc' | 'desc';

interface DraftPlayerBoardProps {
  viewMode: ViewMode;
  /** Active league sport — drives data-table stat headers. Defaults to 'baseball' upstream. */
  sport: SportKind;
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
  onSetSearchTerm: (v: string) => void;
  onSetSelectedPosition: (v: string) => void;
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
 * Depth-grid column count, mirroring the original CSS's 1200px/900px
 * `grid-template-columns` breakpoints. Uses a local `window.matchMedia`
 * listener (the `useIsNarrow()` custom-breakpoint pattern from
 * `.agents/skills/shared-components-first/SKILL.md`) rather than Tamagui's
 * `useMedia()`, which reads from a `TamaguiProvider` context this component's
 * consumers don't all supply (e.g. `apps/web/src/components/
 * EliteDraftBoard.a11y.spec.tsx` renders it bare).
 */
function useDepthGridColumns(): number {
  const [columns, setColumns] = useState(4);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const gtLg = window.matchMedia('(min-width: 1201px)');
    const gtMd = window.matchMedia('(min-width: 901px)');
    const gtSm = window.matchMedia('(min-width: 641px)');
    const update = () => {
      setColumns(gtLg.matches ? 4 : gtMd.matches ? 3 : gtSm.matches ? 2 : 1);
    };
    update();
    gtLg.addEventListener('change', update);
    gtMd.addEventListener('change', update);
    gtSm.addEventListener('change', update);
    return () => {
      gtLg.removeEventListener('change', update);
      gtMd.removeEventListener('change', update);
      gtSm.removeEventListener('change', update);
    };
  }, []);
  return columns;
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

export function DraftPlayerBoard({
  viewMode,
  sport,
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
  onSetSearchTerm,
  onSetSelectedPosition,
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

  const gridCols =
    viewMode === 'grid' ? 'repeat(auto-fill, minmax(320px, 1fr))' : '1fr';

  // Player detail modal state
  const [detailPlayerId, setDetailPlayerId] = useState<number | null>(null);
  const [detailPlayerName, setDetailPlayerName] = useState('');
  const [detailPlayerPos, setDetailPlayerPos] = useState<string | undefined>();
  const [detailOpen, setDetailOpen] = useState(false);

  // O(1) watchlist lookup — avoids O(n) Array.includes per card per render
  const watchlistSet = useMemo(() => new Set(watchlist), [watchlist]);

  // Position-filter pill list, sport-driven (LS-9241 — previously a
  // module-level baseball-only constant, so football drafts had no pill
  // that ever matched a football player's position).
  const positions = useMemo(() => POSITIONS_BY_SPORT[sport], [sport]);

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
        aVal = (a as DraftPlayer & { adp?: number }).adp ?? Infinity;
        bVal = (b as DraftPlayer & { adp?: number }).adp ?? Infinity;
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
            <SearchWrap>
              <YStack
                position="absolute"
                left={12}
                zIndex={1}
                pointerEvents="none"
              >
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
                paddingRight={searchTerm ? 34 : 14}
                placeholder="Search available players..."
                placeholderTextColor={TEXT_MUTED}
                aria-label="Search players"
                value={searchTerm}
                onChangeText={onSetSearchTerm}
              />
              {searchTerm ? (
                <YStack
                  role="button"
                  accessibilityRole="button"
                  aria-label="Clear search"
                  onPress={() => onSetSearchTerm('')}
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
          </ControlsBar>
        )}

        {/* Draft Board view */}
        {viewMode === 'board' && (
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
                {(
                  [
                    { key: 'rank', label: 'Rank', width: 64, align: 'right' },
                    {
                      key: 'name',
                      label: 'Player',
                      width: undefined,
                      align: 'left',
                    },
                    { key: 'position', label: 'Pos', width: 60, align: 'left' },
                    { key: 'adp', label: 'ADP', width: 70, align: 'right' },
                  ] as Array<{
                    key: string;
                    label: string;
                    width: number | undefined;
                    align: 'left' | 'right';
                  }>
                ).map(({ key, label, width, align }) => (
                  <XStack
                    key={key}
                    role="columnheader"
                    accessibilityRole="button"
                    aria-sort={
                      sortKey === key
                        ? sortDir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    onPress={() => handleHeaderClick(key)}
                    cursor="pointer"
                    flex={width ? undefined : 1}
                    width={width}
                    justifyContent={
                      align === 'right' ? 'flex-end' : 'flex-start'
                    }
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
                      color={sortKey === key ? ACCENT : TEXT_SECONDARY}
                      whiteSpace="nowrap"
                    >
                      {label}
                      {sortKey === key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                    </Text>
                  </XStack>
                ))}
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
                    <XStack flex={1} padding={8}>
                      <Text fontWeight="600" fontSize={13} color={TEXT}>
                        {player.name}
                      </Text>
                    </XStack>
                    <XStack width={60} padding={8}>
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
                          {player.position ?? '?'}
                        </Text>
                      </XStack>
                    </XStack>
                    <XStack width={70} justifyContent="flex-end" padding={8}>
                      <Text fontSize={12} color={TEXT}>
                        {(
                          player as DraftPlayer & { adp?: number }
                        ).adp?.toFixed(1) ?? '—'}
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
                      ? 'No players match your search'
                      : 'All available players have been drafted'}
                  </Text>
                </YStack>
              )}
            </YStack>
          </YStack>
        )}

        {/* My Depth Chart view */}
        {viewMode === 'depth' && (
          <DepthGrid>
            {depthChartBuckets.map(({ positionType, total, players }) => {
              const complete = total > 0 && players.length >= total;
              const posColor = getPositionColor(sport, positionType);
              return (
                <YStack
                  key={positionType}
                  flexBasis={`${100 / depthGridColumns}%`}
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
                        {positionType}
                      </Text>
                      <Text
                        fontSize={11}
                        color={complete ? '$statusSuccessFg' : TEXT_SECONDARY}
                      >
                        {players.length} / {total}
                      </Text>
                    </XStack>
                    {Array.from({
                      length: Math.max(total, players.length),
                    }).map((_, i) => {
                      const player = players[i];
                      return (
                        <XStack
                          key={i}
                          alignItems="center"
                          justifyContent={player ? 'space-between' : 'center'}
                          paddingVertical={5}
                          paddingHorizontal={8}
                          marginBottom={3}
                          borderRadius={4}
                          style={csp({
                            background: player ? PANEL : 'transparent',
                            border: player ? undefined : `1px dashed ${BORDER}`,
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
                                {player.position}
                              </Text>
                            </>
                          ) : (
                            <Text
                              fontSize={12}
                              color={TEXT_MUTED}
                              fontStyle="italic"
                            >
                              Open
                            </Text>
                          )}
                        </XStack>
                      );
                    })}
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
        )}

        {/* Cards / List / Compact view */}
        {(viewMode === 'grid' ||
          viewMode === 'list' ||
          viewMode === 'compact') && (
          <>
            <YStack
              data-testid="player-pool"
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
                      : 'All available players have been drafted'}
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
