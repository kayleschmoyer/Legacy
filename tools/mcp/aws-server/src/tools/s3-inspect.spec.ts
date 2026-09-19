jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

import { gzipSync } from 'node:zlib';
import {
  type CommandRunner,
  DEFAULT_GET_MAX_BYTES,
  GET_SIZE_CAP_BYTES,
  MAX_GET_MAX_BYTES,
  MAX_KEYS,
  MAX_SUMMARY_PAGES,
  s3Inspect,
  type S3InspectDeps,
} from './s3-inspect.js';

const BUCKET = 'legacy-sports-dev-retrosheet-corpus';

function parseJson<T = Record<string, unknown>>(
  result: Awaited<ReturnType<typeof s3Inspect>>,
): T {
  const block = result.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Expected a text content block');
  }
  return JSON.parse(block.text) as T;
}

function makeDeps(
  runner: CommandRunner,
  download?: Buffer,
): Partial<S3InspectDeps> {
  return {
    runner,
    makeTempDir: () => '/tmp/fake',
    readDownload: () => download ?? Buffer.from(''),
    cleanup: () => undefined,
  };
}

function listPage(
  keys: Array<{ Key: string; LastModified?: string; Size?: number }>,
  nextToken?: string,
): string {
  return JSON.stringify({
    Contents: keys,
    IsTruncated: nextToken !== undefined,
    NextContinuationToken: nextToken,
    KeyCount: keys.length,
  });
}

function notFoundError(): Error {
  return new Error(
    'An error occurred (404) when calling the HeadObject operation: Not Found',
  );
}

function argsOf(runner: CommandRunner, call = 0): string[] {
  return jest.mocked(runner).mock.calls[call][1];
}

function valueOf(args: string[], flag: string): string {
  return args[args.indexOf(flag) + 1];
}

