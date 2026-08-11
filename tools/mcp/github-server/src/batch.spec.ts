import {
  assembleBatchResult,
  batchError,
  checkBatchSize,
  MAX_BATCH_SIZE,
  runBatch,
} from './batch';

describe('batch helpers', () => {
  describe('checkBatchSize', () => {
    it('returns null for valid sizes', () => {
      expect(checkBatchSize(1)).toBeNull();
      expect(checkBatchSize(MAX_BATCH_SIZE)).toBeNull();
    });

    it('rejects empty arrays with a structured error', () => {
      const result = checkBatchSize(0);
      expect(result?.isError).toBe(true);
      if (!result)
        throw new Error('expected checkBatchSize to return a result');
      const body = JSON.parse(result.content[0].text) as {
        success: boolean;
        error: string;
      };
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/empty/i);
    });

    it('rejects over-limit batches with the count in the error', () => {
      const result = checkBatchSize(73);
      expect(result?.isError).toBe(true);
      if (!result)
        throw new Error('expected checkBatchSize to return a result');
      const body = JSON.parse(result.content[0].text) as {
        success: boolean;
        error: string;
      };
      expect(body.error).toContain('73');
      expect(body.error).toContain('50');
    });

    it('honours a custom max', () => {
      expect(checkBatchSize(5, 10)).toBeNull();
      expect(checkBatchSize(11, 10)?.isError).toBe(true);
    });
  });

  describe('batchError', () => {
    it('wraps a message in the standard whole-call failure shape', () => {
      const result = batchError('boom');
      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as {
        success: boolean;
        error: string;
      };
      expect(body).toEqual({ success: false, error: 'boom' });
    });
  });

  describe('assembleBatchResult', () => {
    it('marks success=true and omits isError when there are no failures', () => {
      const result = assembleBatchResult(2, [{ index: 0 }, { index: 1 }], []);
      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as {
        success: boolean;
        total: number;
        succeeded: { index: number }[];
        failed: { index: number; key?: string | number; error: string }[];
      };
      expect(body).toMatchObject({
        success: true,
        total: 2,
        succeeded: [{ index: 0 }, { index: 1 }],
        failed: [],
      });
    });

    it('sets isError and success=false when any item failed', () => {
      const result = assembleBatchResult(
        2,
        [{ index: 0 }],
        [{ index: 1, key: 'x', error: 'oops' }],
      );
      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as {
        success: boolean;
        failed: { index: number; key?: string | number; error: string }[];
      };
      expect(body.success).toBe(false);
      expect(body.failed).toEqual([{ index: 1, key: 'x', error: 'oops' }]);
    });

    it('merges extra fields into the body', () => {
      const result = assembleBatchResult(1, [{ index: 0 }], [], { warn: 'hi' });
      const body = JSON.parse(result.content[0].text) as { warn: string };
      expect(body.warn).toBe('hi');
    });
  });

  describe('runBatch', () => {
    it('routes thrown errors to failed[] without aborting the rest', async () => {
      const { succeeded, failed } = await runBatch<number, { value: number }>(
        [1, 2, 3, 4],
        (n) => {
          if (n === 2) throw new Error('bad two');
          return Promise.resolve({ value: n });
        },
        { concurrency: 2, keyOf: (n) => n },
      );

      expect(succeeded).toHaveLength(3);
      expect(succeeded.map((s) => s.value).sort()).toEqual([1, 3, 4]);
      expect(failed).toEqual([{ index: 1, key: 2, error: 'bad two' }]);
    });

    it('preserves item index through concurrent chunks', async () => {
      const { succeeded } = await runBatch<
        string,
        { index: number; v: string }
      >(['a', 'b', 'c', 'd', 'e'], (v, i) => Promise.resolve({ index: i, v }), {
        concurrency: 2,
      });
      const sorted = [...succeeded].sort((a, b) => a.index - b.index);
      expect(sorted).toEqual([
        { index: 0, v: 'a' },
        { index: 1, v: 'b' },
        { index: 2, v: 'c' },
        { index: 3, v: 'd' },
        { index: 4, v: 'e' },
      ]);
    });
  });
});
