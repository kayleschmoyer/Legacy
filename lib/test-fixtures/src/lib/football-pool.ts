/**
 * Football mock player pool.
 *
 * Seeds a deterministic ~250-entry football player pool for use in Storybook
 * previews, `MockDraftPage`, and the (forthcoming) sport-aware draft engine
 * when football leagues are run against the mock pool. Real football stats
 * ingestion is a separate workstream (see ADR 0011 §4 and LS-4633); until it
 * lands, the football sport reads from this pool when the
 * `football-mock-players` GrowthBook flag is enabled.
 *
 * The pool is built procedurally from a small position-count distribution and
 * realistic NFL first/last name banks. FPG and ownership-percent values are
 * plausible per-position ranges scaled by rank — they are NOT real projections.
 */
import type { FixtureFootballPlayer, FootballPosition } from './types';

interface PositionSpec {
  position: FootballPosition;
  /** Number of players to generate at this position. */
  count: number;
  /** Top-of-position fantasy points per game (best player at this position). */
  topFpg: number;
  /** Bottom-of-position fantasy points per game (lowest-ranked at this position). */
  bottomFpg: number;
}

/**
 * Position distribution sums to 250 and mirrors typical fantasy football
 * roster scarcity (more WR/RB than QB/TE/K/DEF).
 */
const POSITION_DISTRIBUTION: readonly PositionSpec[] = [
  { position: 'QB', count: 32, topFpg: 28.5, bottomFpg: 9.5 },
  { position: 'RB', count: 70, topFpg: 26.0, bottomFpg: 5.0 },
  { position: 'WR', count: 90, topFpg: 24.0, bottomFpg: 4.5 },
  { position: 'TE', count: 30, topFpg: 18.0, bottomFpg: 4.0 },
  { position: 'K', count: 16, topFpg: 11.5, bottomFpg: 6.5 },
  { position: 'DEF', count: 12, topFpg: 12.5, bottomFpg: 4.0 },
];

const NFL_TEAMS: readonly string[] = [
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
];

const FIRST_NAMES: readonly string[] = [
  'Jalen',
  'Patrick',
  'Josh',
  'Lamar',
  'Joe',
  'Justin',
  'Dak',
  'Trevor',
  'Tua',
  'Kyler',
  'Aaron',
  'Russell',
  'Geno',
  'Derek',
  'Brock',
  'Jared',
  'Christian',
  'Saquon',
  'Bijan',
  'Jonathan',
  'Derrick',
  'Nick',
  'Travis',
  'Jahmyr',
  'Breece',
  'Kenneth',
  'Rachaad',
  'Tony',
  'Joe',
  'Aaron',
  'Justin',
  'CeeDee',
  'Tyreek',
  'Stefon',
  'AJ',
  'Davante',
  'Cooper',
  'Amon-Ra',
  'Garrett',
  'Chris',
  'DK',
  'Jaylen',
  'Mike',
  'DeVonta',
  'Drake',
  'Brandon',
  'Marvin',
  'Puka',
  'Malik',
  'Calvin',
  'Tee',
  'Travis',
  'Mark',
  'Sam',
  'Evan',
  'George',
  'Dallas',
  'TJ',
  'Trey',
  'Jake',
  'David',
  'Cole',
  'Tyler',
  'Pat',
  'Greg',
  'Brandon',
  'Jason',
  'Harrison',
  'Younghoe',
  'Justin',
  'Daniel',
  'Cairo',
  'Wil',
  'Riley',
];

