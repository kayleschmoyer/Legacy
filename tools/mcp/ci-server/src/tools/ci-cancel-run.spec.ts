import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('./cancel-run.js', () => ({ cancelRun: jest.fn() }));
jest.mock('./cancel-runs.js', () => ({ cancelRuns: jest.fn() }));

import { ciCancelRun } from './ci-cancel-run.js';
import { cancelRun } from './cancel-run.js';
import { cancelRuns } from './cancel-runs.js';

const mockCancelRun = cancelRun as jest.MockedFunction<typeof cancelRun>;
const mockCancelRuns = cancelRuns as jest.MockedFunction<typeof cancelRuns>;

const OK = { content: [{ type: 'text' as const, text: '{}' }] };

describe('ciCancelRun', () => {
  beforeEach(() => {
    mockCancelRun.mockReset().mockResolvedValue(OK);
    mockCancelRuns.mockReset().mockResolvedValue(OK);
  });

  it('delegates to cancelRun when runId is given', async () => {
    await ciCancelRun({ runId: 42 });
    expect(mockCancelRun).toHaveBeenCalledWith({ runId: 42 });
    expect(mockCancelRuns).not.toHaveBeenCalled();
  });

  it('delegates to cancelRuns when workflow+branch are given', async () => {
    await ciCancelRun({ workflow: 'ci.yml', branch: 'main' });
    expect(mockCancelRuns).toHaveBeenCalledWith({
      workflow: 'ci.yml',
      branch: 'main',
    });
    expect(mockCancelRun).not.toHaveBeenCalled();
  });

  it('rejects when neither runId nor a selector is given', async () => {
    const result = await ciCancelRun({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Pass runId/);
  });

  it('rejects when both runId and a selector are given', async () => {
    const result = await ciCancelRun({
      runId: 42,
      workflow: 'ci.yml',
      branch: 'main',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not both/);
  });

  it('rejects a half-given selector (workflow without branch)', async () => {
    const result = await ciCancelRun({ workflow: 'ci.yml' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/requires both workflow and branch/);
    expect(mockCancelRuns).not.toHaveBeenCalled();
  });

  it('rejects a half-given selector (branch without workflow)', async () => {
    const result = await ciCancelRun({ branch: 'main' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/requires both workflow and branch/);
  });
});
