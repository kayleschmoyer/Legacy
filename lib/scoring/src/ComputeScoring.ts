export function computeAverageScoring<
  T extends Record<string, number | string | null | undefined> & {
    g?: number | null;
  },
>(
  statsRecord: T | null | undefined,
  scoringSettings: Partial<Record<keyof T, number>>,
): number {
  if (!statsRecord?.g) {
    return 0;
  }

  const totalScore = computeScoring(statsRecord, scoringSettings);
  return totalScore / statsRecord.g;
}

export function computeScoring<
  T extends Record<string, number | string | null | undefined>,
>(
  statsRecord: T | null | undefined,
  scoringSettings: Partial<Record<keyof T, number>>,
): number {
  if (!statsRecord) {
    return 0;
  }

  let sum = 0;

  for (const key of Object.keys(statsRecord)) {
    const multiplier = scoringSettings[key];

    if (!multiplier) {
      continue;
    }

    if (typeof multiplier !== 'number' || !Number.isFinite(multiplier)) {
      throw new Error(`Cannot compute with non-finite multiplier: ${key}`);
    }

    const value = statsRecord[key];

    if (value === null) {
      continue;
    }

    if (typeof value !== 'number') {
      throw new Error(`Cannot compute non-numeric stat: ${key}`);
    }

    sum += multiplier * value;
  }

  return sum;
}
