jest.mock('../github-api', () => ({ githubGraphQL: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { prFiles } from './pr-files';
import { githubGraphQL } from '../github-api';
import { getRepoOwnerName } from '../auth';

const mockedGraphQL = githubGraphQL as jest.MockedFunction<
  typeof githubGraphQL
>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

function fileNode(
  path: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    path,
    additions: 1,
    deletions: 0,
    changeType: 'MODIFIED',
    ...overrides,
  };
}

function prNode(
  number: number,
  files: Record<string, unknown>[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null } = {
    hasNextPage: false,
    endCursor: null,
  },
) {
  return { number, files: { nodes: files, pageInfo } };
}

beforeEach(() => {
  mockedRepo.mockResolvedValue({ owner: 'org', name: 'repo' });
});

afterEach(() => jest.resetAllMocks());

describe('prFiles', () => {
  it('returns just paths for the default "names" format', async () => {
    mockedGraphQL.mockResolvedValue({
      data: {
        repository: {
          pr_1: prNode(1, [fileNode('a.ts'), fileNode('b.ts')]),
        },
      },
      errors: undefined,
    });

    const result = await prFiles({ prNumbers: [1] });
    const parsed = JSON.parse(result.content[0].text) as Record<
      string,
      string[]
    >;

    expect(parsed['1']).toEqual(['a.ts', 'b.ts']);
  });

  it('returns full file metadata for format:"full"', async () => {
    mockedGraphQL.mockResolvedValue({
      data: {
        repository: {
          pr_1: prNode(1, [
            fileNode('a.ts', {
              additions: 5,
              deletions: 2,
              changeType: 'ADDED',
            }),
          ]),
        },
      },
      errors: undefined,
    });

    const result = await prFiles({ prNumbers: [1], format: 'full' });
    const parsed = JSON.parse(result.content[0].text) as Record<
      string,
      Array<{
        path: string;
        additions: number;
        deletions: number;
        changeType: string;
      }>
    >;

    expect(parsed['1']).toEqual([
      { path: 'a.ts', additions: 5, deletions: 2, changeType: 'ADDED' },
    ]);
  });

  it('batches multiple PR numbers into a single GraphQL call for a small batch', async () => {
    mockedGraphQL.mockResolvedValue({
      data: {
        repository: {
          pr_1: prNode(1, [fileNode('a.ts')]),
          pr_2: prNode(2, [fileNode('b.ts')]),
        },
      },
      errors: undefined,
    });

    const result = await prFiles({ prNumbers: [1, 2] });
    const parsed = JSON.parse(result.content[0].text) as Record<
      string,
      string[]
    >;

    expect(mockedGraphQL).toHaveBeenCalledTimes(1);
    expect(parsed['1']).toEqual(['a.ts']);
    expect(parsed['2']).toEqual(['b.ts']);
  });

  it('drains additional pages instead of truncating at 100 files', async () => {
    mockedGraphQL.mockImplementation((query: string) => {
      if (query.includes('pr_42')) {
        return Promise.resolve({
          data: {
            repository: {
              pr_42: prNode(42, [fileNode('first.ts')], {
                hasNextPage: true,
                endCursor: 'cursor-1',
              }),
            },
          },
          errors: undefined,
        });
      }
      // Pagination follow-up query, scoped to the PR number.
      return Promise.resolve({
        data: {
          repository: {
            pullRequest: {
              files: {
                nodes: [fileNode('second.ts')],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
        errors: undefined,
      });
    });

    const result = await prFiles({ prNumbers: [42] });
    const parsed = JSON.parse(result.content[0].text) as Record<
      string,
      string[]
    >;

    expect(parsed['42']).toEqual(['first.ts', 'second.ts']);
  });

  it('dedupes repeated PR numbers', async () => {
    mockedGraphQL.mockResolvedValue({
      data: { repository: { pr_1: prNode(1, [fileNode('a.ts')]) } },
      errors: undefined,
    });

    const result = await prFiles({ prNumbers: [1, 1, 1] });
    const parsed = JSON.parse(result.content[0].text) as Record<
      string,
      string[]
    >;

    expect(Object.keys(parsed)).toEqual(['1']);
    // One query for the deduped batch of one, not three.
    expect(mockedGraphQL).toHaveBeenCalledTimes(1);
  });

  it('omits a PR number the API returns nothing for (e.g. not found)', async () => {
    mockedGraphQL.mockResolvedValue({
      data: { repository: { pr_1: prNode(1, [fileNode('a.ts')]), pr_2: null } },
      errors: undefined,
    });

    const result = await prFiles({ prNumbers: [1, 2] });
    const parsed = JSON.parse(result.content[0].text) as Record<
      string,
      string[]
    >;

    expect(Object.keys(parsed)).toEqual(['1']);
  });

  it('returns an error result when the GraphQL call fails', async () => {
    mockedGraphQL.mockRejectedValue(new Error('boom'));

    const result = await prFiles({ prNumbers: [1] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('boom');
  });
});
