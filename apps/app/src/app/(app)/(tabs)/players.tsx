import React, { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useFeatureIsOn } from '@growthbook/growthbook-react';
import PlayerStatsScreen from '../PlayerStats';
import PlayerComparisonScreen from '../PlayerComparison';
import FootballPlayers from '../football/players';

type Segment = 'stats' | 'compare';
type Sport = 'baseball' | 'football';

function SegmentButton({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}): React.JSX.Element {
  return (
    <YStack
      testID={testID}
      flex={1}
      paddingVertical="$2"
      alignItems="center"
      justifyContent="center"
      backgroundColor={active ? '#1B3A5C' : 'transparent'}
      borderRadius="$2"
      onPress={onPress}
      pressStyle={{ opacity: 0.8 }}
    >
      <Text
        fontSize="$3"
        fontWeight="700"
        color={active ? 'white' : '$colorSubtle'}
      >
        {label}
      </Text>
    </YStack>
  );
}

function SportPill({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}): React.JSX.Element {
  return (
    <YStack
      testID={testID}
      paddingHorizontal="$3"
      paddingVertical="$1"
      borderRadius="$10"
      borderWidth={1}
      borderColor={active ? '#1B3A5C' : '$borderColor'}
      backgroundColor={active ? '#1B3A5C22' : 'transparent'}
      onPress={onPress}
      pressStyle={{ opacity: 0.8 }}
    >
      <Text
        fontSize="$3"
        fontWeight="600"
        color={active ? '#1B3A5C' : '$colorSubtle'}
      >
        {label}
      </Text>
    </YStack>
  );
}

export default function PlayersTab(): React.JSX.Element {
  const [segment, setSegment] = useState<Segment>('stats');
  const [sport, setSport] = useState<Sport>('baseball');
  const footballEnabled = useFeatureIsOn('football_enabled');

  return (
    <YStack flex={1} backgroundColor="$background">
      {/* Segmented control: Stats | Compare */}
      <XStack
        testID="players-segment-control"
        margin="$3"
        marginBottom="$2"
        backgroundColor="$gray3"
        borderRadius="$3"
        padding="$1"
        gap="$1"
      >
        <SegmentButton
          testID="segment-stats"
          label="Stats"
          active={segment === 'stats'}
          onPress={() => setSegment('stats')}
        />
        <SegmentButton
          testID="segment-compare"
          label="Compare"
          active={segment === 'compare'}
          onPress={() => setSegment('compare')}
        />
      </XStack>

      {/* Sport filter — only shown when football is enabled */}
      {footballEnabled && (
        <XStack
          testID="players-sport-filter"
          paddingHorizontal="$3"
          paddingBottom="$2"
          gap="$2"
        >
          <SportPill
            testID="sport-baseball"
            label="Baseball"
            active={sport === 'baseball'}
            onPress={() => setSport('baseball')}
          />
          <SportPill
            testID="sport-football"
            label="Football"
            active={sport === 'football'}
            onPress={() => setSport('football')}
          />
        </XStack>
      )}

      {/* Content area */}
      <YStack flex={1}>
        {segment === 'stats' && (sport === 'baseball' || !footballEnabled) && (
          <PlayerStatsScreen />
        )}
        {segment === 'stats' && sport === 'football' && footballEnabled && (
          <FootballPlayers />
        )}
        {segment === 'compare' && <PlayerComparisonScreen />}
      </YStack>
    </YStack>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
