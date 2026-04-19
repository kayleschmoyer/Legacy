import React from 'react';
import { Paragraph, ScrollView, Text, XStack, YStack } from 'tamagui';
import { TwentyQuestionsCategory } from '../../api/db/graphql.generated';

export interface QuestionRecord {
  questionNumber: number;
  category: TwentyQuestionsCategory;
  parameter: string;
  answer: boolean;
  isGuess: boolean;
}

interface QuestionHistoryProps {
  questions: QuestionRecord[];
}

function strVal(param: Record<string, unknown>, key: string): string {
  const v = param[key];
  if (v === null || v === undefined) return '?';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    return String(v);
  return '?';
}

function formatQuestion(
  category: TwentyQuestionsCategory,
  parameterJson: string,
): string {
  let param: Record<string, unknown> = {};
  try {
    param = JSON.parse(parameterJson) as Record<string, unknown>;
  } catch {
    // ignore
  }

  switch (category) {
    case TwentyQuestionsCategory.Position:
      return `Did this player ever play ${strVal(param, 'position')}?`;
    case TwentyQuestionsCategory.Team:
      return `Did this player ever play for ${strVal(param, 'team')}?`;
    case TwentyQuestionsCategory.Era:
      return `Did this player play in the ${strVal(param, 'decade')}s?`;
    case TwentyQuestionsCategory.HallOfFame:
      return 'Is this player in the Hall of Fame?';
    case TwentyQuestionsCategory.StatThreshold:
      return `Did this player accumulate ${strVal(param, 'threshold')}+ career ${strVal(param, 'stat').toUpperCase()}?`;
    case TwentyQuestionsCategory.BattingHand: {
      const hand = strVal(param, 'hand');
      const label =
        hand === 'L' ? 'left-handed' : hand === 'R' ? 'right-handed' : 'switch';
      return `Does this player bat ${label}?`;
    }
    case TwentyQuestionsCategory.ThrowingHand: {
      const hand = strVal(param, 'hand');
      return `Does this player throw ${hand === 'L' ? 'left-handed' : 'right-handed'}?`;
    }
    case TwentyQuestionsCategory.ActiveStatus:
      return 'Is this player currently active (2023+)?';
    default:
      return category;
  }
}

export const QuestionHistory: React.FC<QuestionHistoryProps> = ({
  questions,
}) => {
  if (questions.length === 0) {
    return (
      <Paragraph color="$gray10" textAlign="center" paddingVertical="$4">
        No questions asked yet. Use the builder below to ask your first
        question.
      </Paragraph>
    );
  }

  return (
    <ScrollView testID="question-history">
      <YStack gap="$2">
        {questions.map((q) => (
          <XStack
            key={q.questionNumber}
            backgroundColor="$gray2"
            borderRadius="$3"
            padding="$3"
            alignItems="center"
            gap="$3"
            testID={`question-${q.questionNumber}`}
          >
            <Text
              fontSize="$2"
              color="$gray9"
              fontWeight="600"
              minWidth={30}
              testID={`question-label-${q.questionNumber}`}
            >
              {q.isGuess ? 'G' : `Q${q.questionNumber}`}
            </Text>
            <Paragraph
              flex={1}
              fontSize="$3"
              testID={`question-text-${q.questionNumber}`}
            >
              {q.isGuess
                ? `Guessed a player`
                : formatQuestion(q.category, q.parameter)}
            </Paragraph>
            <YStack
              backgroundColor={q.answer ? '#4CAF50' : '#F44336'}
              borderRadius="$2"
              paddingHorizontal="$2"
              paddingVertical="$1"
              testID={`question-answer-${q.questionNumber}`}
            >
              <Text fontSize="$2" color="white" fontWeight="700">
                {q.answer ? 'YES' : 'NO'}
              </Text>
            </YStack>
          </XStack>
        ))}
      </YStack>
    </ScrollView>
  );
};
