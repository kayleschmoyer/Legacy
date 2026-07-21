import { bulkRebase } from './bulk-rebase';

jest.mock('./rebase-pr', () => ({
  rebasePRWorker: jest.fn(),
}));

jest.mock('../auth', () => ({
  isLambda: jest.fn(() => false),
}));

const { rebasePRWorker: mockRebasePR } = jest.requireMock('./rebase-pr') as {
  rebasePRWorker: jest.Mock;
};

beforeEach(() => {
  jest.resetAllMocks();
});

function successResult(number: number) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          number,
          branch: `b${number}`,
          base: 'main',
          message: `PR #${number} rebased`,
        }),
      },
    ],
  };
}

function conflictResult(number: number) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          success: false,
          number,
          branch: `b${number}`,
          error: 'Rebase conflicts detected',
          conflictFiles: ['a.ts'],
        }),
      },
    ],
  };
}

describe('bulkRebase', () => {
  it('runs sequentially and aggregates success results', async () => {
    const callOrder: number[] = [];
    mockRebasePR.mockImplementation(async ({ number }: { number: number }) => {
      callOrder.push(number);
      return successResult(number);
    });

    const result = await bulkRebase({ numbers: [10, 20, 30] });

    expect(callOrder).toEqual([10, 20, 30]);
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.total).toBe(3);
    expect(body.succeeded.map((s: { number: number }) => s.number)).toEqual([
      10, 20, 30,
    ]);
  });

  it('continues past a failed rebase and surfaces the conflict error', async () => {
    mockRebasePR
      .mockResolvedValueOnce(successResult(1))
      .mockResolvedValueOnce(conflictResult(2))
      .mockResolvedValueOnce(successResult(3));

    const result = await bulkRebase({ numbers: [1, 2, 3] });

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.succeeded).toHaveLength(2);
    expect(body.failed).toEqual([
      { index: 1, key: 2, error: 'Rebase conflicts detected' },
    ]);
  });
});
