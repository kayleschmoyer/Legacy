jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));
jest.mock('../pr-utils', () => ({ resolveHeadShaFromPrNumber: jest.fn() }));

import { githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';
import { listCommitStatuses } from './list-commit-statuses';

const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
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
});
