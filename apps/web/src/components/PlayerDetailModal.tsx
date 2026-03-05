import React, { useMemo, useState } from 'react';
import { ScrollView, Separator, Spinner, Text, XStack, YStack } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import { BaseModal } from './BaseModal';
import { StatCard, type StatRowData } from './StatCard';
import { StatTable } from './StatTable';
import { useGetAllPlayerSeasonStatsQuery } from '../api/db/graphql.generated';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  getPositionColor,
  TEXT_MUTED,
  WHITE,
  withAlpha,
} from '../constants/colors';

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

type StatsTab = 'batting' | 'pitching' | 'fielding';

// ---------------------------------------------------------------------------
// Tab Button
// ---------------------------------------------------------------------------

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <YStack
      cursor="pointer"
      paddingHorizontal="$3"
      paddingVertical="$2"
      borderBottomWidth={2}
      borderBottomColor={active ? BRAND_NAVY_LIGHT : 'transparent'}
      hoverStyle={{
        backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.12),
      }}
      pressStyle={{ scale: 0.97 }}
      animation="quick"
      onPress={onPress}
    >
      <Text
        fontSize="$3"
        fontWeight={active ? '700' : '500'}
        color={active ? BRAND_GOLD_LIGHT : TEXT_MUTED}
      >
        {label}
      </Text>
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// Position Badge
// ---------------------------------------------------------------------------

function PositionBadge({ position }: { position: string }) {
  return (
    <Text
      fontSize="$2"
      fontWeight="700"
      color={WHITE}
      backgroundColor={getPositionColor(position)}
      paddingHorizontal="$2"
      paddingVertical="$1"
      borderRadius="$2"
    >
      {position}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Position Avatar (circle with position initials)
// ---------------------------------------------------------------------------

function PositionAvatar({ position }: { position: string }) {
  return (
    <XStack
      width={48}
      height={48}
      borderRadius={24}
      backgroundColor={getPositionColor(position)}
      alignItems="center"
      justifyContent="center"
      borderWidth={2}
      borderColor={withAlpha(WHITE, 0.25)}
    >
      <Text fontSize="$4" fontWeight="bold" color={WHITE}>
        {position}
      </Text>
    </XStack>
  );
}

// ---------------------------------------------------------------------------
// Hero Stat Chip
// ---------------------------------------------------------------------------

function HeroStat({ label, value }: { label: string; value: string | number }) {
  return (
    <YStack
      alignItems="center"
      paddingHorizontal="$3"
      paddingVertical="$2"
      backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.15)}
      borderRadius="$3"
      borderWidth={1}
      borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.3)}
      minWidth={72}
      animation="quick"
      hoverStyle={{
        backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.25),
        borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.5),
      }}
    >
      <Text fontSize="$5" fontWeight="bold" color={BRAND_GOLD_LIGHT}>
        {value}
      </Text>
      <Text fontSize="$1" fontWeight="600" color={TEXT_MUTED} marginTop="$1">
        {label}
      </Text>
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * PlayerDetailModal — Full-featured player detail dialog.
 *
 * Shows career hero stats, summary cards, and tabbed season-by-season
 * batting / pitching / fielding statistics.
 *
 * Built on shared `BaseModal`, `StatCard`, and `StatTable` components
 * following Legacy Sports UI Standards.
 */
