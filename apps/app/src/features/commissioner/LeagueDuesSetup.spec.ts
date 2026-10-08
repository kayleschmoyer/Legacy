import { CombinedGraphQLErrors } from '@apollo/client';
import {
  GENERIC_DUES_SAVE_ERROR,
  getDuesSaveErrorMessage,
  parseDollarsToCents,
} from './LeagueDuesSetup';

describe('parseDollarsToCents', () => {
  it.each([
    ['', 0],
    ['.', 0],
    ['0', 0],
    ['0.1', 10],
    ['0.01', 1],
    ['19.99', 1999],
    ['100.5', 10050],
    ['10.10', 1010],
    ['12.05', 1205],
    ['50', 5000],
    ['50.00', 5000],
    ['1.01', 101],
    ['2.675', 267],
  ])('parseDollarsToCents(%s) === %d', (input, expected) => {
    expect(parseDollarsToCents(input)).toBe(expected);
  });
});

describe('getDuesSaveErrorMessage', () => {
  const RAW_COERCION_TEXT =
    'Variable "$input" got invalid value 99999999999 at "input.amountCents"; Int cannot represent non 32-bit signed integer value: 99999999999';

  it.each([
    [
      'a variable-coercion GraphQL error (no path)',
      new CombinedGraphQLErrors({
        errors: [
          {
            message: RAW_COERCION_TEXT,
            extensions: { code: 'BAD_USER_INPUT' },
          },
        ],
      }),
    ],
    [
      'a resolver error with a non-user-facing code',
      new CombinedGraphQLErrors({
        errors: [
          {
            message: 'relation "league_dues" does not exist',
            path: ['updateDuesSettings'],
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
          },
        ],
      }),
    ],
    ['a plain network error', new Error(RAW_COERCION_TEXT)],
    ['a non-Error value', 'boom'],
  ])('returns generic copy for %s', (_label, err) => {
    expect(getDuesSaveErrorMessage(err)).toBe(GENERIC_DUES_SAVE_ERROR);
  });

  it.each(['BAD_USER_INPUT', 'FORBIDDEN'])(
    'passes through a resolver-raised %s message',
    (code) => {
      const err = new CombinedGraphQLErrors({
        errors: [
          {
            message: 'Dues amount cannot exceed $10,000',
            path: ['updateDuesSettings'],
            extensions: { code },
          },
        ],
      });
      expect(getDuesSaveErrorMessage(err)).toBe(
        'Dues amount cannot exceed $10,000',
      );
    },
  );
});
