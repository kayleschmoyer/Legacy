import React, { useMemo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  EMERALD_LIGHT,
  OUTLINE_SUBTLE,
  OVERLAY_BLACK_40,
  SURFACE_CARD,
  TEXT_MUTED,
  VIOLET_LIGHT,
  WHITE,
  withAlpha,
} from '../constants/colors';
import type { GetPlayerCareerArcQuery } from '../api/db/graphql.generated';

// ─── Types ──────────────────────────────────────────────────────────────────

type BattingSeason = NonNullable<
  GetPlayerCareerArcQuery['playerSeasonBatting']
>[number];
type PitchingSeason = NonNullable<
  GetPlayerCareerArcQuery['playerSeasonPitching']
>[number];

export type CareerArcMode = 'batting' | 'pitching';

interface ChartDataPoint {
  season: number;
  /** Primary metric value (OPS for batters, ERA+ for pitchers) */
  value: number;
  /** Secondary metric (HR for batters, SO for pitchers) */
  secondary: number;
  team: string;
  awards: string | null;
  isPeak: boolean;
  games: number;
}

interface MilestoneMarker {
  season: number;
  value: number;
  label: string;
  color: string;
}

export interface CareerArcChartProps {
  battingSeasons: BattingSeason[] | null | undefined;
  pitchingSeasons: PitchingSeason[] | null | undefined;
  mode: CareerArcMode;
  height?: number;
  compact?: boolean;
}

// ─── Award parsing ──────────────────────────────────────────────────────────

const AWARD_LABELS: Record<string, { label: string; color: string }> = {
  AS: { label: 'All-Star', color: BRAND_GOLD_LIGHT },
  MVP: { label: 'MVP', color: BRAND_SEAM_RED },
  CYA: { label: 'Cy Young', color: VIOLET_LIGHT },
  GG: { label: 'Gold Glove', color: EMERALD_LIGHT },
  SS: { label: 'Silver Slugger', color: BRAND_GOLD },
  ROY: { label: 'ROY', color: BRAND_NAVY_LIGHT },
};

