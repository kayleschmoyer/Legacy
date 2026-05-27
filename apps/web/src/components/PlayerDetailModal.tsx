import React, { useEffect, useMemo, useState } from 'react';
import { Button, ScrollView, Spinner, Text, XStack, YStack } from 'tamagui';
import { X } from '@tamagui/lucide-icons';
import { LOGGER } from '@legacy-sports/logging';
import { BaseModal } from './BaseModal';
import type { CareerArcMode } from './CareerArcChart';
import {
  useGetAllPlayerSeasonStatsQuery,
  useGetPlayerCareerArcQuery,
} from '../api/db/graphql.generated';
import {
  ipToDecimalInnings,
  ipToOuts,
  outsToBaseballIP,
} from '../lib/scoring/ipUtils';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  getPositionColor,
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
}

interface SeasonRow {
  season: number;
  batting?: {
    games: number;
    pa: number;
    ab: number;
    h: number;
    hr: number;
    rbi: number;
    sb: number;
    avg: string;
    obp: string;
    slg: string;
  };
  pitching?: {
    games: number;
    wins: number;
    losses: number;
    era: string;
    ip: number;
    so: number;
    bb: number;
  };
  fielding?: {
    games: number;
    inn: number;
    po: number;
    a: number;
    e: number;
    position: string;
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

function PositionBadge({ position }: { position: string }) {
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
      flex={1}
      minWidth={120}
      padding={20}
      gap={6}
      backgroundColor={SURFACE_CARD}
      borderWidth={1}
      borderColor={STATS_BORDER}
      borderRadius={16}
      $sm={{ minWidth: 96, padding: 14 }}
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
          fontSize: 54,
          lineHeight: 1,
          letterSpacing: '-0.01em',
          fontVariantNumeric: 'tabular-nums',
        }}
        $sm={{ style: { fontSize: 30 } }}
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
      data-testid={`tab-${tabKey}`}
    >
      <Text
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

function EditorialTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: (string | number)[][];
}) {
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
          <XStack
            backgroundColor={SURFACE_PANEL}
            borderBottomWidth={1}
            borderBottomColor={STATS_BORDER}
            paddingVertical={12}
            paddingHorizontal={12}
          >
            {headers.map((h, i) => (
              <Text
                key={h}
                flex={i === 0 ? 1.2 : 1}
                minWidth={0}
                numberOfLines={1}
                color={TEXT_SECONDARY}
                textAlign={i === 0 ? 'left' : 'right'}
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                {h}
              </Text>
            ))}
          </XStack>
          {rows.map((cells, ri) => (
            <XStack
              key={String(cells[0])}
              paddingVertical={12}
              paddingHorizontal={12}
              borderBottomWidth={ri < rows.length - 1 ? 1 : 0}
              borderBottomColor={STATS_BORDER}
              hoverStyle={{
                backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.1),
              }}
            >
              {cells.map((cell, ci) => (
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
              ))}
            </XStack>
          ))}
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
}: PlayerDetailModalProps) {
  LOGGER.debug('[PlayerDetailModal] render', { playerId, playerName, open });

  const [activeTab, setActiveTab] = useState<StatsTab>('career-arc');
  const [arcMode, setArcMode] = useState<CareerArcMode>('batting');

  // ------ Data fetching ------
  const { data, previousData, loading, error } =
    useGetAllPlayerSeasonStatsQuery({
      variables: { playerId: playerId ?? 0 },
      skip: !playerId || !open,
    });

  const displayData = data ?? previousData;

  const { data: arcData } = useGetPlayerCareerArcQuery({
    variables: { playerId: playerId ?? 0 },
    skip: !playerId || !open,
  });

  const eligiblePositions = displayData?.player?.eligiblePositions ?? [];

  const firstName = data?.player?.firstName;
  const lastName = data?.player?.lastName;
  const resolvedPlayerName =
    firstName && lastName ? `${firstName} ${lastName}` : playerName;
  const initials = deriveInitials(resolvedPlayerName);

  // ------ Transform to season rows ------
  const seasonRows = useMemo((): SeasonRow[] => {
    if (!displayData) return [];
    const seasons = new Map<number, SeasonRow>();

    displayData.playerSeasonBatting?.forEach(
      (b: {
        season?: number | null;
        games?: number | null;
        plateAppearances?: number | null;
        atBats?: number | null;
        hits?: number | null;
        homeRuns?: number | null;
        rbi?: number | null;
        stolenBases?: number | null;
        baseOnBalls?: number | null;
      }) => {
        if (!b?.season) return;
        const row: SeasonRow = seasons.get(b.season) || { season: b.season };
        const ab = b.atBats ?? 0;
        const h = b.hits ?? 0;
        const pa = b.plateAppearances ?? 0;
        const bb = b.baseOnBalls ?? 0;
        const avg = ab > 0 ? (h / ab).toFixed(3) : '.000';
        const obp = pa > 0 ? ((h + bb) / pa).toFixed(3) : '.000';
        const slg =
          ab > 0 ? (((b.homeRuns ?? 0) * 4 + h) / ab).toFixed(3) : '.000';
        row.batting = {
          games: b.games ?? 0,
          pa,
          ab,
          h,
          hr: b.homeRuns ?? 0,
          rbi: b.rbi ?? 0,
          sb: b.stolenBases ?? 0,
          avg,
          obp,
          slg,
        };
        seasons.set(b.season, row);
      },
    );

    displayData.playerSeasonPitching?.forEach(
      (p: {
        season?: number | null;
        games?: number | null;
        wins?: number | null;
        losses?: number | null;
        inningsPitched?: number | null;
        earnedRuns?: number | null;
        strikeouts?: number | null;
        baseOnBalls?: number | null;
      }) => {
        if (!p?.season) return;
        const row: SeasonRow = seasons.get(p.season) || { season: p.season };
        const ip = p.inningsPitched ?? 0;
        const er = p.earnedRuns ?? 0;
        const decimalInnings = ipToDecimalInnings(ip);
        const era =
          decimalInnings > 0 ? ((er * 9) / decimalInnings).toFixed(2) : '0.00';
        row.pitching = {
          games: p.games ?? 0,
          wins: p.wins ?? 0,
          losses: p.losses ?? 0,
          era,
          ip,
          so: p.strikeouts ?? 0,
          bb: p.baseOnBalls ?? 0,
        };
        seasons.set(p.season, row);
      },
    );

    displayData.playerSeasonFielding?.forEach(
      (f: {
        season?: number | null;
        games?: number | null;
        inningsDefended?: number | null;
        putouts?: number | null;
        assists?: number | null;
        errors?: number | null;
        position?: string | null;
      }) => {
        if (!f?.season) return;
        const row: SeasonRow = seasons.get(f.season) || { season: f.season };
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
        } else {
          row.fielding = {
            games: f.games ?? 0,
            inn: f.inningsDefended ?? 0,
            po: f.putouts ?? 0,
            a: f.assists ?? 0,
            e: f.errors ?? 0,
            position: f.position ?? '',
          };
        }
        seasons.set(f.season, row);
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

    return {
      hasBatting: batting.length > 0,
      hasPitching: pitching.length > 0,
      hasFielding: seasonRows.some((r) => r.fielding),
      seasons: seasonRows.length,
      minYear,
      maxYear,
      games: totGames,
      ab: totAB,
      h: totH,
      hr: totHR,
      rbi: totRBI,
      sb: totSB,
      avg: totAB > 0 ? (totH / totAB).toFixed(3) : '.000',
      pGames,
      pWins,
      pLosses,
      pIP,
      pSO,
    };
  }, [seasonRows]);

  // ------ Table data ------
  const battingTableRows = useMemo(
    () =>
      seasonRows
        .filter((r) => r.batting != null)
        .map((r) => [
          r.season,
          r.batting?.games ?? 0,
          r.batting?.pa ?? 0,
          r.batting?.ab ?? 0,
          r.batting?.h ?? 0,
          r.batting?.hr ?? 0,
          r.batting?.rbi ?? 0,
          r.batting?.sb ?? 0,
          r.batting?.avg ?? '',
        ]),
    [seasonRows],
  );

  const pitchingTableRows = useMemo(
    () =>
      seasonRows
        .filter((r) => r.pitching != null)
        .map((r) => [
          r.season,
          r.pitching?.games ?? 0,
          `${r.pitching?.wins ?? 0}-${r.pitching?.losses ?? 0}`,
          r.pitching?.era ?? 0,
          r.pitching?.ip ?? 0,
          r.pitching?.so ?? 0,
          r.pitching?.bb ?? 0,
        ]),
    [seasonRows],
  );

  const fieldingTableRows = useMemo(
    () =>
      seasonRows
        .filter((r) => r.fielding != null)
        .map((r) => [
          r.season,
          r.fielding?.position ?? '',
          r.fielding?.games ?? 0,
          r.fielding?.inn ?? 0,
          r.fielding?.po ?? 0,
          r.fielding?.a ?? 0,
          r.fielding?.e ?? 0,
        ]),
    [seasonRows],
  );

  // ------ Available tabs ------
  const hasBattingArc = (arcData?.playerSeasonBatting?.length ?? 0) > 0;
  const hasPitchingArc = (arcData?.playerSeasonPitching?.length ?? 0) > 0;

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

  useEffect(() => {
    if (
      availableTabs.length > 0 &&
      !availableTabs.some((t) => t.key === activeTab)
    ) {
      setActiveTab(availableTabs[0].key);
    }
  }, [availableTabs, activeTab]);

  // ------ Career stat tile rows ------
  const battingTiles: CareerTile[] = useMemo(() => {
    if (!careerTotals?.hasBatting) return [];
    return [
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
  }, [careerTotals]);

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
      <ScrollView maxHeight="calc(88vh)" backgroundColor={BG_DARK}>
        <YStack
          padding={24}
          $sm={{ padding: 16 }}
          style={{ background: mastheadBackground }}
        >
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
          {!!displayData && !error && eligiblePositions.length > 0 && (
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
              {eligiblePositions.map((pos) => (
                <PositionBadge key={pos} position={pos} />
              ))}
            </XStack>
          )}

          {/* ── Hero stats ── */}
          {!!displayData && !error && careerTotals && (
            <XStack gap={14} flexWrap="wrap" marginTop={20}>
              {careerTotals.hasBatting && (
                <>
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
                </>
              )}
              {careerTotals.hasPitching && !careerTotals.hasBatting && (
                <>
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
                </>
              )}
            </XStack>
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
              <XStack
                marginTop={28}
                borderBottomWidth={1}
                borderBottomColor={STATS_BORDER}
                overflow="scroll"
              >
                {availableTabs.map((tab) => (
                  <EditorialTab
                    key={tab.key}
                    label={tab.label}
                    tabKey={tab.key}
                    active={activeTab === tab.key}
                    onPress={() => setActiveTab(tab.key)}
                  />
                ))}
              </XStack>

              {/* Career Arc */}
              {activeTab === 'career-arc' && (
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
                    <React.Suspense fallback={<Spinner color={BRAND_GOLD} />}>
                      <CareerArcChart
                        battingSeasons={arcData?.playerSeasonBatting}
                        pitchingSeasons={arcData?.playerSeasonPitching}
                        mode={hasBattingArc ? arcMode : 'pitching'}
                      />
                    </React.Suspense>
                  </YStack>
                </YStack>
              )}

              {activeTab === 'batting' && battingTableRows.length > 0 && (
                <>
                  <SectionHead
                    title="Season by Season · Batting"
                    meta="Newest first"
                  />
                  <EditorialTable
                    caption="Season batting statistics"
                    headers={[
                      'Year',
                      'G',
                      'PA',
                      'AB',
                      'H',
                      'HR',
                      'RBI',
                      'SB',
                      'AVG',
                    ]}
                    rows={battingTableRows}
                  />
                </>
              )}

              {activeTab === 'pitching' && pitchingTableRows.length > 0 && (
                <>
                  <SectionHead
                    title="Season by Season · Pitching"
                    meta="Newest first"
                  />
                  <EditorialTable
                    caption="Season pitching statistics"
                    headers={['Year', 'G', 'W-L', 'ERA', 'IP', 'SO', 'BB']}
                    rows={pitchingTableRows}
                  />
                </>
              )}

              {activeTab === 'fielding' && fieldingTableRows.length > 0 && (
                <>
                  <SectionHead
                    title="Season by Season · Fielding"
                    meta="Newest first"
                  />
                  <EditorialTable
                    caption="Season fielding statistics"
                    headers={['Year', 'POS', 'G', 'INN', 'PO', 'A', 'E']}
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
