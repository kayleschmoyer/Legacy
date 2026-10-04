import { gzipSync } from 'node:zlib';

import { PfaCareerStats } from './pfa-provider';
import { buildPfaObjectKey, isPfaSeason, PfaPayloadError } from './pfa-types';
import {
  __setS3ClientForTesting,
  clearFootballCorpusCache,
  getPfaPlayerSeasonPayload,
} from './s3-store';

/*
 * Payload built the way the LS-9995 ingest writes it
 * (`lib/pfa-client/src/lib/build-season-payloads.ts`): rows carry no
 * playerId, rushing/receiving `fumbles` is always null, kicking distance
 * bands are null.
 */
const PAYLOAD = {
  v: 1,
  pfrId: 'UnitJo00',
  pfaId: 'unitjo01',
  season: 1960,
  passing: [
    {
      season: 1960,
      gameNum: 1,
      gameIdentifier: '1960nfl001',
      cmp: 13,
      att: 26,
      yds: 190,
      td: 1,
      int: 2,
      sacked: null,
      sackYds: null,
      rating: null,
    },
  ],
  rushing: [
    {
      season: 1960,
      gameNum: 1,
      gameIdentifier: '1960nfl001',
      att: 3,
      yds: 12,
      td: 0,
      lng: 7,
      fumbles: null,
    },
  ],
  receiving: [],
  kicking: [],
};

const player = { id: 42, pfrId: 'UnitJo00' };

function gz(value: unknown): Uint8Array {
  return gzipSync(Buffer.from(JSON.stringify(value), 'utf-8'));
}

function respondWith(bytes: Uint8Array) {
  return { Body: { transformToByteArray: () => Promise.resolve(bytes) } };
}

function installClient(send: jest.Mock) {
  __setS3ClientForTesting({ send } as unknown as Parameters<
    typeof __setS3ClientForTesting
  >[0]);
}

function notFoundError(): Error {
  const error = new Error('NoSuchKey');
  error.name = 'NoSuchKey';
  return error;
}

