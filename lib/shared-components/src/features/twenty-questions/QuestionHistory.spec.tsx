import React from 'react';
import { TwentyQuestionsCategory } from '@legacy-sports/graphql';
import { QuestionHistory, type QuestionRecord } from './QuestionHistory';
import { render } from '../../test-utils';

const guess = (overrides: Partial<QuestionRecord> = {}): QuestionRecord => ({
  questionNumber: 1,
  category: TwentyQuestionsCategory.Position,
  parameter: '{}',
  answer: false,
  isGuess: true,
  guessPlayer: null,
  ...overrides,
});

describe('QuestionHistory', () => {
  it('names the guessed player on a guess row (LS-10676)', () => {
    const { getByTestId } = render(
      <QuestionHistory
        questions={[
          guess({
            questionNumber: 1,
            guessPlayer: { firstName: 'Babe', lastName: 'Ruth' },
          }),
          guess({
            questionNumber: 2,
            guessPlayer: { firstName: 'Willie', lastName: 'Mays' },
          }),
        ]}
      />,
    );
    expect(getByTestId('question-text-1').textContent).toBe(
      'Guessed Babe Ruth',
    );
    expect(getByTestId('question-text-2').textContent).toBe(
      'Guessed Willie Mays',
    );
    expect(getByTestId('question-answer-1').textContent).toBe('NO');
  });

  it('falls back to "Guessed a player" when the guessed player is unknown', () => {
    const { getByTestId } = render(
      <QuestionHistory
        questions={[
          guess({ questionNumber: 1, guessPlayer: null }),
          guess({
            questionNumber: 2,
            guessPlayer: { firstName: null, lastName: null },
          }),
        ]}
      />,
    );
    expect(getByTestId('question-text-1').textContent).toBe('Guessed a player');
    expect(getByTestId('question-text-2').textContent).toBe('Guessed a player');
  });

  it('still renders the question text for non-guess rows', () => {
    const { getByTestId } = render(
      <QuestionHistory
        questions={[
          {
            questionNumber: 1,
            category: TwentyQuestionsCategory.HallOfFame,
            parameter: '{}',
            answer: true,
            isGuess: false,
          },
        ]}
      />,
    );
    expect(getByTestId('question-text-1').textContent).toBe(
      'Is this player in the Hall of Fame?',
    );
  });
});
