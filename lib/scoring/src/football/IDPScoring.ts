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

export function computeIDPScore(
  stats: GameFootballDefenseIdp,
  multipliers: IDPScoringSettings,
): number {
  let sum = 0;

  for (const key of Object.keys(multipliers) as (keyof IDPScoringSettings)[]) {
    const multiplier = multipliers[key];
    const value = stats[key];
    if (isNaN(multiplier) || value == null || isNaN(value)) {
      continue;
    }
    sum += multiplier * value;
  }

  return sum;
}
