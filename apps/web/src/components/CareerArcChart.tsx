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
import type { GetPlayerCareerArcQuery } from '@legacy-sports/graphql';
import {
  BLUE_LIGHT,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  EMERALD_LIGHT,
  OUTLINE_SUBTLE,
  OVERLAY_BLACK_40,
  SURFACE_CARD,
  TEXT_MUTED,
  WHITE,
  withAlpha,
} from '../constants/colors';

// ─── Types ──────────────────────────────────────────────────────────────────

type BattingSeason = NonNullable<GetPlayerCareerArcQuery['arcBatting']>[number];
type PitchingSeason = NonNullable<
  GetPlayerCareerArcQuery['arcPitching']
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
  /** Sample size: plate appearances (batting) or innings pitched (pitching) */
  sample: number;
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
  CYA: { label: 'Cy Young', color: BLUE_LIGHT },
  GG: { label: 'Gold Glove', color: EMERALD_LIGHT },
  SS: { label: 'Silver Slugger', color: BRAND_GOLD },
  ROY: { label: 'ROY', color: BRAND_NAVY_LIGHT },
};

export interface ParsedAward {
  /** Base award code, e.g. 'MVP' — the key into AWARD_LABELS. */
  code: string;
  /** True for an actual award; false for a ballot placement such as 'MVP-5'. */
  won: boolean;
  /** Display text, e.g. 'NL MVP', 'Gold Glove', 'MVP (5th in voting)'. */
  label: string;
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/**
 * Parse one B-Ref award code. Same conventions as
 * lib/bref-client/src/lib/CareerAchievements.ts `normalizeCode`:
 *   - no suffix ('GG', 'MVP')            → win
 *   - league suffix ('MVP-NL', 'CYA-AL') → win in that league
 *   - ballot rank ('MVP-1', 'ROY-6')     → win only for rank 1
 */
function parseAwardCode(raw: string): ParsedAward {
  const dashIdx = raw.indexOf('-');
  const code = dashIdx === -1 ? raw : raw.slice(0, dashIdx);
  const suffix = dashIdx === -1 ? '' : raw.slice(dashIdx + 1);
  const rank = /^\d+$/.test(suffix) ? Number(suffix) : null;
  const league = /^(AL|NL)\b/.exec(suffix)?.[1] ?? null;
  const won = rank === null || rank === 1;
  const name = AWARD_LABELS[code]?.label ?? code;

  let label = name;
  if (!won && rank !== null) label = `${name} (${ordinal(rank)} in voting)`;
  else if (league) label = `${league} ${name}`;

  return { code, won, label };
}

/** Parse a comma-separated B-Ref `award_summary` (e.g. 'MVP-NL,GG,SS'). */
export function parseAwards(summary: string | null | undefined): ParsedAward[] {
  if (!summary) return [];
  return summary
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .map(parseAwardCode);
}

function getAwardMarkers(dataPoints: ChartDataPoint[]): MilestoneMarker[] {
  const markers: MilestoneMarker[] = [];
  for (const point of dataPoints) {
    const awards = parseAwards(point.awards);
    for (const award of awards) {
      const match = AWARD_LABELS[award.code];
      if (match && award.won) {
        markers.push({
          season: point.season,
          value: point.value,
          label: award.label,
          color: match.color,
        });
      }
    }
  }
  return markers;
}

// ─── Data transformation ────────────────────────────────────────────────────

function shouldReplaceSeasonPoint(
  candidate: ChartDataPoint,
  existing: ChartDataPoint,
): boolean {
  if (candidate.games !== existing.games) {
    return candidate.games > existing.games;
  }

  if (candidate.value !== existing.value) {
    return candidate.value > existing.value;
  }

  return candidate.team.localeCompare(existing.team) < 0;
}

function deduplicateBySeason(points: ChartDataPoint[]): ChartDataPoint[] {
  const bySeasonMap = new Map<number, ChartDataPoint>();
  for (const point of points) {
    const existing = bySeasonMap.get(point.season);
    if (!existing || shouldReplaceSeasonPoint(point, existing)) {
      bySeasonMap.set(point.season, point);
    }
  }
  return Array.from(bySeasonMap.values());
}

function buildBattingData(seasons: BattingSeason[]): ChartDataPoint[] {
  return deduplicateBySeason(
    seasons
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
        sample: s.plateAppearances ?? 0,
      })),
  ).sort((a, b) => a.season - b.season);
}

function buildPitchingData(seasons: PitchingSeason[]): ChartDataPoint[] {
  return deduplicateBySeason(
    seasons
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
        sample: s.inningsPitched ?? 0,
      })),
  ).sort((a, b) => a.season - b.season);
}

/**
 * Minimum sample (plate appearances / innings pitched) for a season to count
 * toward the Peak and Career Avg summaries. A games-played threshold excludes
 * every starting pitcher and every pitcher's batting arc (LS-10496).
 */
const MIN_QUALIFYING_SAMPLE: Record<CareerArcMode, number> = {
  batting: 300,
  pitching: 100,
};

