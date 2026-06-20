import React from 'react';
import { Paragraph, ScrollView, Text, XStack, YStack } from 'tamagui';
import { TwentyQuestionsCategory } from '@legacy-sports/graphql';

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

// Read a list value supporting either the multi-select form (plural array key) or
// the legacy single-value form (singular scalar key). Returns rendered strings.
function readList(
  param: Record<string, unknown>,
  pluralKey: string,
  singularKey: string,
  render: (v: unknown) => string = (v) => String(v),
): string[] {
  const plural = param[pluralKey];
  if (Array.isArray(plural)) {
    return plural.map(render);
  }
  const single = param[singularKey];
  if (single === null || single === undefined) return [];
  return [render(single)];
}

function joinList(items: string[]): string {
  if (items.length === 0) return '?';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
}

function handLabel(h: string): string {
  return h === 'L' ? 'left-handed' : h === 'R' ? 'right-handed' : 'switch';
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
    case TwentyQuestionsCategory.Position: {
      const positions = readList(param, 'positions', 'position');
      return `Did this player ever play ${joinList(positions)}?`;
    }
    case TwentyQuestionsCategory.Team: {
      const teams = readList(param, 'teams', 'team');
      return `Did this player ever play for ${joinList(teams)}?`;
    }
    case TwentyQuestionsCategory.Era: {
      const decades = readList(
        param,
        'decades',
        'decade',
        (v) => `${String(v)}s`,
      );
      return `Did this player play in the ${joinList(decades)}?`;
    }
    case TwentyQuestionsCategory.HallOfFame:
      return 'Is this player in the Hall of Fame?';
    case TwentyQuestionsCategory.StatThreshold:
      return `Did this player accumulate ${strVal(param, 'threshold')}+ career ${strVal(param, 'stat').toUpperCase()}?`;
    case TwentyQuestionsCategory.BattingHand: {
      const labels = readList(param, 'hands', 'hand', (v) =>
        handLabel(String(v)),
      );
      return `Does this player bat ${joinList(labels)}?`;
    }
    case TwentyQuestionsCategory.ThrowingHand: {
      const labels = readList(param, 'hands', 'hand', (v) =>
        handLabel(String(v)),
      );
      return `Does this player throw ${joinList(labels)}?`;
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
