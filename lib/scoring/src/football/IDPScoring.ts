export interface IDPScoringSettings {
  solo_tkl: number;
  ast_tkl: number;
  sacks: number;
  int: number;
  pd: number;
  ff: number;
  fr: number;
  def_td: number;
  safeties: number;
}

export interface GameFootballDefenseIdp {
  solo_tkl?: number | null;
  ast_tkl?: number | null;
  sacks?: number | null;
  int?: number | null;
  pd?: number | null;
  ff?: number | null;
  fr?: number | null;
  def_td?: number | null;
  safeties?: number | null;
}

/**
 * `positionBonuses` (LS-9104) is applied additively on top of `multipliers`
 * for the same stat key — never a replacement — so a bonus-only stat with no
 * base multiplier still scores.
 */
export function computeIDPScore(
  stats: GameFootballDefenseIdp,
  multipliers: Partial<IDPScoringSettings>,
  positionBonuses?: Partial<IDPScoringSettings>,
): number {
  let sum = 0;
  const keys = positionBonuses
    ? new Set([
        ...Object.keys(multipliers),
        ...Object.keys(positionBonuses),
      ] as (keyof IDPScoringSettings)[])
    : (Object.keys(multipliers) as (keyof IDPScoringSettings)[]);

  for (const key of keys) {
    const baseMultiplier = multipliers[key];
    const bonusMultiplier = positionBonuses?.[key];
    const base =
      typeof baseMultiplier === 'number' && !isNaN(baseMultiplier)
        ? baseMultiplier
        : 0;
    const bonus =
      typeof bonusMultiplier === 'number' && !isNaN(bonusMultiplier)
        ? bonusMultiplier
        : 0;
    const multiplier = base + bonus;

    const value = stats[key];
    if (!multiplier || value == null || isNaN(value)) {
      continue;
    }
    sum += multiplier * value;
  }

  return sum;
}
