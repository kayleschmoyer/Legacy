import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('./rerun.js', () => ({ rerun: jest.fn() }));
jest.mock('./rerun-batch.js', () => ({ rerunBatch: jest.fn() }));
jest.mock('./retry-failed.js', () => ({ retryFailed: jest.fn() }));

import { ciRerun } from './ci-rerun.js';
import { rerun } from './rerun.js';
import { rerunBatch } from './rerun-batch.js';
import { retryFailed } from './retry-failed.js';

const mockRerun = rerun as jest.MockedFunction<typeof rerun>;
const mockRerunBatch = rerunBatch as jest.MockedFunction<typeof rerunBatch>;
const mockRetryFailed = retryFailed as jest.MockedFunction<typeof retryFailed>;

const OK = { content: [{ type: 'text' as const, text: '{}' }] };

describe('ciRerun', () => {
  beforeEach(() => {
    mockRerun.mockReset().mockResolvedValue(OK);
    mockRerunBatch.mockReset().mockResolvedValue(OK);
    mockRetryFailed.mockReset().mockResolvedValue(OK);
  });

  it('rejects when neither runId nor runIds is given', async () => {
    const result = await ciRerun({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Exactly one of runId or runIds/);
    expect(mockRerun).not.toHaveBeenCalled();
  });

  it('rejects when both runId and runIds are given', async () => {
    const result = await ciRerun({ runId: 1, runIds: [2, 3] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Exactly one of runId or runIds/);
  });

  it('defaults to scope="failed" and delegates to rerun with failedOnly true', async () => {
    await ciRerun({ runId: 101 });
    expect(mockRerun).toHaveBeenCalledWith({
      runId: 101,
      failedOnly: true,
      jobId: undefined,
      debug: undefined,
    });
  });

  it('scope="all" delegates with failedOnly false', async () => {
    await ciRerun({ runId: 101, scope: 'all' });
    expect(mockRerun).toHaveBeenCalledWith({
      runId: 101,
      failedOnly: false,
      jobId: undefined,
      debug: undefined,
    });
  });

  it('scope="job" delegates jobId through', async () => {
    await ciRerun({ runId: 101, scope: 'job', jobId: 999 });
    expect(mockRerun).toHaveBeenCalledWith({
      runId: 101,
      failedOnly: true,
      jobId: 999,
      debug: undefined,
    });
  });

  it('rejects jobId without scope="job"', async () => {
    const result = await ciRerun({ runId: 101, jobId: 5 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(
      /jobId\/jobName requires scope="job"/,
    );
  });

  it('scope="job" delegates jobName through (LS-9608)', async () => {
    await ciRerun({ runId: 101, scope: 'job', jobName: 'Summarize' });
    expect(mockRerun).toHaveBeenCalledWith({
      runId: 101,
      failedOnly: true,
      jobId: undefined,
      jobName: 'Summarize',
      debug: undefined,
    });
  });

  it('rejects scope="job" without jobId or jobName', async () => {
    const result = await ciRerun({ runId: 101, scope: 'job' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/jobId or jobName is required/);
    expect(mockRerun).not.toHaveBeenCalled();
  });

  it('rejects jobName without scope="job"', async () => {
    const result = await ciRerun({ runId: 101, jobName: 'Summarize' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(
      /jobId\/jobName requires scope="job"/,
    );
  });

  it('rejects runIds combined with jobName', async () => {
    const result = await ciRerun({
      runIds: [1, 2],
      scope: 'job',
      jobName: 'Summarize',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/single-run only/);
    expect(mockRerunBatch).not.toHaveBeenCalled();
  });

  it('withDiagnostics delegates to retryFailed', async () => {
    await ciRerun({ runId: 101, withDiagnostics: true, withFreshLogs: true });
    expect(mockRetryFailed).toHaveBeenCalledWith({
      runId: 101,
      withFreshLogs: true,
    });
    expect(mockRerun).not.toHaveBeenCalled();
  });

  it('rejects withDiagnostics with a non-default scope', async () => {
    const result = await ciRerun({
      runId: 101,
      scope: 'all',
      withDiagnostics: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/withDiagnostics only supports/);
    expect(mockRetryFailed).not.toHaveBeenCalled();
  });

  it('runIds delegates to rerunBatch', async () => {
    await ciRerun({ runIds: [1, 2, 3], scope: 'all', debug: true });
    expect(mockRerunBatch).toHaveBeenCalledWith({
      runIds: [1, 2, 3],
      failedOnly: false,
      debug: true,
    });
  });

  it('rejects runIds combined with scope="job"', async () => {
    const result = await ciRerun({ runIds: [1, 2], scope: 'job', jobId: 5 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/single-run only/);
    expect(mockRerunBatch).not.toHaveBeenCalled();
  });

  it('rejects runIds combined with withDiagnostics', async () => {
    const result = await ciRerun({ runIds: [1, 2], withDiagnostics: true });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/single-run only/);
    expect(mockRerunBatch).not.toHaveBeenCalled();
  });
});
