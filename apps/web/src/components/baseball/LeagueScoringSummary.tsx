import React, { useMemo } from 'react';
import {
  Card,
  humanizeString,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { Text } from 'tamagui';
import type { ApolloError } from '@apollo/client';
import { createDefaultScoringSettings, type ScoringSettings } from '../../lib/scoring';

interface LeagueScoringSummaryProps {
  loading: boolean;
  error?: ApolloError | null;
  profileName: string;
  settings: ScoringSettings;
}

const GROUP_CONFIG = [
  {
    key: 'batting' as const,
    title: 'Batting',
    description: 'Applies to all hitter stat totals.',
  },
  {
    key: 'fielding' as const,
    title: 'Fielding',
    description: 'Fielding bonuses and penalties.',
  },
  {
    key: 'pitching' as const,
    title: 'Pitching',
    description: 'Earned by pitchers across starts and relief outings.',
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
      padding="$5"
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      borderWidth={1}
      borderRadius="$6"
      aria-labelledby="scoring-summary-title"
    >
      <YStack space="$4">
        <YStack space="$1">
          <Text id="scoring-summary-title" fontSize="$5" fontWeight="700">
            Scoring Multipliers
          </Text>
          <Text fontSize="$3" color="$textMuted">
            Active profile: {profileName}
          </Text>
        </YStack>

        {loading && (
          <Text fontSize="$3" color="$textMuted" role="status">
            Loading scoring profile...
          </Text>
        )}

        {errorText && !loading && (
          <Text fontSize="$3" color="$red10" role="alert">
            Failed to load scoring data: {errorText}
          </Text>
        )}

        {!loading && !errorText && (
          <XStack gap="$4" flexWrap="wrap">
            {GROUP_CONFIG.map((group) => {
              const groupSettings = settings[group.key] ?? {};
              const entries = Object.entries(groupSettings)
                .filter(([, value]) => typeof value === 'number')
                .sort(([a], [b]) => a.localeCompare(b));

              return (
                <Card
                  key={group.key}
                  padding="$4"
                  flex={1}
                  minWidth={220}
                  backgroundColor="$surfaceSubtle"
                  borderColor="$surfacePanelBorder"
                  borderWidth={1}
                  borderRadius="$5"
                  role="region"
                  aria-label={`${group.title} multipliers`}
                >
                  <YStack space="$2">
                    <YStack space="$1">
                      <Text fontSize="$4" fontWeight="600">
                        {group.title}
                      </Text>
                      <Text fontSize="$2" color="$textMuted">
                        {group.description}
                      </Text>
                    </YStack>
                    <Separator borderColor="$outlineSubtle" />
                    <YStack space="$1">
                      {entries.length === 0 && (
                        <Text fontSize="$2" color="$textMuted">
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
                          >
                            <Text fontSize="$3" color="$color12">
                              {humanizeString(key)}
                            </Text>
                            <Text
                              fontSize="$3"
                              fontWeight={isOverride ? '700' : '500'}
                              color={isOverride ? '$blue11' : '$textMuted'}
                            >
                              {formatMultiplier(value)}x
                              {isOverride ? ' • Custom' : ''}
                            </Text>
                          </XStack>
                        );
                      })}
                    </YStack>
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
