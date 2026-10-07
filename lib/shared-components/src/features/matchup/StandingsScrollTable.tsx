import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ScrollView, Separator, Text, useMedia, XStack, YStack } from 'tamagui';
import { Eye } from '@tamagui/lucide-icons/icons/Eye';
import {
  ClinchBadge,
  diffOf,
  formatDiff,
  formatMedianRecord,
  formatWinPct,
  rankBadgeColor,
  type SortDirection,
  type SortKey,
  type StandingRecord,
  teamDisplayName,
} from './standingsTableModel';
import { BRAND_GOLD_LIGHT, withAlpha } from '../../utils/colors';
import { AvatarImage } from '../../components/AvatarImage';
import { GradientSurface } from '../home/GradientSurface';
import { useThemeTokens } from '../../hooks/useThemeTokens';

/**
 * Narrow-viewport (<980, i.e. below `$gtMd`) standings layout — LS-10717.
 *
 * Every column renders; # + Team sit in a fixed left pane and the stat
 * columns (W → Waiver/Median) scroll horizontally in a second pane. The two
 * panes share fixed row heights so they stay aligned. This is deliberately
 * NOT CSS `position: sticky` — React Native has no sticky-left, so two
 * synchronised panes give web and native the same structure.
 *
 * DOM order is header → scroll region → pinned rows (the body panes use
 * `row-reverse` so the pinned pane still paints on the left). That yields the
 * spec'd tab order: sort buttons, then the focusable scroll region, then the
 * team links. On web each pinned row `aria-owns` its scrolling cells so the
 * accessibility tree exposes one logical row per team.
 */

export const STANDINGS_ROW_HEIGHT = 48;
const HEADER_HEIGHT = 40;
const HEADER_HIT_HEIGHT = 44;
const DIVISION_ROW_HEIGHT = 36;
const RANK_WIDTH = 28;
const TEAM_WIDTH_PHONE = 128;
const TEAM_WIDTH_TABLET = 200;
const FADE_WIDTH = 32;
const SKELETON_ROWS = 8;
const CAPTION_FADE_MS = 150;
/** Horizontal distance one ←/→ key press scrolls the stats pane. */
export const KEY_SCROLL_STEP = 64;

type Align = 'right' | 'center';

interface ScrollColumn {
  key: string;
  label: string;
  width: number;
  align: Align;
  sortKey?: SortKey;
  value: (s: StandingRecord, waiverOrder: number | null | undefined) => string;
}

export function buildScrollColumns(
  showWaiverOrder: boolean,
  showMedianRecord: boolean,
): ScrollColumn[] {
  const columns: ScrollColumn[] = [
    {
      key: 'wins',
      label: 'W',
      width: 44,
      align: 'right',
      sortKey: 'wins',
      value: (s) => String(s.wins ?? 0),
    },
    {
      key: 'losses',
      label: 'L',
      width: 44,
      align: 'right',
      sortKey: 'losses',
      value: (s) => String(s.losses ?? 0),
    },
    {
      key: 'ties',
      label: 'T',
      width: 44,
      align: 'right',
      sortKey: 'ties',
      value: (s) => String(s.ties ?? 0),
    },
    {
      key: 'winPct',
      label: 'Win%',
      width: 56,
      align: 'right',
      sortKey: 'winPct',
      value: formatWinPct,
    },
    {
      key: 'pointsFor',
      label: 'PF',
      width: 64,
      align: 'right',
      sortKey: 'pointsFor',
      value: (s) => (s.pointsFor ?? 0).toFixed(2),
    },
    {
      key: 'pointsAgainst',
      label: 'PA',
      width: 64,
      align: 'right',
      sortKey: 'pointsAgainst',
      value: (s) => (s.pointsAgainst ?? 0).toFixed(2),
    },
    {
      key: 'diff',
      label: 'Diff',
      width: 60,
      align: 'right',
      sortKey: 'diff',
      value: (s) => formatDiff(diffOf(s)),
    },
    {
      key: 'streak',
      label: 'Strk',
      width: 48,
      align: 'center',
      value: (s) => s.streak ?? '—',
    },
  ];
  if (showWaiverOrder) {
    columns.push({
      key: 'waiverOrder',
      label: 'Waiver',
      width: 56,
      align: 'center',
      sortKey: 'waiverOrder',
      value: (_s, waiverOrder) =>
        waiverOrder == null ? '—' : `${waiverOrder}`,
    });
  }
  if (showMedianRecord) {
    columns.push({
      key: 'medianRecord',
      label: 'Median',
      width: 64,
      align: 'center',
      sortKey: 'medianRecord',
      value: formatMedianRecord,
    });
  }
  return columns;
}

