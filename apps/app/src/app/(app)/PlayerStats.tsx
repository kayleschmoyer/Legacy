import React from 'react';
import { Text, XStack, YStack } from 'tamagui';

/**
 * Mobile Player Statistics Screen
 *
 * A React Native screen component that will integrate cross-platform player statistics
 * with mobile-specific functionality.
 *
 * TODO: Implement PlayerStatsPage component or integrate with existing PlayersTable
 */
export default function PlayerStatsScreen() {
  return (
    <YStack flex={1} backgroundColor="$background" padding="$4">
      <Text
        fontSize="$6"
        fontWeight="bold"
        textAlign="center"
        marginBottom="$4"
      >
        Player Statistics
      </Text>
      <Text textAlign="center" color="$gray10">
        Component implementation needed
      </Text>
      {/* TODO: Add actual player statistics functionality */}
    </YStack>
  );
}

/**
 * PlayerStatsScreen Header Component
 *
 * Custom header component for the player stats screen that can be used
 * in the navigation options to provide consistent mobile styling.
 */
export function PlayerStatsScreenHeader() {
  return (
    <XStack flex={1} alignItems="center" justifyContent="center">
      <Text fontSize="$6" fontWeight="600" color="$color12">
        {/* eslint-disable-next-line jsx-a11y/accessible-emoji */}
        📊 Player Statistics
      </Text>
    </XStack>
  );
}
