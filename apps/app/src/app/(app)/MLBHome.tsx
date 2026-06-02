import React from 'react';
import { H1, H2, ScrollView, Text, YStack } from 'tamagui';

export default function BaseballHome() {
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack
        alignItems="center"
        backgroundColor="$background"
        flexGrow={1}
        padding="$5"
        space="$4"
      >
        <H1 color="$orange10" fontSize="$9" fontWeight="bold" marginBottom="$2">
          Baseball Fantasy
        </H1>
        <Text color="$color" fontSize="$6" marginBottom="$5">
          Manage your leagues and drafts
        </Text>

        <H2 color="$color" fontSize="$8" fontWeight="600" marginBottom="$2">
          Upcoming Games
        </H2>
      </YStack>
    </ScrollView>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