export interface ScrollMetrics {
  /** Current horizontal offset of the stats pane. */
  x: number;
  /** Visible width of the stats pane. */
  viewport: number;
  /** Full content width of the stats pane. */
  content: number;
}

export interface ScrollCue {
  /** Content is wider than the pane — the cue applies at all. */
  overflow: boolean;
  /** Right-edge fade: overflowing and not yet scrolled to the end. */
  fade: boolean;
  /** Pinned pane casts its shadow: content has passed under it. */
  scrolled: boolean;
  /** "Swipe for PF, PA, Diff →" caption. */
  caption: boolean;
}

/** Pure scroll-cue state, so the visibility rules are unit-testable. */
export function scrollCueFor(
  { x, viewport, content }: ScrollMetrics,
  captionDismissed: boolean,
): ScrollCue {
  const overflow = viewport > 0 && content > viewport + 1;
  return {
    overflow,
    fade: overflow && x + viewport < content - 1,
    scrolled: overflow && x > 0,
    caption: overflow && !captionDismissed,
  };
}

/**
 * Target offset for a keyboard key on the focused stats pane, or `null` when
 * the key is not a scroll key. ←/→ step {@link KEY_SCROLL_STEP}; Home/End jump
 * to the first/last column.
 */
export function keyScrollTarget(
  key: string,
  { x, viewport, content }: ScrollMetrics,
): number | null {
  const max = Math.max(0, content - viewport);
  switch (key) {
    case 'ArrowRight':
      return Math.min(max, x + KEY_SCROLL_STEP);
    case 'ArrowLeft':
      return Math.max(0, x - KEY_SCROLL_STEP);
    case 'Home':
      return 0;
    case 'End':
      return max;
    default:
      return null;
  }
}

/**
 * Offset that brings `[left, left + width)` fully into view with the least
 * movement — `scrollIntoView({ inline: 'nearest' })`, computed from the known
 * column widths so it behaves the same on native.
 */
export function nearestScrollFor(
  left: number,
  width: number,
  { x, viewport }: ScrollMetrics,
): number {
  if (left < x) return left;
  if (left + width > x + viewport) return left + width - viewport;
  return x;
}

// The caption hides after the first scroll *in this session*, so a remount
// (tab switch, week change) does not bring it back.
let captionDismissedThisSession = false;

/** Copy for the scroll caption — "Swipe" for touch, "Scroll" for a fine pointer. */
function captionVerb(): 'Scroll' | 'Swipe' {
  // Capability check, not layout: native (no `matchMedia`) and touch browsers
  // have no fine pointer, so they get the touch copy.
  if (
    typeof document === 'undefined' ||
    typeof window.matchMedia !== 'function'
  )
    return 'Swipe';
  return window.matchMedia('(pointer: fine)').matches ? 'Scroll' : 'Swipe';
}

/** Imperative surface of the Tamagui/RN `ScrollView` instance we rely on. */
interface ScrollHandle {
  scrollTo?: (opts: { x: number; y?: number; animated?: boolean }) => void;
  getScrollableNode?: () => unknown;
}

