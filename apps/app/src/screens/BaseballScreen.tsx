import React from 'react';
import { Text, YStack } from 'tamagui';

export default function BaseballScreen() {
  return (
    <YStack
      flex={1}
      justifyContent="center"
      alignItems="center"
      backgroundColor="$gray12"
    >
      <Text fontSize="$7" fontWeight="bold" color="$white" marginBottom="$3">
        Baseball Fantasy
      </Text>
      <Text fontSize="$4" color="$gray8">
        Coming soon...
      </Text>
    </YStack>
  );
}