const LAST_NAMES: readonly string[] = [
  'Hurts',
  'Mahomes',
  'Allen',
  'Jackson',
  'Burrow',
  'Herbert',
  'Prescott',
  'Lawrence',
  'Tagovailoa',
  'Murray',
  'Rodgers',
  'Wilson',
  'Smith',
  'Carr',
  'Purdy',
  'Goff',
  'McCaffrey',
  'Barkley',
  'Robinson',
  'Taylor',
  'Henry',
  'Chubb',
  'Etienne',
  'Gibbs',
  'Hall',
  'Walker',
  'White',
  'Pollard',
  'Mixon',
  'Jones',
  'Jefferson',
  'Lamb',
  'Hill',
  'Diggs',
  'Brown',
  'Adams',
  'Kupp',
  'St. Brown',
  'Wilson',
  'Olave',
  'Metcalf',
  'Waddle',
  'Evans',
  'Smith',
  'London',
  'Aiyuk',
  'Harrison',
  'Nacua',
  'Nabers',
  'Ridley',
  'Higgins',
  'Kelce',
  'Andrews',
  'LaPorta',
  'Engram',
  'Kittle',
  'Goedert',
  'Hockenson',
  'McBride',
  'Ferguson',
  'Ferguson',
  'Njoku',
  'Pitts',
  'Kmet',
  'Tucker',
  'Zuerlein',
  'McManus',
  'Sanders',
  'Butker',
  'Bates',
  'Aubrey',
  'Carlson',
  'Lutz',
  'Loop',
  'Patterson',
];

/**
 * Deterministic, non-cryptographic 32-bit hash used purely to scatter
 * generated values (FPG, ownership) so the pool does not look monotonic.
 * Seeded by player id so the same id always produces the same values.
 */
function hash32(seed: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Stable [0, 1) value derived from a seed and a salt. */
function frac(seed: number, salt: number): number {
  return hash32(seed * 0x9e3779b1 + salt) / 0x100000000;
}

function buildName(seed: number): { firstName: string; lastName: string } {
  return {
    firstName: FIRST_NAMES[hash32(seed) % FIRST_NAMES.length],
    lastName: LAST_NAMES[hash32(seed + 0x1234) % LAST_NAMES.length],
  };
}

/**
 * Linearly interpolate FPG between top and bottom for the player's
 * position rank, then scatter +/- a small amount so adjacent ranks
 * don't sit on a perfect line.
 */
function fpgForRank(spec: PositionSpec, rank: number, seed: number): number {
  const t = spec.count === 1 ? 0 : rank / (spec.count - 1);
  const base = spec.topFpg - t * (spec.topFpg - spec.bottomFpg);
  const jitter = (frac(seed, 1) - 0.5) * 0.6; // +/- 0.3 FPG
  return Math.round((base + jitter) * 10) / 10;
}

/**
 * Ownership% roughly mirrors rank-within-position with a long tail.
 * Top of position lands near ~95%, bottom near ~1%, scattered slightly
 * so adjacent players don't share identical values.
 */
function ownershipForRank(
  spec: PositionSpec,
  rank: number,
  seed: number,
): number {
  const t = spec.count === 1 ? 0 : rank / (spec.count - 1);
  const base = 95 * Math.pow(1 - t, 1.6);
  const jitter = (frac(seed, 2) - 0.5) * 6;
  return Math.max(0.1, Math.round((base + jitter) * 10) / 10);
}

/** NFL bye weeks span 5–14 in real seasons; spread fixture players across them. */
function byeWeekForSeed(seed: number): number {
  return 5 + (hash32(seed + 0x5a5a) % 10);
}

function buildFootballPool(): readonly FixtureFootballPlayer[] {
  const out: FixtureFootballPlayer[] = [];
  let id = 1;
  for (const spec of POSITION_DISTRIBUTION) {
    for (let rank = 0; rank < spec.count; rank++) {
      const seed = id * 0x10001;
      const { firstName, lastName } = buildName(seed);
      out.push({
        id,
        firstName,
        lastName,
        position: spec.position,
        team: NFL_TEAMS[hash32(seed + 0xabc) % NFL_TEAMS.length],
        fpg: fpgForRank(spec, rank, seed),
        ownershipPct: ownershipForRank(spec, rank, seed),
        byeWeek: byeWeekForSeed(seed),
      });
      id++;
    }
  }
  return Object.freeze(out);
}

export const fixtureFootballPlayers: readonly FixtureFootballPlayer[] =
  buildFootballPool();

/**
 * Count of football fixture players grouped by position. Useful for
 * Storybook summaries and assertion-style tests.
 */
export function countFootballPoolByPosition(): Record<
  FootballPosition,
  number
> {
  const counts: Record<FootballPosition, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DEF: 0,
  };
  for (const p of fixtureFootballPlayers) counts[p.position]++;
  return counts;
}
