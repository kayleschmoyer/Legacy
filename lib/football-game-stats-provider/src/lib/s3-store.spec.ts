import { gzipSync } from 'node:zlib';
import {
  __setS3ClientForTesting,
  clearFootballCorpusCache,
  getPlayerSeasonPayload,
  getTeamDefenseSeasonPayload,
  isFootballCorpusConfigured,
} from './s3-store';
import type { NflversePlayerSeasonPayload } from './types';

const PAYLOAD: NflversePlayerSeasonPayload = {
  v: 1,
  pfrId: 'MahoPa00',
  gsisId: '00-0033873',
  season: 2023,
  passing: [],
  rushing: [],
  receiving: [],
  kicking: [],
  defenseIdp: [],
};

function fakeClient(send: (command: unknown) => Promise<unknown>) {
  return { send } as unknown as Parameters<typeof __setS3ClientForTesting>[0];
}

function notFoundError(): Error & { name: string } {
  const error = new Error('NoSuchKey') as Error & { name: string };
  error.name = 'NoSuchKey';
  return error;
}

describe('football-game-stats-provider s3-store', () => {
  const originalBucket = process.env.FOOTBALL_CORPUS_S3_BUCKET;

  beforeEach(() => {
    process.env.FOOTBALL_CORPUS_S3_BUCKET = 'test-football-corpus';
    delete process.env.FOOTBALL_CORPUS_S3_PREFIX;
    clearFootballCorpusCache();
    __setS3ClientForTesting(null);
  });

  afterAll(() => {
    if (originalBucket === undefined) {
      delete process.env.FOOTBALL_CORPUS_S3_BUCKET;
    } else {
      process.env.FOOTBALL_CORPUS_S3_BUCKET = originalBucket;
    }
  });

  it('reports disabled when no bucket is configured', () => {
    delete process.env.FOOTBALL_CORPUS_S3_BUCKET;
    expect(isFootballCorpusConfigured()).toBe(false);
  });

  it('reports configured when a bucket is set', () => {
    expect(isFootballCorpusConfigured()).toBe(true);
  });

  it('returns null without touching S3 when disabled', async () => {
    delete process.env.FOOTBALL_CORPUS_S3_BUCKET;
    const send = jest.fn();
    __setS3ClientForTesting(fakeClient(send));

    const result = await getPlayerSeasonPayload('MahoPa00', 2023);

    expect(result).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('fetches, gunzips, and parses a player payload from the expected key', async () => {
    const body = gzipSync(Buffer.from(JSON.stringify(PAYLOAD), 'utf-8'));
    const send = jest.fn().mockImplementation((command: { input: unknown }) => {
      expect(command.input).toMatchObject({
        Bucket: 'test-football-corpus',
        Key: 'nflverse/v1/MahoPa00/2023.json.gz',
      });
      return Promise.resolve({
        Body: { transformToByteArray: () => Promise.resolve(body) },
      });
    });
    __setS3ClientForTesting(fakeClient(send));

    const result = await getPlayerSeasonPayload('MahoPa00', 2023);

    expect(result).toEqual(PAYLOAD);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('memoizes concurrent lookups for the same (pfrId, season) into one S3 GET', async () => {
    const body = gzipSync(Buffer.from(JSON.stringify(PAYLOAD), 'utf-8'));
    const send = jest.fn().mockResolvedValue({
      Body: { transformToByteArray: () => Promise.resolve(body) },
    });
    __setS3ClientForTesting(fakeClient(send));

    const [a, b] = await Promise.all([
      getPlayerSeasonPayload('MahoPa00', 2023),
      getPlayerSeasonPayload('MahoPa00', 2023),
    ]);

    expect(a).toEqual(PAYLOAD);
    expect(b).toEqual(PAYLOAD);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('returns null (not an error) on a NoSuchKey miss', async () => {
    const send = jest.fn().mockRejectedValue(notFoundError());
    __setS3ClientForTesting(fakeClient(send));

    const result = await getPlayerSeasonPayload('UnknownId00', 2023);

    expect(result).toBeNull();
  });

  it('surfaces a genuine S3 failure rather than treating it as a miss', async () => {
    const send = jest.fn().mockRejectedValue(new Error('access denied'));
    __setS3ClientForTesting(fakeClient(send));

    await expect(getPlayerSeasonPayload('MahoPa00', 2023)).rejects.toThrow(
      'access denied',
    );
  });

  it('does not memoize a failed lookup — the next call retries', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: () =>
            Promise.resolve(
              gzipSync(Buffer.from(JSON.stringify(PAYLOAD), 'utf-8')),
            ),
        },
      });
    __setS3ClientForTesting(fakeClient(send));

    await expect(getPlayerSeasonPayload('MahoPa00', 2023)).rejects.toThrow(
      'transient',
    );
    const result = await getPlayerSeasonPayload('MahoPa00', 2023);

    expect(result).toEqual(PAYLOAD);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('fetches team defense payloads from a distinct key prefix', async () => {
    const teamPayload = {
      v: 1,
      nflTeam: 'DEN',
      season: 2023,
      games: [],
    };
    const send = jest.fn().mockImplementation((command: { input: unknown }) => {
      expect(command.input).toMatchObject({
        Key: 'nflverse/v1/team-defense/DEN/2023.json.gz',
      });
      return Promise.resolve({
        Body: {
          transformToByteArray: () =>
            Promise.resolve(
              gzipSync(Buffer.from(JSON.stringify(teamPayload), 'utf-8')),
            ),
        },
      });
    });
    __setS3ClientForTesting(fakeClient(send));

    const result = await getTeamDefenseSeasonPayload('den', 2023);

    expect(result).toEqual(teamPayload);
  });
});
