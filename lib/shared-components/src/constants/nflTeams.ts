/**
 * NFL team reference data (LS-4156).
 *
 * Typed static map of all 32 NFL franchises keyed by abbreviation. Mirrors the
 * `nfl_teams` reference table in the DB; lets components resolve display
 * names, conference, division, and team colors without a GraphQL query when
 * the abbreviation is already in scope.
 *
 * Keep this in sync with `lib/db-client/migrations/20260522_180000_create_nfl_teams.ts`.
 */

export type NflConference = 'AFC' | 'NFC';
export type NflDivision = 'North' | 'South' | 'East' | 'West';

export interface NflTeam {
  abbreviation: string;
  fullName: string;
  city: string;
  conference: NflConference;
  division: NflDivision;
  primaryColor: string;
  secondaryColor: string;
}

export const NFL_TEAMS: { readonly [key: string]: NflTeam | undefined } = {
  // AFC East
  BUF: {
    abbreviation: 'BUF',
    fullName: 'Buffalo Bills',
    city: 'Buffalo',
    conference: 'AFC',
    division: 'East',
    primaryColor: '#00338D',
    secondaryColor: '#C60C30',
  },
  MIA: {
    abbreviation: 'MIA',
    fullName: 'Miami Dolphins',
    city: 'Miami',
    conference: 'AFC',
    division: 'East',
    primaryColor: '#008E97',
    secondaryColor: '#FC4C02',
  },
  NE: {
    abbreviation: 'NE',
    fullName: 'New England Patriots',
    city: 'New England',
    conference: 'AFC',
    division: 'East',
    primaryColor: '#002244',
    secondaryColor: '#C60C30',
  },
  NYJ: {
    abbreviation: 'NYJ',
    fullName: 'New York Jets',
    city: 'New York',
    conference: 'AFC',
    division: 'East',
    primaryColor: '#125740',
    secondaryColor: '#000000',
  },
  // AFC North
  BAL: {
    abbreviation: 'BAL',
    fullName: 'Baltimore Ravens',
    city: 'Baltimore',
    conference: 'AFC',
    division: 'North',
    primaryColor: '#241773',
    secondaryColor: '#9E7C0C',
  },
  CIN: {
    abbreviation: 'CIN',
    fullName: 'Cincinnati Bengals',
    city: 'Cincinnati',
    conference: 'AFC',
    division: 'North',
    primaryColor: '#FB4F14',
    secondaryColor: '#000000',
  },
  CLE: {
    abbreviation: 'CLE',
    fullName: 'Cleveland Browns',
    city: 'Cleveland',
    conference: 'AFC',
    division: 'North',
    primaryColor: '#311D00',
    secondaryColor: '#FF3C00',
  },
  PIT: {
    abbreviation: 'PIT',
    fullName: 'Pittsburgh Steelers',
    city: 'Pittsburgh',
    conference: 'AFC',
    division: 'North',
    primaryColor: '#FFB612',
    secondaryColor: '#101820',
  },
  // AFC South
  HOU: {
    abbreviation: 'HOU',
    fullName: 'Houston Texans',
    city: 'Houston',
    conference: 'AFC',
    division: 'South',
    primaryColor: '#03202F',
    secondaryColor: '#A71930',
  },
  IND: {
    abbreviation: 'IND',
    fullName: 'Indianapolis Colts',
    city: 'Indianapolis',
    conference: 'AFC',
    division: 'South',
    primaryColor: '#002C5F',
    secondaryColor: '#A2AAAD',
  },
  JAX: {
    abbreviation: 'JAX',
    fullName: 'Jacksonville Jaguars',
    city: 'Jacksonville',
    conference: 'AFC',
    division: 'South',
    primaryColor: '#101820',
    secondaryColor: '#D7A22A',
  },
  TEN: {
    abbreviation: 'TEN',
    fullName: 'Tennessee Titans',
    city: 'Tennessee',
    conference: 'AFC',
    division: 'South',
    primaryColor: '#0C2340',
    secondaryColor: '#4B92DB',
  },
  // AFC West
  DEN: {
    abbreviation: 'DEN',
    fullName: 'Denver Broncos',
    city: 'Denver',
    conference: 'AFC',
    division: 'West',
    primaryColor: '#FB4F14',
    secondaryColor: '#002244',
  },
  KC: {
    abbreviation: 'KC',
    fullName: 'Kansas City Chiefs',
    city: 'Kansas City',
    conference: 'AFC',
    division: 'West',
    primaryColor: '#E31837',
    secondaryColor: '#FFB81C',
  },
  LV: {
    abbreviation: 'LV',
    fullName: 'Las Vegas Raiders',
    city: 'Las Vegas',
    conference: 'AFC',
    division: 'West',
    primaryColor: '#000000',
    secondaryColor: '#A5ACAF',
  },
  LAC: {
    abbreviation: 'LAC',
    fullName: 'Los Angeles Chargers',
    city: 'Los Angeles',
    conference: 'AFC',
    division: 'West',
    primaryColor: '#0080C6',
    secondaryColor: '#FFC20E',
  },
  // NFC East
  DAL: {
    abbreviation: 'DAL',
    fullName: 'Dallas Cowboys',
    city: 'Dallas',
    conference: 'NFC',
    division: 'East',
    primaryColor: '#003594',
    secondaryColor: '#869397',
  },
  NYG: {
    abbreviation: 'NYG',
    fullName: 'New York Giants',
    city: 'New York',
    conference: 'NFC',
    division: 'East',
    primaryColor: '#0B2265',
    secondaryColor: '#A71930',
  },
  PHI: {
    abbreviation: 'PHI',
    fullName: 'Philadelphia Eagles',
    city: 'Philadelphia',
    conference: 'NFC',
    division: 'East',
    primaryColor: '#004C54',
    secondaryColor: '#A5ACAF',
  },
  WAS: {
    abbreviation: 'WAS',
    fullName: 'Washington Commanders',
    city: 'Washington',
    conference: 'NFC',
    division: 'East',
    primaryColor: '#5A1414',
    secondaryColor: '#FFB612',
  },
  // NFC North
  CHI: {
    abbreviation: 'CHI',
    fullName: 'Chicago Bears',
    city: 'Chicago',
    conference: 'NFC',
    division: 'North',
    primaryColor: '#0B162A',
    secondaryColor: '#C83803',
  },
  DET: {
    abbreviation: 'DET',
    fullName: 'Detroit Lions',
    city: 'Detroit',
    conference: 'NFC',
    division: 'North',
    primaryColor: '#0076B6',
    secondaryColor: '#B0B7BC',
  },
  GB: {
    abbreviation: 'GB',
    fullName: 'Green Bay Packers',
    city: 'Green Bay',
    conference: 'NFC',
    division: 'North',
    primaryColor: '#203731',
    secondaryColor: '#FFB612',
  },
  MIN: {
    abbreviation: 'MIN',
    fullName: 'Minnesota Vikings',
    city: 'Minnesota',
    conference: 'NFC',
    division: 'North',
    primaryColor: '#4F2683',
    secondaryColor: '#FFC62F',
  },
  // NFC South
  ATL: {
    abbreviation: 'ATL',
    fullName: 'Atlanta Falcons',
    city: 'Atlanta',
    conference: 'NFC',
    division: 'South',
    primaryColor: '#A71930',
    secondaryColor: '#000000',
  },
  CAR: {
    abbreviation: 'CAR',
    fullName: 'Carolina Panthers',
    city: 'Carolina',
    conference: 'NFC',
    division: 'South',
    primaryColor: '#0085CA',
    secondaryColor: '#101820',
  },
  NO: {
    abbreviation: 'NO',
    fullName: 'New Orleans Saints',
    city: 'New Orleans',
    conference: 'NFC',
    division: 'South',
    primaryColor: '#D3BC8D',
    secondaryColor: '#101820',
  },
  TB: {
    abbreviation: 'TB',
    fullName: 'Tampa Bay Buccaneers',
    city: 'Tampa Bay',
    conference: 'NFC',
    division: 'South',
    primaryColor: '#D50A0A',
    secondaryColor: '#FF7900',
  },
  // NFC West
  ARI: {
    abbreviation: 'ARI',
    fullName: 'Arizona Cardinals',
    city: 'Arizona',
    conference: 'NFC',
    division: 'West',
    primaryColor: '#97233F',
    secondaryColor: '#000000',
  },
  LAR: {
    abbreviation: 'LAR',
    fullName: 'Los Angeles Rams',
    city: 'Los Angeles',
    conference: 'NFC',
    division: 'West',
    primaryColor: '#003594',
    secondaryColor: '#FFA300',
  },
  SEA: {
    abbreviation: 'SEA',
    fullName: 'Seattle Seahawks',
    city: 'Seattle',
    conference: 'NFC',
    division: 'West',
    primaryColor: '#002244',
    secondaryColor: '#69BE28',
  },
  SF: {
    abbreviation: 'SF',
    fullName: 'San Francisco 49ers',
    city: 'San Francisco',
    conference: 'NFC',
    division: 'West',
    primaryColor: '#AA0000',
    secondaryColor: '#B3995D',
  },
};

export const NFL_TEAM_ABBREVIATIONS: ReadonlyArray<string> =
  Object.keys(NFL_TEAMS);
