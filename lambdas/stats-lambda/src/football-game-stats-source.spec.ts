// ── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Stub only the S3 transport: the provider's real s3-store runs, so these
// tests exercise its NoSuchKey-is-a-miss / everything-else-throws contract.
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  GetObjectCommand: jest.fn().mockImplementation((input: unknown) => ({
    input,
  })),
}));

// ── Import under test ───────────────────────────────────────────────────────

import { clearFootballCorpusCache } from '@legacy-sports/football-game-stats-provider';
import { gzipSync } from 'node:zlib';
import {
  FootballCorpusUnavailableError,
  getFootballGameStatsSource,
  resolvePlayerCorpusKey,
} from './football-game-stats-source';

// ── Helpers ─────────────────────────────────────────────────────────────────

const BUCKET = 'legacy-sports-test-football-corpus';

const passingRow = {
  season: 2023,
  gameNum: 1,
  gameIdentifier: '2023-09-07-KC',
  cmp: 21,
  att: 39,
  yds: 226,
  td: 2,
  int: 1,
  sacked: 2,
  sackYds: 14,
  rating: null,
};

function s3Body(payload: unknown) {
  const bytes = gzipSync(Buffer.from(JSON.stringify(payload)));
  return { Body: { transformToByteArray: () => Promise.resolve(bytes) } };
}

function s3Error(name: string, httpStatusCode: number): Error {
  return Object.assign(new Error(name), {
    name,
    $metadata: { httpStatusCode },
  });
}

