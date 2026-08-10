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

/**
 * `positionBonuses` (LS-9104) is an optional, position-scoped bonus applied
 * additively on top of the base `scoringSettings` weight for the same stat
 * key — never a replacement. Keys with no matching entry in `scoringSettings`
 * default to a base weight of 0 so a bonus-only stat (no base multiplier)
 * still scores.
 */
export function computeScoring<
  T extends Record<string, number | string | null | undefined>,
>(
  statsRecord: T | null | undefined,
  scoringSettings: Partial<Record<keyof T, number>>,
  positionBonuses?: Partial<Record<keyof T, number>>,
): number {
  if (!statsRecord) {
    return 0;
  }

  let sum = 0;

  for (const key of Object.keys(statsRecord)) {
    const baseWeight = scoringSettings[key];
    const bonusWeight = positionBonuses?.[key];

    let base = 0;
    if (baseWeight) {
      if (typeof baseWeight !== 'number' || !Number.isFinite(baseWeight)) {
        throw new Error(`Cannot compute with non-finite multiplier: ${key}`);
      }
      base = baseWeight;
    }

    let bonus = 0;
    if (bonusWeight) {
      if (typeof bonusWeight !== 'number' || !Number.isFinite(bonusWeight)) {
        throw new Error(`Cannot compute with non-finite multiplier: ${key}`);
      }
      bonus = bonusWeight;
    }

    const multiplier = base + bonus;
    if (!multiplier) {
      continue;
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
