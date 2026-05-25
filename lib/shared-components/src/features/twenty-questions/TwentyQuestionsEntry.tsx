import React from 'react';
import { Button, Paragraph, Text, XStack, YStack } from 'tamagui';
import {
  Sport,
  TwentyQuestionsDifficulty,
} from '../../api/db/graphql.generated';

export interface TwentyQuestionsEntryProps {
  difficulty: TwentyQuestionsDifficulty;
  onDifficultyChange: (d: TwentyQuestionsDifficulty) => void;
  sport: Sport;
  /** When undefined the sport selector is hidden (league context locks the sport). */
  onSportChange?: (s: Sport) => void;
  onStart: () => void;
  starting: boolean;
  hasActiveGame: boolean;
}

const DIFFICULTIES: { value: TwentyQuestionsDifficulty; label: string }[] = [
  { value: TwentyQuestionsDifficulty.Easy, label: 'Easy' },
  { value: TwentyQuestionsDifficulty.Medium, label: 'Medium' },
  { value: TwentyQuestionsDifficulty.Hard, label: 'Hard' },
];

const SPORTS: { value: Sport; label: string }[] = [
  { value: Sport.Baseball, label: 'Baseball' },
  { value: Sport.Football, label: 'Football' },
];

export const TwentyQuestionsEntry: React.FC<TwentyQuestionsEntryProps> = ({
  difficulty,
  onDifficultyChange,
  sport,
  onSportChange,
  onStart,
  starting,
  hasActiveGame,
}) => (
  <YStack
    flex={1}
    alignItems="center"
    justifyContent="center"
    padding="$6"
    gap="$5"
    testID="twenty-questions-entry"
  >
    <Text fontSize="$8" fontWeight="700" textAlign="center">
      20 Questions
    </Text>
    <Paragraph textAlign="center" color="$gray11" maxWidth={320}>
      Can you identify the mystery player in 20 yes/no questions? Guess sooner
      to earn more tokens.
    </Paragraph>

    {!hasActiveGame && (
      <YStack gap="$4" alignItems="center" width="100%">
        {onSportChange != null && (
          <YStack gap="$2" alignItems="center">
            <Text color="$gray10" fontSize="$3" marginBottom="$1">
              Sport
            </Text>
            <XStack gap="$2">
              {SPORTS.map((s) => (
                <Button
                  key={s.value}
                  size="$3"
                  theme={sport === s.value ? 'blue' : undefined}
                  variant={sport === s.value ? undefined : 'outlined'}
                  onPress={() => onSportChange(s.value)}
                  testID={`sport-${s.value}`}
                >
                  {s.label}
                </Button>
              ))}
            </XStack>
          </YStack>
        )}

        <YStack gap="$2" alignItems="center">
          <Text color="$gray10" fontSize="$3" marginBottom="$1">
            Difficulty
          </Text>
          <XStack gap="$2">
            {DIFFICULTIES.map((d) => (
              <Button
                key={d.value}
                size="$3"
                theme={difficulty === d.value ? 'blue' : undefined}
                variant={difficulty === d.value ? undefined : 'outlined'}
                onPress={() => onDifficultyChange(d.value)}
                testID={`difficulty-${d.value}`}
              >
                {d.label}
              </Button>
            ))}
          </XStack>
        </YStack>
      </YStack>
    )}

    <Button
      size="$5"
      theme="blue"
      onPress={onStart}
      disabled={starting}
      testID={hasActiveGame ? 'resume-game-button' : 'start-game-button'}
    >
      {starting ? 'Loading…' : hasActiveGame ? 'Resume Game' : 'Start Game'}
    </Button>
  </YStack>
);
