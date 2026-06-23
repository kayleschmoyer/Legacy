import React from 'react';
import { Pressable } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from '@tamagui/lucide-icons';
import { PlayerDetailById } from '@legacy-sports/shared-components';
import { Button, Text, YStack } from 'tamagui';
import { toIntId } from '../../common/utilities/RouteUtils';

const PLAYERS_FALLBACK = '/(tabs)/players' as const;

export default function PlayerDetailScreen() {
  const { playerId, playerName } = useLocalSearchParams<{
    playerId: string;
    playerName: string;
  }>();
  const router = useRouter();

  const id = toIntId(playerId);

  if (id === null) {
    return (
      <YStack
        flex={1}
        justifyContent="center"
        alignItems="center"
        padding="$5"
        backgroundColor="$background"
        gap="$4"
      >
        <Text fontSize="$8" fontWeight="700" textAlign="center">
          Player Not Found
        </Text>
        <Text fontSize="$4" textAlign="center" color="$color10">
          This link contains an invalid or missing player ID.
        </Text>
        <Button
          testID="player-detail-invalid-back"
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace(PLAYERS_FALLBACK)
          }
          borderRadius="$3"
          paddingHorizontal="$5"
        >
          <Text fontWeight="700" fontSize="$4">
            Go Back
          </Text>
        </Button>
      </YStack>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: ({ canGoBack }) => (
            <Pressable
              testID="player-detail-header-back"
              onPress={() =>
                canGoBack ? router.back() : router.replace(PLAYERS_FALLBACK)
              }
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <ChevronLeft size={24} color="#1B3A5C" />
            </Pressable>
          ),
        }}
      />
      <PlayerDetailById playerId={id} initialName={playerName} />
    </>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
