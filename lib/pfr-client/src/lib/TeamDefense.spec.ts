import { getGameLog, getSeasonTotals } from './TeamDefense';
import * as PFRSession from './PFRSession';

jest.mock('./PFRSession');
const mockGetTeamDefenseGameLog = jest.mocked(PFRSession.getTeamDefenseGameLog);

const player = { id: 99, pfrId: 'KanCity00' };

// Fixture uses table id 'games' (PFR's primary team defense table id).
// One active game row + one bye week row (no box score link).
const FIXTURE_HTML = `
<html><body>
<table id="games">
  <thead>
    <tr>
      <th data-stat="ranker">Rk</th>
      <td data-stat="game_date">Date</td>
      <td data-stat="sacks">Sacks</td>
      <td data-stat="def_int">Int</td>
      <td data-stat="fumbles_rec">FR</td>
      <td data-stat="def_td">TD</td>
      <td data-stat="safety_md">Sfty</td>
      <td data-stat="pts_off">PA</td>
      <td data-stat="yds_off">YA</td>
      <td data-stat="pass_yds_off">PassA</td>
      <td data-stat="rush_yds_off">RushA</td>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th data-stat="ranker">1</th>
      <td data-stat="game_date"><a href="/boxscores/202409080kan.htm">2024-09-08</a></td>
      <td data-stat="sacks">3</td>
      <td data-stat="def_int">2</td>
      <td data-stat="fumbles_rec">1</td>
      <td data-stat="def_td">1</td>
      <td data-stat="safety_md">0</td>
      <td data-stat="pts_off">17</td>
      <td data-stat="yds_off">280</td>
      <td data-stat="pass_yds_off">180</td>
      <td data-stat="rush_yds_off">100</td>
    </tr>
    <tr>
      <th data-stat="ranker">9</th>
      <td data-stat="game_date">2024-10-27</td>
      <td data-stat="sacks"></td>
      <td data-stat="def_int"></td>
      <td data-stat="fumbles_rec"></td>
      <td data-stat="def_td"></td>
      <td data-stat="safety_md"></td>
      <td data-stat="pts_off"></td>
      <td data-stat="yds_off"></td>
      <td data-stat="pass_yds_off"></td>
      <td data-stat="rush_yds_off"></td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <th data-stat="ranker">1</th>
      <td data-stat="game_date"></td>
      <td data-stat="game_count">17</td>
      <td data-stat="sacks">42</td>
      <td data-stat="def_int">18</td>
      <td data-stat="fumbles_rec">9</td>
      <td data-stat="def_td">4</td>
      <td data-stat="safety_md">1</td>
    </tr>
  </tfoot>
</table>
</body></html>
`;

describe('TeamDefense.getGameLog', () => {
  beforeEach(() => {
    mockGetTeamDefenseGameLog.mockResolvedValue(FIXTURE_HTML);
  });

  it('parses defense game row and skips bye week', async () => {
    const rows = await getGameLog(player, 'kan', 2024);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      playerId: 99,
      season: 2024,
      gameNum: 1,
      gameIdentifier: '202409080kan',
      sacks: 3,
      int: 2,
      fumRec: 1,
      defTd: 1,
      safeties: 0,
      ptsAllowed: 17,
      ydsAllowed: 280,
      passYdsAllowed: 180,
      rushYdsAllowed: 100,
    });
  });

  it('returns empty array when no defense table is found', async () => {
    mockGetTeamDefenseGameLog.mockResolvedValue('<html><body></body></html>');
    const rows = await getGameLog(player, 'kan', 2024);
    expect(rows).toHaveLength(0);
  });

  it('calls getTeamDefenseGameLog with correct team and season', async () => {
    await getGameLog(player, 'kan', 2024);
    expect(mockGetTeamDefenseGameLog).toHaveBeenCalledWith('kan', 2024);
  });
});

describe('TeamDefense.getSeasonTotals', () => {
  beforeEach(() => {
    mockGetTeamDefenseGameLog.mockResolvedValue(FIXTURE_HTML);
  });

  it('returns season totals from footer row', async () => {
    const totals = await getSeasonTotals(player, 'kan', 2024);

    expect(totals).toMatchObject({
      playerId: 99,
      season: 2024,
      team: 'KAN',
      g: 17,
      sacks: 42,
      int: 18,
      fumRec: 9,
      defTd: 4,
      safeties: 1,
    });
  });

  it('returns null when no defense table is found', async () => {
    mockGetTeamDefenseGameLog.mockResolvedValue('<html><body></body></html>');
    const totals = await getSeasonTotals(player, 'kan', 2024);
    expect(totals).toBeNull();
  });
});
