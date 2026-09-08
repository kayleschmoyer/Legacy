jest.mock('../github-api', () => ({
  githubRest: jest.fn(),
  githubGraphQL: jest.fn(),
}));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));
jest.mock('../pr-utils', () => ({ resolveHeadShaFromPrNumber: jest.fn() }));

import { listCommitStatuses } from './list-commit-statuses';
import { githubGraphQL, githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';

const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedGraphQL = githubGraphQL as jest.MockedFunction<
  typeof githubGraphQL
>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

function status(context: string, state: string) {
  return {
    id: 1,
    state,
    context,
    description: `${context} desc`,
    target_url: `https://ci/${context}`,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

const PERMISSION_403_ERROR = new Error(
  'GitHub API GET /repos/o/r/commits/abc1234def/statuses failed (403): ' +
    '{"message":"Resource not accessible by integration"}. This is a missing ' +
    'GitHub App permission/scope, not a missing token — a token was provisioned ' +
    'and accepted. The Agent Author GitHub App installation lacks the repository ' +
    'permission governing this endpoint: "Commit statuses: Read". Grant the ' +
    "permission in the App's settings and approve the updated installation, then retry.",
);

describe('listCommitStatuses (LS-8021 token-efficient output)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRepo.mockResolvedValue({ owner: 'o', name: 'r' });
  });

  it('renders a compact Markdown table and preserves the Statuses-API note', async () => {
    mockedRest.mockResolvedValueOnce([
      status('bot-review', 'success'),
    ] as never);

    const text = (await listCommitStatuses({ sha: 'abc1234def' })).content[0]
      .text;
    expect(text).toContain('context|state|description|targetUrl|createdAt');
    expect(text).toContain(
      'bot-review|success|bot-review desc|https://ci/bot-review',
    );
    // Guidance preserved from the old JSON `note` field.
    expect(text).toContain('not Check Runs (Checks API)');
    expect(text).toContain('_sha: abc1234');
    expect(text).not.toContain('"statuses"');
  });

  it('deduplicates by context, keeping the most recent status', async () => {
    mockedRest.mockResolvedValueOnce([
      status('ctx', 'success'),
      status('ctx', 'failure'),
    ] as never);

    const text = (await listCommitStatuses({ sha: 'abc1234def' })).content[0]
      .text;
    expect(text).toContain('ctx|success');
    expect(text).not.toContain('ctx|failure');
  });

  it('emits an explicit signal (with the note) when there are no statuses', async () => {
    mockedRest.mockResolvedValueOnce([] as never);

    const text = (await listCommitStatuses({ sha: 'abc1234def' })).content[0]
      .text;
    expect(text).toContain('No commit statuses found');
    expect(text).toContain('not Check Runs (Checks API)');
  });

  describe('permission-gap fallback (LS-5234)', () => {
    it('falls back to statusCheckRollup when the Statuses API 403s and a prNumber is available', async () => {
      mockedRest.mockRejectedValueOnce(PERMISSION_403_ERROR);
      mockedGraphQL.mockResolvedValueOnce({
        data: {
          repository: {
            pullRequest: {
              commits: {
                nodes: [
                  {
                    commit: {
                      statusCheckRollup: {
                        contexts: {
                          nodes: [
                            {
                              __typename: 'StatusContext',
                              context: 'bot-review',
                              state: 'SUCCESS',
                              description: 'looks good',
                              targetUrl: 'https://ci/bot-review',
                              createdAt: '2026-01-01T00:00:00Z',
                            },
                            // A CheckRun node in the same rollup — the query
                            // only requests StatusContext fields via the
                            // inline fragment, so it comes back as `{}`.
                            {},
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      });

      const result = await listCommitStatuses({
        sha: 'abc1234def',
        prNumber: 4613,
      });
      const text = result.content[0].text;

      expect(mockedGraphQL).toHaveBeenCalledTimes(1);
      expect(text).toContain(
        'bot-review|success|looks good|https://ci/bot-review',
      );
      expect(text).toContain('lacks the "Commit statuses: Read" permission');
      expect(text).toContain('not Check Runs (Checks API)');
      expect(result.isError).toBeUndefined();
    });

    it('surfaces the raw 403 when no prNumber is available to fall back with', async () => {
      mockedRest.mockRejectedValueOnce(PERMISSION_403_ERROR);

      const result = await listCommitStatuses({ sha: 'abc1234def' });

      expect(mockedGraphQL).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Resource not accessible by integration',
      );
    });

    it('does not fall back on a non-permission error', async () => {
      mockedRest.mockRejectedValueOnce(
        new Error('GitHub API rate limit exceeded.'),
      );

      const result = await listCommitStatuses({
        sha: 'abc1234def',
        prNumber: 4613,
      });

      expect(mockedGraphQL).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('rate limit exceeded');
    });
  });
});
