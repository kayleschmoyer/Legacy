import React, { useMemo } from 'react';
import {
  Card,
  humanizeString,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { BarChart3 } from '@tamagui/lucide-icons';
import { Text } from 'tamagui';
import {
  createDefaultScoringSettings,
  type ScoringSettings,
} from '../../lib/scoring';

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
    description: 'Applies to all hitter stat totals.',
    accent: '$blue9',
    gradientFrom: 'rgba(59,130,246,0.15)',
  },
  {
    key: 'fielding' as const,
    title: 'Fielding',
    description: 'Fielding bonuses and penalties.',
    accent: '$orange9',
    gradientFrom: 'rgba(249,115,22,0.15)',
  },
  {
    key: 'pitching' as const,
    title: 'Pitching',
    description: 'Earned by pitchers across starts and relief outings.',
    accent: '$green9',
    gradientFrom: 'rgba(34,197,94,0.15)',
  },
];

const formatMultiplier = (value: number | undefined): string => {
  if (value === undefined) return '—';
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
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
      aria-labelledby="scoring-summary-title"
      style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.25)' }}
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
          background:
            'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(10,15,26,0.85) 60%)',
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
            background:
              'linear-gradient(135deg, rgba(59,130,246,0.35), rgba(59,130,246,0.12))',
            boxShadow: '0 0 16px rgba(59,130,246,0.25)',
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

      <YStack padding="$4" space="$3">
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

        {!loading && !errorText && (
          <XStack gap="$3" flexWrap="wrap">
            {GROUP_CONFIG.map((group) => {
              const groupSettings = settings[group.key] ?? {};
              const entries = Object.entries(groupSettings)
                .filter(([, value]) => typeof value === 'number')
                .sort(([a], [b]) => a.localeCompare(b));

              const overrideCount = entries.filter(([key, value]) => {
                const defaultValue = defaults[group.key][key];
                return (
                  typeof defaultValue === 'number' &&
                  typeof value === 'number' &&
                  defaultValue !== value
                );
              }).length;

              return (
                <Card
                  key={group.key}
                  flex={1}
                  minWidth={220}
                  borderColor="$surfacePanelBorder"
                  borderWidth={1}
                  borderRadius="$5"
                  overflow="hidden"
                  role="region"
                  aria-label={`${group.title} multipliers`}
                  animation="quick"
                  hoverStyle={{ borderColor: '$borderColorHover' }}
                  style={{
                    background: `linear-gradient(180deg, ${group.gradientFrom} 0%, transparent 50%)`,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  }}
                >
                  {/* Group header */}
                  <XStack
                    paddingHorizontal="$3"
                    paddingVertical="$2.5"
                    alignItems="center"
                    gap="$2"
                    borderBottomWidth={1}
                    borderBottomColor="$surfacePanelBorder"
                  >
                    <XStack
                      width={3}
                      height={18}
                      borderRadius={2}
                      backgroundColor={group.accent}
                    />
                    <YStack flex={1}>
                      <XStack alignItems="center" gap="$2">
                        <Text fontSize="$3" fontWeight="700" color="$color12">
                          {group.title}
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
                      <Text fontSize={11} color="$gray8">
                        {group.description}
                      </Text>
                    </YStack>
                  </XStack>

                  {/* Stat list */}
                  <YStack padding="$2.5" space="$1">
                    {entries.length === 0 && (
                      <Text fontSize="$2" color="$gray8" paddingHorizontal="$1">
                        No stats configured yet.
                      </Text>
                    )}
                    {entries.map(([key, value]) => {
                      const defaultValue = defaults[group.key][key];
                      const isOverride =
                        typeof defaultValue === 'number' &&
                        typeof value === 'number' &&
                        defaultValue !== value;

                      return (
                        <XStack
                          key={key}
                          justifyContent="space-between"
                          alignItems="center"
                          paddingVertical="$1"
                          paddingHorizontal="$1.5"
                          borderRadius="$2"
                          animation="quick"
                          hoverStyle={{
                            backgroundColor: '$backgroundHover',
                          }}
                          style={{ transition: 'background-color 0.15s ease' }}
                        >
                          <Text fontSize="$2" color="$color12">
                            {humanizeString(key)}
                          </Text>
                          <XStack alignItems="center" gap="$1.5">
                            <Text
                              fontSize="$2"
                              fontWeight={isOverride ? '700' : '500'}
                              color={isOverride ? '$blue11' : '$gray10'}
                            >
                              {formatMultiplier(value)}x
                            </Text>
                            {isOverride && (
                              <XStack
                                width={6}
                                height={6}
                                borderRadius={3}
                                backgroundColor="$blue9"
                              />
                            )}
                          </XStack>
                        </XStack>
                      );
                    })}
                  </YStack>
                </Card>
              );
            })}
          </XStack>
        )}
      </YStack>
    </Card>
  );
}
