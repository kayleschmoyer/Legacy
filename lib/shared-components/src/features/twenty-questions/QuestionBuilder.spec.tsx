import React from 'react';
import { TwentyQuestionsCategory } from '@legacy-sports/graphql';
import {
  type AskPayload,
  parseStatThreshold,
  QuestionBuilder,
} from './QuestionBuilder';
import { fireEvent, render } from '../../test-utils';

describe('parseStatThreshold (LS-10504)', () => {
  it.each([
    '',
    '   ',
    'abc',
    'abc!@#',
    '-5',
    '0',
    '00',
    '1.5',
    '1e3',
    '100000',
  ])('rejects %p', (raw) => {
    expect(parseStatThreshold(raw)).toBeNull();
  });

  it.each([
    ['1', 1],
    ['500', 500],
    [' 42 ', 42],
    ['99999', 99999],
  ])('accepts %p', (raw, expected) => {
    expect(parseStatThreshold(raw)).toBe(expected);
  });

  it('rejects an over-long digit string instead of parsing to 1e+200', () => {
    expect(parseStatThreshold('9'.repeat(200))).toBeNull();
  });
});

describe('QuestionBuilder stat threshold (LS-10504)', () => {
  const setup = () => {
    const onAsk = jest.fn<void, [AskPayload]>();
    const utils = render(<QuestionBuilder onAsk={onAsk} asking={false} />);
    fireEvent.click(
      utils.getByTestId(`category-${TwentyQuestionsCategory.StatThreshold}`),
    );
    return { onAsk, ...utils };
  };

  const askButton = (el: HTMLElement) => el.closest('button') ?? el;

  it('allows asking with the default threshold', () => {
    const { onAsk, getByTestId, queryByTestId } = setup();
    expect(queryByTestId('threshold-error')).toBeNull();
    fireEvent.click(askButton(getByTestId('ask-question-button')));
    expect(onAsk).toHaveBeenCalledTimes(1);
    const { category, parameter } = onAsk.mock.calls[0][0];
    expect(category).toBe(TwentyQuestionsCategory.StatThreshold);
    expect(JSON.parse(parameter)).toMatchObject({ threshold: 500 });
  });

  it.each(['', 'abc', '-5', '0'])(
    'disables Ask and never submits for %p',
    (value) => {
      const { onAsk, getByTestId } = setup();
      fireEvent.change(getByTestId('threshold-input'), {
        target: { value },
      });
      expect(getByTestId('threshold-error')).toBeTruthy();
      fireEvent.click(askButton(getByTestId('ask-question-button')));
      expect(onAsk).not.toHaveBeenCalled();
    },
  );

  it('caps the input length', () => {
    const { getByTestId } = setup();
    expect(getByTestId('threshold-input').getAttribute('maxlength')).toBe('5');
  });
});