function requestedKey(): string {
  const [command] = mockSend.mock.calls[0] as [{ input: { Key: string } }];
  return command.input.Key;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('getFootballGameStatsSource', () => {
  const originalBucket = process.env['FOOTBALL_CORPUS_S3_BUCKET'];

  beforeEach(() => {
    jest.clearAllMocks();
    clearFootballCorpusCache();
    process.env['FOOTBALL_CORPUS_S3_BUCKET'] = BUCKET;
  });

  afterAll(() => {
    if (originalBucket === undefined) {
      delete process.env['FOOTBALL_CORPUS_S3_BUCKET'];
    } else {
      process.env['FOOTBALL_CORPUS_S3_BUCKET'] = originalBucket;
    }
  });

  describe('1999+ (nflverse)', () => {
    it('reads the player game log from nflverse/v1/<pfrId>/<season>.json.gz', async () => {
      mockSend.mockResolvedValueOnce(
        s3Body({
          v: 1,
          pfrId: 'MahoPa00',
          gsisId: '00-0033873',
          season: 2023,
          passing: [passingRow],
          rushing: [],
          receiving: [],
          kicking: [],
          defenseIdp: [],
        }),
      );

      const source = getFootballGameStatsSource(2023);
      const log = await source.getCareerGameLog('MahoPa00', 2023);

      expect(source.name).toBe('nflverse');
      expect(requestedKey()).toBe('nflverse/v1/MahoPa00/2023.json.gz');
      expect(log).toEqual({
        passing: [passingRow],
        rushing: [],
        receiving: [],
        kicking: [],
      });
    });

    it('reads team defense from the per-team nflverse object', async () => {
      const game = {
        season: 1999,
        gameNum: 1,
        gameIdentifier: '1999-09-12-KC',
        sacks: 3,
        int: 1,
        fumRec: 0,
        defTd: 0,
        safeties: 0,
        ptsAllowed: 17,
        ydsAllowed: 310,
        passYdsAllowed: 210,
        rushYdsAllowed: 100,
      };
      mockSend.mockResolvedValueOnce(
        s3Body({ v: 1, nflTeam: 'KAN', season: 1999, games: [game] }),
      );

      const games = await getFootballGameStatsSource(
        1999,
      ).getTeamDefenseGameLog('kan', 1999);

      expect(requestedKey()).toBe('nflverse/v1/team-defense/KAN/1999.json.gz');
      expect(games).toEqual([game]);
    });

    it('treats NoSuchKey as a miss (null), not an error', async () => {
      mockSend.mockRejectedValueOnce(s3Error('NoSuchKey', 404));

      await expect(
        getFootballGameStatsSource(2010).getIdpGameLog('NobodY00', 2010),
      ).resolves.toBeNull();
    });

    it('throws on a non-404 S3 error instead of reporting a miss', async () => {
      mockSend.mockRejectedValueOnce(s3Error('AccessDenied', 403));

      await expect(
        getFootballGameStatsSource(2010).getCareerGameLog('MahoPa00', 2010),
      ).rejects.toMatchObject({ name: 'AccessDenied' });
    });

    it('throws FootballCorpusUnavailableError when the bucket is not configured', async () => {
      delete process.env['FOOTBALL_CORPUS_S3_BUCKET'];

      await expect(
        getFootballGameStatsSource(2010).getCareerGameLog('MahoPa00', 2010),
      ).rejects.toBeInstanceOf(FootballCorpusUnavailableError);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('1960-1998 (PFA)', () => {
    const pfaPassing = {
      ...passingRow,
      season: 1985,
      gameIdentifier: '1985-09-08-MIA',
    };

    it('reads the player game log from pfa/v1/<pfrId>/<season>.json.gz', async () => {
      mockSend.mockResolvedValueOnce(
        s3Body({
          v: 1,
          pfrId: 'MariDa00',
          pfaId: 'marino-dan',
          season: 1985,
          passing: [pfaPassing],
          rushing: [],
          receiving: [],
          kicking: [],
        }),
      );

      const source = getFootballGameStatsSource(1985);
      const log = await source.getCareerGameLog('MariDa00', 1985);

      expect(source.name).toBe('pfa');
      expect(requestedKey()).toBe('pfa/v1/MariDa00/1985.json.gz');
      expect(log).toEqual({
        passing: [pfaPassing],
        rushing: [],
        receiving: [],
        kicking: [],
      });
    });

    it('routes 1998 to PFA and 1999 to nflverse', () => {
      expect(getFootballGameStatsSource(1998).name).toBe('pfa');
      expect(getFootballGameStatsSource(1999).name).toBe('nflverse');
    });

    it('treats a PFA NoSuchKey as a miss (null)', async () => {
      mockSend.mockRejectedValueOnce(s3Error('NoSuchKey', 404));

      await expect(
        getFootballGameStatsSource(1985).getCareerGameLog('NobodY00', 1985),
      ).resolves.toBeNull();
    });

    it('throws on a corrupt PFA object instead of reporting a miss', async () => {
      mockSend.mockResolvedValueOnce(
        s3Body({ v: 1, pfrId: 'SomeoneElse00', season: 1985 }),
      );

      await expect(
        getFootballGameStatsSource(1985).getCareerGameLog('MariDa00', 1985),
      ).rejects.toMatchObject({ name: 'PfaPayloadError' });
    });

    it('reads a player with no pfr_id from pfa/v1/pfa-<pfaId>/ (ADR 0023)', async () => {
      const unitasPassing = {
        ...passingRow,
        season: 1960,
        gameIdentifier: '1960nfl001',
      };
      mockSend.mockResolvedValueOnce(
        s3Body({
          v: 1,
          pfrId: null,
          pfaId: 'unit00100',
          season: 1960,
          passing: [unitasPassing],
          rushing: [],
          receiving: [],
          kicking: [],
        }),
      );

      const corpusKey = resolvePlayerCorpusKey({
        pfrId: null,
        pfaId: 'unit00100',
      });
      const log = await getFootballGameStatsSource(1960).getCareerGameLog(
        corpusKey,
        1960,
      );

      expect(corpusKey).toBe('pfa-unit00100');
      expect(requestedKey()).toBe('pfa/v1/pfa-unit00100/1960.json.gz');
      expect(log?.passing).toEqual([unitasPassing]);
    });

    it('resolves pre-1999 IDP and team defense as a miss without touching S3', async () => {
      const source = getFootballGameStatsSource(1985);

      await expect(source.getIdpGameLog('TaylLa00', 1985)).resolves.toBeNull();
      await expect(
        source.getTeamDefenseGameLog('NYG', 1985),
      ).resolves.toBeNull();
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});

describe('resolvePlayerCorpusKey', () => {
  it('is pfr_id when set, else pfa-<pfa_id>', () => {
    expect(resolvePlayerCorpusKey({ pfrId: 'MariDa00', pfaId: null })).toBe(
      'MariDa00',
    );
    expect(resolvePlayerCorpusKey({ pfrId: 'MariDa00' })).toBe('MariDa00');
    expect(resolvePlayerCorpusKey({ pfrId: null, pfaId: 'unit00100' })).toBe(
      'pfa-unit00100',
    );
  });

  it('throws for a player with neither id rather than reading nothing', () => {
    expect(() => resolvePlayerCorpusKey({ pfrId: null, pfaId: null })).toThrow(
      'neither pfr_id nor pfa_id',
    );
  });
});