/** The scrolling DOM element on web; `null` on native (no DOM). */
function domNodeOf(handle: ScrollHandle | null): HTMLElement | null {
  if (handle == null) return null;
  const node =
    typeof handle.getScrollableNode === 'function'
      ? handle.getScrollableNode()
      : handle;
  return node != null &&
    typeof (node as HTMLElement).addEventListener === 'function'
    ? (node as HTMLElement)
    : null;
}

function isFocusVisible(node: HTMLElement): boolean {
  try {
    return node.matches(':focus-visible');
  } catch {
    // Engines without :focus-visible support — show the ring on any focus.
    return true;
  }
}

interface ScrollEventLike {
  nativeEvent: {
    contentOffset: { x: number };
    contentSize?: { width: number };
    layoutMeasurement?: { width: number };
  };
}

export interface StandingsGroup {
  key: string;
  /** Division label row; `null` for a league without divisions. */
  label: string | null;
  teams: StandingRecord[];
}

type Item =
  | { kind: 'division'; key: string; label: string }
  | {
      kind: 'team';
      key: string;
      standing: StandingRecord;
      rank: number;
      teamId: number | null;
    };

export interface StandingsScrollTableProps {
  groups: StandingsGroup[];
  title: string;
  subtitle?: string;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  isCurrentUser: (s: StandingRecord) => boolean;
  onTeamPress?: (teamId: number) => void;
  getTeamUrl?: (teamId: number) => string;
  showWaiverOrder: boolean;
  waiverOrders?: Record<string, number>;
  showMedianRecord: boolean;
}

function SortHeaderButton({
  label,
  active,
  direction,
  align,
  onPress,
  onFocus,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  align: 'left' | Align;
  onPress: () => void;
  onFocus?: () => void;
}) {
  return (
    <XStack
      tag="button"
      role="button"
      height={HEADER_HIT_HEIGHT}
      marginVertical={(HEADER_HEIGHT - HEADER_HIT_HEIGHT) / 2}
      width="100%"
      alignItems="center"
      justifyContent={
        align === 'right'
          ? 'flex-end'
          : align === 'center'
            ? 'center'
            : 'flex-start'
      }
      paddingHorizontal={4}
      backgroundColor="transparent"
      borderWidth={0}
      cursor="pointer"
      userSelect="none"
      focusVisibleStyle={{
        outlineColor: '$focusRing',
        outlineWidth: 2,
        outlineStyle: 'solid',
        outlineOffset: -2,
      }}
      onPress={onPress}
      onFocus={onFocus}
    >
      <Text
        fontSize={12}
        fontWeight="700"
        whiteSpace="nowrap"
        color={active ? BRAND_GOLD_LIGHT : '$textMuted'}
      >
        {active ? `${label} ${direction === 'asc' ? '↑' : '↓'}` : label}
      </Text>
    </XStack>
  );
}

/** Loading skeleton — same fixed row heights, no scroll machinery or cue. */
export function StandingsScrollSkeleton({
  showWaiverOrder,
  showMedianRecord,
}: {
  showWaiverOrder: boolean;
  showMedianRecord: boolean;
}) {
  const media = useMedia();
  const teamWidth = media.xxs ? TEAM_WIDTH_PHONE : TEAM_WIDTH_TABLET;
  const columns = buildScrollColumns(showWaiverOrder, showMedianRecord);
  return (
    <YStack role="status" aria-busy overflow="hidden">
      {/* Visually hidden; announces the state to assistive tech. */}
      <Text position="absolute" width={1} height={1} overflow="hidden">
        Loading standings...
      </Text>
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <XStack
          key={i}
          height={STANDINGS_ROW_HEIGHT}
          alignItems="center"
          borderBottomWidth={1}
          borderBottomColor="$outlineSubtle"
          overflow="hidden"
        >
          <YStack width={RANK_WIDTH + teamWidth} flexShrink={0} paddingLeft={8}>
            <YStack
              width={100}
              height={12}
              borderRadius={4}
              backgroundColor="$surfaceSubtle"
            />
          </YStack>
          {columns.map((c) => (
            <YStack
              key={c.key}
              width={c.width}
              flexShrink={0}
              alignItems="center"
            >
              <YStack
                width={Math.min(40, c.width - 4)}
                height={12}
                borderRadius={4}
                backgroundColor="$surfaceSubtle"
              />
            </YStack>
          ))}
        </XStack>
      ))}
    </YStack>
  );
}

