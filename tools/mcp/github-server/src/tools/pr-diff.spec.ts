jest.mock('../auth', () => ({
  getRepoOwnerName: jest.fn(),
  getToken: jest.fn(),
  invalidateToken: jest.fn(),
}));

import { prDiff } from './pr-diff';
import { getRepoOwnerName, getToken } from '../auth';

const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;
const mockedToken = getToken as jest.MockedFunction<typeof getToken>;

const originalFetch = global.fetch;

beforeEach(() => {
  mockedRepo.mockResolvedValue({ owner: 'org', name: 'repo' });
  mockedToken.mockResolvedValue('token');
});

afterEach(() => {
  jest.resetAllMocks();
  global.fetch = originalFetch;
});

function mockDiffResponse(body: string) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(body),
  });
}

describe('prDiff — default maxBytes (LS-9803)', () => {
  it('does not truncate a diff under the default byte cap', async () => {
    mockDiffResponse('a'.repeat(50_000));
    const result = await prDiff({ prNumber: 1 });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).not.toContain('[Diff truncated');
  });

  it('truncates a diff exceeding the lowered 100,000-byte default, not just the old 500,000-byte one', async () => {
    // Regression for LS-9803: a 178,940-byte diff overflowed the MCP token
    // cap despite being well under the previous 500,000-byte default.
    const body = 'a'.repeat(178_940);
    mockDiffResponse(body);
    const result = await prDiff({ prNumber: 1 });
    const text = result.content[0].text;
    expect(text).toContain('[Diff truncated at 100000 bytes');
    expect(text.length).toBeLessThan(body.length);
  });

  it('honors an explicit maxBytes override', async () => {
    mockDiffResponse('a'.repeat(1_000));
    const result = await prDiff({ prNumber: 1, maxBytes: 500 });
    expect(result.content[0].text).toContain('[Diff truncated at 500 bytes');
  });
});
