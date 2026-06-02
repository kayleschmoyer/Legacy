import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getGameLog, getSeasonTotals } from './CareerStats';
import * as PFRSession from './PFRSession';

jest.mock('./PFRSession');
const mockGetPlayerGameLog = jest.mocked(PFRSession.getPlayerGameLog);

// Real PFR markup: Miles Austin's 2009 gamelog in the current consolidated
// single-table (id="stats") layout. Guards against the LS-5983 markup drift
// where the parser looked for four removed `*_gamelogs` tables.
const AUSTIN_2009_HTML = readFileSync(
  join(__dirname, '__fixtures__', 'austin-mi00-gamelog-2009.html'),
  'utf-8',
);
const austin = { id: 129005, pfrId: 'AustMi00' };

// A QB page in the consolidated layout: passing + rushing column groups.
function qbRow(
  rk: number,
  box: string,
  cmp: number,
  att: number,
  yds: number,
  td: number,
): string {
  return `
    <tr>
      <th data-stat="ranker">${rk}</th>
      <td data-stat="date"><a href="/boxscores/${box}.htm">2018-09-0${rk}</a></td>
      <td data-stat="team_name_abbr"><a href="/teams/kan/2018.htm">KAN</a></td>
      <td data-stat="pass_cmp">${cmp}</td>
      <td data-stat="pass_att">${att}</td>
      <td data-stat="pass_yds">${yds}</td>
      <td data-stat="pass_td">${td}</td>
      <td data-stat="pass_int">0</td>
      <td data-stat="pass_sacked">1</td>
      <td data-stat="pass_sacked_yds">6</td>
      <td data-stat="pass_rating">120.0</td>
      <td data-stat="rush_att">1</td>
      <td data-stat="rush_yds">4</td>
      <td data-stat="rush_td">0</td>
      <td data-stat="fumbles">0</td>
    </tr>`;
}
const QB_HTML = `<html><body><table id="stats"><tbody>
  ${qbRow(1, '201809090lac', 15, 27, 256, 4)}
  ${qbRow(2, '201809230kan', 23, 28, 326, 6)}
</tbody></table></body></html>`;
const qb = { id: 1, pfrId: 'MahoPa00' };

// A kicker page still carries a zeroed passing column group — the parser must
// NOT treat those zero rows as passing games (value-based category guard).
function kickerRow(rk: number, box: string, fgm: number, fga: number): string {
  return `
    <tr>
      <th data-stat="ranker">${rk}</th>
      <td data-stat="date"><a href="/boxscores/${box}.htm">2016-09-0${rk}</a></td>
      <td data-stat="team_name_abbr"><a href="/teams/bal/2016.htm">BAL</a></td>
      <td data-stat="pass_cmp">0</td>
      <td data-stat="pass_att">0</td>
      <td data-stat="pass_yds">0</td>
      <td data-stat="pass_td">0</td>
      <td data-stat="fga1">0</td>
      <td data-stat="fgm1">0</td>
      <td data-stat="fga2">1</td>
      <td data-stat="fgm2">1</td>
      <td data-stat="fga">${fga}</td>
      <td data-stat="fgm">${fgm}</td>
      <td data-stat="xpa">2</td>
      <td data-stat="xpm">2</td>
    </tr>`;
}
const KICKER_HTML = `<html><body><table id="stats"><tbody>
  ${kickerRow(1, '201609110buf', 2, 2)}
  ${kickerRow(2, '201609180cle', 3, 3)}
</tbody></table></body></html>`;
const kicker = { id: 2, pfrId: 'TuckJu00' };

