jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({
  getRepoOwnerName: jest.fn(),
  tryGhAuthToken: jest.fn(),
}));

import { requestReview } from './request-review';
import { githubRest } from '../github-api';
import { getRepoOwnerName, tryGhAuthToken } from '../auth';

const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;
const mockedToken = tryGhAuthToken as jest.MockedFunction<
  typeof tryGhAuthToken
>;

interface ParsedRequestReviewResult {
  results: Array<{ reviewer: string; success: boolean }>;
}

beforeEach(() => {
  mockedRepo.mockResolvedValue({ owner: 'org', name: 'repo' });
  mockedToken.mockResolvedValue(undefined);
});

afterEach(() => jest.resetAllMocks());

describe('requestReview — copilot is opt-in (LS-8707)', () => {
  it('does not request Copilot when "copilot" is omitted, even if the request would fail', async () => {
    mockedRest.mockResolvedValueOnce({
      requested_reviewers: [{ login: 'bkrupa' }],
    });

    const result = await requestReview({ prs: [6402], reviewers: ['bkrupa'] });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(
      result.content[0].text,
    ) as ParsedRequestReviewResult;
    expect(parsed.results).toEqual([{ reviewer: 'bkrupa', success: true }]);
    // Only the human-reviewer POST — no Copilot precheck/request calls.
    expect(mockedRest).toHaveBeenCalledTimes(1);
  });

  it('does not request Copilot when "copilot: false" is explicit', async () => {
    mockedRest.mockResolvedValueOnce({
      requested_reviewers: [{ login: 'bkrupa' }],
    });

    const result = await requestReview({
      prs: [6402],
      reviewers: ['bkrupa'],
      copilot: false,
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(
      result.content[0].text,
    ) as ParsedRequestReviewResult;
    expect(parsed.results).toEqual([{ reviewer: 'bkrupa', success: true }]);
    expect(mockedRest).toHaveBeenCalledTimes(1);
  });

  it('still attempts Copilot when "copilot: true" is explicit', async () => {
    // Precheck: PR snapshot + check-runs + reviews page, then the (failing) POST.
    mockedRest
      .mockResolvedValueOnce({ head: { sha: 'abc123' } })
      .mockResolvedValueOnce({ total_count: 0, check_runs: [] })
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('boom'));

    const result = await requestReview({ prs: [6402], copilot: true });

    const parsed = JSON.parse(
      result.content[0].text,
    ) as ParsedRequestReviewResult;
    expect(parsed.results[0].reviewer).toBe(
      'copilot-pull-request-reviewer[bot]',
    );
    expect(parsed.results[0].success).toBe(false);
  });

  it('errors when no reviewers are given and copilot is not opted in', async () => {
    const result = await requestReview({ prs: [6402] });
    expect(result.isError).toBe(true);
  });
});