describe('s3Inspect', () => {
  describe('action: list (AC1)', () => {
    it('returns keys with lastModified and size', async () => {
      const runner: CommandRunner = jest.fn().mockResolvedValue(
        listPage([
          {
            Key: 'retrosheet/v1/a.json.gz',
            LastModified: '2026-01-02T00:00:00Z',
            Size: 120,
          },
        ]),
      );
      const result = await s3Inspect(
        { action: 'list', bucket: BUCKET, prefix: 'retrosheet/v1/' },
        makeDeps(runner),
      );

      expect(result.isError).toBeFalsy();
      const body = parseJson<{
        ok: boolean;
        count: number;
        objects: Array<Record<string, unknown>>;
      }>(result);
      expect(body.ok).toBe(true);
      expect(body.count).toBe(1);
      expect(body.objects[0]).toMatchObject({
        key: 'retrosheet/v1/a.json.gz',
        lastModified: '2026-01-02T00:00:00Z',
        size: 120,
      });
    });

    it('passes bucket, prefix and --no-paginate to the CLI', async () => {
      const runner: CommandRunner = jest.fn().mockResolvedValue(listPage([]));
      await s3Inspect(
        { action: 'list', bucket: BUCKET, prefix: 'retrosheet/v1/' },
        makeDeps(runner),
      );

      const args = argsOf(runner);
      expect(args.slice(0, 2)).toEqual(['s3api', 'list-objects-v2']);
      expect(valueOf(args, '--bucket')).toBe(BUCKET);
      expect(valueOf(args, '--prefix')).toBe('retrosheet/v1/');
      expect(args).toContain('--no-paginate');
    });

    it('surfaces nextContinuationToken so a listing can be resumed', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValue(listPage([{ Key: 'a' }], 'TOKEN-1'));
      const body = parseJson(
        await s3Inspect({ action: 'list', bucket: BUCKET }, makeDeps(runner)),
      );

      expect(body.truncated).toBe(true);
      expect(body.nextContinuationToken).toBe('TOKEN-1');
    });

    it('forwards a caller-supplied continuationToken', async () => {
      const runner: CommandRunner = jest.fn().mockResolvedValue(listPage([]));
      await s3Inspect(
        { action: 'list', bucket: BUCKET, continuationToken: 'TOKEN-1' },
        makeDeps(runner),
      );

      expect(valueOf(argsOf(runner), '--continuation-token')).toBe('TOKEN-1');
    });

    it('caps maxKeys at the S3 per-request ceiling', async () => {
      const runner: CommandRunner = jest.fn().mockResolvedValue(listPage([]));
      await s3Inspect(
        { action: 'list', bucket: BUCKET, maxKeys: 99_999 },
        makeDeps(runner),
      );

      expect(Number(valueOf(argsOf(runner), '--max-keys'))).toBe(MAX_KEYS);
    });

    it('treats an empty CLI response as an empty listing', async () => {
      const runner: CommandRunner = jest.fn().mockResolvedValue('');
      const body = parseJson(
        await s3Inspect({ action: 'list', bucket: BUCKET }, makeDeps(runner)),
      );

      expect(body.count).toBe(0);
      expect(body.objects).toEqual([]);
    });

    it('returns isError with an SSO remedy when the CLI fails', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockRejectedValue(new Error('sso session has expired'));
      const result = await s3Inspect(
        { action: 'list', bucket: BUCKET },
        makeDeps(runner),
      );

      expect(result.isError).toBe(true);
      expect(parseJson(result).remedy).toMatch(/aws sso login/);
    });
  });

  describe('action: list — summary mode (AC1)', () => {
    it('aggregates count, totalSize and the LastModified range across pages', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValueOnce(
          listPage(
            [
              { Key: 'a', LastModified: '2026-03-01T00:00:00Z', Size: 10 },
              { Key: 'b', LastModified: '2026-01-01T00:00:00Z', Size: 5 },
            ],
            'TOKEN-1',
          ),
        )
        .mockResolvedValueOnce(
          listPage([
            { Key: 'c', LastModified: '2026-06-01T00:00:00Z', Size: 7 },
          ]),
        );

      const body = parseJson(
        await s3Inspect(
          { action: 'list', bucket: BUCKET, summary: true },
          makeDeps(runner),
        ),
      );

      expect(body.mode).toBe('summary');
      expect(body.count).toBe(3);
      expect(body.totalSize).toBe(22);
      expect(body.minLastModified).toBe('2026-01-01T00:00:00Z');
      expect(body.maxLastModified).toBe('2026-06-01T00:00:00Z');
      expect(body.pagesScanned).toBe(2);
      expect(body.complete).toBe(true);
      expect(body.objects).toBeUndefined();
    });

    it('stops at the page ceiling and reports complete:false with a resume token', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValue(listPage([{ Key: 'a', Size: 1 }], 'MORE'));

      const body = parseJson(
        await s3Inspect(
          { action: 'list', bucket: BUCKET, summary: true },
          makeDeps(runner),
        ),
      );

      expect(body.pagesScanned).toBe(MAX_SUMMARY_PAGES);
      expect(body.complete).toBe(false);
      expect(body.nextContinuationToken).toBe('MORE');
    });

    it('returns a zero summary for an empty prefix', async () => {
      const runner: CommandRunner = jest.fn().mockResolvedValue(listPage([]));
      const body = parseJson(
        await s3Inspect(
          { action: 'list', bucket: BUCKET, prefix: 'nope/', summary: true },
          makeDeps(runner),
        ),
      );

      expect(body.count).toBe(0);
      expect(body.minLastModified).toBeNull();
      expect(body.maxLastModified).toBeNull();
      expect(body.complete).toBe(true);
    });
  });

  describe('action: head (AC2)', () => {
    it('returns contentLength, lastModified and contentType', async () => {
      const runner: CommandRunner = jest.fn().mockResolvedValue(
        JSON.stringify({
          ContentLength: 2048,
          LastModified: '2026-02-02T00:00:00Z',
          ContentType: 'application/json',
          ETag: '"abc"',
        }),
      );

      const result = await s3Inspect(
        { action: 'head', bucket: BUCKET, key: 'retrosheet/v1/a.json' },
        makeDeps(runner),
      );

      expect(result.isError).toBeFalsy();
      expect(parseJson(result)).toMatchObject({
        ok: true,
        exists: true,
        contentLength: 2048,
        lastModified: '2026-02-02T00:00:00Z',
        contentType: 'application/json',
      });
    });

    it('returns exists:false without isError on a 404', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockRejectedValue(notFoundError());
      const result = await s3Inspect(
        { action: 'head', bucket: BUCKET, key: 'missing.json' },
        makeDeps(runner),
      );

      expect(result.isError).toBeFalsy();
      expect(parseJson(result)).toMatchObject({ ok: true, exists: false });
    });

    it('still errors on a non-404 failure', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockRejectedValue(new Error('An error occurred (AccessDenied)'));
      const result = await s3Inspect(
        { action: 'head', bucket: BUCKET, key: 'a.json' },
        makeDeps(runner),
      );

      expect(result.isError).toBe(true);
    });

    it('requires a key', async () => {
      const runner: CommandRunner = jest.fn();
      const result = await s3Inspect(
        { action: 'head', bucket: BUCKET },
        makeDeps(runner),
      );

      expect(result.isError).toBe(true);
      expect(parseJson(result).error).toMatch(/requires a key/);
      expect(runner).not.toHaveBeenCalled();
    });
  });

  describe('action: get (AC3)', () => {
    function getRunner(head: object, body?: Buffer) {
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValueOnce(JSON.stringify(head))
        .mockResolvedValueOnce('{}');
      return { runner, deps: makeDeps(runner, body) };
    }

    it('returns a small plain-text object', async () => {
      const { runner, deps } = getRunner(
        { ContentLength: 11, ContentType: 'text/plain' },
        Buffer.from('hello world'),
      );

      const result = await s3Inspect(
        { action: 'get', bucket: BUCKET, key: 'a.txt' },
        deps,
      );

      expect(result.isError).toBeFalsy();
      expect(parseJson(result)).toMatchObject({
        ok: true,
        exists: true,
        gunzipped: false,
        encoding: 'utf-8',
        truncated: false,
        body: 'hello world',
      });
      expect(argsOf(runner, 1).slice(0, 2)).toEqual(['s3api', 'get-object']);
    });

    it('auto-gunzips a .gz key', async () => {
      const payload = JSON.stringify({ player: 'ruthb101' });
      const { deps } = getRunner(
        { ContentLength: 60 },
        gzipSync(Buffer.from(payload)),
      );

      const body = parseJson(
        await s3Inspect(
          { action: 'get', bucket: BUCKET, key: 'retrosheet/v1/x.json.gz' },
          deps,
        ),
      );

      expect(body.gunzipped).toBe(true);
      expect(body.body).toBe(payload);
    });

    it('auto-gunzips when ContentEncoding is gzip even without a .gz suffix', async () => {
      const { deps } = getRunner(
        { ContentLength: 40, ContentEncoding: 'gzip' },
        gzipSync(Buffer.from('compressed')),
      );

      const body = parseJson(
        await s3Inspect({ action: 'get', bucket: BUCKET, key: 'x.json' }, deps),
      );

      expect(body.gunzipped).toBe(true);
      expect(body.body).toBe('compressed');
    });

    it('refuses an object above the size cap without downloading it', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify({ ContentLength: GET_SIZE_CAP_BYTES + 1 }),
        );

      const result = await s3Inspect(
        { action: 'get', bucket: BUCKET, key: 'huge.json' },
        makeDeps(runner),
      );

      expect(result.isError).toBe(true);
      expect(parseJson(result).error).toMatch(
        /above the aws_s3_inspect get cap/,
      );
      // Only the HeadObject call ran — no get-object transfer.
      expect(runner).toHaveBeenCalledTimes(1);
    });

    it('truncates to maxBytes and flags it', async () => {
      const { deps } = getRunner(
        { ContentLength: 100 },
        Buffer.from('abcdefghij'),
      );

      const body = parseJson(
        await s3Inspect(
          { action: 'get', bucket: BUCKET, key: 'a.txt', maxBytes: 4 },
          deps,
        ),
      );

      expect(body.truncated).toBe(true);
      expect(body.bytesReturned).toBe(4);
      expect(body.body).toBe('abcd');
    });

    it('trims a trailing partial UTF-8 sequence rather than emitting U+FFFD', async () => {
      // 'é' is 2 bytes, so maxBytes:3 cuts it in half.
      const { deps } = getRunner(
        { ContentLength: 6 },
        Buffer.from('abé', 'utf-8'),
      );

      const body = parseJson(
        await s3Inspect(
          { action: 'get', bucket: BUCKET, key: 'a.txt', maxBytes: 3 },
          deps,
        ),
      );

      expect(body.truncated).toBe(true);
      expect(body.body).toBe('ab');
      expect(body.body).not.toContain('�');
    });

    it('does not trim binary payloads on a truncation boundary', async () => {
      const binary = Buffer.from([0x00, 0xff, 0xfe, 0xfd]);
      const { deps } = getRunner({ ContentLength: 4 }, binary);

      const body = parseJson<{ encoding: string; body: string }>(
        await s3Inspect(
          { action: 'get', bucket: BUCKET, key: 'a.bin', maxBytes: 3 },
          deps,
        ),
      );

      expect(body.encoding).toBe('base64');
      expect(Buffer.from(body.body, 'base64')).toEqual(binary.subarray(0, 3));
    });

    it('caps maxBytes at the ceiling', async () => {
      const { deps } = getRunner({ ContentLength: 5 }, Buffer.from('12345'));

      const body = parseJson(
        await s3Inspect(
          {
            action: 'get',
            bucket: BUCKET,
            key: 'a.txt',
            maxBytes: MAX_GET_MAX_BYTES * 10,
          },
          deps,
        ),
      );

      expect(body.truncated).toBe(false);
      expect(body.bytesReturned).toBe(5);
    });

    it('defaults maxBytes when unset', async () => {
      const { deps } = getRunner(
        { ContentLength: DEFAULT_GET_MAX_BYTES + 10 },
        Buffer.alloc(DEFAULT_GET_MAX_BYTES + 10, 0x61),
      );

      const body = parseJson(
        await s3Inspect({ action: 'get', bucket: BUCKET, key: 'a.txt' }, deps),
      );

      expect(body.bytesReturned).toBe(DEFAULT_GET_MAX_BYTES);
      expect(body.truncated).toBe(true);
    });

    it('base64-encodes binary payloads', async () => {
      const binary = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      const { deps } = getRunner({ ContentLength: 4 }, binary);

      const body = parseJson<{ encoding: string; body: string }>(
        await s3Inspect({ action: 'get', bucket: BUCKET, key: 'a.bin' }, deps),
      );

      expect(body.encoding).toBe('base64');
      expect(Buffer.from(body.body, 'base64')).toEqual(binary);
    });

    it('returns exists:false on a 404 instead of erroring', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockRejectedValue(notFoundError());
      const result = await s3Inspect(
        { action: 'get', bucket: BUCKET, key: 'missing.json' },
        makeDeps(runner),
      );

      expect(result.isError).toBeFalsy();
      expect(parseJson(result).exists).toBe(false);
    });

    it('errors cleanly when a .gz object is not valid gzip', async () => {
      const { deps } = getRunner(
        { ContentLength: 10 },
        Buffer.from('not gzipped'),
      );

      const result = await s3Inspect(
        { action: 'get', bucket: BUCKET, key: 'a.json.gz' },
        deps,
      );

      expect(result.isError).toBe(true);
      expect(parseJson(result).error).toMatch(/gunzip/);
    });

    it('cleans up the temp directory even when the download fails', async () => {
      const cleanup = jest.fn();
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValueOnce(JSON.stringify({ ContentLength: 10 }))
        .mockRejectedValueOnce(new Error('network blip'));

      const result = await s3Inspect(
        { action: 'get', bucket: BUCKET, key: 'a.txt' },
        {
          runner,
          makeTempDir: () => '/tmp/fake',
          readDownload: () => Buffer.from(''),
          cleanup,
        },
      );

      expect(result.isError).toBe(true);
      expect(cleanup).toHaveBeenCalledWith('/tmp/fake');
    });
  });

  describe('input validation', () => {
    it('rejects an invalid bucket name before calling the CLI', async () => {
      const runner: CommandRunner = jest.fn();
      const result = await s3Inspect(
        { action: 'list', bucket: 'Not A Bucket' },
        makeDeps(runner),
      );

      expect(result.isError).toBe(true);
      expect(parseJson(result).error).toMatch(/Invalid bucket/);
      expect(runner).not.toHaveBeenCalled();
    });

    it('rejects a key starting with a hyphen', async () => {
      const runner: CommandRunner = jest.fn();
      const result = await s3Inspect(
        { action: 'head', bucket: BUCKET, key: '-rf' },
        makeDeps(runner),
      );

      expect(result.isError).toBe(true);
      expect(parseJson(result).error).toMatch(/leading "-"/);
      expect(runner).not.toHaveBeenCalled();
    });

    it('rejects a prefix containing control characters', async () => {
      const runner: CommandRunner = jest.fn();
      const result = await s3Inspect(
        { action: 'list', bucket: BUCKET, prefix: 'a\nb' },
        makeDeps(runner),
      );

      expect(result.isError).toBe(true);
      expect(parseJson(result).error).toMatch(/control characters/);
      expect(runner).not.toHaveBeenCalled();
    });

    it('rejects a malformed continuationToken', async () => {
      const runner: CommandRunner = jest.fn();
      const result = await s3Inspect(
        { action: 'list', bucket: BUCKET, continuationToken: 'bad token!' },
        makeDeps(runner),
      );

      expect(result.isError).toBe(true);
      expect(parseJson(result).error).toMatch(/Invalid continuationToken/);
      expect(runner).not.toHaveBeenCalled();
    });
  });

  describe('read-only guarantee (AC4)', () => {
    it('only ever issues s3api list-objects-v2, head-object and get-object', async () => {
      const readOnly = new Set([
        'list-objects-v2',
        'head-object',
        'get-object',
      ]);

      const listRunner: CommandRunner = jest
        .fn()
        .mockResolvedValue(listPage([]));
      await s3Inspect({ action: 'list', bucket: BUCKET }, makeDeps(listRunner));

      const headRunner: CommandRunner = jest.fn().mockResolvedValue('{}');
      await s3Inspect(
        { action: 'head', bucket: BUCKET, key: 'a.json' },
        makeDeps(headRunner),
      );

      const getRunnerFn: CommandRunner = jest
        .fn()
        .mockResolvedValueOnce(JSON.stringify({ ContentLength: 2 }))
        .mockResolvedValueOnce('{}');
      await s3Inspect(
        { action: 'get', bucket: BUCKET, key: 'a.json' },
        makeDeps(getRunnerFn, Buffer.from('hi')),
      );

      for (const runner of [listRunner, headRunner, getRunnerFn]) {
        for (const call of jest.mocked(runner).mock.calls) {
          expect(call[0]).toBe('aws');
          expect(call[1][0]).toBe('s3api');
          expect(readOnly.has(call[1][1])).toBe(true);
        }
      }
    });
  });
});
