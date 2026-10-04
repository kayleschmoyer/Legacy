import {
  buildDisclosureScoringTable,
  calculateDisclosureScore,
  DISCLOSURE_MAX_SCORE,
  DISCLOSURE_MIN_CLUES,
  DISCLOSURE_MIN_SCORE,
} from './disclosure-scoring';

describe('calculateDisclosureScore', () => {
  it('awards the max score for the first clue', () => {
    expect(calculateDisclosureScore(1, 7)).toBe(DISCLOSURE_MAX_SCORE);
    expect(calculateDisclosureScore(0, 7)).toBe(DISCLOSURE_MAX_SCORE);
    expect(calculateDisclosureScore(1, 1)).toBe(DISCLOSURE_MAX_SCORE);
  });

  it('awards the floor score on the last clue', () => {
    expect(calculateDisclosureScore(5, 5)).toBe(DISCLOSURE_MIN_SCORE);
    expect(calculateDisclosureScore(12, 12)).toBe(DISCLOSURE_MIN_SCORE);
  });

  it('scales linearly between the first and last clue', () => {
    expect(
      Array.from({ length: 7 }, (_, i) => calculateDisclosureScore(i + 1, 7)),
    ).toEqual([1000, 850, 700, 550, 400, 250, 100]);
  });
});

describe('buildDisclosureScoringTable', () => {
  it('matches the server score for a 7-clue round, in 4 rows', () => {
    expect(buildDisclosureScoringTable(7)).toEqual([
      { label: '1 clue', value: '1,000 pts' },
      { label: '2–3 clues', value: '850–700 pts' },
      { label: '4–5 clues', value: '550–400 pts' },
      { label: '6–7 clues', value: '250–100 pts' },
    ]);
  });

  it('adapts to the minimum clue count', () => {
    expect(buildDisclosureScoringTable(5)).toEqual([
      { label: '1 clue', value: '1,000 pts' },
      { label: '2–3 clues', value: '775–550 pts' },
      { label: '4 clues', value: '325 pts' },
      { label: '5 clues', value: '100 pts' },
    ]);
  });

  it('falls back to the minimum clue count before a round starts', () => {
    expect(buildDisclosureScoringTable(0)).toEqual(
      buildDisclosureScoringTable(DISCLOSURE_MIN_CLUES),
    );
    expect(buildDisclosureScoringTable(Number.NaN)).toEqual(
      buildDisclosureScoringTable(DISCLOSURE_MIN_CLUES),
    );
  });

  it.each([1, 2, 3, 5, 6, 7, 10, 13, 25])(
    'covers every clue count of a %i-clue round exactly once, ending on the floor',
    (total) => {
      const rows = buildDisclosureScoringTable(total);
      expect(rows.length).toBeLessThanOrEqual(4);
      expect(rows[0]).toEqual({ label: '1 clue', value: '1,000 pts' });

      const covered: number[] = [];
      for (const { label } of rows) {
        const [from, to = from] = label
          .replace(/ clues?$/, '')
          .split('–')
          .map(Number);
        for (let n = from; n <= to; n++) covered.push(n);
      }
      expect(covered).toEqual(Array.from({ length: total }, (_, i) => i + 1));

      const last = rows[rows.length - 1].value;
      expect(last).toMatch(
        total === 1
          ? /^1,000 pts$/
          : new RegExp(`${DISCLOSURE_MIN_SCORE} pts$`),
      );
    },
  );

  it('never advertises "1 clue = 100 pts" (LS-10434)', () => {
    for (const total of [5, 7, 10]) {
      expect(buildDisclosureScoringTable(total)[0].value).not.toBe('100 pts');
    }
  });
});
