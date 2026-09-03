jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { variablesCheck } from './variables-check';
import { githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';

const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

function variable(name: string, value: string) {
  return {
    name,
    value,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };
}

interface ListResult {
  totalCount: number;
  variables: Array<{
    name: string;
    value: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

interface CheckResult {
  checked: number;
  results: Array<{
    name: string;
    exists: boolean;
    value?: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
}

describe('variablesCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRepo.mockResolvedValue({ owner: 'o', name: 'r' });
  });

  it('rejects an empty names array', async () => {
    const result = await variablesCheck({ names: [] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('At least one variable name');
    expect(mockedRest).not.toHaveBeenCalled();
  });

  it('lists all variables when no names are given', async () => {
    mockedRest.mockResolvedValueOnce({
      total_count: 1,
      variables: [variable('JIRA_AUDIT_AUTO_REPAIR', 'true')],
    });

    const text = (await variablesCheck({})).content[0].text;
    const parsed = JSON.parse(text) as ListResult;
    expect(parsed.totalCount).toBe(1);
    expect(parsed.variables).toEqual([
      {
        name: 'JIRA_AUDIT_AUTO_REPAIR',
        value: 'true',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      },
    ]);
  });

  it('checks specific names and reports exists status per name', async () => {
    mockedRest
      .mockResolvedValueOnce(variable('FOO', 'bar'))
      .mockRejectedValueOnce(new Error('not found'));

    const text = (await variablesCheck({ names: ['FOO', 'MISSING'] }))
      .content[0].text;
    const parsed = JSON.parse(text) as CheckResult;
    expect(parsed.checked).toBe(2);
    expect(parsed.results).toEqual([
      {
        name: 'FOO',
        exists: true,
        value: 'bar',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      },
      { name: 'MISSING', exists: false },
    ]);
  });
});
