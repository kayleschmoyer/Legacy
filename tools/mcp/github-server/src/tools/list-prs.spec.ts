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

describe('listPRs paths filter (LS-9634)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRepo.mockResolvedValue({ owner: 'o', name: 'r' });
  });

  it('includes only PRs whose files match a given path pattern', async () => {
    mockedGraphQL.mockResolvedValueOnce(
      page([
        prNode({
          number: 1,
          files: {
            totalCount: 1,
            nodes: [{ path: 'docs/mcp/api-reference.json' }],
          },
        }),
        prNode({
          number: 2,
          files: { totalCount: 1, nodes: [{ path: 'apps/web/src/foo.tsx' }] },
        }),
      ]),
    );

    const text = (await listPRs({ paths: ['docs/mcp/api-reference'] }))
      .content[0].text;

    expect(text).toContain('1|feat(x): do the thing');
    expect(text).not.toContain('2|feat(x): do the thing');
    expect(text).toContain('_total: 1_');
  });

  it('requests the files field in the same paginated query, not a per-PR fan-out', async () => {
    mockedGraphQL.mockResolvedValueOnce(page([]));

    await listPRs({ paths: ['docs/'] });

    expect(mockedGraphQL).toHaveBeenCalledTimes(1);
    const [query] = mockedGraphQL.mock.calls[0];
    expect(query).toContain('files(first: 100)');
  });

  it('does not request the files field when paths is omitted', async () => {
    mockedGraphQL.mockResolvedValueOnce(page([prNode()]));

    await listPRs({});

    const [query] = mockedGraphQL.mock.calls[0];
    expect(query).not.toContain('files(first: 100)');
  });

  it('adds a matchedPaths column listing the matching files', async () => {
    mockedGraphQL.mockResolvedValueOnce(
      page([
        prNode({
          files: {
            totalCount: 2,
            nodes: [
              { path: 'docs/mcp/api-reference.json' },
              { path: 'apps/web/src/foo.tsx' },
            ],
          },
        }),
      ]),
    );

    const text = (await listPRs({ paths: ['docs/mcp/api-reference'] }))
      .content[0].text;

    expect(text).toContain('matchedPaths');
    expect(text).toContain('docs/mcp/api-reference.json');
    expect(text).not.toContain('apps/web/src/foo.tsx');
  });

  it('returns a clear error for an invalid regex pattern', async () => {
    const result = await listPRs({ paths: ['('] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid path pattern');
    expect(mockedGraphQL).not.toHaveBeenCalled();
  });

  it('rejects a pattern with catastrophic-backtracking risk (ReDoS)', async () => {
    const result = await listPRs({ paths: ['(a+)+$'] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('catastrophic backtracking');
    expect(mockedGraphQL).not.toHaveBeenCalled();
  });

  it('rejects a pattern longer than the max allowed length', async () => {
    const result = await listPRs({ paths: ['a'.repeat(201)] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('too long');
    expect(mockedGraphQL).not.toHaveBeenCalled();
  });
});