export function PlayerDetailModal({
  playerId,
  playerName,
  position,
  open,
  onOpenChange,
}: PlayerDetailModalProps) {
  LOGGER.debug('[PlayerDetailModal] render', { playerId, playerName, open });

  const [activeTab, setActiveTab] = useState<StatsTab>('batting');

  // ------ Data fetching ------
  const { data, loading, error } = useGetAllPlayerSeasonStatsQuery({
    variables: { playerId: playerId ?? 0 },
    skip: !playerId || !open,
  });

  // ------ Transform to season rows ------
  const seasonRows = useMemo((): SeasonRow[] => {
    if (!data) return [];

    const seasons = new Map<number, SeasonRow>();

    // Batting
    data.playerSeasonBatting?.forEach(
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

    // Pitching
    data.playerSeasonPitching?.forEach(
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
        const era = ip > 0 ? ((er * 9) / ip).toFixed(2) : '0.00';

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

    // Fielding (aggregate positions per season)
    data.playerSeasonFielding?.forEach(
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
  }, [data]);

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
    const pIP = pitching.reduce((s, r) => s + (r.pitching?.ip ?? 0), 0);
    const pSO = pitching.reduce((s, r) => s + (r.pitching?.so ?? 0), 0);

    return {
      hasBatting: batting.length > 0,
      hasPitching: pitching.length > 0,
      hasFielding: seasonRows.some((r) => r.fielding),
      seasons: seasonRows.length,
      // batting
      games: totGames,
      ab: totAB,
      h: totH,
      hr: totHR,
      rbi: totRBI,
      sb: totSB,
      avg: totAB > 0 ? (totH / totAB).toFixed(3) : '.000',
      // pitching
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
        .filter((r) => r.batting)
        .map((r) => [
          r.season,
          r.batting!.games,
          r.batting!.pa,
          r.batting!.ab,
          r.batting!.h,
          r.batting!.hr,
          r.batting!.rbi,
          r.batting!.sb,
          r.batting!.avg,
        ]),
    [seasonRows],
  );

  const pitchingTableRows = useMemo(
    () =>
      seasonRows
        .filter((r) => r.pitching)
        .map((r) => [
          r.season,
          r.pitching!.games,
          `${r.pitching!.wins}-${r.pitching!.losses}`,
          r.pitching!.era,
          r.pitching!.ip,
          r.pitching!.so,
          r.pitching!.bb,
        ]),
    [seasonRows],
  );

  const fieldingTableRows = useMemo(
    () =>
      seasonRows
        .filter((r) => r.fielding)
        .map((r) => [
          r.season,
          r.fielding!.position,
          r.fielding!.games,
          r.fielding!.inn,
          r.fielding!.po,
          r.fielding!.a,
          r.fielding!.e,
        ]),
    [seasonRows],
  );

  // ------ Available tabs ------
  const availableTabs = useMemo(() => {
    const tabs: { key: StatsTab; label: string }[] = [];
    if (battingTableRows.length > 0)
      tabs.push({ key: 'batting', label: 'Batting' });
    if (pitchingTableRows.length > 0)
      tabs.push({ key: 'pitching', label: 'Pitching' });
    if (fieldingTableRows.length > 0)
      tabs.push({ key: 'fielding', label: 'Fielding' });
    return tabs;
  }, [battingTableRows, pitchingTableRows, fieldingTableRows]);

  // ------ Career stat card data ------
  const battingCardRows = useMemo((): StatRowData[] => {
    if (!careerTotals?.hasBatting) return [];
    return [
      { label: 'Games', value: careerTotals.games },
      { label: 'Batting Average', value: careerTotals.avg, accent: true },
      { label: 'Home Runs', value: careerTotals.hr },
      { label: 'RBI', value: careerTotals.rbi },
      { label: 'Hits', value: careerTotals.h },
      { label: 'Stolen Bases', value: careerTotals.sb },
    ];
  }, [careerTotals]);

  const pitchingCardRows = useMemo((): StatRowData[] => {
    if (!careerTotals?.hasPitching) return [];
    return [
      { label: 'Games', value: careerTotals.pGames },
      {
        label: 'Record',
        value: `${careerTotals.pWins}\u2013${careerTotals.pLosses}`,
        accent: true,
      },
      { label: 'Innings Pitched', value: careerTotals.pIP },
      { label: 'Strikeouts', value: careerTotals.pSO },
    ];
  }, [careerTotals]);

  // ------ Subtitle ------
  const subtitle = careerTotals
    ? `${careerTotals.seasons} season${careerTotals.seasons !== 1 ? 's' : ''}`
    : undefined;

  // ------ Title badge ------
  const titleBadge = position ? (
    <PositionBadge position={position} />
  ) : undefined;

  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      title={playerName}
      titleId="player-detail-title"
      subtitle={subtitle}
      titleBadge={titleBadge}
    >
      <ScrollView maxHeight="calc(88vh - 100px)">
        <YStack padding="$4" gap="$4">
          {/* ── Loading ── */}
          {loading && (
            <YStack alignItems="center" paddingVertical="$8">
              <Spinner size="large" color={BRAND_NAVY_LIGHT} />
              <Text marginTop="$3" color={TEXT_MUTED}>
                Loading player statistics…
              </Text>
            </YStack>
          )}

          {/* ── Error ── */}
          {error && (
            <YStack
              backgroundColor={withAlpha(BRAND_SEAM_RED, 0.12)}
              padding="$4"
              borderRadius="$3"
              borderWidth={1}
              borderColor={withAlpha(BRAND_SEAM_RED, 0.35)}
            >
              <Text color={BRAND_SEAM_RED} fontWeight="600">
                Error loading stats
              </Text>
              <Text
                color={withAlpha(BRAND_SEAM_RED, 0.8)}
                fontSize="$2"
                marginTop="$1"
              >
                {error.message}
              </Text>
            </YStack>
          )}

          {/* ── Empty state ── */}
          {!loading && !error && seasonRows.length === 0 && (
            <YStack
              alignItems="center"
              paddingVertical="$8"
              backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.08)}
              borderRadius="$3"
            >
              <Text color={TEXT_MUTED} fontSize="$4">
                No season statistics found
              </Text>
            </YStack>
          )}

          {/* ── Hero stats + position avatar ── */}
          {!loading && !error && careerTotals && (
            <>
              <XStack gap="$3" alignItems="center" flexWrap="wrap">
                {position && <PositionAvatar position={position} />}
                <XStack gap="$2" flexWrap="wrap" flex={1}>
                  {careerTotals.hasBatting && (
                    <>
                      <HeroStat label="AVG" value={careerTotals.avg} />
                      <HeroStat label="HR" value={careerTotals.hr} />
                      <HeroStat label="RBI" value={careerTotals.rbi} />
                    </>
                  )}
                  {careerTotals.hasPitching && (
                    <>
                      <HeroStat
                        label="W-L"
                        value={`${careerTotals.pWins}\u2013${careerTotals.pLosses}`}
                      />
                      <HeroStat label="SO" value={careerTotals.pSO} />
                    </>
                  )}
                </XStack>
              </XStack>

              <Separator borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)} />
            </>
          )}

          {/* ── Career summary cards ── */}
          {!loading && !error && careerTotals && (
            <XStack gap="$3" flexWrap="wrap">
              {battingCardRows.length > 0 && (
                <YStack flex={1} minWidth={280}>
                  <StatCard title="Career Batting" rows={battingCardRows} />
                </YStack>
              )}
              {pitchingCardRows.length > 0 && (
                <YStack flex={1} minWidth={280}>
                  <StatCard title="Career Pitching" rows={pitchingCardRows} />
                </YStack>
              )}
            </XStack>
          )}

          {/* ── Season-by-season tabs ── */}
          {!loading && !error && availableTabs.length > 0 && (
            <>
              <Separator borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)} />

              {/* Tab bar */}
              <XStack
                gap="$1"
                borderBottomWidth={1}
                borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
              >
                {availableTabs.map((tab) => (
                  <TabButton
                    key={tab.key}
                    label={tab.label}
                    active={activeTab === tab.key}
                    onPress={() => setActiveTab(tab.key)}
                  />
                ))}
              </XStack>

              {/* Tab content */}
              {activeTab === 'batting' && battingTableRows.length > 0 && (
                <StatTable
                  title="Batting by Season"
                  headers={[
                    'YEAR',
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
              )}

              {activeTab === 'pitching' && pitchingTableRows.length > 0 && (
                <StatTable
                  title="Pitching by Season"
                  headers={['YEAR', 'G', 'W-L', 'ERA', 'IP', 'SO', 'BB']}
                  rows={pitchingTableRows}
                />
              )}

              {activeTab === 'fielding' && fieldingTableRows.length > 0 && (
                <StatTable
                  title="Fielding by Season"
                  headers={['YEAR', 'POS', 'G', 'INN', 'PO', 'A', 'E']}
                  rows={fieldingTableRows}
                />
              )}
            </>
          )}
        </YStack>
      </ScrollView>
    </BaseModal>
  );
}