export function StandingsScrollTable({
  groups,
  title,
  subtitle,
  sortKey,
  sortDirection,
  onSort,
  isCurrentUser,
  onTeamPress,
  getTeamUrl,
  showWaiverOrder,
  waiverOrders,
  showMedianRecord,
}: StandingsScrollTableProps) {
  const media = useMedia();
  const { resolvedTheme, surface } = useThemeTokens();
  const teamWidth = media.xxs ? TEAM_WIDTH_PHONE : TEAM_WIDTH_TABLET;
  const pinnedWidth = RANK_WIDTH + teamWidth;
  const baseId = useId();

  const columns = useMemo(
    () => buildScrollColumns(showWaiverOrder, showMedianRecord),
    [showWaiverOrder, showMedianRecord],
  );
  const columnOffsets = useMemo(() => {
    let left = 0;
    return columns.map((c) => {
      const offset = left;
      left += c.width;
      return offset;
    });
  }, [columns]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const group of groups) {
      if (group.label != null) {
        out.push({
          kind: 'division',
          key: `div-${group.key}`,
          label: group.label,
        });
      }
      group.teams.forEach((standing, index) => {
        out.push({
          kind: 'team',
          key: `team-${standing.teamId ?? `${group.key}-${index}`}`,
          standing,
          rank: index + 1,
          teamId: standing.teamId != null ? Number(standing.teamId) : null,
        });
      });
    }
    return out;
  }, [groups]);

  // --- Scroll state -------------------------------------------------------
  const bodyRef = useRef<ScrollHandle>(null);
  const headerRef = useRef<ScrollHandle>(null);
  const bodyX = useRef(0);
  const headerX = useRef(0);
  const metricsRef = useRef<ScrollMetrics>({ x: 0, viewport: 0, content: 0 });
  const [metrics, setMetrics] = useState<ScrollMetrics>(metricsRef.current);
  const [captionDismissed, setCaptionDismissed] = useState(
    captionDismissedThisSession,
  );
  // Unmounts the caption once its 150ms fade-out has finished.
  const [captionGone, setCaptionGone] = useState(captionDismissedThisSession);
  const [focusVisible, setFocusVisible] = useState(false);

  useEffect(() => {
    if (!captionDismissed || captionGone) return undefined;
    const timer = setTimeout(() => setCaptionGone(true), CAPTION_FADE_MS);
    return () => clearTimeout(timer);
  }, [captionDismissed, captionGone]);

  const updateMetrics = useCallback((patch: Partial<ScrollMetrics>) => {
    const next = { ...metricsRef.current, ...patch };
    const prev = metricsRef.current;
    if (
      next.x === prev.x &&
      next.viewport === prev.viewport &&
      next.content === prev.content
    ) {
      return;
    }
    metricsRef.current = next;
    setMetrics(next);
  }, []);

  const scrollBodyTo = useCallback((target: number) => {
    const { viewport, content } = metricsRef.current;
    const x = Math.min(Math.max(0, target), Math.max(0, content - viewport));
    bodyRef.current?.scrollTo?.({ x, y: 0, animated: false });
  }, []);

  const onBodyScroll = useCallback(
    (e: ScrollEventLike) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const x = contentOffset.x;
      bodyX.current = x;
      updateMetrics({
        x,
        ...(contentSize ? { content: contentSize.width } : {}),
        ...(layoutMeasurement ? { viewport: layoutMeasurement.width } : {}),
      });
      if (Math.abs(headerX.current - x) > 0.5) {
        headerX.current = x;
        headerRef.current?.scrollTo?.({ x, y: 0, animated: false });
      }
      if (x > 0 && !captionDismissedThisSession) {
        captionDismissedThisSession = true;
        setCaptionDismissed(true);
      }
    },
    [updateMetrics],
  );

  // The header pane takes no gestures, but the browser still scrolls it when
  // an off-screen sort button gains focus — follow it with the body.
  const onHeaderScroll = useCallback(
    (e: ScrollEventLike) => {
      const x = e.nativeEvent.contentOffset.x;
      headerX.current = x;
      if (Math.abs(bodyX.current - x) > 0.5) {
        bodyX.current = x;
        scrollBodyTo(x);
      }
    },
    [scrollBodyTo],
  );

  const revealColumn = useCallback(
    (index: number) => {
      scrollBodyTo(
        nearestScrollFor(
          columnOffsets[index],
          columns[index].width,
          metricsRef.current,
        ),
      );
    },
    [columnOffsets, columns, scrollBodyTo],
  );

  // Web keyboard support for the focusable region: ←/→ step, Home/End jump.
  // Wired on the DOM node because these are DOM key events; native has no
  // DOM node and uses the accessibility actions below instead.
  useEffect(() => {
    const node = domNodeOf(bodyRef.current);
    if (node == null) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target !== node) return;
      const target = keyScrollTarget(e.key, metricsRef.current);
      if (target == null) return;
      e.preventDefault();
      scrollBodyTo(target);
    };
    const onFocus = () => setFocusVisible(isFocusVisible(node));
    const onBlur = () => setFocusVisible(false);
    node.addEventListener('keydown', onKeyDown);
    node.addEventListener('focus', onFocus);
    node.addEventListener('blur', onBlur);
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      node.removeEventListener('focus', onFocus);
      node.removeEventListener('blur', onBlur);
    };
  }, [scrollBodyTo]);

  const cue = scrollCueFor(metrics, captionDismissed);
  // Stays mounted through the fade-out after the first scroll.
  const showCaption = cue.overflow && !captionGone;

  // --- Row interaction state (shared so both panes highlight together) ----
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [pressKey, setPressKey] = useState<string | null>(null);

  const currentUserHairline =
    resolvedTheme === 'dark' ? '$outlineStrong' : '$brandNavy';

  const rowBackground = (key: string, current: boolean) =>
    pressKey === key
      ? '$backgroundPress'
      : hoverKey === key
        ? '$backgroundHover'
        : current
          ? '$accentMuted'
          : 'transparent';

  const rowInteraction = (item: Extract<Item, { kind: 'team' }>) => {
    const pressable = onTeamPress != null && item.teamId != null;
    if (!pressable) return {};
    const teamId = item.teamId as number;
    return {
      cursor: 'pointer' as const,
      onHoverIn: () => setHoverKey(item.key),
      onHoverOut: () => setHoverKey((k) => (k === item.key ? null : k)),
      onPressIn: () => setPressKey(item.key),
      onPressOut: () => setPressKey((k) => (k === item.key ? null : k)),
      onPress: () => onTeamPress(teamId),
    };
  };

  const rowFrame = (item: Extract<Item, { kind: 'team' }>) => {
    const current = isCurrentUser(item.standing);
    return {
      height: STANDINGS_ROW_HEIGHT,
      backgroundColor: rowBackground(item.key, current),
      borderBottomWidth: 1,
      borderBottomColor: current ? currentUserHairline : '$outlineSubtle',
      borderTopWidth: current ? 1 : 0,
      borderTopColor: current ? currentUserHairline : undefined,
    };
  };

  const pinnedDivider = {
    borderRightWidth: 1,
    borderRightColor: cue.scrolled ? '$outlineDefault' : '$outlineSubtle',
    zIndex: 1,
    ...(cue.scrolled
      ? {
          shadowColor: '$shadowColor',
          shadowOffset: { width: 3, height: 0 },
          shadowRadius: 6,
          shadowOpacity: 1,
        }
      : {}),
  } as const;

  const rowId = (i: number) => `${baseId}-row-${i}`;
  const cellId = (i: number, c: number) => `${baseId}-row-${i}-c${c}`;
  const ownedCells = (i: number) =>
    columns.map((_c, c) => cellId(i, c)).join(' ');

  const numeric = {
    fontSize: 14,
    color: '$color11' as const,
    fontVariant: ['tabular-nums' as const],
  };

  const fadeTo = surface.bg;

  return (
    <YStack>
      {subtitle || showCaption ? (
        <XStack
          flexWrap="wrap"
          alignItems="center"
          justifyContent="space-between"
          gap="$1"
          marginBottom="$3"
        >
          {subtitle ? (
            <Text fontSize="$2" color="$gray11">
              {subtitle}
            </Text>
          ) : null}
          {showCaption ? (
            <Text
              marginLeft="auto"
              fontSize={12}
              color="$textMuted"
              opacity={cue.caption ? 1 : 0}
              animation="150ms"
              animateOnly={['opacity']}
              aria-hidden
            >
              {`${captionVerb()} for PF, PA, Diff →`}
            </Text>
          ) : null}
        </XStack>
      ) : null}
      <Separator marginBottom="$3" />

      <YStack role="table" aria-label={title} aria-rowcount={items.length + 1}>
        {/* Header: pinned # / Team + a gesture-less pane that follows the body. */}
        <XStack
          height={HEADER_HEIGHT}
          borderBottomWidth={1}
          borderBottomColor="$outlineDefault"
        >
          <XStack
            role="row"
            id={rowId(0)}
            aria-rowindex={1}
            aria-owns={ownedCells(0)}
            width={pinnedWidth}
            flexShrink={0}
            alignItems="center"
            {...pinnedDivider}
          >
            <YStack
              role="columnheader"
              width={RANK_WIDTH}
              aria-sort={
                sortKey === 'rank'
                  ? sortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : undefined
              }
            >
              <SortHeaderButton
                label="#"
                active={sortKey === 'rank'}
                direction={sortDirection}
                align="center"
                onPress={() => onSort('rank')}
              />
            </YStack>
            <YStack
              role="columnheader"
              width={teamWidth}
              aria-sort={
                sortKey === 'team'
                  ? sortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : undefined
              }
            >
              <SortHeaderButton
                label="Team"
                active={sortKey === 'team'}
                direction={sortDirection}
                align="left"
                onPress={() => onSort('team')}
              />
            </YStack>
          </XStack>
          <ScrollView
            ref={headerRef as never}
            horizontal
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={onHeaderScroll}
            flex={1}
            contentContainerStyle={{ flexGrow: 1 }}
          >
            <XStack
              role="presentation"
              height={HEADER_HEIGHT}
              alignItems="center"
            >
              {columns.map((c, ci) => (
                <YStack
                  key={c.key}
                  id={cellId(0, ci)}
                  role="columnheader"
                  width={c.width}
                  aria-sort={
                    c.sortKey != null && sortKey === c.sortKey
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  {c.sortKey != null ? (
                    <SortHeaderButton
                      label={c.label}
                      active={sortKey === c.sortKey}
                      direction={sortDirection}
                      align={c.align}
                      onPress={() => onSort(c.sortKey as SortKey)}
                      onFocus={() => revealColumn(ci)}
                    />
                  ) : (
                    <Text
                      fontSize={12}
                      fontWeight="700"
                      color="$textMuted"
                      paddingHorizontal={4}
                      textAlign={c.align}
                    >
                      {c.label}
                    </Text>
                  )}
                </YStack>
              ))}
            </XStack>
          </ScrollView>
        </XStack>

        {/* Body: `row-reverse` keeps the scroll region ahead of the team links
            in DOM/tab order while the pinned pane still paints on the left. */}
        <XStack flexDirection="row-reverse">
          <YStack flex={1} minWidth={0} position="relative">
            <ScrollView
              ref={bodyRef as never}
              horizontal
              role="region"
              aria-label="Standings stats, scrolls horizontally"
              tabIndex={0}
              scrollEventThrottle={16}
              onScroll={onBodyScroll}
              // Rows (fills, hairlines) span the pane when the stats fit.
              contentContainerStyle={{ flexGrow: 1 }}
              onLayout={(e: { nativeEvent: { layout: { width: number } } }) =>
                updateMetrics({ viewport: e.nativeEvent.layout.width })
              }
              onContentSizeChange={(width: number) =>
                updateMetrics({ content: width })
              }
              accessibilityActions={[
                { name: 'scrollLeft', label: 'Scroll left' },
                { name: 'scrollRight', label: 'Scroll right' },
              ]}
              onAccessibilityAction={(e: {
                nativeEvent: { actionName: string };
              }) => {
                const key =
                  e.nativeEvent.actionName === 'scrollLeft'
                    ? 'ArrowLeft'
                    : e.nativeEvent.actionName === 'scrollRight'
                      ? 'ArrowRight'
                      : null;
                const target =
                  key == null ? null : keyScrollTarget(key, metricsRef.current);
                if (target != null) scrollBodyTo(target);
              }}
            >
              <YStack role="presentation" flexGrow={1}>
                {items.map((item, i) => {
                  if (item.kind === 'division') {
                    return (
                      <YStack
                        key={item.key}
                        aria-hidden
                        height={DIVISION_ROW_HEIGHT}
                        backgroundColor="$surfaceSubtle"
                      />
                    );
                  }
                  const waiverOrder =
                    item.standing.teamId != null
                      ? waiverOrders?.[item.standing.teamId]
                      : undefined;
                  return (
                    <XStack
                      key={item.key}
                      role="presentation"
                      alignItems="center"
                      {...rowFrame(item)}
                      {...rowInteraction(item)}
                    >
                      {columns.map((c, ci) => (
                        <YStack
                          key={c.key}
                          id={cellId(i + 1, ci)}
                          role="cell"
                          width={c.width}
                          paddingHorizontal={6}
                          alignItems={
                            c.align === 'right' ? 'flex-end' : 'center'
                          }
                        >
                          <Text {...numeric} textAlign={c.align}>
                            {c.value(item.standing, waiverOrder)}
                          </Text>
                        </YStack>
                      ))}
                    </XStack>
                  );
                })}
              </YStack>
            </ScrollView>
            {cue.fade ? (
              <YStack
                position="absolute"
                top={0}
                right={0}
                bottom={0}
                width={FADE_WIDTH}
                pointerEvents="none"
                aria-hidden
              >
                <GradientSurface
                  colors={[withAlpha(fadeTo, 0), fadeTo]}
                  angle={90}
                  width={FADE_WIDTH}
                  height="100%"
                />
              </YStack>
            ) : null}
            {focusVisible ? (
              <YStack
                position="absolute"
                top={0}
                right={0}
                bottom={0}
                left={0}
                borderWidth={2}
                borderColor="$focusRing"
                pointerEvents="none"
                aria-hidden
              />
            ) : null}
          </YStack>

          <YStack
            role="rowgroup"
            width={pinnedWidth}
            flexShrink={0}
            {...pinnedDivider}
          >
            {items.map((item, i) => {
              if (item.kind === 'division') {
                return (
                  <XStack
                    key={item.key}
                    role="row"
                    aria-rowindex={i + 2}
                    height={DIVISION_ROW_HEIGHT}
                    alignItems="center"
                    paddingHorizontal={8}
                    backgroundColor="$surfaceSubtle"
                  >
                    <Text
                      role="cell"
                      fontSize={13}
                      fontWeight="700"
                      color="$gray11"
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                  </XStack>
                );
              }
              return (
                <PinnedTeamRow
                  key={item.key}
                  id={rowId(i + 1)}
                  rowIndex={i + 2}
                  ownedCells={ownedCells(i + 1)}
                  standing={item.standing}
                  rank={item.rank}
                  teamId={item.teamId}
                  teamWidth={teamWidth}
                  current={isCurrentUser(item.standing)}
                  hovered={hoverKey === item.key}
                  frame={rowFrame(item)}
                  interaction={rowInteraction(item)}
                  onTeamPress={onTeamPress}
                  getTeamUrl={getTeamUrl}
                />
              );
            })}
          </YStack>
        </XStack>
      </YStack>
    </YStack>
  );
}

