import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../logs.js', () => ({
  fetchRunLogsRing: jest.fn(),
}));

import { getLogs } from './get-logs.js';
import * as logs from '../logs.js';

const mockFetch = logs.fetchRunLogsRing as jest.MockedFunction<
  typeof logs.fetchRunLogsRing
>;

function parsePayload(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

describe('getLogs', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('singular runId', () => {
    it('returns a flat per-run payload (back-compat)', async () => {
      mockFetch.mockResolvedValue({
        lines: ['line a', 'line b'],
        totalLines: 2,
      });

      const result = await getLogs({ runId: 123 });

      expect(result.isError).toBeUndefined();
      const payload = parsePayload(result.content[0].text);
      expect(payload.runId).toBe(123);
      expect(payload.logs).toBe('line a\nline b');
      expect(payload.totalLines).toBe(2);
      // Singular path is not wrapped in { logs: { [runId]: ... } }
      expect(payload).not.toHaveProperty('missing');
    });

    it('errors when neither runId, runIds, nor jobId is provided', async () => {
      const result = await getLogs({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/required/i);
    });

    it('surfaces the underlying error in singular mode', async () => {
      mockFetch.mockRejectedValue(new Error('boom'));
      const result = await getLogs({ runId: 7 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('boom');
    });
  });

  describe('batch runIds', () => {
    it('returns per-run payloads keyed by runId', async () => {
      mockFetch.mockImplementation(async (params) => ({
        lines: [`log-for-${params.runId}`],
        totalLines: 1,
      }));

      const result = await getLogs({ runIds: [10, 20, 30] });

      expect(result.isError).toBeUndefined();
      const payload = parsePayload(result.content[0].text) as {
        logs: Record<string, { runId: number; logs: string }>;
        missing: unknown[];
      };
      expect(Object.keys(payload.logs).sort()).toEqual(['10', '20', '30']);
      expect(payload.logs['10'].logs).toBe('log-for-10');
      expect(payload.logs['20'].logs).toBe('log-for-20');
      expect(payload.logs['30'].logs).toBe('log-for-30');
      expect(payload.missing).toEqual([]);
    });

    it('isolates a BlobNotFound 404 to missing[] without failing the others', async () => {
      mockFetch.mockImplementation(async (params) => {
        if (params.runId === 999) {
          throw new Error(
            'GitHub API 404: <Error><Code>BlobNotFound</Code></Error>',
          );
        }
        return { lines: [`log-for-${params.runId}`], totalLines: 1 };
      });

      const result = await getLogs({ runIds: [1, 999, 2] });

      expect(result.isError).toBeUndefined();
      const payload = parsePayload(result.content[0].text) as {
        logs: Record<string, unknown>;
        missing: Array<{ runId: number; reason: string }>;
      };
      expect(Object.keys(payload.logs).sort()).toEqual(['1', '2']);
      expect(payload.missing).toHaveLength(1);
      expect(payload.missing[0].runId).toBe(999);
      expect(payload.missing[0].reason).toContain('BlobNotFound');
    });

    it('caps the batch at 10 runs', async () => {
      const result = await getLogs({
        runIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/at most 10/i);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects combining runIds with jobId', async () => {
      const result = await getLogs({ runIds: [1, 2], jobId: 5 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/cannot be combined with jobId/i);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('caps concurrent fetches at 3', async () => {
      let inFlight = 0;
      let peak = 0;
      mockFetch.mockImplementation(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return { lines: ['x'], totalLines: 1 };
      });

      await getLogs({ runIds: [1, 2, 3, 4, 5, 6, 7, 8] });

      expect(peak).toBeLessThanOrEqual(3);
      expect(mockFetch).toHaveBeenCalledTimes(8);
    });

    it('returns an empty logs/missing payload structure when all runs succeed', async () => {
      mockFetch.mockResolvedValue({ lines: ['ok'], totalLines: 1 });
      const result = await getLogs({ runIds: [42] });
      const payload = parsePayload(result.content[0].text) as {
        logs: Record<string, unknown>;
        missing: unknown[];
      };
      expect(payload.logs['42']).toBeDefined();
      expect(payload.missing).toEqual([]);
    });
  });
});
