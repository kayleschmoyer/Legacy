import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import type { Context } from 'aws-lambda';

jest.mock('../github-api.js', () => ({
  githubGet: jest.fn(),
}));

import { waitRun, waitRunHint } from './wait-run.js';
import * as githubApi from '../github-api.js';
import { setLambdaContext } from '../lambda-budget.js';

function fakeContext(remainingMs: number): Context {
  return {
    getRemainingTimeInMillis: () => remainingMs,
  } as unknown as Context;
}

const mockGithubGet = githubApi.githubGet as unknown as jest.MockedFunction<
  (path: string) => Promise<unknown>
>;

interface FakeRun {
  id: number;
  status: string;
  conclusion: string | null;
  run_number: number;
  html_url: string;
}

function makeRun(overrides: Partial<FakeRun> = {}): FakeRun {
  return {
    id: 123,
    status: 'in_progress',
    conclusion: null,
    run_number: 7,
    html_url: 'https://github.com/bkrupa/legacy-sports/actions/runs/123',
    ...overrides,
  };
}

function parseBody(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

describe('waitRun', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
  });

  afterEach(() => {
    setLambdaContext(undefined);
  });

  it('returns completed immediately when the run is already done', async () => {
    mockGithubGet.mockResolvedValueOnce(
      makeRun({ status: 'completed', conclusion: 'success' }),
    );

    const result = await waitRun({ runId: 123 });

    expect(result.isError).toBeUndefined();
    expect(parseBody(result.content[0].text)).toMatchObject({
      runId: 123,
      status: 'completed',
      conclusion: 'success',
    });
    expect(mockGithubGet).toHaveBeenCalledTimes(1);
  });

  it('polls until the deadline and returns an in_progress snapshot with a re-arm hint, never a raw error (LS-8429)', async () => {
    mockGithubGet.mockResolvedValue(makeRun({ status: 'in_progress' }));
    jest.useFakeTimers();

    try {
      const resultPromise = waitRun({ runId: 123 });
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.isError).toBeUndefined();
      const body = parseBody(result.content[0].text);
      expect(body.status).toBe('in_progress');
      expect(body.hint).toContain('ci_wait_run({ runId: 123 })');
    } finally {
      jest.useRealTimers();
    }
  });

  it('caps the internal wait at the 20s Lambda-safe ceiling even when a longer maxWaitSeconds is requested (LS-8429)', async () => {
    mockGithubGet.mockResolvedValue(makeRun({ status: 'in_progress' }));
    jest.useFakeTimers();

    try {
      // Request the old 55s ceiling explicitly — it must still be clamped to
      // 20s so the Lambda (30s configured timeout) always returns a response
      // instead of getting killed mid-request.
      const resultPromise = waitRun({ runId: 123, maxWaitSeconds: 55 });
      await jest.runAllTimersAsync();
      await resultPromise;

      // Poll interval is 5s: calls land at t=0,5,10,15,20 -> 5 total calls.
      // Under the old 55s ceiling this would run to 12 calls instead.
      expect(mockGithubGet).toHaveBeenCalledTimes(5);
    } finally {
      jest.useRealTimers();
    }
  });

  it("clamps the wait to the Lambda's actual remaining time, not just the static 20s ceiling, when pre-handler auth/credential-fetch overhead has already eaten into the budget (LS-8429 regression)", async () => {
    mockGithubGet.mockResolvedValue(makeRun({ status: 'in_progress' }));
    // 12s left on the clock minus the 5s response margin -> a 7s effective
    // budget instead of the full 20s ceiling. Poll interval is 5s, so calls
    // land at t=0,5,7 (3 calls) instead of the 5 a static 20s ceiling would
    // produce -- the exact gap that let the "Service Unavailable" transport
    // error recur after the first (static-ceiling-only) fix for this ticket.
    setLambdaContext(fakeContext(12_000));
    jest.useFakeTimers();

    try {
      const resultPromise = waitRun({ runId: 123 });
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.isError).toBeUndefined();
      expect(parseBody(result.content[0].text).status).toBe('in_progress');
      expect(mockGithubGet).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('makes only the single initial status check (no polling) when the Lambda has no safe time left, instead of risking a mid-poll SIGKILL', async () => {
    mockGithubGet.mockResolvedValue(makeRun({ status: 'in_progress' }));
    setLambdaContext(fakeContext(2_000));

    const result = await waitRun({ runId: 123 });

    expect(result.isError).toBeUndefined();
    expect(parseBody(result.content[0].text).status).toBe('in_progress');
    expect(mockGithubGet).toHaveBeenCalledTimes(1);
  });

  it('propagates a 404 (bad run ID) immediately as an error, without retrying', async () => {
    mockGithubGet.mockRejectedValue(new Error('GitHub API 404: Not Found'));

    const result = await waitRun({ runId: 999 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to check run 999');
    expect(mockGithubGet).toHaveBeenCalledTimes(1);
  });

  it('treats a transient error mid-poll as non-fatal and keeps polling until it succeeds', async () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockGithubGet
      .mockResolvedValueOnce(makeRun({ status: 'in_progress' }))
      .mockRejectedValueOnce(new Error('GitHub API 500: oops'))
      .mockResolvedValueOnce(
        makeRun({ status: 'completed', conclusion: 'success' }),
      );
    jest.useFakeTimers();

    try {
      const resultPromise = waitRun({ runId: 123 });
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.isError).toBeUndefined();
      expect(parseBody(result.content[0].text).status).toBe('completed');
      expect(mockGithubGet).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
      consoleErrorSpy.mockRestore();
    }
  });
});

describe('waitRunHint', () => {
  it('references the 20s per-call bound and the re-arm call', () => {
    const hint = waitRunHint(42);
    expect(hint).toContain('20s');
    expect(hint).toContain('ci_wait_run({ runId: 42 })');
    expect(hint).toContain('Do NOT re-dispatch');
  });
});
