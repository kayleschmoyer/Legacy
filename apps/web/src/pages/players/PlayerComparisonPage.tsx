import React, { useCallback, useMemo, useState } from 'react';
import {
  Button,
  H2,
  H3,
  H4,
  ScrollView,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { BarChart2, Plus, X } from '@tamagui/lucide-icons';
import {
  type GetPlayersWithStatsQuery,
  useGetAllPlayerSeasonStatsQuery,
  useGetPlayersWithStatsQuery,
} from '../../api/db/graphql.generated';
import { PremiumGate } from '../../components/PremiumGate';
import { useIsPremium } from '../../hooks/useIsPremium';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  SURFACE_CARD,
  SURFACE_PANEL,
  SURFACE_SUBTLE,
  TEXT_MUTED,
  WHITE,
  withAlpha,
} from '../../constants/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlayerSummary = NonNullable<
  NonNullable<GetPlayersWithStatsQuery['players']>[number]
>;

interface SelectedPlayer {
  id: number;
  name: string;
  position: string;
  summary: PlayerSummary;
}

// Up to 4 player slots
const MAX_PLAYERS = 4;

// Accent palette for each player column
const PLAYER_ACCENTS = [BRAND_GOLD, '#60A5FA', '#34D399', '#F87171'] as const;

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null) return '—';
  return decimals > 0 ? n.toFixed(decimals) : String(n);
}

function fmtAvg(n: number | null | undefined): string {
  if (n == null) return '—';
  // averages come back as 0.xxx floats
  return n >= 1 ? n.toFixed(0) : n.toFixed(3).replace(/^0/, '');
}

/** Return the index of the "best" value in an array (highest or lowest based on lowerIsBetter). */
function bestIndex(
  values: (number | null | undefined)[],
  lowerIsBetter = false,
): number | null {
  let best: number | null = null;
  let bestIdx: number | null = null;
  values.forEach((v, i) => {
    if (v == null) return;
    if (bestIdx === null || (lowerIsBetter ? v < best! : v > best!)) {
      best = v;
      bestIdx = i;
    }
  });
  return bestIdx;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** One cell in the stat comparison grid */
function StatCell({
  value,
  isBest,
  accentColor,
}: {
  value: string;
  isBest: boolean;
  accentColor: string;
}) {
  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      paddingVertical="$2"
      paddingHorizontal="$1"
      borderRadius="$2"
      backgroundColor={isBest ? withAlpha(accentColor, 0.14) : 'transparent'}
    >
      <Text
        fontSize="$3"
        fontWeight={isBest ? '700' : '400'}
        color={isBest ? accentColor : WHITE}
      >
        {value}
      </Text>
      {isBest && (
        <Text fontSize="$1" color={accentColor} fontWeight="600" marginTop={1}>
          ▲ best
        </Text>
      )}
    </YStack>
  );
}

/** One row in the stat comparison table */
function ComparisonRow({
  label,
  values,
  lowerIsBetter = false,
  rawNums,
}: {
  label: string;
  values: string[];
  lowerIsBetter?: boolean;
  rawNums: (number | null | undefined)[];
}) {
  const bestIdx = bestIndex(rawNums, lowerIsBetter);
  return (
    <XStack
      borderBottomWidth={1}
      borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
      paddingVertical="$1"
      paddingHorizontal="$3"
    >
      {/* Stat label */}
      <YStack
        width={130}
        justifyContent="center"
        paddingVertical="$2"
        flexShrink={0}
      >
        <Text fontSize="$2" color={TEXT_MUTED} fontWeight="600">
          {label}
        </Text>
      </YStack>

      {/* Player values */}
      {values.map((val, i) => (
        <StatCell
          key={i}
          value={val}
          isBest={bestIdx === i}
          accentColor={PLAYER_ACCENTS[i] ?? BRAND_GOLD}
        />
      ))}
    </XStack>
  );
}

