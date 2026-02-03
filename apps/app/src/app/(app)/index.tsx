import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Button, H1, ScrollView, Text, XStack, YStack } from 'tamagui';

const sports = [
  { name: 'Football', route: 'Football' as const },
  { name: 'Baseball', route: 'Baseball' as const },
];

type RootStackParamList = {
  Home: undefined;
  Football: undefined;
  Baseball: undefined;
  About: undefined;
};

type NavigationProp = StackNavigationProp<RootStackParamList>;

export default function Home() {
  const navigation = useNavigation<NavigationProp>();

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack
        alignItems="center"
        backgroundColor="$background"
        flexGrow={1}
        justifyContent="center"
        padding="$5"
        space="$5"
      >
        <H1 color="$color" fontSize="$10" fontWeight="bold">
          Fantasy Sports Hub
        </H1>
        <Text color="$gray11" fontSize="$6">
          Choose your sport
        </Text>
        <XStack
          flexWrap="wrap"
          justifyContent="space-around"
          width="100%"
          space="$4"
        >
          {sports.map((sport) => (
            <Button
              key={sport.route}
              alignItems="center"
              backgroundColor="$gray8"
              borderRadius="$4"
              padding="$5"
              width="45%"
              marginBottom="$5"
              onPress={() => navigation.navigate(sport.route)}
            >
              <Text color="$color" fontSize="$6" fontWeight="600">
                {sport.name}
              </Text>
            </Button>
          ))}
        </XStack>

        {/* About button */}
        <Button
          alignItems="center"
          backgroundColor="$blue8"
          borderRadius="$4"
          padding="$4"
          width="100%"
          marginTop="$4"
          onPress={() => navigation.navigate('About')}
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
