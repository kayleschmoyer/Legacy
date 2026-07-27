import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Button,
  ScrollView,
  Spinner,
  Text,
  Tooltip,
  XStack,
  YStack,
} from 'tamagui';
import { ExternalLink, X } from '@tamagui/lucide-icons';
import { LOGGER } from '@legacy-sports/logging';
import {
  useGetAllPlayerSeasonStatsQuery,
  useGetPlayerCareerArcQuery,
} from '@legacy-sports/graphql';
import { BaseModal } from './BaseModal';
import type { CareerArcMode } from './CareerArcChart';
import { useIsPremiumStatus } from '../hooks/useIsPremium';
import {
  ipToDecimalInnings,
  ipToOuts,
  outsToBaseballIP,
} from '../lib/scoring/ipUtils';
import { getPositionColor } from '@legacy-sports/shared-components';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  STATS_BORDER,
  SURFACE_CARD,
  SURFACE_PANEL,
  SURFACE_SUBTLE,
  TEXT_INTERFACE,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  WHITE,
  withAlpha,
} from '../constants/colors';

const CareerArcChart = React.lazy(() =>
  import('./CareerArcChart').then((m) => ({ default: m.CareerArcChart })),
);

// ---------------------------------------------------------------------------
// ChartErrorBoundary — catches lazy-chunk failures for CareerArcChart
// and renders a retry CTA rather than crashing the modal (LS-6967).
// ---------------------------------------------------------------------------

interface ChartErrorBoundaryState {
  hasError: boolean;
}

export class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ChartErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ChartErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    LOGGER.error('[PlayerDetailModal] CareerArcChart chunk load failed', error);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <YStack
          alignItems="center"
          gap={12}
          paddingVertical={24}
          data-testid="career-arc-chart-error"
        >
          <Text
            color={TEXT_SECONDARY}
            style={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 14 }}
          >
            Chart unavailable — the visualisation failed to load.
          </Text>
          <Button
            size="$3"
            onPress={() => this.setState({ hasError: false })}
            backgroundColor={withAlpha(BRAND_GOLD, 0.15)}
            borderColor={withAlpha(BRAND_GOLD, 0.4)}
            borderWidth={1}
            color={BRAND_GOLD_LIGHT}
            hoverStyle={{ backgroundColor: withAlpha(BRAND_GOLD, 0.25) }}
            pressStyle={{ backgroundColor: withAlpha(BRAND_GOLD, 0.3) }}
          >
            <Text
              color={BRAND_GOLD_LIGHT}
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              Retry
            </Text>
          </Button>
        </YStack>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Editorial type tokens — match the Player Details design bundle
// (docs/design/kXxk3B29-DRvoJthw6UifA, slice 2 / LS-4622).
// ---------------------------------------------------------------------------

const FONT_DISPLAY = "'Big Shoulders Display', sans-serif";
const FONT_BODY = "'Literata', serif";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayerDetailModalProps {
  /** Numeric player ID to load stats for */
  playerId: number | null;
  /** Display name shown in the header */
  playerName: string;
  /** Primary position badge (e.g. "SS", "P") */
  position?: string;
  /** Whether the modal is visible */
  open: boolean;
  /** Callback when the modal should close */
  onOpenChange: (open: boolean) => void;
  /**
   * Optional "open full page" affordance (PST-051 / LS-7124). When provided, an
   * external-link button is rendered in the header that navigates to the
   * standalone `/players/:id` route. Omitted when the modal *is* the full page
   * (PlayerDetailPage), where the affordance would be redundant.
   */
  onViewFullPage?: () => void;
  /**
   * Called when the user clicks a position badge in the eligible-positions row
   * (LS-6978). Consumers can use this to filter or highlight matching roster
   * slots. When omitted the badges remain non-interactive.
   */
  onPositionClick?: (position: string) => void;
  /**
   * Optional back-navigation callback (LS-5578). When provided, a "← Back"
   * button is rendered above the masthead so users can return to the calling
   * context (e.g. the stats list) without relying on the browser's back button.
   */
  onBack?: () => void;
}

interface SeasonRow {
  season: number;
  team?: string;
  batting?: {
    games: number;
    pa: number;
    ab: number;
    h: number;
    doubles: number;
    triples: number;
    hr: number;
    rbi: number;
    sb: number;
    bb: number;
    so: number;
    avg: string;
    obp: string;
    slg: string;
    ops: string;
    babip: string;
    opsPlus: number | null;
  };
  pitching?: {
    games: number;
    wins: number;
    losses: number;
    era: string;
    ip: number;
    so: number;
    bb: number;
    fip: string | null;
    whip: string | null;
    k9: string | null;
    bb9: string | null;
  };
  fielding?: {
    games: number;
    inn: number;
    po: number;
    a: number;
    e: number;
    position: string;
    drs: number | null;
    uzr: number | null;
    oaa: number | null;
  };
}

type StatsTab = 'career-arc' | 'batting' | 'pitching' | 'fielding';

interface CareerTile {
  label: string;
  value: string | number;
  accent?: boolean;
}

// ---------------------------------------------------------------------------
// Editorial sub-components
// ---------------------------------------------------------------------------

