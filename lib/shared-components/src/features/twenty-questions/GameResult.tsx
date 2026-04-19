import React from 'react';
import { Button, Paragraph, Text, YStack } from 'tamagui';
import { TwentyQuestionsStatus } from '../../api/db/graphql.generated';

interface TargetPlayer {
  id?: number | null;
  firstName?: string | null;
  lastName?: string | null;
  eligiblePositions?: string[] | null;
}

interface GameResultProps {
  status: TwentyQuestionsStatus;
  targetPlayer: TargetPlayer | null;
  tokensEarned: number | null;
  questionsUsed: number;
  maxQuestions: number;
  onPlayAgain: () => void;
  onBack: () => void;
}

export const GameResult: React.FC<GameResultProps> = ({
  status,
  targetPlayer,
  tokensEarned,
  questionsUsed,
  maxQuestions,
  onPlayAgain,
  onBack,
}) => {
  const won = status === TwentyQuestionsStatus.Won;
  const playerName = targetPlayer
    ? `${targetPlayer.firstName ?? ''} ${targetPlayer.lastName ?? ''}`.trim()
    : null;
  const positions = targetPlayer?.eligiblePositions?.join(', ') ?? null;

  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      padding="$6"
      gap="$4"
      testID="twenty-questions-result"
    >
      <Text
        fontSize="$9"
        fontWeight="800"
        testID="result-emoji"
        role="img"
        accessibilityLabel={won ? 'trophy' : 'cross mark'}
      >
        {won ? '🏆' : '❌'}
      </Text>

      <Text fontSize="$7" fontWeight="700" testID="result-headline">
        {won ? 'You got it!' : 'Better luck next time'}
      </Text>

      {playerName && (
        <YStack alignItems="center" gap="$1">
          <Text
            fontSize="$6"
            fontWeight="700"
            color="$gray12"
            testID="target-player-name"
          >
            {playerName}
          </Text>
          {positions && (
            <Text
              fontSize="$3"
              color="$gray10"
              testID="target-player-positions"
            >
              {positions}
            </Text>
          )}
        </YStack>
      )}

      {won && tokensEarned != null && tokensEarned > 0 && (
        <Text
          fontSize="$6"
          fontWeight="700"
          color="#C5A55A"
          testID="tokens-earned"
        >
          +{tokensEarned} tokens
        </Text>
      )}

      <Paragraph color="$gray10" testID="questions-used">
        Questions used: {questionsUsed} / {maxQuestions}
      </Paragraph>

      <Button
        size="$5"
        theme="blue"
        onPress={onPlayAgain}
        testID="play-again-button"
      >
        Play Again
      </Button>
      <Button size="$3" chromeless onPress={onBack} testID="back-button">
        Back
      </Button>
    </YStack>
  );
};
