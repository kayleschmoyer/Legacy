import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildDefenseIdpRows,
  buildGameIdIndex,
  buildGsisToPfrCrosswalk,
  buildKickingRows,
  buildPassingRows,
  buildReceivingRows,
  buildRushingRows,
  buildTeamDefenseGames,
  normalizeNflTeam,
  parseNflverseCsv,
  toNum,
} from './transform';

/**
 * Fixtures here are REAL rows captured live on 2026-09-11 from nflverse's
 * `player_stats`/`players`/`schedules` GitHub releases (see the module
 * doc-comment in transform.ts for the exact URL) — not hand-built from
 * documentation, unlike `lib/pfa-client`'s fixtures (whose network access
 * was blocked; this environment's was not). This lets these tests double as
 * a real value-level check against nflverse's source truth: every expected
 * number below is transcribed from the downloaded CSVs, not invented.
 */

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', name), 'utf-8');
}

const weeklyRows = parseNflverseCsv(
  loadFixture('stats_player_week_2023-sample.csv'),
);
const playersRows = parseNflverseCsv(loadFixture('players-sample.csv'));
const scheduleRows = parseNflverseCsv(loadFixture('games-sample.csv'));

const MAHOMES_GSIS = '00-0033873';
const PRATER_GSIS = '00-0023853';
const JACKSON_GSIS = '00-0027872';

describe('parseNflverseCsv', () => {
  it('parses the real header and all sample rows', () => {
    expect(weeklyRows).toHaveLength(5);
    expect(weeklyRows[0].player_id).toBe(MAHOMES_GSIS);
    expect(weeklyRows[0].player_display_name).toBe('Patrick Mahomes');
  });

  it('handles a quoted field containing commas (headshot_url query string)', () => {
    expect(weeklyRows[0].headshot_url).toContain(
      'f_auto,q_auto/league/qrdbvu4iqy7wkqg8jq8d',
    );
  });
});

describe('toNum', () => {
  it('parses numeric strings', () => {
    expect(toNum('226')).toBe(226);
    expect(toNum('-7')).toBe(-7);
  });

  it('returns null for empty and undefined', () => {
    expect(toNum('')).toBeNull();
    expect(toNum(undefined)).toBeNull();
  });
});

describe('buildGsisToPfrCrosswalk', () => {
  it('maps real gsis_id -> pfr_id for all three sample players', () => {
    const crosswalk = buildGsisToPfrCrosswalk(playersRows);
    expect(crosswalk.get(MAHOMES_GSIS)).toBe('MahoPa00');
    expect(crosswalk.get(PRATER_GSIS)).toBe('PratMa20');
    expect(crosswalk.get(JACKSON_GSIS)).toBe('JackKa99');
  });
});

describe('normalizeNflTeam', () => {
  it('maps historical franchise codes to their current one', () => {
    expect(normalizeNflTeam('OAK')).toBe('LV');
    expect(normalizeNflTeam('SD')).toBe('LAC');
    expect(normalizeNflTeam('STL')).toBe('LAR');
  });

  it('passes through already-current codes unchanged', () => {
    expect(normalizeNflTeam('KC')).toBe('KC');
  });
});

describe('buildGameIdIndex', () => {
  it('resolves the real nflverse game_id for a (season, week, team)', () => {
    const index = buildGameIdIndex(scheduleRows);
    expect(index.get('2023|1|KC')).toBe('2023_01_DET_KC');
    expect(index.get('2023|2|KC')).toBe('2023_02_KC_JAX');
    expect(index.get('2023|3|KC')).toBe('2023_03_CHI_KC');
    expect(index.get('2023|1|ARI')).toBe('2023_01_ARI_WAS');
    expect(index.get('2023|1|DEN')).toBe('2023_01_LV_DEN');
  });
});

describe('buildPassingRows', () => {
  const gameIdIndex = buildGameIdIndex(scheduleRows);
  const mahomesRows = weeklyRows.filter((r) => r.player_id === MAHOMES_GSIS);

  it('emits one row per week with real passing production, numbered sequentially', () => {
    const rows = buildPassingRows(mahomesRows, gameIdIndex, 2023);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      gameNum: 1,
      gameIdentifier: '2023_01_DET_KC',
      cmp: 21,
      att: 39,
      yds: 226,
      td: 2,
      int: 1,
      sacked: 0,
      sackYds: 0,
      rating: null,
    });
    expect(rows[1]).toMatchObject({
      gameNum: 2,
      gameIdentifier: '2023_02_KC_JAX',
      cmp: 29,
      att: 41,
      yds: 305,
      sacked: 1,
      sackYds: -7,
    });
    expect(rows[2]).toMatchObject({
      gameNum: 3,
      gameIdentifier: '2023_03_CHI_KC',
      cmp: 24,
      att: 33,
      yds: 272,
      td: 3,
      int: 0,
    });
  });

  it('emits no passing rows for a kicker with zero attempts', () => {
    const praterRows = weeklyRows.filter((r) => r.player_id === PRATER_GSIS);
    expect(buildPassingRows(praterRows, gameIdIndex, 2023)).toHaveLength(0);
  });
});

