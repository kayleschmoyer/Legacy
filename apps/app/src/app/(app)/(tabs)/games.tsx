import React from 'react';
import { ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import { trackMinigameTap } from '../../../utils/analytics';

const BG_DEEP_NAVY = '#0A0F1A';

type GameEntry = {
  id: string;
  title: string;
  tag: string;
  description: string;
  route: string;
  cta: string;
};

const GAMES: GameEntry[] = [
  {
    id: 'season-draft',
    title: 'Season Draft',
    tag: 'Multiplayer · 2–6 players',
    description:
      'Draft hitters or pitchers across eras. Pick the right season, fill your roster, rack up the counting stats.',
    route: '/season-draft',
    cta: 'Enter Lobby',
  },
  {
    id: 'disclosure',
    title: 'Who Am I?',
    tag: 'Solo · 2–3 min',
    description:
      'Clues drop one at a time — birthplace, era, quirks, milestones. Name the player with the fewest clues revealed.',
    route: '/disclosure-game',
    cta: 'Play Now',
  },
  {
    id: 'twenty-questions',
    title: '20 Questions',
    tag: 'Solo · 3–5 min',
    description:
      'Ask up to 20 yes/no questions to identify the mystery player. Fewer questions means more tokens.',
    route: '/games/twenty-questions',
    cta: 'Play Now',
  },
];

function GameCard({ game }: { game: GameEntry }) {
  const router = useRouter();

  function handlePress() {
    trackMinigameTap(game.id);
    router.push(game.route as Parameters<typeof router.push>[0]);
  }

  return (
    <YStack
      onPress={handlePress}
      backgroundColor="$color2"
      borderRadius="$4"
      padding="$4"
      borderWidth={1}
      borderColor="$glassBorder"
      gap="$2"
      pressStyle={{ opacity: 0.8, borderColor: '$brandGold' }}
      testID={`games-entry-${game.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${game.title} — ${game.tag}`}
    >
      <Text
        fontSize="$2"
        letterSpacing={1}
        textTransform="uppercase"
        color="$textMuted"
      >
        {game.tag}
      </Text>
      <Text fontSize="$8" fontWeight="800" letterSpacing={-0.5} color="$color">
        {game.title}
      </Text>
      <Text fontSize="$3" lineHeight="$5" color="$textMuted">
        {game.description}
      </Text>
      <XStack marginTop="$2">
        <Text
          fontSize="$2"
          letterSpacing={1}
          textTransform="uppercase"
          fontWeight="700"
          color="$brandGold"
        >
          {game.cta} →
        </Text>
      </XStack>
    </YStack>
  );
}

export default function GamesTab() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG_DEEP_NAVY }}
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      testID="games-tab-screen"
    >
      <YStack gap="$2" marginBottom="$5">
        <Text
          fontSize="$2"
          letterSpacing={2}
          textTransform="uppercase"
          fontWeight="700"
          color="$brandGold"
        >
          Minigames
        </Text>
        <Text
          fontSize="$8"
          fontWeight="800"
          letterSpacing={-0.5}
          lineHeight="$8"
          color="$color"
        >
          {`The game doesn't stop\nwhen the season does.`}
        </Text>
        <Text fontSize="$4" lineHeight="$6" color="$textMuted">
          Quick-draft showdowns and trivia built on 150 years of archived
          statistics.
        </Text>
      </YStack>

      <YStack gap="$3">
        {GAMES.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </YStack>
    </ScrollView>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