/** Header row with player names */
function ComparisonHeader({ players }: { players: SelectedPlayer[] }) {
  return (
    <XStack
      paddingHorizontal="$3"
      paddingVertical="$3"
      backgroundColor={withAlpha(BRAND_NAVY_DARK, 0.6)}
      borderTopLeftRadius="$4"
      borderTopRightRadius="$4"
    >
      {/* Spacer for label column */}
      <YStack width={130} flexShrink={0} />
      {players.map((p, i) => (
        <YStack key={p.id} flex={1} alignItems="center" gap="$1">
          <Text
            fontSize="$3"
            fontWeight="700"
            color={PLAYER_ACCENTS[i] ?? BRAND_GOLD}
            textAlign="center"
            numberOfLines={2}
          >
            {p.name}
          </Text>
          <Text
            fontSize="$1"
            color={withAlpha(PLAYER_ACCENTS[i] ?? BRAND_GOLD, 0.7)}
            fontWeight="600"
          >
            {p.position}
          </Text>
        </YStack>
      ))}
    </XStack>
  );
}

/** Section header within the table */
function SectionHeader({ title }: { title: string }) {
  return (
    <XStack
      paddingHorizontal="$3"
      paddingVertical="$2"
      backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
    >
      <Text fontSize="$2" fontWeight="700" color={BRAND_GOLD_LIGHT}>
        {title}
      </Text>
    </XStack>
  );
}

// ---------------------------------------------------------------------------
// Player search dropdown
// ---------------------------------------------------------------------------

function PlayerSearchInput({
  onSelect,
  excludeIds,
  disabled,
}: {
  onSelect: (player: PlayerSummary) => void;
  excludeIds: number[];
  disabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const { data, loading } = useGetPlayersWithStatsQuery({
    variables: { search: query, limit: 8 },
    skip: query.trim().length < 2,
  });

  const results = useMemo(
    () =>
      (data?.players ?? []).filter(
        (p) => p?.id != null && !excludeIds.includes(p.id),
      ),
    [data, excludeIds],
  );

  return (
    <YStack position="relative" style={{ zIndex: 100 }}>
      <XStack
        backgroundColor={SURFACE_CARD}
        borderWidth={1}
        borderColor={
          open ? BRAND_NAVY_LIGHT : withAlpha(BRAND_NAVY_LIGHT, 0.35)
        }
        borderRadius="$4"
        alignItems="center"
        paddingHorizontal="$3"
        opacity={disabled ? 0.5 : 1}
      >
        <Plus size={16} color={TEXT_MUTED} />
        <input
          disabled={disabled}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={
            disabled ? 'Max 4 players selected' : 'Search for a player…'
          }
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: WHITE,
            fontSize: 14,
            padding: '10px 8px',
            fontFamily: 'inherit',
          }}
          aria-label="Search players to compare"
          aria-autocomplete="list"
        />
        {loading && <Spinner size="small" color={BRAND_NAVY_LIGHT} />}
      </XStack>

      {open && results.length > 0 && (
        <YStack
          position="absolute"
          top="110%"
          left={0}
          right={0}
          backgroundColor={SURFACE_PANEL}
          borderWidth={1}
          borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.4)}
          borderRadius="$3"
          overflow="hidden"
          shadowColor={BRAND_NAVY_DARK}
          shadowOffset={{ width: 0, height: 4 }}
          shadowOpacity={0.4}
          shadowRadius={12}
          elevation={20}
        >
          {results.map((p) => {
            if (!p?.id) return null;
            const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
            const pos = (p.eligiblePositions ?? []).join(', ') || '—';
            return (
              <XStack
                key={p.id}
                paddingHorizontal="$3"
                paddingVertical="$3"
                borderBottomWidth={1}
                borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.15)}
                cursor="pointer"
                hoverStyle={{
                  backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.12),
                }}
                onPress={() => {
                  onSelect(p);
                  setQuery('');
                  setOpen(false);
                }}
                alignItems="center"
                gap="$3"
              >
                <YStack flex={1}>
                  <Text fontSize="$3" color={WHITE} fontWeight="600">
                    {name}
                  </Text>
                  <Text fontSize="$2" color={TEXT_MUTED}>
                    {pos}
                  </Text>
                </YStack>
                {p.scoring?.avgPointsPerGame != null && (
                  <YStack alignItems="flex-end">
                    <Text fontSize="$2" color={BRAND_GOLD} fontWeight="700">
                      {p.scoring.avgPointsPerGame.toFixed(1)} pts/g
                    </Text>
                  </YStack>
                )}
              </XStack>
            );
          })}
        </YStack>
      )}
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// Selected player chip
// ---------------------------------------------------------------------------

