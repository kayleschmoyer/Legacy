import {
  CareerStats as PfrCareerStats,
  IDPStats as PfrIDPStats,
  TeamDefense as PfrTeamDefense,
} from '@legacy-sports/pfr-client';
import { CareerStats, IDPStats, TeamDefense } from './provider';
import * as s3Store from './s3-store';

jest.mock('./s3-store');
jest.mock('@legacy-sports/pfr-client', () => ({
  CareerStats: { getGameLog: jest.fn() },
  IDPStats: { getGameLog: jest.fn() },
  TeamDefense: { getGameLog: jest.fn() },
}));

const mockPfrCareerStats = jest.mocked(PfrCareerStats.getGameLog);
const mockPfrIDPStats = jest.mocked(PfrIDPStats.getGameLog);
const mockPfrTeamDefense = jest.mocked(PfrTeamDefense.getGameLog);

const player = { id: 42, pfrId: 'MahoPa00' };

describe('CareerStats.getGameLog (nflverse-backed provider)', () => {
  afterEach(() => jest.clearAllMocks());

  it('serves from the S3 payload and injects playerId when the corpus has coverage', async () => {
    jest.spyOn(s3Store, 'getPlayerSeasonPayload').mockResolvedValue({
      v: 1,
      pfrId: 'MahoPa00',
      gsisId: '00-0033873',
      season: 2023,
      passing: [
        {
          season: 2023,
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
        },
      ],
      rushing: [],
      receiving: [],
      kicking: [],
      defenseIdp: [],
    });

    const log = await CareerStats.getGameLog(player, 2023);

    expect(log.passing).toHaveLength(1);
    expect(log.passing[0]).toMatchObject({ playerId: 42, yds: 226 });
    expect(mockPfrCareerStats).not.toHaveBeenCalled();
  });

  it('falls back to pfr-client when the corpus has no coverage (null payload)', async () => {
    jest.spyOn(s3Store, 'getPlayerSeasonPayload').mockResolvedValue(null);
    mockPfrCareerStats.mockResolvedValue({
      passing: [],
      rushing: [],
      receiving: [],
      kicking: [],
    });

    await CareerStats.getGameLog(player, 1985);

    expect(mockPfrCareerStats).toHaveBeenCalledWith(player, 1985);
  });
});

describe('IDPStats.getGameLog (nflverse-backed provider)', () => {
  afterEach(() => jest.clearAllMocks());

  it('serves IDP rows from the S3 payload', async () => {
    jest.spyOn(s3Store, 'getPlayerSeasonPayload').mockResolvedValue({
      v: 1,
      pfrId: 'JackKa99',
      gsisId: '00-0027872',
      season: 2023,
      passing: [],
      rushing: [],
      receiving: [],
      kicking: [],
      defenseIdp: [
        {
          season: 2023,
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
        },
      ],
    });

    const rows = await IDPStats.getGameLog({ id: 7, pfrId: 'JackKa99' }, 2023);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ playerId: 7, int: 1 });
    expect(mockPfrIDPStats).not.toHaveBeenCalled();
  });

  it('falls back to pfr-client on a corpus miss', async () => {
    jest.spyOn(s3Store, 'getPlayerSeasonPayload').mockResolvedValue(null);
    mockPfrIDPStats.mockResolvedValue([]);

    await IDPStats.getGameLog(player, 1985);

    expect(mockPfrIDPStats).toHaveBeenCalledWith(player, 1985);
  });
});

describe('TeamDefense.getGameLog (nflverse-backed provider)', () => {
  afterEach(() => jest.clearAllMocks());

  it('serves team defense rows from the S3 payload', async () => {
    jest.spyOn(s3Store, 'getTeamDefenseSeasonPayload').mockResolvedValue({
      v: 1,
      nflTeam: 'DEN',
      season: 2023,
      games: [
        {
          season: 2023,
          gameNum: 1,
          gameIdentifier: '2023_01_LV_DEN',
          sacks: 0,
          int: 1,
          fumRec: 0,
          defTd: 0,
          safeties: 0,
          ptsAllowed: 17,
          ydsAllowed: 0,
          passYdsAllowed: 0,
          rushYdsAllowed: 0,
        },
      ],
    });

    const rows = await TeamDefense.getGameLog(player, 'DEN', 2023);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ playerId: 42, ptsAllowed: 17 });
    expect(mockPfrTeamDefense).not.toHaveBeenCalled();
  });

  it('falls back to pfr-client on a corpus miss', async () => {
    jest.spyOn(s3Store, 'getTeamDefenseSeasonPayload').mockResolvedValue(null);
    mockPfrTeamDefense.mockResolvedValue([]);

    await TeamDefense.getGameLog(player, 'den', 1985);

    expect(mockPfrTeamDefense).toHaveBeenCalledWith(player, 'den', 1985);
  });
});