describe('PFA read path (LS-9997)', () => {
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
    __setS3ClientForTesting(null);
  });

  describe('key layout and season range', () => {
    it('builds pfa/v1/<pfrId>/<season>.json.gz, honouring an optional prefix', () => {
      expect(buildPfaObjectKey('', 'UnitJo00', 1960)).toBe(
        'pfa/v1/UnitJo00/1960.json.gz',
      );
      expect(buildPfaObjectKey('/corpus/', 'UnitJo00', 1960)).toBe(
        'corpus/pfa/v1/UnitJo00/1960.json.gz',
      );
    });

    it('covers 1960-1998 inclusive only', () => {
      expect(isPfaSeason(1959)).toBe(false);
      expect(isPfaSeason(1960)).toBe(true);
      expect(isPfaSeason(1998)).toBe(true);
      expect(isPfaSeason(1999)).toBe(false);
    });
  });

  describe('found object', () => {
    it('reads the expected key and returns a GameLog with playerId injected', async () => {
      const send = jest
        .fn()
        .mockImplementation((command: { input: unknown }) => {
          expect(command.input).toEqual({
            Bucket: 'test-football-corpus',
            Key: 'pfa/v1/UnitJo00/1960.json.gz',
          });
          return Promise.resolve(respondWith(gz(PAYLOAD)));
        });
      installClient(send);

      const log = await PfaCareerStats.getGameLog(player, 1960);

      expect(log).toEqual({
        passing: [{ ...PAYLOAD.passing[0], playerId: 42 }],
        rushing: [{ ...PAYLOAD.rushing[0], playerId: 42 }],
        receiving: [],
        kicking: [],
      });
    });

    it('keeps fumbles null (never 0), including when the ingest omitted the key', async () => {
      const { fumbles: _omitted, ...rushingWithoutFumbles } =
        PAYLOAD.rushing[0];
      const payload = {
        ...PAYLOAD,
        rushing: [rushingWithoutFumbles],
        receiving: [
          {
            season: 1960,
            gameNum: 1,
            gameIdentifier: '1960nfl001',
            rec: 4,
            tgt: null,
            yds: 51,
            td: 1,
            lng: 22,
            fumbles: null,
          },
        ],
      };
      installClient(jest.fn().mockResolvedValue(respondWith(gz(payload))));

      const log = await PfaCareerStats.getGameLog(player, 1960);

      expect(log?.rushing[0].fumbles).toBeNull();
      expect(log?.receiving[0].fumbles).toBeNull();
    });

    it('memoizes concurrent reads of one player-season into a single GET', async () => {
      const send = jest.fn().mockResolvedValue(respondWith(gz(PAYLOAD)));
      installClient(send);

      const [a, b] = await Promise.all([
        getPfaPlayerSeasonPayload('UnitJo00', 1960),
        getPfaPlayerSeasonPayload('UnitJo00', 1960),
      ]);

      expect(a).toEqual(PAYLOAD);
      expect(b).toEqual(PAYLOAD);
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('missing object', () => {
    it('returns null ("no data") on NoSuchKey, not a throw or an empty log', async () => {
      installClient(jest.fn().mockRejectedValue(notFoundError()));

      await expect(PfaCareerStats.getGameLog(player, 1960)).resolves.toBeNull();
    });

    it('returns null for a 1999+ season without touching S3', async () => {
      const send = jest.fn();
      installClient(send);

      await expect(PfaCareerStats.getGameLog(player, 1999)).resolves.toBeNull();
      expect(send).not.toHaveBeenCalled();
    });

    it('returns null without touching S3 when no corpus bucket is configured', async () => {
      delete process.env.FOOTBALL_CORPUS_S3_BUCKET;
      const send = jest.fn();
      installClient(send);

      await expect(PfaCareerStats.getGameLog(player, 1960)).resolves.toBeNull();
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('S3 failures and malformed objects', () => {
    it('throws on a non-404 S3 error instead of treating it as a miss', async () => {
      installClient(jest.fn().mockRejectedValue(new Error('AccessDenied')));

      await expect(PfaCareerStats.getGameLog(player, 1960)).rejects.toThrow(
        'AccessDenied',
      );
    });

    it('throws PfaPayloadError for bytes that are not gzip', async () => {
      installClient(
        jest.fn().mockResolvedValue(respondWith(Buffer.from('not gzip'))),
      );

      await expect(PfaCareerStats.getGameLog(player, 1960)).rejects.toThrow(
        PfaPayloadError,
      );
    });

    it('throws PfaPayloadError for gzipped bytes that are not JSON', async () => {
      installClient(
        jest
          .fn()
          .mockResolvedValue(respondWith(gzipSync(Buffer.from('{truncated')))),
      );

      await expect(PfaCareerStats.getGameLog(player, 1960)).rejects.toThrow(
        PfaPayloadError,
      );
    });

    it.each([
      ['an unknown version', { ...PAYLOAD, v: 2 }, /unsupported version 2/],
      ['a missing stat array', { ...PAYLOAD, kicking: undefined }, /"kicking"/],
      [
        'a malformed row',
        { ...PAYLOAD, passing: [{ yds: 10 }] },
        /"passing" has a malformed row/,
      ],
      [
        'another player-season',
        { ...PAYLOAD, pfrId: 'OtheRr00' },
        /expected UnitJo00 1960/,
      ],
      ['a non-object', [PAYLOAD], /not a JSON object/],
    ])('throws PfaPayloadError for %s', async (_label, payload, message) => {
      installClient(jest.fn().mockResolvedValue(respondWith(gz(payload))));

      const read = PfaCareerStats.getGameLog(player, 1960);

      await expect(read).rejects.toThrow(PfaPayloadError);
      await expect(read).rejects.toThrow(message);
    });

    it('does not cache a malformed read, so a repaired object is picked up', async () => {
      const send = jest
        .fn()
        .mockResolvedValueOnce(respondWith(Buffer.from('not gzip')))
        .mockResolvedValueOnce(respondWith(gz(PAYLOAD)));
      installClient(send);

      await expect(getPfaPlayerSeasonPayload('UnitJo00', 1960)).rejects.toThrow(
        PfaPayloadError,
      );
      await expect(
        getPfaPlayerSeasonPayload('UnitJo00', 1960),
      ).resolves.toEqual(PAYLOAD);
      expect(send).toHaveBeenCalledTimes(2);
    });
  });
});