function PortraitAvatar({
  initials,
  accent,
}: {
  initials: string;
  accent?: string;
}) {
  // Linear gradient: navy → position-tinted accent (defaults to brand gold).
  const tint = accent ?? BRAND_GOLD;
  return (
    <XStack
      width={92}
      height={92}
      borderRadius={46}
      alignItems="center"
      justifyContent="center"
      borderWidth={1}
      borderColor={withAlpha(BRAND_GOLD, 0.45)}
      style={{
        background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${tint} 100%)`,
      }}
      $sm={{ width: 68, height: 68, borderRadius: 34 }}
    >
      <Text
        color={WHITE}
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 28,
          letterSpacing: '0.04em',
        }}
      >
        {initials}
      </Text>
    </XStack>
  );
}

function PositionBadge({
  position,
  onPress,
}: {
  position: string;
  onPress?: () => void;
}) {
  return (
    <Text
      data-testid="player-position"
      color={WHITE}
      backgroundColor={getPositionColor('baseball', position)}
      paddingHorizontal={8}
      paddingVertical={4}
      borderRadius={4}
      minWidth={32}
      textAlign="center"
      style={{
        fontFamily: FONT_DISPLAY,
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '0.1em',
      }}
      cursor={onPress != null ? 'pointer' : undefined}
      onPress={onPress}
      pressStyle={onPress != null ? { opacity: 0.7 } : undefined}
      hoverStyle={onPress != null ? { opacity: 0.85 } : undefined}
      role={onPress != null ? 'button' : undefined}
      aria-label={onPress != null ? `Filter roster by ${position}` : undefined}
    >
      {position}
    </Text>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Text
      color={BRAND_GOLD}
      style={{
        fontFamily: FONT_DISPLAY,
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
}

function EditorialHeading({
  children,
  size = 'h1',
}: {
  children: React.ReactNode;
  size?: 'h1' | 'h2';
}) {
  const isH1 = size === 'h1';
  return (
    <Text
      color={WHITE}
      style={{
        fontFamily: FONT_DISPLAY,
        fontWeight: 800,
        fontSize: isH1 ? 54 : 22,
        lineHeight: isH1 ? 0.95 : 1.1,
        letterSpacing: isH1 ? '-0.02em' : '0.04em',
        textTransform: isH1 ? 'none' : 'uppercase',
        margin: 0,
      }}
      $sm={isH1 ? { style: { fontSize: 34 } } : undefined}
    >
      {children}
    </Text>
  );
}

function HeroStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <YStack
      minWidth={90}
      padding={20}
      gap={6}
      backgroundColor={SURFACE_CARD}
      borderWidth={1}
      borderColor={STATS_BORDER}
      borderRadius={16}
      $sm={{ padding: 14 }}
    >
      <Text
        color={TEXT_TERTIARY}
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      <Text
        color={accent ? BRAND_GOLD_LIGHT : TEXT_INTERFACE}
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 'clamp(30px, 8vw, 54px)',
          lineHeight: 1,
          letterSpacing: '-0.01em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Text>
    </YStack>
  );
}

function CareerStatTile({ label, value, accent }: CareerTile) {
  return (
    <YStack
      flex={1}
      minWidth={120}
      padding={14}
      gap={4}
      backgroundColor={SURFACE_SUBTLE}
      borderWidth={1}
      borderColor={STATS_BORDER}
      borderRadius={16}
      $sm={{ minWidth: 92, padding: 10 }}
    >
      <Text
        color={TEXT_TERTIARY}
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      <Text
        color={accent ? BRAND_GOLD_LIGHT : TEXT_INTERFACE}
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 26,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Text>
    </YStack>
  );
}

function SectionHead({ title, meta }: { title: string; meta?: string }) {
  return (
    <XStack
      alignItems="baseline"
      justifyContent="space-between"
      gap={12}
      marginTop={28}
      marginBottom={14}
      flexWrap="wrap"
    >
      <EditorialHeading size="h2">{title}</EditorialHeading>
      {meta && (
        <Text
          color={TEXT_TERTIARY}
          style={{
            fontFamily: FONT_BODY,
            fontSize: 13,
            fontStyle: 'italic',
          }}
        >
          {meta}
        </Text>
      )}
    </XStack>
  );
}

function EditorialTab({
  label,
  tabKey,
  active,
  onPress,
}: {
  label: string;
  tabKey: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <YStack
      cursor="pointer"
      paddingHorizontal={18}
      paddingVertical={14}
      borderBottomWidth={2}
      borderBottomColor={active ? BRAND_GOLD : 'transparent'}
      animation="quick"
      pressStyle={{ scale: 0.97 }}
      hoverStyle={{ backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.08) }}
      onPress={onPress}
      style={{ scrollSnapAlign: 'start' }}
    >
      <Text
        testID={`tab-${tabKey}`}
        color={active ? TEXT_INTERFACE : TEXT_SECONDARY}
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Text>
    </YStack>
  );
}

// Rows beyond this threshold are rendered in a fixed-height virtual window.
const EDITORIAL_VIRTUALIZE_THRESHOLD = 25;
const EDITORIAL_ROW_HEIGHT_PX = 46;
const EDITORIAL_VIRTUAL_HEIGHT = 400;

type EditorialSortDir = 'asc' | 'desc';
type EditorialCellVal = string | number;

export function compareEditorialCells(
  a: EditorialCellVal,
  b: EditorialCellVal,
  dir: EditorialSortDir,
): number {
  const aMissing = a === '' || a == null;
  const bMissing = b === '' || b == null;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  const aNum = typeof a === 'number' ? a : Number(a);
  const bNum = typeof b === 'number' ? b : Number(b);
  const bothNum = Number.isFinite(aNum) && Number.isFinite(bNum);
  const cmp = bothNum
    ? aNum - bNum
    : String(a).localeCompare(String(b), undefined, { numeric: true });
  return dir === 'asc' ? cmp : -cmp;
}

export function EditorialTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<EditorialSortDir>('asc');
  const parentRef = useRef<HTMLDivElement>(null);

  const handleSort = useCallback(
    (colIdx: number) => {
      if (sortCol !== colIdx) {
        setSortCol(colIdx);
        setSortDir('asc');
      } else if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        setSortCol(null);
        setSortDir('asc');
      }
    },
    [sortCol, sortDir],
  );

  const sortedRows = useMemo(() => {
    if (sortCol === null) return rows;
    return [...rows].sort((a, b) =>
      compareEditorialCells(a[sortCol], b[sortCol], sortDir),
    );
  }, [rows, sortCol, sortDir]);

  const shouldVirtualize = sortedRows.length > EDITORIAL_VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? sortedRows.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => EDITORIAL_ROW_HEIGHT_PX,
    overscan: 5,
  });

  const rowContent = (cells: EditorialCellVal[]) =>
    cells.map((cell, ci) => (
      <Text
        key={`${cells[0]}-${headers[ci]}`}
        flex={ci === 0 ? 1.2 : 1}
        minWidth={0}
        numberOfLines={1}
        color={ci === 0 ? BRAND_GOLD_LIGHT : TEXT_INTERFACE}
        textAlign={ci === 0 ? 'left' : 'right'}
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: ci === 0 ? 800 : 600,
          fontSize: 15,
          letterSpacing: ci === 0 ? '0.04em' : 0,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {cell}
      </Text>
    ));

  return (
    <YStack
      marginTop={14}
      borderWidth={1}
      borderColor={STATS_BORDER}
      borderRadius={16}
      backgroundColor={SURFACE_CARD}
      overflow="hidden"
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <YStack minWidth={700}>
          {/* Sortable header row */}
          <XStack
            backgroundColor={SURFACE_PANEL}
            borderBottomWidth={1}
            borderBottomColor={STATS_BORDER}
            paddingVertical={12}
            paddingHorizontal={12}
          >
            {headers.map((h, i) => (
              <YStack
                key={h}
                flex={i === 0 ? 1.2 : 1}
                minWidth={0}
                role="columnheader"
                aria-sort={
                  sortCol === i
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                <button
                  type="button"
                  onClick={() => handleSort(i)}
                  aria-label={`Sort by ${h}`}
                  style={{
                    display: 'block',
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    textAlign: i === 0 ? 'left' : 'right',
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 700,
                    fontSize: 11,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: sortCol === i ? TEXT_INTERFACE : TEXT_SECONDARY,
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {h}
                  {sortCol === i ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              </YStack>
            ))}
          </XStack>

          {/* Rows — virtualized when count > threshold */}
          {shouldVirtualize ? (
            <div
              ref={parentRef}
              style={{ height: EDITORIAL_VIRTUAL_HEIGHT, overflowY: 'auto' }}
            >
              <div
                style={{
                  height: virtualizer.getTotalSize(),
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((vi) => {
                  const cells = sortedRows[vi.index];
                  const isLast = vi.index === sortedRows.length - 1;
                  return (
                    <div
                      key={vi.key}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${vi.start}px)`,
                      }}
                    >
                      <XStack
                        paddingVertical={12}
                        paddingHorizontal={12}
                        borderBottomWidth={isLast ? 0 : 1}
                        borderBottomColor={STATS_BORDER}
                        hoverStyle={{
                          backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.1),
                        }}
                      >
                        {rowContent(cells)}
                      </XStack>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            sortedRows.map((cells, ri) => (
              <XStack
                key={String(cells[0])}
                paddingVertical={12}
                paddingHorizontal={12}
                borderBottomWidth={ri < sortedRows.length - 1 ? 1 : 0}
                borderBottomColor={STATS_BORDER}
                hoverStyle={{
                  backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.1),
                }}
              >
                {rowContent(cells)}
              </XStack>
            ))
          )}
        </YStack>
      </ScrollView>
      <Text
        // Accessible caption — visually hidden, announced by screen readers.
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {caption}
      </Text>
    </YStack>
  );
}