describe('CareerStats.getGameLog — consolidated id="stats" table', () => {
  beforeEach(() => {
    mockGetPlayerGameLog.mockResolvedValue(AUSTIN_2009_HTML);
  });

  it('parses every receiving game from the real PFR fixture', async () => {
    const log = await getGameLog(austin, 2009);

    expect(log.receiving).toHaveLength(16);
    expect(log.receiving[0]).toMatchObject({
      playerId: 129005,
      season: 2009,
      gameNum: 1,
      gameIdentifier: '200909130tam',
      rec: 1,
      tgt: 2,
      yds: 42,
      td: 1,
    });
    // The week-5 explosion vs KAN.
    expect(log.receiving[4]).toMatchObject({
      gameIdentifier: '200910110kan',
      rec: 10,
      yds: 250,
      td: 2,
    });
  });

  it('emits rushing rows only for games with carries', async () => {
    const log = await getGameLog(austin, 2009);

    // Austin had exactly two carries on the season (weeks 8 and 16).
    expect(log.rushing).toHaveLength(2);
    expect(log.rushing.map((r) => r.gameIdentifier)).toEqual([
      '200911010dal',
      '200912270was',
    ]);
    expect(log.rushing[0]).toMatchObject({ att: 1, yds: 11 });
  });

  it('returns empty arrays for categories the player did not produce in', async () => {
    const log = await getGameLog(austin, 2009);

    expect(log.passing).toHaveLength(0);
    expect(log.kicking).toHaveLength(0);
  });

  it('returns all empty arrays when the stats table is absent', async () => {
    mockGetPlayerGameLog.mockResolvedValue('<html><body></body></html>');
    const log = await getGameLog(austin, 2009);

    expect(log.passing).toHaveLength(0);
    expect(log.rushing).toHaveLength(0);
    expect(log.receiving).toHaveLength(0);
    expect(log.kicking).toHaveLength(0);
  });
});

describe('CareerStats.getSeasonTotals — aggregated from game rows', () => {
  it('reproduces real receiving season totals', async () => {
    mockGetPlayerGameLog.mockResolvedValue(AUSTIN_2009_HTML);
    const totals = await getSeasonTotals(austin, 2009);

    expect(totals.receiving).toMatchObject({
      playerId: 129005,
      season: 2009,
      team: 'DAL',
      g: 16,
      rec: 81,
      tgt: 124,
      yds: 1320,
      td: 11,
      fumbles: 1,
    });
  });

  it('reproduces real rushing season totals', async () => {
    mockGetPlayerGameLog.mockResolvedValue(AUSTIN_2009_HTML);
    const totals = await getSeasonTotals(austin, 2009);

    expect(totals.rushing).toMatchObject({
      season: 2009,
      team: 'DAL',
      g: 2,
      att: 2,
      yds: -2,
      td: 0,
    });
  });

  it('returns null for categories with no production', async () => {
    mockGetPlayerGameLog.mockResolvedValue(AUSTIN_2009_HTML);
    const totals = await getSeasonTotals(austin, 2009);

    expect(totals.passing).toBeNull();
    expect(totals.kicking).toBeNull();
  });
});

describe('CareerStats — passing (QB)', () => {
  beforeEach(() => {
    mockGetPlayerGameLog.mockResolvedValue(QB_HTML);
  });

  it('parses passing game rows', async () => {
    const log = await getGameLog(qb, 2018);

    expect(log.passing).toHaveLength(2);
    expect(log.passing[0]).toMatchObject({
      gameIdentifier: '201809090lac',
      cmp: 15,
      att: 27,
      yds: 256,
      td: 4,
      sacked: 1,
      sackYds: 6,
      rating: 120,
    });
  });

  it('aggregates passing season totals', async () => {
    const totals = await getSeasonTotals(qb, 2018);

    expect(totals.passing).toMatchObject({
      g: 2,
      cmp: 38,
      att: 55,
      yds: 582,
      td: 10,
      int: 0,
    });
  });
});

describe('CareerStats — kicker zeroed passing group guard', () => {
  beforeEach(() => {
    mockGetPlayerGameLog.mockResolvedValue(KICKER_HTML);
  });

  it('does not emit passing rows for a kicker with a zeroed passing column group', async () => {
    const log = await getGameLog(kicker, 2016);

    expect(log.passing).toHaveLength(0);
    expect(log.kicking).toHaveLength(2);
    expect(log.kicking[0]).toMatchObject({
      gameIdentifier: '201609110buf',
      fgm: 2,
      fga: 2,
      xpm: 2,
      xpa: 2,
    });
  });

  it('aggregates kicking totals and leaves passing null', async () => {
    const totals = await getSeasonTotals(kicker, 2016);

    expect(totals.passing).toBeNull();
    expect(totals.kicking).toMatchObject({
      g: 2,
      fgm: 5,
      fga: 5,
      xpm: 4,
      xpa: 4,
    });
  });
});
