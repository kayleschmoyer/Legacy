import React from 'react';
import { Text } from 'tamagui';
import { YStack } from '../Layout';

// Sports-themed color tokens
const SPORTS_COLORS = {
  background: '#121212',
  gold: '#FFD700',
  white: '#FFFFFF',
} as const;

function FootballScreen() {
  return (
    <YStack
      ai="center"
      bg={SPORTS_COLORS.background}
      flexGrow={1}
      p="$4"
      $web={{
        minHeight: '60vh',
        display: 'flex',
      }}
    >
      <Text
        color={SPORTS_COLORS.gold}
        fontSize="$8"
        fontWeight="bold"
        marginBottom="$2"
        $web={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        Football Fantasy
      </Text>
      <Text
        color={SPORTS_COLORS.white}
        fontSize="$5"
        marginBottom="$4"
        $web={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        Manage your leagues and drafts
      </Text>

      <Text
        color={SPORTS_COLORS.white}
        fontSize="$7"
        fontWeight="600"
        marginBottom="$2"
        $web={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        Upcoming Drafts
      </Text>
    </YStack>
  );
}

function BaseballScreen() {
  return (
    <YStack
      ai="center"
      bg={SPORTS_COLORS.background}
      flexGrow={1}
      p="$4"
      $web={{
        minHeight: '60vh',
        display: 'flex',
      }}
    >
      <Text
        color={SPORTS_COLORS.gold}
        fontSize="$8"
        fontWeight="bold"
        marginBottom="$2"
        $web={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        Baseball Fantasy
      </Text>
      <Text
        color={SPORTS_COLORS.white}
        fontSize="$5"
        marginBottom="$4"
        $web={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        Where Legends Are Made
      </Text>

      <Text
        color={SPORTS_COLORS.white}
        fontSize="$7"
        fontWeight="600"
        marginBottom="$2"
        $web={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        Manage Your Leagues
      </Text>
    </YStack>
  );
}

export { FootballScreen };
export { BaseballScreen };
