import React from 'react';
import { Card, Spinner, Text, XStack, YStack } from 'tamagui';
import { AlertCircle, CheckCircle } from '@tamagui/lucide-icons';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';
// import { StatsLoadingStatus } from '../../api/db/graphql.generated';

// TODO(LS-53): Placeholder until StatsLoadingStatus is implemented in schema
enum StatsLoadingStatus {
  NotStarted = 'NOT_STARTED',
  Loading = 'LOADING',
  Completed = 'COMPLETED',
  Error = 'ERROR',
  Failed = 'FAILED',
}
type StatsLoadingStatusType = StatsLoadingStatus | null | undefined;

export interface StatsLoadingIndicatorProps {
  status: StatsLoadingStatusType;
  compact?: boolean;
}

/**
 * StatsLoadingIndicator - Shows the current stats fetching status
 * Displays appropriate icon and message based on loading state
 */
export function StatsLoadingIndicator({
  status,
  compact = false,
}: StatsLoadingIndicatorProps) {
  if (!status || status === StatsLoadingStatus.NotStarted) {
    return null; // Don't show anything if stats loading hasn't started
  }

  const getStatusConfig = () => {
    switch (status) {
      case StatsLoadingStatus.Loading:
        return {
          icon: <Spinner size="small" color={BRAND_NAVY_LIGHT} />,
          color: BRAND_GOLD_LIGHT,
          bgColor: withAlpha(BRAND_NAVY_LIGHT, 0.18),
          text: 'Loading game stats...',
          description: 'Fetching player game data from Baseball Reference',
        };
      case StatsLoadingStatus.Completed:
        return {
          icon: <CheckCircle size={16} color="$green10" />,
          color: '$green10',
          bgColor: '$green3',
          text: 'Stats loaded',
          description: 'All game stats loaded successfully',
        };
      case StatsLoadingStatus.Failed:
        return {
          icon: <AlertCircle size={16} color="$red10" />,
          color: '$red10',
          bgColor: '$red3',
          text: 'Failed to load stats',
          description: 'There was an error loading game stats',
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  if (!config) return null;

  if (compact) {
    return (
      <XStack
        space="$2"
        alignItems="center"
        paddingHorizontal="$3"
        paddingVertical="$2"
        backgroundColor={config.bgColor}
        borderRadius="$3"
      >
        {config.icon}
        <Text fontSize="$2" color={config.color} fontWeight="500">
          {config.text}
        </Text>
      </XStack>
    );
  }

  return (
    <Card
      elevate
      size="$3"
      bordered
      backgroundColor={config.bgColor}
      borderColor={config.color}
      borderWidth={1}
    >
      <Card.Header padded>
        <XStack space="$3" alignItems="center">
          {config.icon}
          <YStack flex={1}>
            <Text fontSize="$4" color={config.color} fontWeight="bold">
              {config.text}
            </Text>
            <Text fontSize="$2" color="$gray11" marginTop="$1">
              {config.description}
            </Text>
          </YStack>
        </XStack>
      </Card.Header>
    </Card>
  );
}
