import { parseDollarsToCents } from './LeagueDuesSetup';

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
