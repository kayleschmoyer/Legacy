jest.mock('../github-api', () => ({ githubGraphQL: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { listPRs } from './list-prs';
import { getRepoOwnerName } from '../auth';
import { githubGraphQL } from '../github-api';

const mockedGraphQL = githubGraphQL as jest.MockedFunction<
  typeof githubGraphQL
>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

function prNode(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    title: 'feat(x): do the thing',
    state: 'OPEN',
    headRefName: 'claude/branch',
    baseRefName: 'main',
    author: { login: 'alice' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    url: 'https://github.com/o/r/pull/42',
    labels: { nodes: [{ name: 'bug' }, { name: 'agent-in-progress' }] },
    isDraft: false,
    mergedAt: null,
    reviewDecision: 'APPROVED',
    ...overrides,
  };
}

function page(nodes: unknown[], hasNextPage = false) {
  return {
    data: {
      repository: {
        pullRequests: {
          pageInfo: { hasNextPage, endCursor: hasNextPage ? 'cursor' : null },
          nodes,
        },
      },
    },
  };
}

describe('listPRs (LS-8021 token-efficient output)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRepo.mockResolvedValue({ owner: 'o', name: 'r' });
  });

  it('renders a compact Markdown table with a header row and one row per PR', async () => {
    mockedGraphQL.mockResolvedValueOnce(page([prNode()]));

    const text = (await listPRs({})).content[0].text;

    // Header + separator (compact GFM, no padding) — column headers written once.
    expect(text).toContain('number|title|state|branch|base|author');
    expect(text).toContain('---|---|---');
    // The data row: nested fields flattened (author→login, labels→comma list).
    expect(text).toContain(
      '42|feat(x): do the thing|OPEN|claude/branch|main|alice',
    );
    expect(text).toContain('bug,agent-in-progress');
    expect(text).toContain('_total: 1_');
    // No pretty-printed JSON structural punctuation.
    expect(text).not.toContain('"number"');
  });

  it('flags when the page limit was reached (more may exist)', async () => {
    // hasNextPage true + limit reached ⇒ the "more may exist" hint fires.
    mockedGraphQL.mockResolvedValueOnce(page([prNode()], true));

    const text = (await listPRs({ limit: 1 })).content[0].text;
    expect(text).toContain('limit 1 reached');
  });

  it('emits an explicit signal instead of a blank table when empty', async () => {
    mockedGraphQL.mockResolvedValueOnce(page([]));

    const text = (await listPRs({})).content[0].text;
    expect(text).toBe('No PRs found matching filters.');
  });
});
