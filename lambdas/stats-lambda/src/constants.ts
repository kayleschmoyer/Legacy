export const IDP_POSITIONS = ['DL', 'LB', 'DB'];

// PFR player IDs are 4–8 letters followed by exactly 2 digits (e.g. BradTo00, MahosPa00).
const PFR_ID_REGEX = /^[A-Za-z]{4,8}\d{2}$/;

// Corpus key of a football player with no PFR id: 'pfa-' + the Pro Football
// Archives id, e.g. pfa-unit00100 (ADR 0023, LS-10588).
const PFA_CORPUS_KEY_REGEX = /^pfa-[a-z0-9]{1,16}$/;

// Canonical NFL team abbreviations used by Pro-Football-Reference.
const NFL_TEAMS = new Set([
  'ARI',
  'ATL',
  'BAL',
  'BUF',
  'CAR',
  'CHI',
  'CIN',
  'CLE',
  'DAL',
  'DEN',
  'DET',
  'GB',
  'HOU',
  'IND',
  'JAC',
  'JAX',
  'KC',
  'LAC',
  'LAR',
  'LV',
  'MIA',
  'MIN',
  'NE',
  'NO',
  'NYG',
  'NYJ',
  'PHI',
  'PIT',
  'SEA',
  'SF',
  'TB',
  'TEN',
  'WAS',
]);

export function validatePfrId(pfrId: string): void {
  if (!PFR_ID_REGEX.test(pfrId)) {
    throw new Error(`Invalid pfrId format: "${pfrId}"`);
  }
}

/** A football corpus key is a PFR id, or 'pfa-<pfaId>' for a player with none. */
export function validateFootballCorpusKey(corpusKey: string): void {
  if (!PFR_ID_REGEX.test(corpusKey) && !PFA_CORPUS_KEY_REGEX.test(corpusKey)) {
    throw new Error(`Invalid football corpus key: "${corpusKey}"`);
  }
}

export function validateNflTeam(nflTeam: string): void {
  if (!NFL_TEAMS.has(nflTeam)) {
    throw new Error(`Invalid nflTeam: "${nflTeam}"`);
  }
}
