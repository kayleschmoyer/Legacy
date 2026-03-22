import React from 'react';
import { Card, H4, Separator, Spinner, Text, XStack, YStack } from 'tamagui';
import { Clock, Scale, Trophy, User } from '@tamagui/lucide-icons';
import {
  TiebreakerMethod,
  useGetTiebreakerHistoryQuery,
} from '../../api/db/graphql.generated';
import { BRAND_NAVY_LIGHT } from '../../utils/colors';

export interface TiebreakerHistoryProps {
  leagueId: number;
  matchupId?: number;
}

const METHOD_LABELS: Record<TiebreakerMethod, string> = {
  [TiebreakerMethod.HighestCategory]: 'Highest Category',
  [TiebreakerMethod.TotalSeasonPoints]: 'Total Season Points',
  [TiebreakerMethod.HeadToHeadRecord]: 'Head-to-Head Record',
  [TiebreakerMethod.Random]: 'Random',
  [TiebreakerMethod.CoChampion]: 'Co-Champion',
};

/**
 * TiebreakerHistory — Displays the history of tiebreaker resolutions.
 *
 * Shows each resolved tiebreaker with the method used, winner, reason,
 * and whether the commissioner manually overrode it.
 * Cross-platform: Tamagui only, no web-specific APIs.
 */
export function TiebreakerHistory({
  leagueId,
  matchupId,
}: TiebreakerHistoryProps) {
  const { data, loading } = useGetTiebreakerHistoryQuery({
    variables: { leagueId, matchupId },
  });

  const history = data?.getTiebreakerHistory;

  if (loading) {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        padding="$5"
        borderRadius="$6"
      >
        <YStack alignItems="center" justifyContent="center" padding="$6">
          <Spinner size="large" />
          <Text fontSize="$3" color="$gray10" marginTop="$2">
            Loading tiebreaker history...
          </Text>
        </YStack>
      </Card>
    );
  }

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      padding="$5"
      borderRadius="$6"
    >
      <YStack gap="$4">
        {/* Header */}
        <XStack alignItems="center" gap="$2">
          <Clock size={20} color={BRAND_NAVY_LIGHT} />
          <YStack>
            <H4 margin={0}>Tiebreaker History</H4>
            <Text fontSize="$2" color="$gray10">
              Past tiebreaker resolutions for this league.
            </Text>
          </YStack>
        </XStack>

        {!history || history.length === 0 ? (
          <YStack
            padding="$4"
            alignItems="center"
            backgroundColor="$gray2"
            borderRadius="$4"
          >
            <Scale size={32} color="$gray8" />
            <Text
              fontSize="$3"
              color="$gray10"
              marginTop="$2"
              textAlign="center"
            >
              No tiebreakers have been resolved yet.
            </Text>
          </YStack>
        ) : (
          <YStack gap="$3">
            {history.map((entry, index) => (
              <React.Fragment key={entry.id ?? index}>
                {index > 0 && <Separator />}
                <YStack gap="$2" padding="$2">
                  <XStack
                    justifyContent="space-between"
                    alignItems="center"
                    flexWrap="wrap"
                    gap="$2"
                  >
                    <XStack alignItems="center" gap="$2">
                      <Trophy size={16} color={BRAND_NAVY_LIGHT} />
                      <Text fontWeight="600" fontSize="$3" color="$color">
                        {entry.winner?.name ?? 'Unknown team'}
                      </Text>
                    </XStack>
                    <Text fontSize="$2" color="$gray9">
                      {entry.resolvedAt
                        ? new Date(entry.resolvedAt).toLocaleDateString()
                        : ''}
                    </Text>
                  </XStack>

                  <XStack gap="$3" flexWrap="wrap">
                    <XStack alignItems="center" gap="$1">
                      <Scale size={12} color="$gray9" />
                      <Text fontSize="$2" color="$gray10">
                        {entry.appliedMethod
                          ? METHOD_LABELS[entry.appliedMethod]
                          : 'Unknown'}
                      </Text>
                    </XStack>

                    {entry.wasCommissionerOverride && (
                      <XStack alignItems="center" gap="$1">
                        <User size={12} color="$yellow10" />
                        <Text fontSize="$2" color="$yellow10" fontWeight="600">
                          Commissioner Override
                        </Text>
                      </XStack>
                    )}
                  </XStack>

                  {entry.reason && (
                    <Text fontSize="$2" color="$gray9" fontStyle="italic">
                      {entry.reason}
                    </Text>
                  )}
                </YStack>
              </React.Fragment>
            ))}
          </YStack>
        )}
      </YStack>
    </Card>
  );
}
