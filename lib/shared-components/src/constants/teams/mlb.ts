/**
 * MLB franchise reference data (LS-7477, LS-7478).
 *
 * Each entry is keyed by the franchise's current abbreviation. The
 * `historicalAbbrs` list lets us map legacy game logs (e.g. OAK Athletics
 * games before the 2025 Las Vegas move, MTL Expos before the 2005
 * Washington move) back to the same `franchiseId`, so an opponent filter
 * for "ATH" pulls both OAK and LV logs without the caller having to know.
 */

export type MlbLeague = 'AL' | 'NL';
export type MlbDivision = 'East' | 'Central' | 'West';

export interface MlbFranchise {
  franchiseId: string;
  currentAbbr: string;
  currentName: string;
  /** Past abbreviations the franchise has used. Does NOT include currentAbbr. */
  historicalAbbrs: string[];
  league: MlbLeague;
  division: MlbDivision;
}

export const MLB_TEAMS: ReadonlyArray<MlbFranchise> = [
  // AL East
  {
    franchiseId: 'BAL',
    currentAbbr: 'BAL',
    currentName: 'Baltimore Orioles',
    historicalAbbrs: [],
    league: 'AL',
    division: 'East',
  },
  {
    franchiseId: 'BOS',
    currentAbbr: 'BOS',
    currentName: 'Boston Red Sox',
    historicalAbbrs: [],
    league: 'AL',
    division: 'East',
  },
  {
    franchiseId: 'NYY',
    currentAbbr: 'NYY',
    currentName: 'New York Yankees',
    historicalAbbrs: [],
    league: 'AL',
    division: 'East',
  },
  {
    franchiseId: 'TB',
    currentAbbr: 'TB',
    currentName: 'Tampa Bay Rays',
    historicalAbbrs: ['TBR', 'TBD'],
    league: 'AL',
    division: 'East',
  },
  {
    franchiseId: 'TOR',
    currentAbbr: 'TOR',
    currentName: 'Toronto Blue Jays',
    historicalAbbrs: [],
    league: 'AL',
    division: 'East',
  },
  // AL Central
  {
    franchiseId: 'CWS',
    currentAbbr: 'CWS',
    currentName: 'Chicago White Sox',
    historicalAbbrs: ['CHW'],
    league: 'AL',
    division: 'Central',
  },
  {
    franchiseId: 'CLE',
    currentAbbr: 'CLE',
    currentName: 'Cleveland Guardians',
    historicalAbbrs: ['CLE_INDIANS'],
    league: 'AL',
    division: 'Central',
  },
  {
    franchiseId: 'DET',
    currentAbbr: 'DET',
    currentName: 'Detroit Tigers',
    historicalAbbrs: [],
    league: 'AL',
    division: 'Central',
  },
  {
    franchiseId: 'KC',
    currentAbbr: 'KC',
    currentName: 'Kansas City Royals',
    historicalAbbrs: ['KCR'],
    league: 'AL',
    division: 'Central',
  },
  {
    franchiseId: 'MIN',
    currentAbbr: 'MIN',
    currentName: 'Minnesota Twins',
    historicalAbbrs: [],
    league: 'AL',
    division: 'Central',
  },
  // AL West — Athletics franchise relocated OAK -> LV; both abbreviations live under franchiseId ATH.
  {
    franchiseId: 'HOU',
    currentAbbr: 'HOU',
    currentName: 'Houston Astros',
    historicalAbbrs: [],
    league: 'AL',
    division: 'West',
  },
  {
    franchiseId: 'LAA',
    currentAbbr: 'LAA',
    currentName: 'Los Angeles Angels',
    historicalAbbrs: ['ANA', 'CAL'],
    league: 'AL',
    division: 'West',
  },
  {
    franchiseId: 'ATH',
    currentAbbr: 'ATH',
    currentName: 'Athletics',
    historicalAbbrs: ['OAK', 'LV'],
    league: 'AL',
    division: 'West',
  },
  {
    franchiseId: 'SEA',
    currentAbbr: 'SEA',
    currentName: 'Seattle Mariners',
    historicalAbbrs: [],
    league: 'AL',
    division: 'West',
  },
  {
    franchiseId: 'TEX',
    currentAbbr: 'TEX',
    currentName: 'Texas Rangers',
    historicalAbbrs: [],
    league: 'AL',
    division: 'West',
  },
  // NL East
  {
    franchiseId: 'ATL',
    currentAbbr: 'ATL',
    currentName: 'Atlanta Braves',
    historicalAbbrs: [],
    league: 'NL',
    division: 'East',
  },
  {
    franchiseId: 'MIA',
    currentAbbr: 'MIA',
    currentName: 'Miami Marlins',
    historicalAbbrs: ['FLA'],
    league: 'NL',
    division: 'East',
  },
  {
    franchiseId: 'NYM',
    currentAbbr: 'NYM',
    currentName: 'New York Mets',
    historicalAbbrs: [],
    league: 'NL',
    division: 'East',
  },
  {
    franchiseId: 'PHI',
    currentAbbr: 'PHI',
    currentName: 'Philadelphia Phillies',
    historicalAbbrs: [],
    league: 'NL',
    division: 'East',
  },
  // Nationals franchise: MTL Expos -> WSH/WAS Nationals.
  {
    franchiseId: 'WSH',
    currentAbbr: 'WSH',
    currentName: 'Washington Nationals',
    historicalAbbrs: ['WAS', 'MTL'],
    league: 'NL',
    division: 'East',
  },
  // NL Central
  {
    franchiseId: 'CHC',
    currentAbbr: 'CHC',
    currentName: 'Chicago Cubs',
    historicalAbbrs: [],
    league: 'NL',
    division: 'Central',
  },
  {
    franchiseId: 'CIN',
    currentAbbr: 'CIN',
    currentName: 'Cincinnati Reds',
    historicalAbbrs: [],
    league: 'NL',
    division: 'Central',
  },
  {
    franchiseId: 'MIL',
    currentAbbr: 'MIL',
    currentName: 'Milwaukee Brewers',
    historicalAbbrs: [],
    league: 'NL',
    division: 'Central',
  },
  {
    franchiseId: 'PIT',
    currentAbbr: 'PIT',
    currentName: 'Pittsburgh Pirates',
    historicalAbbrs: [],
    league: 'NL',
    division: 'Central',
  },
  {
    franchiseId: 'STL',
    currentAbbr: 'STL',
    currentName: 'St. Louis Cardinals',
    historicalAbbrs: [],
    league: 'NL',
    division: 'Central',
  },
  // NL West
  {
    franchiseId: 'ARI',
    currentAbbr: 'ARI',
    currentName: 'Arizona Diamondbacks',
    historicalAbbrs: [],
    league: 'NL',
    division: 'West',
  },
  {
    franchiseId: 'COL',
    currentAbbr: 'COL',
    currentName: 'Colorado Rockies',
    historicalAbbrs: [],
    league: 'NL',
    division: 'West',
  },
  {
    franchiseId: 'LAD',
    currentAbbr: 'LAD',
    currentName: 'Los Angeles Dodgers',
    historicalAbbrs: [],
    league: 'NL',
    division: 'West',
  },
  {
    franchiseId: 'SD',
    currentAbbr: 'SD',
    currentName: 'San Diego Padres',
    historicalAbbrs: ['SDP'],
    league: 'NL',
    division: 'West',
  },
  {
    franchiseId: 'SF',
    currentAbbr: 'SF',
    currentName: 'San Francisco Giants',
    historicalAbbrs: ['SFG'],
    league: 'NL',
    division: 'West',
  },
];

/**
 * Resolve any past-or-present MLB abbreviation to the franchise's stable id.
 * Returns undefined for unknown abbreviations rather than throwing — callers
 * decide whether an unmapped abbr is a data bug or just an old league.
 */
export function franchiseIdForMlbAbbr(abbr: string): string | undefined {
  const up = abbr.toUpperCase();
  for (const t of MLB_TEAMS) {
    if (t.currentAbbr === up) return t.franchiseId;
    if (t.historicalAbbrs.includes(up)) return t.franchiseId;
  }
  return undefined;
}

/**
 * Expand a franchise id (or current abbr) to the full set of abbreviations
 * that have ever represented it. Used so a query against an opponent filter
 * for OAK/ATH also matches LV logs (and vice versa) — LS-7478.
 */
export function expandMlbFranchiseAbbrs(franchiseIdOrAbbr: string): string[] {
  const id =
    franchiseIdForMlbAbbr(franchiseIdOrAbbr) ?? franchiseIdOrAbbr.toUpperCase();
  const team = MLB_TEAMS.find((t) => t.franchiseId === id);
  if (!team) return [franchiseIdOrAbbr.toUpperCase()];
  return [team.currentAbbr, ...team.historicalAbbrs];
}
