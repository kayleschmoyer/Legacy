jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { prCommits } from './pr-commits';
import { githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';

const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

function commit(sha: string, message: string) {
  return {
    sha,
    commit: { message, author: { name: 'Dev', date: '2026-01-01T00:00:00Z' } },
    html_url: `https://github.com/o/r/commit/${sha}`,
  };
}

describe('prCommits (LS-8021 token-efficient output)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRepo.mockResolvedValue({ owner: 'o', name: 'r' });
  });

  it('renders a compact Markdown table, one row per commit', async () => {
    mockedRest.mockResolvedValueOnce([
      commit('abc1234def', 'fix(x): correct thing\n\nbody'),
    ] as never);

    const text = (await prCommits({ number: 5 })).content[0].text;
    expect(text).toContain('sha|shortSha|message|author|date|url');
    // First line of the message only; full sha + short sha both present.
    expect(text).toContain('abc1234def|abc1234|fix(x): correct thing|Dev');
    expect(text).toContain('_PR #5, count: 1_');
    expect(text).not.toContain('"sha"');
  });

  it('emits an explicit signal when there are no commits', async () => {
    mockedRest.mockResolvedValueOnce([] as never);

    const text = (await prCommits({ number: 5 })).content[0].text;
    expect(text).toBe('No commits found for PR #5.');
  });
});
