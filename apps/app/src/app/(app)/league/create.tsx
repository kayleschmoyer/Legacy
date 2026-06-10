import React from 'react';
import { useRouter } from 'expo-router';
import { Button, H1, Text, XStack, YStack } from 'tamagui';

export default function CreateLeagueSportPicker(): React.JSX.Element {
  const router = useRouter();

  return (
    <YStack
      flex={1}
      backgroundColor="$background"
      alignItems="center"
      justifyContent="center"
      padding="$6"
      gap="$6"
    >
      <YStack alignItems="center" gap="$2">
        <H1 size="$8" color="$color" textAlign="center">
          Create a League
        </H1>
        <Text size="$4" color="$gray11" textAlign="center">
          Which sport would you like to play?
        </Text>
      </YStack>

      <XStack gap="$4" width="100%" maxWidth={400}>
        <Button
          flex={1}
          size="$6"
          backgroundColor="$blue9"
          borderRadius="$4"
          onPress={() => router.push('/baseball/league/create')}
          pressStyle={{ opacity: 0.8, scale: 0.97 }}
          accessibilityRole="button"
          accessibilityLabel="Create a baseball league"
        >
          <YStack alignItems="center" gap="$2">
            <Text fontSize={36}>⚾</Text>
            <Text color="white" fontWeight="700" fontSize="$4">
              Baseball
            </Text>
          </YStack>
        </Button>

        <Button
          flex={1}
          size="$6"
          backgroundColor="$orange9"
          borderRadius="$4"
          onPress={() => router.push('/football/league/create')}
          pressStyle={{ opacity: 0.8, scale: 0.97 }}
          accessibilityRole="button"
          accessibilityLabel="Create a football league"
        >
          <YStack alignItems="center" gap="$2">
            <Text fontSize={36}>🏈</Text>
            <Text color="white" fontWeight="700" fontSize="$4">
              Football
            </Text>
          </YStack>
        </Button>
      </XStack>
    </YStack>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
