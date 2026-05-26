import { getGameLog, getSeasonTotals } from './CareerStats';
import * as PFRSession from './PFRSession';

jest.mock('./PFRSession');
const mockGetPlayerGameLog = jest.mocked(PFRSession.getPlayerGameLog);

const player = { id: 7, pfrId: 'TestQb00' };

// Fixture: passing and rushing tables each have one active game + one bye week.
// Receiving and kicking tables are absent (verify empty arrays returned).
const FIXTURE_HTML = `
<html><body>
<table id="passing_gamelogs">
  <thead>
    <tr>
      <th data-stat="ranker">Rk</th>
      <td data-stat="game_date">Date</td>
      <td data-stat="team">Tm</td>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th data-stat="ranker">1</th>
      <td data-stat="game_date"><a href="/boxscores/202409080kan.htm">2024-09-08</a></td>
      <td data-stat="team"><a href="/teams/kan/2024.htm">KAN</a></td>
      <td data-stat="pass_cmp">28</td>
      <td data-stat="pass_att">42</td>
      <td data-stat="pass_yds">312</td>
      <td data-stat="pass_td">3</td>
      <td data-stat="pass_int">1</td>
      <td data-stat="pass_sacked">2</td>
      <td data-stat="pass_sacked_yds">14</td>
      <td data-stat="pass_rating">104.2</td>
    </tr>
    <tr>
      <th data-stat="ranker">9</th>
      <td data-stat="game_date">2024-10-27</td>
      <td data-stat="team"><a href="/teams/kan/2024.htm">KAN</a></td>
      <td data-stat="pass_cmp"></td>
      <td data-stat="pass_att"></td>
      <td data-stat="pass_yds"></td>
      <td data-stat="pass_td"></td>
      <td data-stat="pass_int"></td>
      <td data-stat="pass_sacked"></td>
      <td data-stat="pass_sacked_yds"></td>
      <td data-stat="pass_rating"></td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <th data-stat="ranker">1</th>
      <td data-stat="game_date"></td>
      <td data-stat="team"><a href="/teams/kan/2024.htm">KAN</a></td>
      <td data-stat="game_count">16</td>
      <td data-stat="pass_cmp">380</td>
      <td data-stat="pass_att">560</td>
      <td data-stat="pass_yds">4200</td>
      <td data-stat="pass_td">32</td>
      <td data-stat="pass_int">10</td>
      <td data-stat="pass_rating">97.5</td>
    </tr>
  </tfoot>
</table>
<table id="rushing_gamelogs">
  <thead>
    <tr>
      <th data-stat="ranker">Rk</th>
      <td data-stat="game_date">Date</td>
      <td data-stat="team">Tm</td>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th data-stat="ranker">1</th>
      <td data-stat="game_date"><a href="/boxscores/202409080kan.htm">2024-09-08</a></td>
      <td data-stat="team"><a href="/teams/kan/2024.htm">KAN</a></td>
      <td data-stat="rush_att">5</td>
      <td data-stat="rush_yds">32</td>
      <td data-stat="rush_td">0</td>
      <td data-stat="rush_long">12</td>
      <td data-stat="fumbles">0</td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <th data-stat="ranker">1</th>
      <td data-stat="game_date"></td>
      <td data-stat="team"><a href="/teams/kan/2024.htm">KAN</a></td>
      <td data-stat="game_count">16</td>
      <td data-stat="rush_att">62</td>
      <td data-stat="rush_yds">380</td>
      <td data-stat="rush_td">4</td>
      <td data-stat="fumbles">2</td>
    </tr>
  </tfoot>
</table>
</body></html>
`;

describe('CareerStats.getGameLog', () => {
  beforeEach(() => {
    mockGetPlayerGameLog.mockResolvedValue(FIXTURE_HTML);
  });

  it('parses passing game row and skips bye week', async () => {
    const log = await getGameLog(player, 2024);

    expect(log.passing).toHaveLength(1);
    expect(log.passing[0]).toMatchObject({
      playerId: 7,
      season: 2024,
      gameNum: 1,
      gameIdentifier: '202409080kan',
      cmp: 28,
      att: 42,
      yds: 312,
      td: 3,
      int: 1,
      sacked: 2,
      sackYds: 14,
      rating: 104.2,
    });
  });

  it('parses rushing game row', async () => {
    const log = await getGameLog(player, 2024);

    expect(log.rushing).toHaveLength(1);
    expect(log.rushing[0]).toMatchObject({
      playerId: 7,
      season: 2024,
      gameNum: 1,
      att: 5,
      yds: 32,
      td: 0,
      fumbles: 0,
    });
  });

  it('returns empty arrays for missing stat tables (receiving, kicking)', async () => {
    const log = await getGameLog(player, 2024);

    expect(log.receiving).toHaveLength(0);
    expect(log.kicking).toHaveLength(0);
  });

  it('returns all empty arrays when HTML has no gamelog tables', async () => {
    mockGetPlayerGameLog.mockResolvedValue('<html><body></body></html>');
    const log = await getGameLog(player, 2024);

    expect(log.passing).toHaveLength(0);
    expect(log.rushing).toHaveLength(0);
    expect(log.receiving).toHaveLength(0);
    expect(log.kicking).toHaveLength(0);
  });
});

describe('CareerStats.getSeasonTotals', () => {
  beforeEach(() => {
    mockGetPlayerGameLog.mockResolvedValue(FIXTURE_HTML);
  });

  it('returns passing season totals from footer row', async () => {
    const totals = await getSeasonTotals(player, 2024);

    expect(totals.passing).toMatchObject({
      playerId: 7,
      season: 2024,
      team: 'KAN',
      g: 16,
      cmp: 380,
      att: 560,
      yds: 4200,
      td: 32,
      int: 10,
      rating: 97.5,
    });
  });

  it('returns rushing season totals from footer row', async () => {
    const totals = await getSeasonTotals(player, 2024);

    expect(totals.rushing).toMatchObject({
      playerId: 7,
      season: 2024,
      team: 'KAN',
      g: 16,
      att: 62,
      yds: 380,
      td: 4,
      fumbles: 2,
    });
  });

  it('returns null for missing stat tables (receiving, kicking)', async () => {
    const totals = await getSeasonTotals(player, 2024);

    expect(totals.receiving).toBeNull();
    expect(totals.kicking).toBeNull();
  });
});
