import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('./view-run.js', () => ({ viewRun: jest.fn() }));
jest.mock('./view-run-batch.js', () => ({ viewRunBatch: jest.fn() }));

import { ciViewRun } from './ci-view-run.js';
import { viewRun } from './view-run.js';
import { viewRunBatch } from './view-run-batch.js';

const mockViewRun = viewRun as jest.MockedFunction<typeof viewRun>;
const mockViewRunBatch = viewRunBatch as jest.MockedFunction<
  typeof viewRunBatch
>;

const OK = { content: [{ type: 'text' as const, text: '{}' }] };

describe('ciViewRun', () => {
  beforeEach(() => {
    mockViewRun.mockReset().mockResolvedValue(OK);
    mockViewRunBatch.mockReset().mockResolvedValue(OK);
  });

  it('rejects when neither runId nor runIds is given', async () => {
    const result = await ciViewRun({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Exactly one of runId or runIds/);
  });

  it('rejects when both runId and runIds are given', async () => {
    const result = await ciViewRun({ runId: 1, runIds: [2, 3] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Exactly one of runId or runIds/);
  });

  it('delegates single-run params through to viewRun', async () => {
    await ciViewRun({
      runId: 101,
      attempt: 2,
      includeJobs: false,
      format: 'json',
    });
    expect(mockViewRun).toHaveBeenCalledWith({
      runId: 101,
      attempt: 2,
      includeJobs: false,
      format: 'json',
    });
    expect(mockViewRunBatch).not.toHaveBeenCalled();
  });

  it('delegates runIds to viewRunBatch', async () => {
    await ciViewRun({ runIds: [1, 2, 3], includeJobs: true });
    expect(mockViewRunBatch).toHaveBeenCalledWith({
      runIds: [1, 2, 3],
      includeJobs: true,
    });
    expect(mockViewRun).not.toHaveBeenCalled();
  });

  it('rejects runIds combined with attempt', async () => {
    const result = await ciViewRun({ runIds: [1, 2], attempt: 3 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(
      /attempt is meaningless across heterogeneous runs/,
    );
    expect(mockViewRunBatch).not.toHaveBeenCalled();
  });
});