describe('buildRushingRows', () => {
  it('carries real rushing production for the same games', () => {
    const gameIdIndex = buildGameIdIndex(scheduleRows);
    const mahomesRows = weeklyRows.filter((r) => r.player_id === MAHOMES_GSIS);
    const rows = buildRushingRows(mahomesRows, gameIdIndex, 2023);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ att: 6, yds: 45, td: 0, lng: null });
    expect(rows[1]).toMatchObject({ att: 7, yds: 30 });
    expect(rows[2]).toMatchObject({ att: 3, yds: 28 });
  });
});

describe('buildReceivingRows', () => {
  it('emits nothing for a QB with no targets', () => {
    const gameIdIndex = buildGameIdIndex(scheduleRows);
    const mahomesRows = weeklyRows.filter((r) => r.player_id === MAHOMES_GSIS);
    expect(buildReceivingRows(mahomesRows, gameIdIndex, 2023)).toHaveLength(0);
  });
});

describe('buildKickingRows', () => {
  it('parses Matt Prater real week-1 2023 kicking line', () => {
    const gameIdIndex = buildGameIdIndex(scheduleRows);
    const praterRows = weeklyRows.filter((r) => r.player_id === PRATER_GSIS);
    const rows = buildKickingRows(praterRows, gameIdIndex, 2023);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      gameNum: 1,
      gameIdentifier: '2023_01_ARI_WAS',
      fgm: 3,
      fga: 3,
      fg2029m: 1,
      fg3039m: 1,
      fg50m: 1,
      lng: 54,
      xpm: 1,
      xpa: 1,
    });
  });
});

describe('buildDefenseIdpRows', () => {
  it('parses Kareem Jackson real week-1 2023 IDP line', () => {
    const gameIdIndex = buildGameIdIndex(scheduleRows);
    const jacksonRows = weeklyRows.filter((r) => r.player_id === JACKSON_GSIS);
    const rows = buildDefenseIdpRows(jacksonRows, gameIdIndex, 2023);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      gameNum: 1,
      gameIdentifier: '2023_01_LV_DEN',
      soloTkl: 4,
      astTkl: 0,
      sacks: 0,
      int: 1,
      pd: 1,
      ff: 0,
      fr: 0,
      defTd: 0,
      safeties: 0,
    });
  });

  it('emits nothing for a player with zero defensive activity', () => {
    const gameIdIndex = buildGameIdIndex(scheduleRows);
    const mahomesRows = weeklyRows.filter((r) => r.player_id === MAHOMES_GSIS);
    expect(buildDefenseIdpRows(mahomesRows, gameIdIndex, 2023)).toHaveLength(0);
  });
});

describe('buildTeamDefenseGames', () => {
  const games = buildTeamDefenseGames(weeklyRows, scheduleRows, 2023);

  it("derives DET's yards/points allowed from KC's real offensive output (Mahomes, week 1)", () => {
    const det = games.get('DET') ?? [];
    expect(det).toHaveLength(1);
    expect(det[0]).toMatchObject({
      gameIdentifier: '2023_01_DET_KC',
      passYdsAllowed: 226,
      rushYdsAllowed: 45,
      ydsAllowed: 271,
      // KC (the opponent DET's defense faced) scored 20 that game.
      ptsAllowed: 20,
    });
  });

  it("derives CHI's points allowed from the real final score (Chiefs 41, Bears 10)", () => {
    const chi = games.get('CHI') ?? [];
    expect(chi[0]).toMatchObject({
      gameIdentifier: '2023_03_CHI_KC',
      ptsAllowed: 41,
    });
  });

  it("credits DEN's own defense with Kareem Jackson's real week-1 takeaway", () => {
    const den = games.get('DEN') ?? [];
    expect(den).toHaveLength(1);
    expect(den[0]).toMatchObject({
      gameIdentifier: '2023_01_LV_DEN',
      int: 1,
      sacks: 0,
      // Raiders (LV) scored 17 against Denver's defense that week.
      ptsAllowed: 17,
    });
  });
});