function qualifyingSeasons(
  data: ChartDataPoint[],
  mode: CareerArcMode,
): ChartDataPoint[] {
  return data.filter((d) => d.sample >= MIN_QUALIFYING_SAMPLE[mode]);
}

/** Sample-weighted career average over qualifying seasons, or null if none. */
function summarizeCareerArc(
  data: ChartDataPoint[],
  mode: CareerArcMode,
): { avgValue: number; peakValue: number } | null {
  const qualified = qualifyingSeasons(data, mode);
  if (qualified.length === 0) return null;
  const totalSample = qualified.reduce((sum, d) => sum + d.sample, 0);
  return {
    avgValue:
      qualified.reduce((sum, d) => sum + d.value * d.sample, 0) / totalSample,
    peakValue: Math.max(...qualified.map((d) => d.value)),
  };
}

function markPeakSeasons(
  data: ChartDataPoint[],
  mode: CareerArcMode,
  topN = 3,
): ChartDataPoint[] {
  if (data.length === 0) return data;
  const sorted = qualifyingSeasons(data, mode).sort(
    (a, b) => b.value - a.value,
  );
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
          {awards.map((award, i) => {
            const meta = AWARD_LABELS[award.code];
            return (
              <Text
                key={`${award.label}-${i}`}
                fontSize={10}
                fontWeight="600"
                color={meta?.color ?? TEXT_MUTED}
                paddingHorizontal="$1"
                borderRadius="$1"
                style={{
                  background: withAlpha(meta?.color ?? TEXT_MUTED, 0.15),
                }}
              >
                {award.label}
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
    return markPeakSeasons(raw, mode);
  }, [battingSeasons, pitchingSeasons, mode]);

  const milestones = useMemo(() => getAwardMarkers(data), [data]);

  const summary = useMemo(() => summarizeCareerArc(data, mode), [data, mode]);
  const avgValue = summary?.avgValue ?? 0;
  const peakValue = summary?.peakValue ?? 0;

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
  const secondaryLabel = mode === 'batting' ? 'HR' : 'SO';
  const gradientId = `careerArcGradient-${mode}`;
  const accentColor = mode === 'batting' ? BRAND_GOLD_LIGHT : BRAND_SEAM_RED;

  const formatMetric = (v: number) =>
    mode === 'batting' ? v.toFixed(3) : v.toFixed(0);

  const chartAriaLabel = `Career arc: ${mode} performance across ${data.length} season${data.length !== 1 ? 's' : ''}. ${summary ? `Peak ${metricLabel}: ${formatMetric(peakValue)}. Career average ${metricLabel}: ${formatMetric(avgValue)}.` : 'No qualifying seasons for peak or average.'}`;

  return (
    <YStack gap="$3" role="region" aria-label={chartAriaLabel}>
      {/* Header stats row */}
      {!compact && (
        <XStack gap="$4" flexWrap="wrap" alignItems="center">
          <YStack>
            <Text fontSize="$2" color={TEXT_MUTED} fontWeight="600">
              Peak {metricLabel}
            </Text>
            <Text fontSize="$5" fontWeight="700" color={accentColor}>
              {summary ? formatMetric(peakValue) : '—'}
            </Text>
          </YStack>
          <YStack>
            <Text fontSize="$2" color={TEXT_MUTED} fontWeight="600">
              Career Avg {metricLabel}
            </Text>
            <Text fontSize="$5" fontWeight="700" color={TEXT_MUTED}>
              {summary ? formatMetric(avgValue) : '—'}
            </Text>
          </YStack>
          {!summary && (
            <Text fontSize="$2" color={TEXT_MUTED}>
              No qualifying seasons
            </Text>
          )}
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

      {/* Chart — aria-hidden; the sr-only table below is the accessible equivalent */}
      <div aria-hidden="true">
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
            {!compact && summary && (
              <ReferenceLine
                y={avgValue}
                stroke={withAlpha(TEXT_MUTED, 0.4)}
                strokeDasharray="6 4"
                label={{
                  value: `Avg ${formatMetric(avgValue)}`,
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
      </div>

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

      {/* Screen-reader-only data table — WCAG 1.1.1 equivalent text alternative */}
      <table
        data-testid="career-arc-sr-table"
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
        <caption>Career {mode} statistics by season</caption>
        <thead>
          <tr>
            <th scope="col">Season</th>
            <th scope="col">Team</th>
            <th scope="col">{metricLabel}</th>
            <th scope="col">{secondaryLabel}</th>
            <th scope="col">Games</th>
            <th scope="col">Awards</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.season}>
              <td>
                {point.season}
                {point.isPeak ? ' (peak season)' : ''}
              </td>
              <td>{point.team}</td>
              <td>
                {mode === 'batting' ? point.value.toFixed(3) : point.value}
              </td>
              <td>{point.secondary}</td>
              <td>{point.games}</td>
              <td>
                {parseAwards(point.awards)
                  .map((award) => award.label)
                  .join(', ') || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </YStack>
  );
}
