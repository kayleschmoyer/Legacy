import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockRunJobWithBudget =
  jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('./jobs.js', () => ({
  runJobWithBudget: mockRunJobWithBudget,
}));

import { runJobWithPluginWorkerRetry } from './plugin-worker-retry.js';

const baseOpts = {
  command: 'make',
  args: ['pc-typecheck'],
  cwd: '/repo',
  label: 'pc-typecheck',
  timeoutMs: 1000,
  idempotencyKey: 'pc-chunk:/repo:pc-typecheck',
};

const PLUGIN_WORKER_LOG =
  'Plugin Worker for /repo/node_modules/nx/dist/src/plugins/js is exiting as it did not receive a load message within 10 seconds of connecting.\n';

describe('runJobWithPluginWorkerRetry', () => {
  beforeEach(() => {
    mockRunJobWithBudget.mockReset();
  });

  it('returns the first snapshot unretried when it passes', async () => {
    mockRunJobWithBudget.mockResolvedValueOnce({
      status: 'done',
      log: 'NX   Successfully ran target typecheck',
    });

    const result = await runJobWithPluginWorkerRetry(baseOpts, 5000);

    expect(result.pluginWorkerRetried).toBe(false);
    expect(mockRunJobWithBudget).toHaveBeenCalledTimes(1);
  });

  it('returns the first snapshot unretried when it fails for an unrelated reason', async () => {
    mockRunJobWithBudget.mockResolvedValueOnce({
      status: 'failed',
      log: 'TS2322: some real type error',
      error: 'pc-typecheck exited with code 1',
    });

    const result = await runJobWithPluginWorkerRetry(baseOpts, 5000);

    expect(result.pluginWorkerRetried).toBe(false);
    expect(mockRunJobWithBudget).toHaveBeenCalledTimes(1);
  });

  it('leaves a still-running first snapshot alone (nothing terminal to retry yet)', async () => {
    mockRunJobWithBudget.mockResolvedValueOnce({
      status: 'running',
      jobId: 'nx-123',
    });

    const result = await runJobWithPluginWorkerRetry(baseOpts, 5000);

    expect(result.pluginWorkerRetried).toBe(false);
    expect(mockRunJobWithBudget).toHaveBeenCalledTimes(1);
  });

  it('retries once with NX_ISOLATE_PLUGINS=false when the plugin-worker signature is hit', async () => {
    mockRunJobWithBudget
      .mockResolvedValueOnce({
        status: 'failed',
        log: PLUGIN_WORKER_LOG,
        error: 'pc-typecheck exited with code 1',
      })
      .mockResolvedValueOnce({
        status: 'done',
        log: 'NX   Successfully ran target typecheck',
      });

    const result = await runJobWithPluginWorkerRetry(baseOpts, 5000);

    expect(mockRunJobWithBudget).toHaveBeenCalledTimes(2);
    const retryCallOpts = mockRunJobWithBudget.mock.calls[1][0] as {
      env?: Record<string, string>;
      idempotencyKey?: string;
    };
    expect(retryCallOpts.env).toMatchObject({ NX_ISOLATE_PLUGINS: 'false' });
    expect(retryCallOpts.idempotencyKey).toBe(
      'pc-chunk:/repo:pc-typecheck:isolate-retry',
    );
    expect(result.pluginWorkerRetried).toBe(true);
    expect(result.snapshot.status).toBe('done');
  });

  it('surfaces the retry snapshot even when the retry itself still fails', async () => {
    mockRunJobWithBudget
      .mockResolvedValueOnce({
        status: 'failed',
        log: PLUGIN_WORKER_LOG,
        error: 'pc-typecheck exited with code 1',
      })
      .mockResolvedValueOnce({
        status: 'failed',
        log: PLUGIN_WORKER_LOG,
        error: 'pc-typecheck exited with code 1',
      });

    const result = await runJobWithPluginWorkerRetry(baseOpts, 5000);

    expect(mockRunJobWithBudget).toHaveBeenCalledTimes(2);
    expect(result.pluginWorkerRetried).toBe(true);
    expect(result.snapshot.status).toBe('failed');
  });

  it('preserves caller-supplied env alongside the NX_ISOLATE_PLUGINS override', async () => {
    mockRunJobWithBudget
      .mockResolvedValueOnce({
        status: 'failed',
        log: PLUGIN_WORKER_LOG,
        error: 'nx run web:build exited with code 1',
      })
      .mockResolvedValueOnce({ status: 'done', log: 'ok' });

    await runJobWithPluginWorkerRetry(
      { ...baseOpts, env: { FOO: 'bar' } },
      5000,
    );

    const retryCallOpts = mockRunJobWithBudget.mock.calls[1][0] as {
      env?: Record<string, string>;
    };
    expect(retryCallOpts.env).toMatchObject({
      FOO: 'bar',
      NX_ISOLATE_PLUGINS: 'false',
    });
  });
});
