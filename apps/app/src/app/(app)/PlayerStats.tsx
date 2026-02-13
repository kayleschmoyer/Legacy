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
    <YStack flex={1} backgroundColor="$background" padding="$4" space="$4">
      <YStack
        backgroundColor="$color2"
        borderColor="$borderColor"
        borderWidth={1}
        borderRadius="$4"
        padding="$4"
        alignItems="center"
        space="$3"
      >
        <Text
          fontSize="$6"
          fontWeight="bold"
          textAlign="center"
          color="$color12"
          accessibilityLabel="Player Statistics"
        >
          <span role="img" aria-label="chart">
            📊
          </span>{' '}
          Player Statistics
        </Text>
        <Text textAlign="center" color="$color10" fontSize="$4">
          Component implementation needed
        </Text>
        {/* TODO: Add actual player statistics functionality */}
      </YStack>
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
    <XStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      backgroundColor="$color2"
      borderBottomWidth={1}
      borderBottomColor="$borderColor"
      paddingVertical="$2"
    >
      <Text
        fontSize="$6"
        fontWeight="600"
        color="$color12"
        accessibilityLabel="Player Statistics"
      >
        <span role="img" aria-label="chart">
          📊
        </span>{' '}
        Player Statistics
      </Text>
    </XStack>
  );
}