function PlayerChip({
  player,
  index,
  onRemove,
}: {
  player: SelectedPlayer;
  index: number;
  onRemove: () => void;
}) {
  const accent = PLAYER_ACCENTS[index] ?? BRAND_GOLD;
  return (
    <XStack
      backgroundColor={withAlpha(accent, 0.12)}
      borderWidth={1}
      borderColor={withAlpha(accent, 0.35)}
      borderRadius="$4"
      paddingHorizontal="$3"
      paddingVertical="$2"
      alignItems="center"
      gap="$2"
      flexShrink={1}
    >
      <YStack
        width={10}
        height={10}
        borderRadius={5}
        backgroundColor={accent}
      />
      <YStack flex={1}>
        <Text fontSize="$3" color={WHITE} fontWeight="600" numberOfLines={1}>
          {player.name}
        </Text>
        <Text fontSize="$2" color={withAlpha(accent, 0.8)}>
          {player.position}
        </Text>
      </YStack>
      <Button
        size="$2"
        circular
        icon={X}
        backgroundColor="transparent"
        color={withAlpha(WHITE, 0.6)}
        borderWidth={0}
        hoverStyle={{ backgroundColor: withAlpha(WHITE, 0.1) }}
        onPress={onRemove}
        aria-label={`Remove ${player.name}`}
      />
    </XStack>
  );
}

// ---------------------------------------------------------------------------
// Season-by-season breakdown table for a single player
// ---------------------------------------------------------------------------

function SeasonBattingTable({
  name,
  accent,
  data,
  loading,
}: {
  name: string;
  accent: string;
  data: ReturnType<typeof useGetAllPlayerSeasonStatsQuery>['data'];
  loading: boolean;
}) {
  const rows = useMemo(() => {
    if (!data?.playerSeasonBatting) return [];
    return [...data.playerSeasonBatting]
      .filter((r) => r?.season != null && (r.atBats ?? 0) > 0)
      .sort((a, b) => (a?.season ?? 0) - (b?.season ?? 0));
  }, [data]);

  if (loading) {
    return (
      <YStack padding="$3" alignItems="center">
        <Spinner size="small" color={BRAND_NAVY_LIGHT} />
      </YStack>
    );
  }
  if (rows.length === 0) return null;

  return (
    <YStack marginBottom="$4">
      <H4 color={accent} fontSize="$4" marginBottom="$2">
        {name} — Batting by Season
      </H4>
      <YStack
        backgroundColor={withAlpha(BRAND_NAVY_DARK, 0.4)}
        borderRadius="$3"
        borderWidth={1}
        borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.2)}
        overflow="hidden"
      >
        {/* Header */}
        <XStack
          paddingVertical="$2"
          paddingHorizontal="$3"
          backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.14)}
          borderBottomWidth={1}
          borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.2)}
        >
          {['Year', 'G', 'AB', 'H', 'HR', 'RBI', 'SB', 'AVG', 'OBP', 'SLG'].map(
            (h) => (
              <Text
                key={h}
                flex={h === 'Year' ? 1.2 : 1}
                fontSize="$2"
                fontWeight="700"
                color={BRAND_GOLD_LIGHT}
                textAlign={h === 'Year' ? 'left' : 'center'}
              >
                {h}
              </Text>
            ),
          )}
        </XStack>

        {/* Rows */}
        {rows.map((r, idx) => (
          <XStack
            key={`${r?.season}-${idx}`}
            paddingVertical="$2"
            paddingHorizontal="$3"
            backgroundColor={
              idx % 2 === 0 ? 'transparent' : withAlpha(BRAND_NAVY_LIGHT, 0.05)
            }
            borderBottomWidth={idx < rows.length - 1 ? 1 : 0}
            borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.1)}
          >
            {[
              String(r?.season ?? '—'),
              String(r?.games ?? '—'),
              String(r?.atBats ?? '—'),
              String(r?.hits ?? '—'),
              String(r?.homeRuns ?? '—'),
              String(r?.rbi ?? '—'),
              String(r?.stolenBases ?? '—'),
              r?.battingAverage != null ? fmtAvg(r.battingAverage) : '—',
              r?.onBasePercentage != null ? fmtAvg(r.onBasePercentage) : '—',
              r?.sluggingPercentage != null
                ? fmtAvg(r.sluggingPercentage)
                : '—',
            ].map((val, ci) => (
              <Text
                key={ci}
                flex={ci === 0 ? 1.2 : 1}
                fontSize="$2"
                fontWeight={ci === 0 ? '600' : '400'}
                color={ci === 0 ? accent : WHITE}
                textAlign={ci === 0 ? 'left' : 'center'}
              >
                {val}
              </Text>
            ))}
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
}