function PinnedTeamRow({
  id,
  rowIndex,
  ownedCells,
  standing,
  rank,
  teamId,
  teamWidth,
  current,
  hovered,
  frame,
  interaction,
  onTeamPress,
  getTeamUrl,
}: {
  id: string;
  rowIndex: number;
  ownedCells: string;
  standing: StandingRecord;
  rank: number;
  teamId: number | null;
  teamWidth: number;
  current: boolean;
  hovered: boolean;
  frame: Record<string, unknown>;
  interaction: Record<string, unknown>;
  onTeamPress?: (teamId: number) => void;
  getTeamUrl?: (teamId: number) => string;
}) {
  const badgeColor = rankBadgeColor(rank);
  const name = teamDisplayName(standing);
  const teamUrl =
    teamId != null && getTeamUrl != null ? getTeamUrl(teamId) : undefined;
  const pressable = onTeamPress != null && teamId != null;

  return (
    <XStack
      role="row"
      id={id}
      aria-rowindex={rowIndex}
      aria-owns={ownedCells}
      alignItems="center"
      {...frame}
      {...interaction}
    >
      <YStack
        role="cell"
        width={RANK_WIDTH}
        alignItems="center"
        justifyContent="center"
      >
        <YStack
          width={28}
          height={28}
          borderRadius={14}
          backgroundColor={withAlpha(badgeColor, 0.18)}
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize="$2" fontWeight="bold" color={badgeColor}>
            {rank}
          </Text>
        </YStack>
      </YStack>
      <XStack
        role="cell"
        width={teamWidth}
        paddingHorizontal={8}
        gap={6}
        alignItems="center"
      >
        <AvatarImage
          url={standing.avatarUrl}
          username={standing.teamName}
          size={24}
          borderRadius={4}
        />
        <Text
          tag={teamUrl ? 'a' : undefined}
          {...(teamUrl
            ? ({
                href: teamUrl,
                onClick: (e: React.MouseEvent) => {
                  if (e.button === 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onTeamPress != null && teamId != null) {
                      onTeamPress(teamId);
                    }
                  }
                },
              } as Record<string, unknown>)
            : {})}
          {...({ title: name } as Record<string, unknown>)}
          flex={1}
          minWidth={0}
          numberOfLines={1}
          fontSize={14}
          fontWeight="600"
          color="$color12"
          textDecorationLine="none"
        >
          {name}
        </Text>
        {standing.clinchStatus ? (
          <ClinchBadge status={standing.clinchStatus} />
        ) : null}
        {current ? (
          <Text
            flexShrink={0}
            fontSize="$1"
            fontWeight="700"
            color={BRAND_GOLD_LIGHT}
            borderColor={BRAND_GOLD_LIGHT}
            borderWidth={1}
            borderRadius="$2"
            paddingHorizontal="$1.5"
          >
            You
          </Text>
        ) : null}
        {hovered && pressable ? <Eye size={14} color="$gray10" /> : null}
      </XStack>
    </XStack>
  );
}