function parseAwards(summary: string | null | undefined): string[] {
  if (!summary) return [];
  return summary
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getAwardMarkers(dataPoints: ChartDataPoint[]): MilestoneMarker[] {
  const markers: MilestoneMarker[] = [];
  for (const point of dataPoints) {
    const awards = parseAwards(point.awards);
    for (const award of awards) {
      const match = AWARD_LABELS[award];
      if (match) {
        markers.push({
          season: point.season,
          value: point.value,
          label: match.label,
          color: match.color,
        });
      }
    }
  }
  return markers;
}

// ─── Data transformation ────────────────────────────────────────────────────

function buildBattingData(seasons: BattingSeason[]): ChartDataPoint[] {
  return seasons
    .filter(
      (s) =>
        s.season != null &&
        s.games != null &&
        s.games > 0 &&
        s.onBasePlusSlugging != null,
    )
    .map((s) => ({
      season: s.season as number,
      value: s.onBasePlusSlugging as number,
      secondary: s.homeRuns ?? 0,
      team: s.team ?? '',
      awards: s.awardSummary ?? null,
      isPeak: false,
      games: s.games ?? 0,
    }))
    .sort((a, b) => a.season - b.season);
}

function buildPitchingData(seasons: PitchingSeason[]): ChartDataPoint[] {
  return seasons
    .filter(
      (s) =>
        s.season != null &&
        s.games != null &&
        s.games > 0 &&
        s.earnedRunAveragePlus != null,
    )
    .map((s) => ({
      season: s.season as number,
      value: s.earnedRunAveragePlus as number,
      secondary: s.strikeouts ?? 0,
      team: s.team ?? '',
      awards: s.awardSummary ?? null,
      isPeak: false,
      games: s.games ?? 0,
    }))
    .sort((a, b) => a.season - b.season);
}

function markPeakSeasons(data: ChartDataPoint[], topN = 3): ChartDataPoint[] {
  if (data.length === 0) return data;
  const sorted = [...data]
    .filter((d) => d.games >= 50)
    .sort((a, b) => b.value - a.value);
  const peakSeasons = new Set(sorted.slice(0, topN).map((d) => d.season));
  return data.map((d) => ({ ...d, isPeak: peakSeasons.has(d.season) }));
}

// ─── Custom tooltip ─────────────────────────────────────────────────────────

interface TooltipPayloadEntry {
  value: number;
  payload: ChartDataPoint;
}

function CareerArcTooltip({
  active,
  payload,
  mode,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  mode: CareerArcMode;
}) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  const awards = parseAwards(point.awards);

  const metricLabel = mode === 'batting' ? 'OPS' : 'ERA+';
  const secondaryLabel = mode === 'batting' ? 'HR' : 'SO';

  return (
    <YStack
      padding="$2.5"
      borderRadius="$3"
      gap="$1"
      style={{
        background: SURFACE_CARD,
        border: `1px solid ${OUTLINE_SUBTLE}`,
        boxShadow: `0 4px 12px ${OVERLAY_BLACK_40}`,
      }}
    >
      <XStack gap="$2" alignItems="center">
        <Text fontSize="$3" fontWeight="700" color={WHITE}>
          {point.season}
        </Text>
        <Text fontSize="$2" color={TEXT_MUTED}>
          {point.team}
        </Text>
        {point.isPeak && (
          <Text
            fontSize={10}
            fontWeight="700"
            color={BRAND_GOLD_LIGHT}
            paddingHorizontal="$1.5"
            paddingVertical={1}
            borderRadius="$1"
            style={{
              background: withAlpha(BRAND_GOLD_LIGHT, 0.15),
            }}
          >
            PEAK
          </Text>
        )}
      </XStack>
      <XStack gap="$3">
        <Text fontSize="$2" color={BRAND_GOLD_LIGHT} fontWeight="600">
          {metricLabel}:{' '}
          {mode === 'batting' ? point.value.toFixed(3) : point.value}
        </Text>
        <Text fontSize="$2" color={TEXT_MUTED}>
          {secondaryLabel}: {point.secondary}
        </Text>
        <Text fontSize="$2" color={TEXT_MUTED}>
          G: {point.games}
        </Text>
      </XStack>
      {awards.length > 0 && (
        <XStack gap="$1" flexWrap="wrap">
          {awards.map((award) => {
            const meta = AWARD_LABELS[award];
            return (
              <Text
                key={award}
                fontSize={10}
                fontWeight="600"
                color={meta?.color ?? TEXT_MUTED}
                paddingHorizontal="$1"
                borderRadius="$1"
                style={{
                  background: withAlpha(meta?.color ?? TEXT_MUTED, 0.15),
                }}
              >
                {meta?.label ?? award}
              </Text>
            );
          })}
        </XStack>
      )}
    </YStack>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function CareerArcChart({
  battingSeasons,
  pitchingSeasons,
  mode,
  height = 320,
  compact = false,
}: CareerArcChartProps) {
  const data = useMemo(() => {
    const raw =
      mode === 'batting'
        ? buildBattingData(battingSeasons ?? [])
        : buildPitchingData(pitchingSeasons ?? []);
    return markPeakSeasons(raw);
  }, [battingSeasons, pitchingSeasons, mode]);

  const milestones = useMemo(() => getAwardMarkers(data), [data]);

  const { avgValue, peakValue } = useMemo(() => {
    if (data.length === 0) return { avgValue: 0, peakValue: 0 };
    const qualifiedSeasons = data.filter((d) => d.games >= 50);
    const vals = qualifiedSeasons.map((d) => d.value);
    const avg =
      vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const peak = vals.length > 0 ? Math.max(...vals) : 0;
    return { avgValue: avg, peakValue: peak };
  }, [data]);

  // Detect team changes for visual indicators
  const teamChanges = useMemo(() => {
    const changes: number[] = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i].team !== data[i - 1].team) {
        changes.push(data[i].season);
      }
    }
    return changes;
  }, [data]);

  if (data.length === 0) {
    return (
      <YStack
        alignItems="center"
        paddingVertical="$6"
        style={{ background: withAlpha(BRAND_NAVY_LIGHT, 0.08) }}
        borderRadius="$3"
      >
        <Text color={TEXT_MUTED} fontSize="$3">
          No {mode} data available for career arc
        </Text>
      </YStack>
    );
  }

  const metricLabel = mode === 'batting' ? 'OPS' : 'ERA+';
  const gradientId = `careerArcGradient-${mode}`;
  const accentColor = mode === 'batting' ? BRAND_GOLD_LIGHT : BRAND_SEAM_RED;

  return (
    <YStack gap="$3">
      {/* Header stats row */}
      {!compact && (
        <XStack gap="$4" flexWrap="wrap" alignItems="center">
          <YStack>
            <Text fontSize="$2" color={TEXT_MUTED} fontWeight="600">
              Peak {metricLabel}
            </Text>
            <Text fontSize="$5" fontWeight="700" color={accentColor}>
              {mode === 'batting' ? peakValue.toFixed(3) : peakValue}
            </Text>
          </YStack>
          <YStack>
            <Text fontSize="$2" color={TEXT_MUTED} fontWeight="600">
              Career Avg {metricLabel}
            </Text>
            <Text fontSize="$5" fontWeight="700" color={TEXT_MUTED}>
              {mode === 'batting' ? avgValue.toFixed(3) : avgValue.toFixed(0)}
            </Text>
          </YStack>
          <YStack>
            <Text fontSize="$2" color={TEXT_MUTED} fontWeight="600">
              Seasons
            </Text>
            <Text fontSize="$5" fontWeight="700" color={WHITE}>
              {data.length}
            </Text>
          </YStack>
          {teamChanges.length > 0 && (
            <YStack>
              <Text fontSize="$2" color={TEXT_MUTED} fontWeight="600">
                Teams
              </Text>
              <Text fontSize="$5" fontWeight="700" color={WHITE}>
                {new Set(data.map((d) => d.team)).size}
              </Text>
            </YStack>
          )}
        </XStack>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={data}
          margin={{
            top: 12,
            right: compact ? 8 : 16,
            bottom: compact ? 4 : 8,
            left: compact ? -16 : 0,
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={accentColor} stopOpacity={0.35} />
              <stop offset="95%" stopColor={accentColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={withAlpha(OUTLINE_SUBTLE, 0.5)}
            vertical={false}
          />
          <XAxis
            dataKey="season"
            tick={{ fill: TEXT_MUTED, fontSize: compact ? 10 : 12 }}
            tickLine={false}
            axisLine={{ stroke: OUTLINE_SUBTLE }}
            interval={
              compact
                ? 'preserveStartEnd'
                : Math.max(0, Math.floor(data.length / 8) - 1)
            }
          />
          {!compact && (
            <YAxis
              tick={{ fill: TEXT_MUTED, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              domain={['auto', 'auto']}
              width={48}
            />
          )}
          <Tooltip
            content={<CareerArcTooltip mode={mode} />}
            cursor={{
              stroke: withAlpha(WHITE, 0.2),
              strokeDasharray: '4 4',
            }}
          />

          {/* Career average reference line */}
          {!compact && avgValue > 0 && (
            <ReferenceLine
              y={avgValue}
              stroke={withAlpha(TEXT_MUTED, 0.4)}
              strokeDasharray="6 4"
              label={{
                value: `Avg ${mode === 'batting' ? avgValue.toFixed(3) : avgValue.toFixed(0)}`,
                fill: TEXT_MUTED,
                fontSize: 10,
                position: 'right',
              }}
            />
          )}

          {/* Team change vertical lines */}
          {!compact &&
            teamChanges.map((season) => (
              <ReferenceLine
                key={`team-${season}`}
                x={season}
                stroke={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
                strokeDasharray="4 4"
              />
            ))}

          {/* Main area */}
          <Area
            type="monotone"
            dataKey="value"
            stroke={accentColor}
            strokeWidth={compact ? 1.5 : 2.5}
            fill={`url(#${gradientId})`}
            dot={
              compact
                ? false
                : {
                    r: 3,
                    fill: accentColor,
                    stroke: SURFACE_CARD,
                    strokeWidth: 1.5,
                  }
            }
            activeDot={{
              r: compact ? 4 : 6,
              fill: accentColor,
              stroke: WHITE,
              strokeWidth: 2,
            }}
            animationDuration={800}
          />

          {/* Peak season markers */}
          {!compact &&
            data
              .filter((d) => d.isPeak)
              .map((d) => (
                <ReferenceDot
                  key={`peak-${d.season}`}
                  x={d.season}
                  y={d.value}
                  r={6}
                  fill={BRAND_GOLD_LIGHT}
                  stroke={WHITE}
                  strokeWidth={2}
                />
              ))}

          {/* Award milestone markers */}
          {!compact &&
            milestones.map((m, i) => (
              <ReferenceDot
                key={`milestone-${m.season}-${i}`}
                x={m.season}
                y={m.value}
                r={5}
                fill={m.color}
                stroke={SURFACE_CARD}
                strokeWidth={2}
              />
            ))}
        </AreaChart>
      </ResponsiveContainer>

      {/* Milestone legend */}
      {!compact && milestones.length > 0 && (
        <XStack gap="$2" flexWrap="wrap" paddingHorizontal="$1">
          {milestones.map((m, i) => (
            <XStack
              key={`legend-${m.season}-${i}`}
              gap="$1.5"
              alignItems="center"
              paddingHorizontal="$2"
              paddingVertical="$1"
              borderRadius="$2"
              style={{
                background: withAlpha(m.color, 0.12),
                border: `1px solid ${withAlpha(m.color, 0.25)}`,
              }}
            >
              <YStack
                width={8}
                height={8}
                borderRadius={4}
                style={{ background: m.color }}
              />
              <Text fontSize={11} fontWeight="600" color={m.color}>
                {m.season} {m.label}
              </Text>
            </XStack>
          ))}
        </XStack>
      )}
    </YStack>
  );
}
