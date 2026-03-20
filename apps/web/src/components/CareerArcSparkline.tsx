import React, { useId, useMemo } from 'react';
import { YStack } from 'tamagui';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { BRAND_GOLD_LIGHT, BRAND_SEAM_RED } from '../constants/colors';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SparklineDataPoint {
  season: number;
  value: number;
}

export interface CareerArcSparklineProps {
  /** Season-by-season metric values (OPS for batters, ERA+ for pitchers) */
  seasons: Array<{
    season?: number | null;
    /** OPS or ERA+ */
    value?: number | null;
    games?: number | null;
  }>;
  /** Whether this is a pitcher (affects accent color) */
  isPitcher?: boolean;
  width?: number;
  height?: number;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CareerArcSparkline({
  seasons,
  isPitcher = false,
  width = 80,
  height = 28,
}: CareerArcSparklineProps) {
  const instanceId = useId();

  const data = useMemo((): SparklineDataPoint[] => {
    return seasons
      .filter(
        (s) =>
          s.season != null && s.value != null && s.games != null && s.games > 0,
      )
      .map((s) => ({ season: s.season as number, value: s.value as number }))
      .sort((a, b) => a.season - b.season);
  }, [seasons]);

  if (data.length < 2) return null;

  const color = isPitcher ? BRAND_SEAM_RED : BRAND_GOLD_LIGHT;
  const gradientId = `sparkGrad-${isPitcher ? 'p' : 'b'}-${instanceId}`;

  return (
    <YStack width={width} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 1, right: 1, bottom: 1, left: 1 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </YStack>
  );
}