function SeasonPitchingTable({
  name,
  accent,
  data,
  loading,
}: {
  name: string;
  accent: string;
  data: ReturnType<typeof useGetAllPlayerSeasonStatsQuery>['data'];
  loading: boolean;
}) {
  const rows = useMemo(() => {
    if (!data?.playerSeasonPitching) return [];
    return [...data.playerSeasonPitching]
      .filter((r) => r?.season != null && (r.inningsPitched ?? 0) > 0)
      .sort((a, b) => (a?.season ?? 0) - (b?.season ?? 0));
  }, [data]);

  if (loading || rows.length === 0) return null;

  return (
    <YStack marginBottom="$4">
      <H4 color={accent} fontSize="$4" marginBottom="$2">
        {name} — Pitching by Season
      </H4>
      <YStack
        backgroundColor={withAlpha(BRAND_NAVY_DARK, 0.4)}
        borderRadius="$3"
        borderWidth={1}
        borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.2)}
        overflow="hidden"
      >
        <XStack
          paddingVertical="$2"
          paddingHorizontal="$3"
          backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.14)}
          borderBottomWidth={1}
          borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.2)}
        >
          {['Year', 'G', 'W', 'L', 'ERA', 'IP', 'SO', 'BB', 'WHIP'].map((h) => (
            <Text
              key={h}
              flex={h === 'Year' ? 1.2 : 1}
              fontSize="$2"
              fontWeight="700"
              color={BRAND_GOLD_LIGHT}
              textAlign={h === 'Year' ? 'left' : 'center'}
            >
              {h}
            </Text>
          ))}
        </XStack>

        {rows.map((r, idx) => (
          <XStack
            key={`${r?.season}-${idx}`}
            paddingVertical="$2"
            paddingHorizontal="$3"
            backgroundColor={
              idx % 2 === 0 ? 'transparent' : withAlpha(BRAND_NAVY_LIGHT, 0.05)
            }
            borderBottomWidth={idx < rows.length - 1 ? 1 : 0}
            borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.1)}
          >
            {[
              String(r?.season ?? '—'),
              String(r?.games ?? '—'),
              String(r?.wins ?? '—'),
              String(r?.losses ?? '—'),
              r?.earnedRunAverage ?? '—',
              r?.inningsPitched != null ? r.inningsPitched.toFixed(1) : '—',
              String(r?.strikeouts ?? '—'),
              String(r?.baseOnBalls ?? '—'),
              r?.whip != null ? r.whip.toFixed(2) : '—',
            ].map((val, ci) => (
              <Text
                key={ci}
                flex={ci === 0 ? 1.2 : 1}
                fontSize="$2"
                fontWeight={ci === 0 ? '600' : '400'}
                color={ci === 0 ? accent : WHITE}
                textAlign={ci === 0 ? 'left' : 'center'}
              >
                {val}
              </Text>
            ))}
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

/**
 * PlayerComparisonPage — Side-by-side player comparison tool.
 *
 * Requirements (LS-286):
 * - Compare 2–4 players side-by-side
 * - Show career stats, season-by-season breakdown, scoring projections
 * - Highlight statistical advantages per category
 * - Accessible from the Players nav dropdown
 */
export function PlayerComparisonPage() {
  const [selected, setSelected] = useState<(SelectedPlayer | null)[]>([
    null,
    null,
    null,
    null,
  ]);

  const activePlayers = selected.filter((p): p is SelectedPlayer => p !== null);
  const activeIds = activePlayers.map((p) => p.id);

  // ---------- Fixed slot hooks (rules of hooks — must always call all 4) ----------
  const slot0Stats = useGetAllPlayerSeasonStatsQuery({
    variables: { playerId: selected[0]?.id ?? 0 },
    skip: !selected[0],
  });
  const slot1Stats = useGetAllPlayerSeasonStatsQuery({
    variables: { playerId: selected[1]?.id ?? 0 },
    skip: !selected[1],
  });
  const slot2Stats = useGetAllPlayerSeasonStatsQuery({
    variables: { playerId: selected[2]?.id ?? 0 },
    skip: !selected[2],
  });
  const slot3Stats = useGetAllPlayerSeasonStatsQuery({
    variables: { playerId: selected[3]?.id ?? 0 },
    skip: !selected[3],
  });

  const slotStats = [slot0Stats, slot1Stats, slot2Stats, slot3Stats];

  // ---------- Handlers ----------

  const handleAdd = useCallback((p: PlayerSummary) => {
    const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
    const position = (p.eligiblePositions ?? []).join(', ') || '—';
    setSelected((prev) => {
      const firstEmpty = prev.findIndex((s) => s === null);
      if (firstEmpty === -1) return prev;
      const next = [...prev];
      next[firstEmpty] = { id: p.id!, name, position, summary: p };
      return next;
    });
  }, []);

  const handleRemove = useCallback((idx: number) => {
    setSelected((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
  }, []);

  // ---------- Build comparison table data ----------

  const careerBattingRows = useMemo(() => {
    // [ label, lowerIsBetter, extract fn ]
    const defs: [
      string,
      boolean,
      (p: PlayerSummary) => number | null | undefined,
    ][] = [
      ['Games', false, (p) => p.careerBatting?.games],
      ['Hits', false, (p) => p.careerBatting?.hits],
      ['Home Runs', false, (p) => p.careerBatting?.homeRuns],
      ['RBI', false, (p) => p.careerBatting?.rbi],
      ['Runs', false, (p) => p.careerBatting?.runs],
      ['Stolen Bases', false, (p) => p.careerBatting?.stolenBases],
      ['Walks', false, (p) => p.careerBatting?.baseOnBalls],
      ['Total Bases', false, (p) => p.careerBatting?.totalBases],
      ['lWAR', false, (p) => p.careerBatting?.offensiveWAR],
      ['Avg Seasons AVG', false, (p) => p.averageSeasonBatting?.battingAverage],
      [
        'Avg Seasons OBP',
        false,
        (p) => p.averageSeasonBatting?.onBasePercentage,
      ],
      [
        'Avg Seasons SLG',
        false,
        (p) => p.averageSeasonBatting?.sluggingPercentage,
      ],
    ];

    return defs.map(([label, lowerIsBetter, extractor]) => {
      const nums = activePlayers.map((p) => extractor(p.summary));
      const vals = nums.map((n) => {
        if (n == null) return '—';
        // Determine format: avg/obp/slg use decimal
        if (
          label.includes('AVG') ||
          label.includes('OBP') ||
          label.includes('SLG')
        )
          return fmtAvg(n);
        if (label.includes('WAR')) return n.toFixed(1);
        return fmt(n);
      });
      return { label, lowerIsBetter, vals, nums };
    });
  }, [activePlayers]);

  const careerPitchingRows = useMemo(() => {
    const hasPitching = activePlayers.some(
      (p) => (p.summary.careerPitching?.games ?? 0) > 0,
    );
    if (!hasPitching) return [];

    const defs: [
      string,
      boolean,
      (p: PlayerSummary) => number | null | undefined,
    ][] = [
      ['Games', false, (p) => p.careerPitching?.games],
      ['Wins', false, (p) => p.careerPitching?.wins],
      ['Losses', true, (p) => p.careerPitching?.losses],
      ['Saves', false, (p) => p.careerPitching?.saves],
      ['Strikeouts', false, (p) => p.careerPitching?.strikeouts],
      ['Walks', true, (p) => p.careerPitching?.baseOnBalls],
      ['Win %', false, (p) => p.careerPitching?.winPercentage],
    ];

    const eraRows = activePlayers.map(
      (p) => p.summary.careerPitching?.era ?? null,
    );
    const eraRowNums = eraRows.map((s) => (s ? parseFloat(s) : null));

    return [
      ...defs.map(([label, lowerIsBetter, extractor]) => {
        const nums = activePlayers.map((p) => extractor(p.summary));
        const vals = nums.map((n) => {
          if (n == null) return '—';
          if (label === 'Win %') return `${(n * 100).toFixed(1)}%`;
          return fmt(n);
        });
        return { label, lowerIsBetter, vals, nums };
      }),
      {
        label: 'ERA',
        lowerIsBetter: true,
        vals: eraRows.map((s) => s ?? '—'),
        nums: eraRowNums,
      },
    ];
  }, [activePlayers]);

  const scoringRows = useMemo(() => {
    const defs: [
      string,
      boolean,
      (p: PlayerSummary) => number | null | undefined,
    ][] = [
      ['Fantasy Score', false, (p) => p.scoring?.totalScore],
      ['Avg Pts / Game', false, (p) => p.scoring?.avgPointsPerGame],
      ['Hitter Score', false, (p) => p.scoring?.hitterScore],
      ['Pitcher Score', false, (p) => p.scoring?.pitchingScore],
      ['Field Score', false, (p) => p.scoring?.fieldingScore],
    ];

    return defs.map(([label, lowerIsBetter, extractor]) => {
      const nums = activePlayers.map((p) => extractor(p.summary));
      const vals = nums.map((n) => (n == null ? '—' : n.toFixed(1)));
      return { label, lowerIsBetter, vals, nums };
    });
  }, [activePlayers]);

  const achievementRows = useMemo(() => {
    const defs: [
      string,
      boolean,
      (p: PlayerSummary) => number | null | undefined,
    ][] = [
      [
        'All-Star Selections',
        false,
        (p) => p.careerAchievements?.allStarSelections,
      ],
      ['MVP Awards', false, (p) => p.careerAchievements?.mvpAwards],
      ['Cy Young Awards', false, (p) => p.careerAchievements?.cyYoungAwards],
      ['Gold Gloves', false, (p) => p.careerAchievements?.goldGloves],
      ['Silver Sluggers', false, (p) => p.careerAchievements?.silverSluggers],
      ['WS Rings', false, (p) => p.careerAchievements?.worldSeriesRings],
    ];

    return defs.map(([label, lowerIsBetter, extractor]) => {
      const nums = activePlayers.map((p) => extractor(p.summary));
      const vals = nums.map((n) => (n == null ? '—' : String(n)));
      return { label, lowerIsBetter, vals, nums };
    });
  }, [activePlayers]);

  const showTable = activePlayers.length >= 2;
  const isPremium = useIsPremium();

  return (
    <PremiumGate
      isPremium={isPremium}
      featureName="Player Comparison"
      featureDescription="Compare up to 4 players side-by-side with career stats, scoring projections, and season breakdowns."
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <YStack minHeight="100vh" backgroundColor={BG_DARK as never}>
          <YStack
            maxWidth={1280}
            alignSelf="center"
            width="100%"
            padding="$4"
            gap="$5"
          >
            {/* ── Page header ── */}
            <XStack alignItems="center" gap="$3" paddingTop="$2">
              <BarChart2 size={28} color={BRAND_GOLD} />
              <YStack>
                <H2 color={WHITE} fontSize="$8" fontWeight="700" margin={0}>
                  Player Comparison
                </H2>
                <Text color={TEXT_MUTED} fontSize="$3">
                  Compare up to 4 players side-by-side — career stats, scoring
                  projections, and season breakdowns.
                </Text>
              </YStack>
            </XStack>

            <Separator borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.25)} />

            {/* ── Player selection ── */}
            <YStack gap="$3">
              <Text color={BRAND_GOLD_LIGHT} fontWeight="700" fontSize="$4">
                Select Players ({activePlayers.length}/{MAX_PLAYERS})
              </Text>

              {/* Active player chips */}
              {activePlayers.length > 0 && (
                <XStack flexWrap="wrap" gap="$2">
                  {selected.map((p, idx) =>
                    p ? (
                      <PlayerChip
                        key={p.id}
                        player={p}
                        index={idx}
                        onRemove={() => handleRemove(idx)}
                      />
                    ) : null,
                  )}
                </XStack>
              )}

              {/* Search */}
              <PlayerSearchInput
                onSelect={handleAdd}
                excludeIds={activeIds}
                disabled={activePlayers.length >= MAX_PLAYERS}
              />

              {activePlayers.length < 2 && (
                <Text color={TEXT_MUTED} fontSize="$2">
                  Add at least 2 players to see the comparison table.
                </Text>
              )}
            </YStack>

            {/* ── Comparison table ── */}
            {showTable && (
              <YStack gap="$4">
                <YStack
                  backgroundColor={SURFACE_SUBTLE}
                  borderRadius="$4"
                  borderWidth={1}
                  borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.3)}
                  overflow="hidden"
                >
                  <ComparisonHeader players={activePlayers} />

                  {/* Fantasy Scoring Projections */}
                  <SectionHeader title="⚡ Fantasy Scoring Projections" />
                  {scoringRows.map((row) => (
                    <ComparisonRow
                      key={row.label}
                      label={row.label}
                      values={row.vals}
                      lowerIsBetter={row.lowerIsBetter}
                      rawNums={row.nums}
                    />
                  ))}

                  {/* Career Batting */}
                  <SectionHeader title="🏏 Career Batting" />
                  {careerBattingRows.map((row) => (
                    <ComparisonRow
                      key={row.label}
                      label={row.label}
                      values={row.vals}
                      lowerIsBetter={row.lowerIsBetter}
                      rawNums={row.nums}
                    />
                  ))}

                  {/* Career Pitching (if any player is a pitcher) */}
                  {careerPitchingRows.length > 0 && (
                    <>
                      <SectionHeader title="⚾ Career Pitching" />
                      {careerPitchingRows.map((row) => (
                        <ComparisonRow
                          key={row.label}
                          label={row.label}
                          values={row.vals}
                          lowerIsBetter={row.lowerIsBetter}
                          rawNums={row.nums}
                        />
                      ))}
                    </>
                  )}

                  {/* Achievements */}
                  <SectionHeader title="🏆 Career Achievements" />
                  {achievementRows.map((row) => (
                    <ComparisonRow
                      key={row.label}
                      label={row.label}
                      values={row.vals}
                      lowerIsBetter={row.lowerIsBetter}
                      rawNums={row.nums}
                    />
                  ))}
                </YStack>

                {/* ── Season-by-season breakdown ── */}
                <YStack gap="$2">
                  <H3 color={WHITE} fontSize="$6" fontWeight="700">
                    Season-by-Season Breakdown
                  </H3>
                  <Separator borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.2)} />
                </YStack>

                <YStack gap="$6">
                  {selected.map((player, idx) => {
                    if (!player) return null;
                    const accent = PLAYER_ACCENTS[idx] ?? BRAND_GOLD;
                    const stats = slotStats[idx];
                    return (
                      <YStack key={player.id} gap="$3">
                        <XStack
                          alignItems="center"
                          gap="$2"
                          paddingHorizontal="$1"
                        >
                          <YStack
                            width={12}
                            height={12}
                            borderRadius={6}
                            backgroundColor={accent}
                          />
                          <Text fontSize="$5" fontWeight="700" color={accent}>
                            {player.name}
                          </Text>
                          <Text fontSize="$3" color={TEXT_MUTED}>
                            {player.position}
                          </Text>
                        </XStack>
                        <SeasonBattingTable
                          name={player.name}
                          accent={accent}
                          data={stats?.data}
                          loading={stats?.loading ?? false}
                        />
                        <SeasonPitchingTable
                          name={player.name}
                          accent={accent}
                          data={stats?.data}
                          loading={stats?.loading ?? false}
                        />
                      </YStack>
                    );
                  })}
                </YStack>
              </YStack>
            )}

            {/* ── Empty state ── */}
            {!showTable && activePlayers.length === 0 && (
              <YStack
                alignItems="center"
                justifyContent="center"
                paddingVertical="$12"
                gap="$4"
                backgroundColor={SURFACE_SUBTLE}
                borderRadius="$4"
                borderWidth={1}
                borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.2)}
                style={{ borderStyle: 'dashed' as never }}
              >
                <BarChart2 size={48} color={withAlpha(BRAND_GOLD, 0.4)} />
                <YStack alignItems="center" gap="$2">
                  <Text fontSize="$5" color={TEXT_MUTED} fontWeight="600">
                    No players selected
                  </Text>
                  <Text
                    fontSize="$3"
                    color={withAlpha(TEXT_MUTED, 0.6)}
                    textAlign="center"
                  >
                    Search for players above to start comparing side-by-side.
                    {'\n'}Great for draft preparation and free agent evaluation.
                  </Text>
                </YStack>
              </YStack>
            )}
          </YStack>
        </YStack>
      </ScrollView>
    </PremiumGate>
  );
}
