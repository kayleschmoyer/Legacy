import React from 'react';
import { useRouter } from 'expo-router';
import { Button, H1, ScrollView, Text, XStack, YStack } from 'tamagui';

const sports = [
  { name: 'Football', route: '/football' as const },
  { name: 'Baseball', route: '/baseball' as const },
];

export default function Home() {
  const router = useRouter();

  return (
    <ScrollView testID="home-screen" contentContainerStyle={{ flexGrow: 1 }}>
      <YStack
        testID="home-content"
        alignItems="center"
        backgroundColor="$background"
        flexGrow={1}
        justifyContent="center"
        padding="$5"
        space="$5"
      >
        <H1 testID="home-title" color="$color" fontSize="$10" fontWeight="bold">
          Fantasy Sports Hub
        </H1>
        <Text color="$gray11" fontSize="$6">
          Choose your sport
        </Text>
        <XStack
          testID="sport-selection"
          flexWrap="wrap"
          justifyContent="space-around"
          width="100%"
          space="$4"
        >
          {sports.map((sport) => (
            <Button
              testID={`sport-button-${sport.route.toLowerCase()}`}
              key={sport.route}
              alignItems="center"
              backgroundColor="$gray8"
              borderRadius="$4"
              padding="$5"
              width="45%"
              marginBottom="$5"
              onPress={() => router.push(sport.route)}
            >
              <Text color="$color" fontSize="$6" fontWeight="600">
                {sport.name}
              </Text>
            </Button>
          ))}
        </XStack>

        {/* About button */}
        <Button
          testID="about-button"
          alignItems="center"
          backgroundColor="$blue8"
          borderRadius="$4"
          padding="$4"
          width="100%"
          marginTop="$4"
          onPress={() => router.push('/about')}
        >
          <YStack>
            <Text color="$color" fontSize="$5" fontWeight="600">
              About
            </Text>
          </YStack>
        </Button>
      </YStack>
    </ScrollView>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
