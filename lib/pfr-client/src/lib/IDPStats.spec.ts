import { getGameLog, getSeasonTotals } from './IDPStats';
import * as PFRSession from './PFRSession';

jest.mock('./PFRSession');
const mockGetPlayerGameLog = jest.mocked(PFRSession.getPlayerGameLog);

const player = { id: 42, pfrId: 'TestPl00' };

// Fixture: one active game (week 1) + one bye week (week 9, no box score link).
// The tfoot row holds season totals including a 3.5-sack half-sack total.
const FIXTURE_HTML = `
<html><body>
<table id="defense_gamelogs">
  <thead>
    <tr>
      <th data-stat="ranker">Rk</th>
      <td data-stat="game_date">Date</td>
      <td data-stat="team">Tm</td>
      <td data-stat="tackles_solo">Solo</td>
      <td data-stat="tackles_assist">Ast</td>
      <td data-stat="sacks">Sacks</td>
      <td data-stat="def_int">Int</td>
      <td data-stat="pass_defended">PD</td>
      <td data-stat="fumbles_forced">FF</td>
      <td data-stat="fumbles_rec">FR</td>
      <td data-stat="def_td">TD</td>
      <td data-stat="safety_md">Sfty</td>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th data-stat="ranker">1</th>
      <td data-stat="game_date"><a href="/boxscores/202409080kan.htm">2024-09-08</a></td>
      <td data-stat="team"><a href="/teams/kan/2024.htm">KAN</a></td>
      <td data-stat="tackles_solo">5</td>
      <td data-stat="tackles_assist">3</td>
      <td data-stat="sacks">0.5</td>
      <td data-stat="def_int">1</td>
      <td data-stat="pass_defended">2</td>
      <td data-stat="fumbles_forced">0</td>
      <td data-stat="fumbles_rec">1</td>
      <td data-stat="def_td">0</td>
      <td data-stat="safety_md">0</td>
    </tr>
    <tr>
      <th data-stat="ranker">9</th>
      <td data-stat="game_date">2024-10-27</td>
      <td data-stat="team"><a href="/teams/kan/2024.htm">KAN</a></td>
      <td data-stat="tackles_solo"></td>
      <td data-stat="tackles_assist"></td>
      <td data-stat="sacks"></td>
      <td data-stat="def_int"></td>
      <td data-stat="pass_defended"></td>
      <td data-stat="fumbles_forced"></td>
      <td data-stat="fumbles_rec"></td>
      <td data-stat="def_td"></td>
      <td data-stat="safety_md"></td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <th data-stat="ranker">1</th>
      <td data-stat="game_date"></td>
      <td data-stat="team"><a href="/teams/kan/2024.htm">KAN</a></td>
      <td data-stat="game_count">17</td>
      <td data-stat="games_started">16</td>
      <td data-stat="tackles_solo">60</td>
      <td data-stat="tackles_assist">20</td>
      <td data-stat="sacks">3.5</td>
      <td data-stat="def_int">2</td>
      <td data-stat="pass_defended">8</td>
      <td data-stat="fumbles_forced">2</td>
      <td data-stat="fumbles_rec">1</td>
      <td data-stat="def_td">0</td>
      <td data-stat="safety_md">0</td>
    </tr>
  </tfoot>
</table>
</body></html>
`;

describe('IDPStats.getGameLog', () => {
  beforeEach(() => {
    mockGetPlayerGameLog.mockResolvedValue(FIXTURE_HTML);
  });

  it('returns parsed game rows and skips bye weeks', async () => {
    const rows = await getGameLog(player, 2024);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      playerId: 42,
      season: 2024,
      gameNum: 1,
      gameIdentifier: '202409080kan',
      soloTkl: 5,
      astTkl: 3,
      sacks: 0.5,
      int: 1,
      pd: 2,
      ff: 0,
      fr: 1,
      defTd: 0,
      safeties: 0,
    });
  });

  it('returns empty array when defense_gamelogs table is absent', async () => {
    mockGetPlayerGameLog.mockResolvedValue('<html><body></body></html>');
    const rows = await getGameLog(player, 2024);
    expect(rows).toHaveLength(0);
  });

  it('calls getPlayerGameLog with correct pfrId and season', async () => {
    await getGameLog(player, 2024);
    expect(mockGetPlayerGameLog).toHaveBeenCalledWith('TestPl00', 2024);
  });
});

describe('IDPStats.getSeasonTotals', () => {
  beforeEach(() => {
    mockGetPlayerGameLog.mockResolvedValue(FIXTURE_HTML);
  });

  it('returns season totals from footer including computed totalTkl and half-sacks', async () => {
    const totals = await getSeasonTotals(player, 2024);

    expect(totals).toMatchObject({
      playerId: 42,
      season: 2024,
      team: 'KAN',
      g: 17,
      gs: 16,
      soloTkl: 60,
      astTkl: 20,
      totalTkl: 80,
      sacks: 3.5,
      int: 2,
      pd: 8,
      ff: 2,
      fr: 1,
      defTd: 0,
      safeties: 0,
    });
  });

  it('returns null when defense_gamelogs table is absent', async () => {
    mockGetPlayerGameLog.mockResolvedValue('<html><body></body></html>');
    const totals = await getSeasonTotals(player, 2024);
    expect(totals).toBeNull();
  });
});
