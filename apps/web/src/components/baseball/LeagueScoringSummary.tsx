import React, { useMemo } from 'react';
import { Card, XStack, YStack } from '@legacy-sports/shared-components';
import { BarChart3 } from '@tamagui/lucide-icons';
import { Text } from 'tamagui';
import {
  BG_DARK,
  BLACK,
  BLUE,
  GREEN,
  ORANGE,
  withAlpha,
} from '../../constants/colors';
import {
  createDefaultScoringSettings,
  type ScoringSettings,
} from '../../lib/scoring';

/** Human-readable labels for baseball stat column names (camelCase + snake_case). */
const STAT_LABELS: Record<string, string> = {
  // Batting
  cs: 'CS',
  doubles: '2B',
  h: 'H',
  hbp: 'HBP',
  hr: 'HR',
  r: 'R',
  rbi: 'RBI',
  sb: 'SB',
  so: 'SO',
  triples: '3B',
  // Fielding
  eDef: 'Errors',
  e_def: 'Errors',
  // Pitching
  bb: 'BB',
  er: 'ER',
  l: 'L',
  outsRecorded: 'Outs',
  outs_recorded: 'Outs',
  sv: 'SV',
  w: 'W',
};

function statLabel(key: string): string {
  return (
    STAT_LABELS[key] ??
    key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

interface LeagueScoringSummaryProps {
  loading: boolean;
  error?: Error | null;
  profileName: string;
  settings: ScoringSettings;
}

const GROUP_CONFIG = [
  {
    key: 'batting' as const,
    title: 'Batting',
    accent: '$blue9',
    accentBg: withAlpha(BLUE, 0.12),
  },
  {
    key: 'fielding' as const,
    title: 'Fielding',
    accent: '$orange9',
    accentBg: withAlpha(ORANGE, 0.12),
  },
  {
    key: 'pitching' as const,
    title: 'Pitching',
    accent: '$green9',
    accentBg: withAlpha(GREEN, 0.12),
  },
];

const formatMultiplier = (value: number | undefined): string => {
  if (value === undefined) return '—';
  if (Number.isInteger(value)) return `${value}`;
  const formatted = value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return formatted;
};

/** Return the color token for a multiplier value. */
function multiplierColor(value: number, isOverride: boolean): string {
  if (isOverride) return '$blue11';
  if (value > 0) return '$green10';
  if (value < 0) return '$red10';
  return '$gray10';
}

const chipContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

export function LeagueScoringSummary(
  props: LeagueScoringSummaryProps,
): React.JSX.Element {
  const { loading, error, profileName, settings } = props;

  const defaults = useMemo(() => createDefaultScoringSettings(), []);
  const errorText = error?.message ?? null;

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      borderWidth={1}
      borderRadius="$6"
      overflow="hidden"
      width="100%"
      aria-labelledby="scoring-summary-title"
      style={{ boxShadow: `0 4px 24px ${withAlpha(BLACK, 0.25)}` }}
    >
      {/* Glassmorphism header */}
      <XStack
        paddingHorizontal="$5"
        paddingVertical="$4"
        alignItems="center"
        gap="$3"
        borderBottomWidth={1}
        borderBottomColor="$surfacePanelBorder"
        style={{
          background: `linear-gradient(135deg, ${withAlpha(BLUE, 0.08)} 0%, ${withAlpha(BG_DARK, 0.85)} 60%)`,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <XStack
          width={40}
          height={40}
          borderRadius="$4"
          alignItems="center"
          justifyContent="center"
          style={{
            background: `linear-gradient(135deg, ${withAlpha(BLUE, 0.35)}, ${withAlpha(BLUE, 0.12)})`,
            boxShadow: `0 0 16px ${withAlpha(BLUE, 0.25)}`,
          }}
        >
          <BarChart3 size={20} color="$blue10" />
        </XStack>
        <YStack flex={1}>
          <Text
            id="scoring-summary-title"
            fontSize="$5"
            fontWeight="700"
            color="$color12"
          >
            Scoring Multipliers
          </Text>
          <Text fontSize="$2" color="$gray9">
            Active profile: {profileName}
          </Text>
        </YStack>
      </XStack>

      <YStack padding="$4" gap="$4">
        {loading && (
          <YStack alignItems="center" padding="$4">
            <Text fontSize="$3" color="$gray9" role="status">
              Loading scoring profile…
            </Text>
          </YStack>
        )}

        {errorText && !loading && (
          <Card
            backgroundColor="$red2"
            borderColor="$red6"
            borderWidth={1}
            padding="$3"
            borderRadius="$4"
            role="alert"
          >
            <Text fontSize="$3" color="$red11">
              Failed to load scoring data: {errorText}
            </Text>
          </Card>
        )}

        {!loading &&
          !errorText &&
          GROUP_CONFIG.map((group) => {
            const groupSettings = settings[group.key] ?? {};
            const entries = Object.entries(groupSettings)
              .filter(
                (entry): entry is [string, number] =>
                  typeof entry[1] === 'number',
              )
              .sort(([, a], [, b]) => b - a);

            if (entries.length === 0) return null;

            const overrideCount = entries.filter(([key, value]) => {
              const defaultValue = defaults[group.key][key];
              return (
                typeof defaultValue === 'number' &&
                typeof value === 'number' &&
                defaultValue !== value
              );
            }).length;

            return (
              <YStack
                key={group.key}
                gap="$2"
                role="region"
                aria-label={`${group.title} multipliers`}
              >
                {/* Section header */}
                <XStack alignItems="center" gap="$2">
                  <XStack
                    width={3}
                    height={16}
                    borderRadius={2}
                    backgroundColor={group.accent}
                    flexShrink={0}
                  />
                  <Text fontSize="$3" fontWeight="700" color="$color12">
                    {group.title}
                  </Text>
                  <Text fontSize="$2" color="$gray8">
                    ({entries.length})
                  </Text>
                  {overrideCount > 0 && (
                    <XStack
                      backgroundColor="$blue3"
                      paddingHorizontal="$1.5"
                      paddingVertical={1}
                      borderRadius="$10"
                    >
                      <Text fontSize={9} fontWeight="700" color="$blue10">
                        {overrideCount} custom
                      </Text>
                    </XStack>
                  )}
                </XStack>

                {/* Stat chips */}
                <div style={chipContainerStyle}>
                  {entries.map(([key, value]) => {
                    const numValue = value;
                    const defaultValue = defaults[group.key][key];
                    const isOverride =
                      typeof defaultValue === 'number' &&
                      defaultValue !== numValue;

                    return (
                      <XStack
                        key={key}
                        alignItems="center"
                        gap="$1.5"
                        paddingHorizontal="$2.5"
                        paddingVertical="$1.5"
                        borderRadius="$3"
                        borderWidth={1}
                        borderColor={
                          isOverride ? '$blue6' : '$surfacePanelBorder'
                        }
                        backgroundColor={isOverride ? '$blue2' : '$background'}
                        animation="quick"
                        hoverStyle={{
                          backgroundColor: '$backgroundHover',
                        }}
                      >
                        <Text fontSize="$2" fontWeight="600" color="$color11">
                          {statLabel(key)}
                        </Text>
                        <Text
                          fontSize="$3"
                          fontWeight="700"
                          color={multiplierColor(numValue, isOverride)}
                        >
                          {numValue > 0 ? '+' : ''}
                          {formatMultiplier(numValue)}
                        </Text>
                      </XStack>
                    );
                  })}
                </div>
              </YStack>
            );
          })}
      </YStack>
    </Card>
  );
}