// Build initials from "Firstname Lastname" — first letter of first + last word.
function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '··';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * PlayerDetailModal — Full-featured player detail dialog.
 *
 * Editorial layout matches design slice 2 of the Player Details bundle
 * (LS-4586 / LS-4622): masthead with portrait + scoreboard-sized name,
 * hero career stats, a flat career grid, and editorial-typography tabs.
 */
export function PlayerDetailModal({
  playerId,
  playerName,
  position,
  open,
  onOpenChange,
  onBack,
  onViewFullPage,
  onPositionClick,
}: PlayerDetailModalProps) {
  LOGGER.debug('[PlayerDetailModal] render', { playerId, playerName, open });

  const [activeTab, setActiveTab] = useState<StatsTab>('career-arc');
  const [arcMode, setArcMode] = useState<CareerArcMode>('batting');
  const { isPremium } = useIsPremiumStatus();
  // Premium plans grant every catalog entitlement, so these advanced-stats gates
  // resolve to the user's premium status (LS-8643). Per-entitlement client
  // resolution from the token claim lands in LS-8645.
  const hasAdvancedBatting = isPremium;
  const hasPremiumPitching = isPremium;
  const hasPremiumFielding = isPremium;
  const hasPremiumBatting = isPremium;

  // ------ Data fetching ------
  const { data, previousData, loading, error } =
    useGetAllPlayerSeasonStatsQuery({
      variables: { playerId: playerId ?? 0 },
      skip: !playerId || !open,
    });

  const displayData = data ?? previousData;

  const { data: arcData, previousData: previousArcData } =
    useGetPlayerCareerArcQuery({
      variables: { playerId: playerId ?? 0 },
      skip: !playerId || !open,
      fetchPolicy: 'cache-first',
    });

  const displayArcData = arcData ?? previousArcData;

  const eligiblePositions = displayData?.player?.eligiblePositions ?? [];

  const firstName = displayData?.player?.firstName;
  const lastName = displayData?.player?.lastName;
  const resolvedPlayerName =
    firstName && lastName ? `${firstName} ${lastName}` : playerName;
  const initials = deriveInitials(resolvedPlayerName);

  // ------ Transform to season rows ------
  const seasonRows = useMemo((): SeasonRow[] => {
    if (!displayData) return [];
    const seasons = new Map<string, SeasonRow>();

    displayData.playerSeasonBatting?.forEach(
      (b: {
        season?: number | null;
        team?: string | null;
        games?: number | null;
        plateAppearances?: number | null;
        atBats?: number | null;
        hits?: number | null;
        doubles?: number | null;
        triples?: number | null;
        homeRuns?: number | null;
        rbi?: number | null;
        stolenBases?: number | null;
        baseOnBalls?: number | null;
        onBasePercentage?: number | null;
        sluggingPercentage?: number | null;
        strikeouts?: number | null;
        onBasePlusSlugging?: number | null;
        onBasePlusSluggingPlus?: number | null;
      }) => {
        if (!b?.season) return;
        const key = `${b.season}-${b.team ?? ''}`;
        const row: SeasonRow = seasons.get(key) || {
          season: b.season,
          team: b.team ?? undefined,
        };
        const ab = b.atBats ?? 0;
        const h = b.hits ?? 0;
        const hr = b.homeRuns ?? 0;
        const pa = b.plateAppearances ?? 0;
        const bb = b.baseOnBalls ?? 0;
        const doubles = b.doubles ?? 0;
        const triples = b.triples ?? 0;
        const so = b.strikeouts ?? 0;
        const avg = ab > 0 ? (h / ab).toFixed(3) : '.000';
        const obp =
          b.onBasePercentage != null
            ? b.onBasePercentage.toFixed(3)
            : pa > 0
              ? ((h + bb) / pa).toFixed(3)
              : '.000';
        const slg =
          b.sluggingPercentage != null
            ? b.sluggingPercentage.toFixed(3)
            : ab > 0
              ? ((h + doubles + 2 * triples + 3 * hr) / ab).toFixed(3)
              : '.000';
        const ops =
          b.onBasePlusSlugging != null
            ? b.onBasePlusSlugging.toFixed(3)
            : (parseFloat(obp) + parseFloat(slg)).toFixed(3);
        // BABIP = (H - HR) / (AB - SO - HR); SF omitted — not in schema
        const babipDenominator = ab - so - hr;
        const babip =
          babipDenominator > 0
            ? ((h - hr) / babipDenominator).toFixed(3)
            : '.000';
        row.batting = {
          games: b.games ?? 0,
          pa,
          ab,
          h,
          doubles,
          triples,
          hr,
          rbi: b.rbi ?? 0,
          sb: b.stolenBases ?? 0,
          bb,
          so: b.strikeouts ?? 0,
          avg,
          obp,
          slg,
          ops,
          babip,
          opsPlus: b.onBasePlusSluggingPlus ?? null,
        };
        seasons.set(key, row);
      },
    );

    displayData.playerSeasonPitching?.forEach(
      (p: {
        season?: number | null;
        team?: string | null;
        games?: number | null;
        wins?: number | null;
        losses?: number | null;
        inningsPitched?: number | null;
        earnedRuns?: number | null;
        strikeouts?: number | null;
        baseOnBalls?: number | null;
        earnedRunAverage?: string | null;
        fip?: number | null;
        whip?: number | null;
        strikeoutsPerNine?: number | null;
        basesOnBallsPerNine?: number | null;
      }) => {
        if (!p?.season) return;
        const key = `${p.season}-${p.team ?? ''}`;
        const row: SeasonRow = seasons.get(key) || {
          season: p.season,
          team: p.team ?? undefined,
        };
        const ip = p.inningsPitched ?? 0;
        const er = p.earnedRuns ?? 0;
        const decimalInnings = ipToDecimalInnings(ip);
        const era =
          p.earnedRunAverage != null
            ? p.earnedRunAverage
            : decimalInnings > 0
              ? ((er * 9) / decimalInnings).toFixed(2)
              : '0.00';
        row.pitching = {
          games: p.games ?? 0,
          wins: p.wins ?? 0,
          losses: p.losses ?? 0,
          era,
          ip,
          so: p.strikeouts ?? 0,
          bb: p.baseOnBalls ?? 0,
          fip: p.fip != null ? p.fip.toFixed(2) : null,
          whip: p.whip != null ? p.whip.toFixed(3) : null,
          k9:
            p.strikeoutsPerNine != null ? p.strikeoutsPerNine.toFixed(1) : null,
          bb9:
            p.basesOnBallsPerNine != null
              ? p.basesOnBallsPerNine.toFixed(1)
              : null,
        };
        seasons.set(key, row);
      },
    );

    displayData.playerSeasonFielding?.forEach(
      (f: {
        season?: number | null;
        team?: string | null;
        games?: number | null;
        inningsDefended?: number | null;
        putouts?: number | null;
        assists?: number | null;
        errors?: number | null;
        position?: string | null;
        drs?: number | null;
        uzr?: number | null;
        oaa?: number | null;
      }) => {
        if (!f?.season) return;
        const key = `${f.season}-${f.team ?? ''}`;
        const row: SeasonRow = seasons.get(key) || {
          season: f.season,
          team: f.team ?? undefined,
        };
        if (row.fielding) {
          row.fielding.games += f.games ?? 0;
          row.fielding.inn += f.inningsDefended ?? 0;
          row.fielding.po += f.putouts ?? 0;
          row.fielding.a += f.assists ?? 0;
          row.fielding.e += f.errors ?? 0;
          const pos = f.position ?? '';
          if (pos && !row.fielding.position.includes(pos)) {
            row.fielding.position += (row.fielding.position ? ', ' : '') + pos;
          }
          // Accumulate sabermetrics (null when non-premium or unavailable).
          // Guard against NaN: if the running total is already NaN (e.g. from a
          // corrupt upstream value) treat it as 0 so subsequent rows don't
          // propagate NaN through the rest of the accumulation.
          if (f.drs != null)
            row.fielding.drs =
              (Number.isNaN(row.fielding.drs) ? 0 : (row.fielding.drs ?? 0)) +
              f.drs;
          if (f.uzr != null)
            row.fielding.uzr =
              (Number.isNaN(row.fielding.uzr) ? 0 : (row.fielding.uzr ?? 0)) +
              f.uzr;
          if (f.oaa != null)
            row.fielding.oaa =
              (Number.isNaN(row.fielding.oaa) ? 0 : (row.fielding.oaa ?? 0)) +
              f.oaa;
        } else {
          row.fielding = {
            games: f.games ?? 0,
            inn: f.inningsDefended ?? 0,
            po: f.putouts ?? 0,
            a: f.assists ?? 0,
            e: f.errors ?? 0,
            position: f.position ?? '',
            drs: f.drs ?? null,
            uzr: f.uzr ?? null,
            oaa: f.oaa ?? null,
          };
        }
        seasons.set(key, row);
      },
    );

    return Array.from(seasons.values()).sort((a, b) => b.season - a.season);
  }, [displayData]);

  // ------ Career totals ------
  const careerTotals = useMemo(() => {
    if (seasonRows.length === 0) return null;
    const batting = seasonRows.filter((r) => r.batting);
    const pitching = seasonRows.filter((r) => r.pitching);

    const totGames = batting.reduce((s, r) => s + (r.batting?.games ?? 0), 0);
    const totAB = batting.reduce((s, r) => s + (r.batting?.ab ?? 0), 0);
    const totH = batting.reduce((s, r) => s + (r.batting?.h ?? 0), 0);
    const totHR = batting.reduce((s, r) => s + (r.batting?.hr ?? 0), 0);
    const totRBI = batting.reduce((s, r) => s + (r.batting?.rbi ?? 0), 0);
    const totSB = batting.reduce((s, r) => s + (r.batting?.sb ?? 0), 0);
    const totBB = batting.reduce((s, r) => s + (r.batting?.bb ?? 0), 0);
    const totSO = batting.reduce((s, r) => s + (r.batting?.so ?? 0), 0);
    const totPA = batting.reduce((s, r) => s + (r.batting?.pa ?? 0), 0);
    const totDoubles = batting.reduce(
      (s, r) => s + (r.batting?.doubles ?? 0),
      0,
    );
    const totTriples = batting.reduce(
      (s, r) => s + (r.batting?.triples ?? 0),
      0,
    );

    const pGames = pitching.reduce((s, r) => s + (r.pitching?.games ?? 0), 0);
    const pWins = pitching.reduce((s, r) => s + (r.pitching?.wins ?? 0), 0);
    const pLosses = pitching.reduce((s, r) => s + (r.pitching?.losses ?? 0), 0);
    const pTotalOuts = pitching.reduce(
      (s, r) => s + ipToOuts(r.pitching?.ip ?? 0),
      0,
    );
    const pIP = outsToBaseballIP(pTotalOuts);
    const pSO = pitching.reduce((s, r) => s + (r.pitching?.so ?? 0), 0);

    const years = seasonRows.map((r) => r.season);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const uniqueSeasons = new Set(years).size;

    const careerOBP = totAB + totBB > 0 ? (totH + totBB) / (totAB + totBB) : 0;
    const careerSLG =
      totAB > 0 ? (totH + totDoubles + 2 * totTriples + 3 * totHR) / totAB : 0;
    const careerOPS = careerOBP + careerSLG;

    const opsPlusSamples = batting.filter((r) => r.batting?.opsPlus != null);
    const opsPlusTotalPA = opsPlusSamples.reduce(
      (s, r) => s + (r.batting?.pa ?? 0),
      0,
    );
    const careerOPSPlus =
      opsPlusTotalPA > 0
        ? opsPlusSamples.reduce(
            (s, r) => s + (r.batting?.opsPlus ?? 0) * (r.batting?.pa ?? 0),
            0,
          ) / opsPlusTotalPA
        : null;

    const babipDenom = totAB - totSO - totHR;
    const careerBABIP = babipDenom > 0 ? (totH - totHR) / babipDenom : null;

    return {
      hasBatting: batting.length > 0,
      hasPitching: pitching.length > 0,
      hasFielding: seasonRows.some((r) => r.fielding),
      seasons: uniqueSeasons,
      minYear,
      maxYear,
      games: totGames,
      ab: totAB,
      h: totH,
      hr: totHR,
      rbi: totRBI,
      sb: totSB,
      avg: totAB > 0 ? (totH / totAB).toFixed(3) : '.000',
      ops: careerOPS.toFixed(3),
      opsPlus:
        careerOPSPlus != null ? Math.round(careerOPSPlus).toString() : null,
      babip: careerBABIP != null ? careerBABIP.toFixed(3) : null,
      pGames,
      pWins,
      pLosses,
      pIP,
      pSO,
      totPA,
    };
  }, [seasonRows]);

  // ------ Table data ------
  const battingTableRows = useMemo(() => {
    const base = seasonRows
      .filter((r) => r.batting != null)
      .map((r) => {
        const row: (string | number)[] = [
          r.team ? `${r.season} ${r.team}` : r.season,
          r.batting?.games ?? 0,
          r.batting?.pa ?? 0,
          r.batting?.ab ?? 0,
          r.batting?.h ?? 0,
          r.batting?.hr ?? 0,
          r.batting?.rbi ?? 0,
          r.batting?.sb ?? 0,
          r.batting?.avg ?? '',
          r.batting?.obp ?? '',
          r.batting?.slg ?? '',
        ];
        if (hasAdvancedBatting) {
          row.push(
            r.batting?.ops ?? '',
            r.batting?.babip ?? '',
            r.batting?.opsPlus ?? '—',
          );
        }
        return row;
      });
    return base;
  }, [seasonRows, hasAdvancedBatting]);

  const pitchingTableRows = useMemo(
    () =>
      seasonRows
        .filter((r) => r.pitching != null)
        .map((r) => {
          const base: (string | number)[] = [
            r.team ? `${r.season} ${r.team}` : r.season,
            r.pitching?.games ?? 0,
            `${r.pitching?.wins ?? 0}-${r.pitching?.losses ?? 0}`,
            r.pitching?.era ?? 0,
            outsToBaseballIP(ipToOuts(r.pitching?.ip ?? 0)),
            r.pitching?.so ?? 0,
            r.pitching?.bb ?? 0,
          ];
          if (hasPremiumPitching) {
            base.push(
              r.pitching?.fip ?? '—',
              r.pitching?.whip ?? '—',
              r.pitching?.k9 ?? '—',
              r.pitching?.bb9 ?? '—',
            );
          }
          return base;
        }),
    [seasonRows, hasPremiumPitching],
  );

  const fieldingRows = useMemo(() => {
    if (!displayData?.playerSeasonFielding) return [];
    return [...displayData.playerSeasonFielding]
      .filter(
        (
          f,
        ): f is NonNullable<typeof f> & {
          season: number;
        } => f != null && f.season != null,
      )
      .map((f) => ({
        season: f.season,
        team: f.team ?? undefined,
        position: f.position ?? '',
        games: f.games ?? 0,
        inn: f.inningsDefended ?? 0,
        po: f.putouts ?? 0,
        a: f.assists ?? 0,
        e: f.errors ?? 0,
        drs: f.drs ?? null,
        uzr: f.uzr ?? null,
        oaa: f.oaa ?? null,
      }))
      .sort((a, b) => b.season - a.season || b.inn - a.inn);
  }, [displayData]);

  const fieldingTableRows = useMemo(
    () =>
      fieldingRows.map((r) => {
        const base: (string | number)[] = [
          r.team ? `${r.season} ${r.team}` : r.season,
          r.position,
          r.games,
          outsToBaseballIP(ipToOuts(r.inn)),
          r.po,
          r.a,
          r.e,
        ];
        if (hasPremiumFielding) {
          base.push(
            r.drs != null && !Number.isNaN(r.drs)
              ? Number(r.drs.toFixed(1))
              : '—',
            r.uzr != null && !Number.isNaN(r.uzr)
              ? Number(r.uzr.toFixed(1))
              : '—',
            r.oaa != null && !Number.isNaN(r.oaa)
              ? Number(r.oaa.toFixed(1))
              : '—',
          );
        }
        return base;
      }),
    [fieldingRows, hasPremiumFielding],
  );

  // ------ Available tabs ------
  const hasBattingArc = (displayArcData?.arcBatting?.length ?? 0) > 0;
  const hasPitchingArc = (displayArcData?.arcPitching?.length ?? 0) > 0;

  const availableTabs = useMemo(() => {
    const tabs: { key: StatsTab; label: string }[] = [];
    if (hasBattingArc || hasPitchingArc)
      tabs.push({ key: 'career-arc', label: 'Career Arc' });
    if (battingTableRows.length > 0)
      tabs.push({ key: 'batting', label: 'Batting' });
    if (pitchingTableRows.length > 0)
      tabs.push({ key: 'pitching', label: 'Pitching' });
    if (fieldingTableRows.length > 0)
      tabs.push({ key: 'fielding', label: 'Fielding' });
    return tabs;
  }, [
    hasBattingArc,
    hasPitchingArc,
    battingTableRows,
    pitchingTableRows,
    fieldingTableRows,
  ]);

  // Derive the displayed tab synchronously (LS-6992): useMemo prevents the
  // one-frame flash of empty content that occurred with a post-render useEffect.
  const effectiveActiveTab = useMemo((): StatsTab => {
    if (availableTabs.length === 0) return activeTab;
    return availableTabs.some((t) => t.key === activeTab)
      ? activeTab
      : availableTabs[0].key;
  }, [availableTabs, activeTab]);

  // Sync state after fallback so stale activeTab doesn't cause later renders to
  // jump back to an unexpected tab when availableTabs grows (e.g. arc data loads).
  useEffect(() => {
    if (effectiveActiveTab !== activeTab) {
      setActiveTab(effectiveActiveTab);
    }
  }, [effectiveActiveTab, activeTab]);

  // ------ Focus restoration (LS-6966) ------
  // BaseModal uses hideHeader so the X button calls onOpenChange(false) directly
  // rather than going through Dialog.Close. Radix therefore doesn't automatically
  // return focus to the triggering element; we save it on open and restore it on
  // close so keyboard users land back where they started. ESC is handled by the
  // underlying Radix Dialog primitive and also triggers this path.
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
    } else {
      const el = previousFocusRef.current;
      previousFocusRef.current = null;
      el?.focus();
    }
  }, [open]);

  // Reset arcMode to a sane default whenever the viewed player changes so
  // state from a previous player is never carried over (LS-6975).
  useEffect(() => {
    setArcMode('batting');
  }, [playerId]);

  // Once arc data resolves, correct pitcher-only players to 'pitching'.
  useEffect(() => {
    if (!hasBattingArc && hasPitchingArc) {
      setArcMode('pitching');
    }
  }, [hasBattingArc, hasPitchingArc]);

  // ------ Career stat tile rows ------
  const battingTiles: CareerTile[] = useMemo(() => {
    if (!careerTotals?.hasBatting) return [];
    const tiles: CareerTile[] = [
      { label: 'Games', value: careerTotals.games.toLocaleString('en-US') },
      { label: 'AVG', value: careerTotals.avg, accent: true },
      { label: 'Home Runs', value: careerTotals.hr.toLocaleString('en-US') },
      { label: 'RBI', value: careerTotals.rbi.toLocaleString('en-US') },
      { label: 'Hits', value: careerTotals.h.toLocaleString('en-US') },
      {
        label: 'Stolen Bases',
        value: careerTotals.sb.toLocaleString('en-US'),
      },
    ];
    if (hasPremiumBatting) {
      tiles.push({ label: 'OPS', value: careerTotals.ops, accent: true });
      if (careerTotals.opsPlus != null) {
        tiles.push({ label: 'OPS+', value: careerTotals.opsPlus });
      }
      if (careerTotals.babip != null) {
        tiles.push({ label: 'BABIP', value: careerTotals.babip });
      }
    }
    return tiles;
  }, [careerTotals, hasPremiumBatting]);

  const pitchingTiles: CareerTile[] = useMemo(() => {
    if (!careerTotals?.hasPitching) return [];
    return [
      { label: 'Games', value: careerTotals.pGames.toLocaleString('en-US') },
      {
        label: 'Record',
        value: `${careerTotals.pWins}–${careerTotals.pLosses}`,
        accent: true,
      },
      { label: 'Innings', value: careerTotals.pIP },
      { label: 'Strikeouts', value: careerTotals.pSO.toLocaleString('en-US') },
    ];
  }, [careerTotals]);

  // ------ Eyebrow text ------
  const eyebrowText = careerTotals
    ? `Player · ${careerTotals.seasons} Season${careerTotals.seasons !== 1 ? 's' : ''} · ${careerTotals.minYear}–${careerTotals.maxYear}`
    : 'Player';

  // ------ Era-tinted background — radial wash keyed off the player's position ------
  const headerAccentColor = position
    ? getPositionColor('baseball', position)
    : undefined;
  const mastheadBackground = headerAccentColor
    ? `radial-gradient(ellipse at 100% 0%, ${withAlpha(headerAccentColor, 0.18)} 0%, transparent 55%), radial-gradient(ellipse at 0% 100%, ${withAlpha(headerAccentColor, 0.1)} 0%, transparent 50%), ${BG_DARK}`
    : BG_DARK;

  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      title={resolvedPlayerName}
      maxWidth={1200}
      hideHeader
    >
      <ScrollView
        maxHeight="min(88dvh, calc(100dvh - 32px))"
        backgroundColor={BG_DARK}
      >
        <YStack
          padding={24}
          $sm={{ padding: 16 }}
          style={{ background: mastheadBackground }}
          // Stable id for the whole modal body — the e2e detail surface scopes
          // reads here instead of the generic aria-modal selector (ADR-0016
          // stage 3). This YStack wraps every state (masthead, loading, error,
          // empty, cards, tables), so it is present whenever the modal is open.
          data-testid="player-detail-modal"
        >
          {/* ── Back button for in-app context (LS-5578) ── */}
          {onBack && (
            <button
              onClick={onBack}
              style={{
                alignSelf: 'flex-start',
                marginBottom: '1rem',
                padding: '0.4rem 0.8rem',
                backgroundColor: 'transparent',
                color: WHITE,
                border: `1px solid rgba(197,165,90,0.2)`,
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontFamily: "'Big Shoulders Display', sans-serif",
                letterSpacing: '0.3px',
                fontSize: 14,
              }}
            >
              ← Back
            </button>
          )}
          {/* ── Editorial masthead ── */}
          <XStack
            gap={16}
            alignItems="center"
            paddingBottom={20}
            borderBottomWidth={1}
            borderBottomColor={STATS_BORDER}
            flexWrap="wrap"
          >
            <PortraitAvatar initials={initials} accent={headerAccentColor} />
            <YStack flex={1} gap={4} minWidth={200} $sm={{ minWidth: 0 }}>
              <Eyebrow>{eyebrowText}</Eyebrow>
              <EditorialHeading>{resolvedPlayerName}</EditorialHeading>
            </YStack>
            {onViewFullPage && (
              <Button
                size="$3"
                circular
                icon={ExternalLink}
                aria-label="Open full page"
                onPress={onViewFullPage}
                backgroundColor={withAlpha(WHITE, 0.08)}
                borderColor={STATS_BORDER}
                borderWidth={1}
                color={TEXT_INTERFACE}
                hoverStyle={{ backgroundColor: withAlpha(WHITE, 0.14) }}
                pressStyle={{ backgroundColor: withAlpha(WHITE, 0.18) }}
              />
            )}
            <Button
              size="$3"
              circular
              icon={X}
              aria-label="Close"
              onPress={() => onOpenChange(false)}
              backgroundColor={withAlpha(WHITE, 0.08)}
              borderColor={STATS_BORDER}
              borderWidth={1}
              color={TEXT_INTERFACE}
              hoverStyle={{ backgroundColor: withAlpha(WHITE, 0.14) }}
              pressStyle={{ backgroundColor: withAlpha(WHITE, 0.18) }}
            />
          </XStack>

          {/* ── Loading ── */}
          {loading && !displayData && (
            <YStack
              alignItems="center"
              paddingVertical={48}
              data-testid="player-detail-loading"
            >
              <Spinner size="large" color={BRAND_GOLD} />
              <Text
                marginTop={12}
                color={TEXT_TERTIARY}
                style={{ fontFamily: FONT_BODY, fontStyle: 'italic' }}
              >
                Loading player statistics…
              </Text>
            </YStack>
          )}

          {/* ── Error ── */}
          {error && (
            <YStack
              data-testid="player-detail-error"
              marginTop={20}
              backgroundColor={SURFACE_CARD}
              padding={28}
              borderRadius={16}
              borderWidth={1}
              borderColor={withAlpha(BRAND_SEAM_RED, 0.35)}
            >
              <Text
                color={WHITE}
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 22,
                }}
              >
                We couldn't load this player
              </Text>
              <Text
                color={TEXT_SECONDARY}
                marginTop={6}
                style={{ fontFamily: FONT_BODY }}
              >
                {error.message}
              </Text>
            </YStack>
          )}

          {/* ── Empty state ── */}
          {!!displayData && !error && seasonRows.length === 0 && (
            <YStack
              alignItems="center"
              paddingVertical={48}
              marginTop={20}
              backgroundColor={SURFACE_CARD}
              borderWidth={1}
              borderColor={STATS_BORDER}
              borderStyle="dashed"
              borderRadius={16}
              data-testid="player-detail-empty"
            >
              <Text
                color={WHITE}
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 28,
                  letterSpacing: '-0.01em',
                }}
              >
                No season statistics found.
              </Text>
              <Text
                color={TEXT_SECONDARY}
                marginTop={8}
                style={{ fontFamily: FONT_BODY, fontStyle: 'italic' }}
              >
                This player has no major-league seasons in the archive.
              </Text>
            </YStack>
          )}

          {/* ── Positions band ── */}
          {!!displayData && !error && (
            <XStack
              gap={10}
              alignItems="center"
              flexWrap="wrap"
              paddingVertical={14}
              borderBottomWidth={1}
              borderBottomColor={STATS_BORDER}
              data-testid="eligible-positions"
            >
              <Text
                color={TEXT_TERTIARY}
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                }}
              >
                Eligible
              </Text>
              {eligiblePositions.length > 0 ? (
                eligiblePositions.map((pos) => (
                  <PositionBadge
                    key={pos}
                    position={pos}
                    onPress={
                      onPositionClick ? () => onPositionClick(pos) : undefined
                    }
                  />
                ))
              ) : (
                <Tooltip placement="top">
                  <Tooltip.Trigger>
                    <Text
                      color={TEXT_TERTIARY}
                      style={{
                        fontFamily: FONT_BODY,
                        fontStyle: 'italic',
                        fontSize: 13,
                        textDecoration: 'underline dotted',
                        cursor: 'default',
                      }}
                      data-testid="eligible-positions-unranked"
                    >
                      No fantasy eligibility yet
                    </Text>
                  </Tooltip.Trigger>
                  <Tooltip.Content
                    enterStyle={{ x: 0, y: -5, opacity: 0, scale: 0.9 }}
                    exitStyle={{ x: 0, y: -5, opacity: 0, scale: 0.9 }}
                    scale={1}
                    x={0}
                    y={0}
                    opacity={1}
                    animation={[
                      'quick',
                      { opacity: { overshootClamping: true } },
                    ]}
                  >
                    <Tooltip.Arrow />
                    <Text
                      color={TEXT_INTERFACE}
                      style={{ fontFamily: FONT_BODY, fontSize: 13 }}
                    >
                      Rookies and recent call-ups may not yet have fantasy
                      eligibility assigned for this season.
                    </Text>
                  </Tooltip.Content>
                </Tooltip>
              )}
            </XStack>
          )}

          {/* ── Hero stats ── */}
          {!!displayData && !error && careerTotals && (
            <YStack gap={14} marginTop={20} data-testid="hero-stats">
              {careerTotals.hasBatting && (
                <XStack
                  data-testid="hero-stats-batting"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                    gap: 14,
                  }}
                >
                  <HeroStat
                    label="Career AVG"
                    value={careerTotals.avg}
                    accent
                  />
                  <HeroStat
                    label="Home Runs"
                    value={careerTotals.hr.toLocaleString('en-US')}
                  />
                  <HeroStat
                    label="Runs Batted In"
                    value={careerTotals.rbi.toLocaleString('en-US')}
                  />
                </XStack>
              )}
              {careerTotals.hasPitching && (
                <XStack
                  data-testid="hero-stats-pitching"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                    gap: 14,
                  }}
                >
                  <HeroStat
                    label="Record"
                    value={`${careerTotals.pWins}–${careerTotals.pLosses}`}
                    accent
                  />
                  <HeroStat
                    label="Strikeouts"
                    value={careerTotals.pSO.toLocaleString('en-US')}
                  />
                  <HeroStat label="Innings Pitched" value={careerTotals.pIP} />
                </XStack>
              )}
            </YStack>
          )}

          {/* ── Career batting grid ── */}
          {!!displayData && !error && battingTiles.length > 0 && (
            <YStack data-testid="career-batting-card">
              <SectionHead
                title="Career Batting"
                meta={
                  careerTotals
                    ? `Aggregated across ${careerTotals.seasons} season${careerTotals.seasons !== 1 ? 's' : ''}`
                    : undefined
                }
              />
              <XStack gap={8} flexWrap="wrap">
                {battingTiles.map((t) => (
                  <CareerStatTile
                    key={t.label}
                    label={t.label}
                    value={t.value}
                    accent={t.accent}
                  />
                ))}
              </XStack>
            </YStack>
          )}

          {/* ── Career pitching grid ── */}
          {!!displayData && !error && pitchingTiles.length > 0 && (
            <YStack data-testid="career-pitching-card">
              <SectionHead
                title="Career Pitching"
                meta={
                  careerTotals
                    ? `Aggregated across ${careerTotals.seasons} season${careerTotals.seasons !== 1 ? 's' : ''}`
                    : undefined
                }
              />
              <XStack gap={8} flexWrap="wrap">
                {pitchingTiles.map((t) => (
                  <CareerStatTile
                    key={t.label}
                    label={t.label}
                    value={t.value}
                    accent={t.accent}
                  />
                ))}
              </XStack>
            </YStack>
          )}

          {/* ── Tabs ── */}
          {!!displayData && !error && availableTabs.length > 0 && (
            <>
              <YStack
                marginTop={28}
                borderBottomWidth={1}
                borderBottomColor={STATS_BORDER}
                position="relative"
                overflow="hidden"
              >
                <XStack
                  overflow="scroll"
                  style={{ scrollSnapType: 'x mandatory' }}
                >
                  {availableTabs.map((tab) => (
                    <EditorialTab
                      key={tab.key}
                      label={tab.label}
                      tabKey={tab.key}
                      active={effectiveActiveTab === tab.key}
                      onPress={() => setActiveTab(tab.key)}
                    />
                  ))}
                </XStack>
                <YStack
                  position="absolute"
                  top={0}
                  right={0}
                  bottom={0}
                  width={48}
                  pointerEvents="none"
                  style={{
                    background: `linear-gradient(to right, transparent, ${BG_DARK})`,
                  }}
                />
              </YStack>

              {/* Career Arc */}
              {effectiveActiveTab === 'career-arc' && (
                <YStack gap={12} marginTop={22}>
                  {hasBattingArc && hasPitchingArc && (
                    <XStack gap={4}>
                      <EditorialTab
                        label="Batting"
                        tabKey="arc-batting"
                        active={arcMode === 'batting'}
                        onPress={() => setArcMode('batting')}
                      />
                      <EditorialTab
                        label="Pitching"
                        tabKey="arc-pitching"
                        active={arcMode === 'pitching'}
                        onPress={() => setArcMode('pitching')}
                      />
                    </XStack>
                  )}
                  <YStack
                    padding={22}
                    backgroundColor={SURFACE_SUBTLE}
                    borderWidth={1}
                    borderColor={STATS_BORDER}
                    borderRadius={16}
                  >
                    <ChartErrorBoundary>
                      <React.Suspense fallback={<Spinner color={BRAND_GOLD} />}>
                        <CareerArcChart
                          key={playerId ?? 0}
                          battingSeasons={displayArcData?.arcBatting}
                          pitchingSeasons={displayArcData?.arcPitching}
                          mode={hasBattingArc ? arcMode : 'pitching'}
                        />
                      </React.Suspense>
                    </ChartErrorBoundary>
                  </YStack>
                </YStack>
              )}

              {effectiveActiveTab === 'batting' &&
                battingTableRows.length > 0 && (
                  <>
                    <SectionHead title="Season by Season · Batting" />
                    <EditorialTable
                      caption="Season batting statistics"
                      headers={
                        hasAdvancedBatting
                          ? [
                              'Year',
                              'G',
                              'PA',
                              'AB',
                              'H',
                              'HR',
                              'RBI',
                              'SB',
                              'AVG',
                              'OBP',
                              'SLG',
                              'OPS',
                              'BABIP',
                              'OPS+',
                            ]
                          : [
                              'Year',
                              'G',
                              'PA',
                              'AB',
                              'H',
                              'HR',
                              'RBI',
                              'SB',
                              'AVG',
                              'OBP',
                              'SLG',
                            ]
                      }
                      rows={battingTableRows}
                    />
                  </>
                )}

              {effectiveActiveTab === 'pitching' &&
                pitchingTableRows.length > 0 && (
                  <>
                    <SectionHead title="Season by Season · Pitching" />
                    <EditorialTable
                      caption="Season pitching statistics"
                      headers={[
                        'Year',
                        'G',
                        'W-L',
                        'ERA',
                        'IP',
                        'SO',
                        'BB',
                        ...(hasPremiumPitching
                          ? ['FIP', 'WHIP', 'K/9', 'BB/9']
                          : []),
                      ]}
                      rows={pitchingTableRows}
                    />
                  </>
                )}

              {effectiveActiveTab === 'fielding' &&
                fieldingTableRows.length > 0 && (
                  <>
                    <SectionHead title="Season by Season · Fielding" />
                    <EditorialTable
                      caption="Season fielding statistics"
                      headers={
                        hasPremiumFielding
                          ? [
                              'Year',
                              'POS',
                              'G',
                              'INN',
                              'PO',
                              'A',
                              'E',
                              'DRS',
                              'UZR',
                              'OAA',
                            ]
                          : ['Year', 'POS', 'G', 'INN', 'PO', 'A', 'E']
                      }
                      rows={fieldingTableRows}
                    />
                  </>
                )}
            </>
          )}
        </YStack>
      </ScrollView>
    </BaseModal>
  );
}
